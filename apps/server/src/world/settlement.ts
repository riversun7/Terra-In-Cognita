// 오프라인 정산·접속 상태 — docs/adr/2026-10-31-s3-server-stage.md 4절
// - 정산 단위 = 소유 주체(사용자 또는 세력). 그 주체의 모든 유닛 직무와 유지비를 (마지막 정산, 지금] 구간으로 한 번에 계산한다
//   (packages/sim settle: 나눠 정산해도 같은 정수 함수). 결과(직무 상태·원장 거래·settled_at)는 한 번의 동기 처리로
//   쓰기 대기열에 넣는다 → 같은 커밋에 들어간다. 커밋 전에 죽으면 다시 켠 뒤 같은 입력으로 다시 계산한다(두 번 내지 않음).
// - 정산 시점: 접속 상태가 바뀔 때(그래서 한 구간 안에서 접속 상태는 하나다), 상호작용 전(시험 명령·복귀 요약 조회),
//   그리고 SETTLE_EVERY_MS마다(1분에 오래된 순으로 SWEEP_BATCH 주체씩).
// - 접속 상태(D-136): 사용자마다 연결 수를 센다. 모든 연결이 끊긴 시각부터 24시간 동안 반복 직무를 잇는다(D-061·D-144).
//   세력(NPC)은 늘 접속 중으로 친다.
import {
  JOB_GATHER,
  JOB_NONE,
  type JobState,
  PHASE_WORK,
  type SizeClass,
  TEST_JOB_RULES,
  TEST_UPKEEP_PER_UNIT,
  UPKEEP_PERIOD_MS,
  WALK_SPEED,
  settleJob,
  settleUpkeep,
  upkeepBoundaries,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import type { SecondMap, UnitJob } from "./secondMap.ts";
import { UNIT_KIND_WORKER } from "./unitKinds.ts";

/** [임시] 시험 자산 코드(이름에 임시임이 보이게) */
export const ASSET_CREDIT = "s3_test_credit";
export const ASSET_ORE = "s3_test_ore";
/** 시스템 계정 */
export const SYSTEM_ISSUE_CREDIT = `issue:${ASSET_CREDIT}`;
export const SYSTEM_SINK_CREDIT = `sink:${ASSET_CREDIT}`;
/** 총량 자원은 쓴 만큼 행성 매장량으로 돌아간다(D-112·D-116) — 산출은 매장량에서 나온다 */
export const SYSTEM_RESERVE_ORE = `reserve:${ASSET_ORE}`;
/** [임시] 시험 NPC 세력이 처음 받는 시험 화폐 */
export const NPC_START_CREDIT = 1_000_000_000n;

/** 이보다 오래 정산하지 않은 주체는 주기 정산한다 */
export const SETTLE_EVERY_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_BATCH = 50;

export interface SettleReport {
  /** 끝난 일 주기(= 시험 자원 산출) */
  readonly cycles: number;
  readonly upkeepPaid: number;
  readonly upkeepUnpaid: number;
}

export interface Settlement {
  /** 사용자의 소유 주체(없으면 만든다) */
  ownerOfUser(userId: string, nowMs: number): OwnerRow;
  /** 사용자의 소유 주체 ID(없으면 undefined, 만들지 않는다) */
  findOwnerOfUser(userId: string): number | undefined;
  /** 소유 주체 하나를 toMs까지 정산한다 */
  settleOwner(ownerId: number, toMs: number): SettleReport;
  /** 오래 정산하지 않은 주체를 몇 개 정산한다. 정산한 수 */
  sweep(nowMs: number): number;
  /** 접속(연결 하나). 돌려준 함수를 부르면 그 연결이 끊긴 것이다 */
  connect(userId: string, nowMs: () => number): () => void;
  /** 모든 연결이 끊긴 시각(접속 중이면 null, 모르면 undefined) */
  offlineSince(userId: string): number | null | undefined;
  /** 시험 명령: 사용자에게 시험 일꾼 count개(채집 직무)를 준다. 만든 유닛 ID */
  giveWorkers(userId: string, mapKey: number, count: number, nowMs: number): number[];
  /** 시험 명령: 시험 화폐를 발행해 준다 */
  grantCredit(ownerId: number, amount: bigint, nowMs: number): void;
  stop(): void;
}

function sameJob(a: UnitJob, b: JobState): boolean {
  return a.job === b.job && a.phase === b.phase && a.progressMs === b.progressMs && a.fatigue === b.fatigue;
}

export function createSettlement(options: {
  maps: ReadonlyMap<number, SecondMap>;
  owners: Map<number, OwnerRow>;
  ledger: Ledger;
  writer: WorldWriter;
  nextOwnerId: () => number;
  nextUnitId: () => number;
  /** 부팅 때 읽은 접속 상태(접속 중으로 남은 것은 이미 끊김으로 고쳤다) */
  presence: readonly { userId: string; offlineSinceMs: number | null }[];
  now: () => number;
}): Settlement {
  const { maps, owners, ledger, writer } = options;
  const ownerByUser = new Map<string, number>();
  for (const owner of owners.values()) if (owner.userId) ownerByUser.set(owner.userId, owner.id);
  const presence = new Map<string, { connections: number; offlineSinceMs: number | null }>();
  for (const row of options.presence)
    presence.set(row.userId, { connections: 0, offlineSinceMs: row.offlineSinceMs });

  const saveOwner = (owner: OwnerRow): void =>
    writer.upsert("owners", {
      id: owner.id,
      user_id: owner.userId,
      faction_id: owner.factionId,
      settled_at_ms: owner.settledAtMs,
      upkeep_arrears: owner.upkeepArrears,
    });

  const savePresence = (userId: string, offlineSinceMs: number | null, at: number): void =>
    writer.upsert("presence", { user_id: userId, offline_since_ms: offlineSinceMs, updated_at_ms: at });

  type UnitRef = { map: SecondMap; id: number; job: UnitJob };
  const unitsOf = (ownerIds: ReadonlySet<number>): Map<number, UnitRef[]> => {
    const out = new Map<number, UnitRef[]>();
    for (const map of maps.values()) {
      map.forEachUnit((unit) => {
        if (!ownerIds.has(unit.ownerId)) return;
        let list = out.get(unit.ownerId);
        if (!list) {
          list = [];
          out.set(unit.ownerId, list);
        }
        list.push({ map, id: unit.id, job: unit.job });
      });
    }
    return out;
  };

  /** 사용자 주체의 접속 상태. 연결 기록이 없으면 그 주체의 마지막 정산부터 끊긴 것으로 본다 */
  const offlineOf = (owner: OwnerRow): number | null => {
    if (!owner.userId) return null;
    const state = presence.get(owner.userId);
    if (!state) return owner.settledAtMs;
    return state.connections > 0 ? null : state.offlineSinceMs;
  };

  const settleWith = (owner: OwnerRow, units: readonly UnitRef[], toMs: number): SettleReport => {
    const from = owner.settledAtMs;
    if (toMs <= from) return { cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0 };
    const offline = offlineOf(owner);
    let cycles = 0;
    for (const unit of units) {
      if (unit.job.job === JOB_NONE) continue;
      const result = settleJob(unit.job, from, toMs, offline, TEST_JOB_RULES);
      cycles += result.cycles;
      if (!sameJob(unit.job, result.state)) unit.map.setJob(unit.id, { ...result.state });
    }
    let upkeepPaid = 0;
    let upkeepUnpaid = 0;
    const charge = BigInt(units.length) * TEST_UPKEEP_PER_UNIT;
    const boundaries = upkeepBoundaries(from, toMs, UPKEEP_PERIOD_MS);
    if (charge > 0n && boundaries.length > 0) {
      const wallet = ledger.ownerAccount(owner.id, ASSET_CREDIT);
      const sink = ledger.systemAccount(SYSTEM_SINK_CREDIT, ASSET_CREDIT);
      const result = settleUpkeep(ledger.balance(wallet), charge, boundaries);
      for (const at of result.paid) {
        ledger.post({
          kind: "upkeep",
          atMs: at,
          key: `upkeep:${owner.id}:${at}`,
          entries: [
            { account: wallet, amount: -charge },
            { account: sink, amount: charge },
          ],
        });
      }
      upkeepPaid = result.paid.length;
      upkeepUnpaid = result.unpaid;
      owner.upkeepArrears += result.unpaid;
    }
    if (cycles > 0) {
      const amount = BigInt(cycles);
      ledger.post({
        kind: "job_output",
        atMs: toMs,
        entries: [
          { account: ledger.systemAccount(SYSTEM_RESERVE_ORE, ASSET_ORE), amount: -amount },
          { account: ledger.ownerAccount(owner.id, ASSET_ORE), amount },
        ],
      });
    }
    owner.settledAtMs = toMs;
    saveOwner(owner);
    return { cycles, upkeepPaid, upkeepUnpaid };
  };

  const settleOwner = (ownerId: number, toMs: number): SettleReport => {
    const owner = owners.get(ownerId);
    if (!owner) return { cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0 };
    return settleWith(owner, unitsOf(new Set([ownerId])).get(ownerId) ?? [], toMs);
  };

  const ownerOfUser = (userId: string, nowMs: number): OwnerRow => {
    const found = ownerByUser.get(userId);
    const existing = found === undefined ? undefined : owners.get(found);
    if (existing) return existing;
    const owner: OwnerRow = {
      id: options.nextOwnerId(),
      userId,
      factionId: null,
      settledAtMs: nowMs,
      upkeepArrears: 0,
    };
    owners.set(owner.id, owner);
    ownerByUser.set(userId, owner.id);
    saveOwner(owner);
    return owner;
  };

  const sweepTimer = setInterval(() => sweep(options.now()), SWEEP_INTERVAL_MS);
  sweepTimer.unref();

  function sweep(nowMs: number): number {
    const due = [...owners.values()]
      .filter((owner) => owner.settledAtMs < nowMs - SETTLE_EVERY_MS)
      .toSorted((a, b) => a.settledAtMs - b.settledAtMs || a.id - b.id)
      .slice(0, SWEEP_BATCH);
    if (due.length === 0) return 0;
    const units = unitsOf(new Set(due.map((owner) => owner.id)));
    for (const owner of due) settleWith(owner, units.get(owner.id) ?? [], nowMs);
    return due.length;
  }

  return {
    ownerOfUser,
    findOwnerOfUser: (userId) => ownerByUser.get(userId),
    settleOwner,
    sweep,
    connect(userId, nowMs) {
      const at = nowMs();
      const owner = ownerOfUser(userId, at);
      const state = presence.get(userId) ?? { connections: 0, offlineSinceMs: at };
      presence.set(userId, state);
      if (state.connections === 0) {
        // 끊겨 있던 구간을 오프라인 규칙으로 정산한 뒤 접속 중으로 바꾼다
        settleOwner(owner.id, at);
        state.offlineSinceMs = null;
        savePresence(userId, null, at);
      }
      state.connections += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        state.connections -= 1;
        if (state.connections > 0) return;
        const end = nowMs();
        settleOwner(owner.id, end);
        state.offlineSinceMs = end;
        savePresence(userId, end, end);
      };
    },
    offlineSince(userId) {
      const state = presence.get(userId);
      if (!state) return undefined;
      return state.connections > 0 ? null : state.offlineSinceMs;
    },
    giveWorkers(userId, mapKey, count, nowMs) {
      const map = maps.get(mapKey);
      if (!map) return [];
      const owner = ownerOfUser(userId, nowMs);
      // 유닛 수가 바뀌기 전에 정산한다(상호작용 전 정산)
      settleOwner(owner.id, nowMs);
      const made: number[] = [];
      const size: SizeClass = 1;
      for (let attempt = 0; made.length < count && attempt < count * 64; attempt++) {
        const id = options.nextUnitId();
        const cellX = 96 + ((attempt * 7) % 64);
        const cellY = 96 + Math.floor((attempt * 7) / 64) * 3;
        if (
          !map.addUnit({
            id,
            size,
            speed: WALK_SPEED,
            cellX,
            cellY,
            ownerId: owner.id,
            kind: UNIT_KIND_WORKER,
          })
        )
          continue;
        map.setJob(id, { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 });
        made.push(id);
      }
      return made;
    },
    grantCredit(ownerId, amount, nowMs) {
      ledger.post({
        kind: "issue",
        atMs: nowMs,
        entries: [
          { account: ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -amount },
          { account: ledger.ownerAccount(ownerId, ASSET_CREDIT), amount },
        ],
      });
    },
    stop() {
      clearInterval(sweepTimer);
    },
  };
}

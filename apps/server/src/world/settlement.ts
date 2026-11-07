// 오프라인 정산·접속 상태 — docs/adr/2026-10-31-s3-server-stage.md 4절
// - 정산 단위 = 소유 주체(사용자 또는 세력). 그 주체의 모든 유닛 직무와 유지비를 (마지막 정산, 지금] 구간으로 한 번에 계산한다
//   (packages/sim settle: 나눠 정산해도 같은 정수 함수). 결과(직무 상태·원장 거래·settled_at)는 한 번의 동기 처리로
//   쓰기 대기열에 넣는다 → 같은 커밋에 들어간다. 커밋 전에 죽으면 다시 켠 뒤 같은 입력으로 다시 계산한다(두 번 내지 않음).
// - 정산 시점: 접속 상태가 바뀔 때(그래서 한 구간 안에서 접속 상태는 하나다), 상호작용 전(시험 명령·복귀 요약 조회),
//   그리고 SETTLE_EVERY_MS마다(1분에 오래된 순으로 SWEEP_BATCH 주체씩).
// - 접속 상태(D-136): 사용자마다 연결 수를 센다. 모든 연결이 끊긴 시각부터 24시간 동안 반복 직무를 잇는다(D-061·D-144).
//   세력(NPC)은 늘 접속 중으로 친다.
// - 사이보그 본체도 유닛 유지비(D-150 = 생활비)를 낸다(D-453이 D-445 178 "유지비 없음"을 대체). 직무는 없다. 마지막 유지비 경계를
//   못 냈으면 그 경계 시각을 주체에 적는다(upkeep_unpaid_at_ms) → 본체가 효율 불이익(N38)으로 돈다(@terra/sim livingEfficiencyPm).
//   보유 유닛 수(주거 상한 D-153)에서는 그대로 뺀다(roster/worldUnits.ts).
// - 직무 멈춤(D-516 364, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)"): 건물 작업(짓기·레벨업·수리·장비 수리)에 묶인 유닛은
//   그 구간 산출을 내지 않는다. 산출 구간(노동 계약 몫)에 멈춤 구간을 겹쳐 그 구간 창고를 null(산출 버림)로 바꾼다(mergePauses).
//   직무 상태(진행·피로)는 그대로 흐른다(노동 계약 일시 중지와 같은 모양). 정산 뒤 고리(afterSettle)는 노동 계약 유예 끝의 남은 물건 옮기기.
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 산출 구간이 없는 유닛의 기본 산출(시험 광석 → 주인 기본 창고)은 개발
//   시험 일꾼(UNIT_KIND_WORKER)만 낸다. 플레이어 유닛은 노동 계약·직무 배치 구간(채집 시설이면 진짜 물건, labor/workBook.ts)에서만 낸다.
// - 작업 중 부상(D-521, docs/adr/2026-11-08-injury.md): 정산 전 직무 상태로 구간 안 작업 주기 경계를 굴리는 고리(injureWork, world/unitCondition.ts createWorkInjury)를
//   직무 정산과 같은 동기 처리에서 부른다(나눠 정산해도 같다 — 경계·난수가 실제 시각·유닛으로만 정해진다).
import {
  JOB_GATHER,
  JOB_NONE,
  type JobState,
  type OutputSegment,
  PHASE_WORK,
  type SizeClass,
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  TEST_SYSTEM_RESERVE_ORE,
  TEST_SYSTEM_SINK_CREDIT,
  UPKEEP_PERIOD_MS,
  WALK_SPEED,
  settleOwnerPeriod,
  testSettleAccounts,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import type { SecondMap, UnitJob } from "./secondMap.ts";
import { UNIT_KIND_WORKER } from "./unitKinds.ts";

/** [임시] 시험 자산 코드·시스템 계정(@terra/sim settle/owner.ts, 시뮬레이터와 같은 값) */
export const ASSET_CREDIT = TEST_ASSET_CREDIT;
export const ASSET_ORE = TEST_ASSET_ORE;
export const SYSTEM_ISSUE_CREDIT = TEST_SYSTEM_ISSUE_CREDIT;
export const SYSTEM_SINK_CREDIT = TEST_SYSTEM_SINK_CREDIT;
/** 총량 자원은 쓴 만큼 행성 매장량으로 돌아간다(D-112·D-116) — 산출은 매장량에서 나온다 */
export const SYSTEM_RESERVE_ORE = TEST_SYSTEM_RESERVE_ORE;
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
  /** 사용자 주체가 마지막 유지비 경계를 못 냈는가(사이보그 본체 생활비, D-453). 주체가 없으면 false */
  upkeepUnpaid(userId: string): boolean;
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
  /**
   * 산출 나누기 고리(노동 계약, docs/adr/2026-11-03-labor-contracts.md): 주체를 정산할 때마다 (주체, 구간 시작, 끝)으로 불러
   * 유닛 ID → 산출 구간을 받는다. 계약 정산(임금·임대료)은 고리 안에서 같은 동기 처리로 한다
   */
  routeOutputs(router: OutputRouter | undefined): void;
  /** 직무 멈춤 고리(건물 작업): 주체를 정산할 때마다 불러 유닛 ID → 산출 없는 구간을 받는다 */
  pauseOutputs(pauses: OutputPauses | undefined): void;
  /** 정산 뒤 고리: 산출 거래를 넣은 뒤 같은 동기 처리 안에서 부른다(노동 계약 유예 끝 물건 옮기기) */
  afterSettle(hook: ((ownerId: number, toMs: number) => void) | undefined): void;
  /** 작업 중 부상 고리(D-521): 직무 정산 전에 유닛마다 (정산 전 직무, 구간, 접속 상태)로 부른다 */
  injureWork(hook: WorkInjuryHook | undefined): void;
  stop(): void;
}

/** 작업 중 부상 고리 하나(유닛 하나, 정산 전 직무 상태, 구간, 접속 상태) */
export type WorkInjuryHook = (
  unit: { readonly map: SecondMap; readonly id: number; readonly kind: number; readonly job: JobState },
  fromMs: number,
  toMs: number,
  offlineSinceMs: number | null,
) => void;

/** 산출 없는 구간(fromMs, untilMs] */
export interface PauseWindow {
  readonly fromMs: number;
  readonly untilMs: number;
}

export type OutputPauses = (ownerId: number) => ReadonlyMap<number, readonly PauseWindow[]> | undefined;

/**
 * 산출 구간에 멈춤 구간을 겹친다(순수 함수): (fromMs, toMs]를 모든 경계로 잘라, 멈춤 구간 안이면 창고 null, 아니면 원래 구간의 창고
 * (구간이 없거나 마지막 구간 뒤면 base). 결과는 fromMs부터 toMs까지 차례로 덮는다
 */
export function mergePauses(
  segments: readonly OutputSegment[] | undefined,
  pauses: readonly PauseWindow[],
  fromMs: number,
  toMs: number,
  base: () => number,
): OutputSegment[] {
  const edges = new Set<number>([toMs]);
  for (const segment of segments ?? [])
    if (segment.untilMs > fromMs && segment.untilMs < toMs) edges.add(segment.untilMs);
  for (const pause of pauses)
    for (const edge of [pause.fromMs, pause.untilMs]) if (edge > fromMs && edge < toMs) edges.add(edge);
  const out: OutputSegment[] = [];
  let from = fromMs;
  for (const until of [...edges].toSorted((a, b) => a - b)) {
    const paused = pauses.some((pause) => pause.fromMs <= from && pause.untilMs >= until);
    const own = (segments ?? []).find((segment) => segment.untilMs >= until);
    const stock = paused ? null : own ? own.stock : base;
    // 멈추지 않은 조각은 원래 구간의 덤·진짜 물건 칸을 그대로 잇는다(WP3 플레이어 생산)
    const extra: Pick<OutputSegment, "bonusPm" | "goods"> =
      !paused && own ? { bonusPm: own.bonusPm, goods: own.goods } : {};
    const last = out.at(-1);
    if (last && last.stock === stock && last.goods === extra.goods && last.bonusPm === extra.bonusPm)
      out[out.length - 1] = { ...last, untilMs: until };
    else out.push({ untilMs: until, stock, ...extra });
    from = until;
  }
  return out;
}

export type OutputRouter = (
  ownerId: number,
  fromMs: number,
  toMs: number,
) => ReadonlyMap<number, readonly OutputSegment[]> | undefined;

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
  /**
   * 유닛 종류 코드 → 유지비 무게(‰, 보통 유닛 1000). 사이보그 유닛은 비싸다(D-470, 설정 칸 n46_upkeep). 정산할 때마다 읽는다.
   * 없으면 모두 1000(예전과 같다)
   */
  upkeepWeightPm?: ((kind: number) => number) | undefined;
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
      upkeep_unpaid_at_ms: owner.upkeepUnpaidAtMs,
    });

  const savePresence = (userId: string, offlineSinceMs: number | null, at: number): void =>
    writer.upsert("presence", { user_id: userId, offline_since_ms: offlineSinceMs, updated_at_ms: at });

  type UnitRef = { map: SecondMap; id: number; kind: number; job: UnitJob };
  const unitsOf = (ownerIds: ReadonlySet<number>): Map<number, UnitRef[]> => {
    const out = new Map<number, UnitRef[]>();
    for (const map of maps.values()) {
      map.forEachUnit((unit) => {
        // 사이보그 본체도 넣는다: 직무는 없고(JOB_NONE) 유지비(생활비)만 낸다(D-453)
        if (!ownerIds.has(unit.ownerId)) return;
        let list = out.get(unit.ownerId);
        if (!list) {
          list = [];
          out.set(unit.ownerId, list);
        }
        list.push({ map, id: unit.id, kind: unit.kind, job: unit.job });
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

  let router: OutputRouter | undefined;
  let pauser: OutputPauses | undefined;
  let after: ((ownerId: number, toMs: number) => void) | undefined;
  let injury: WorkInjuryHook | undefined;
  const weightOf = options.upkeepWeightPm;

  const settleWith = (owner: OwnerRow, units: readonly UnitRef[], toMs: number): SettleReport => {
    const from = owner.settledAtMs;
    if (toMs <= from) return { cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0 };
    // 노동 계약을 같은 시각까지 정산하고 유닛마다 산출 구간을 받는다(계약이 없으면 undefined → 예전과 같다)
    const routes = router?.(owner.id, from, toMs);
    // 건물 작업에 묶인 유닛은 그 구간 산출이 없다(D-516 364). 멈춤이 없는 유닛은 계약 몫 구간 그대로
    const pauses = pauser?.(owner.id);
    const own = testSettleAccounts(ledger, owner.id);
    const base = (): number => own.stock();
    // 산출 구간이 없는 플레이어 유닛(개발 시험 일꾼이 아닌 유닛)은 기본 산출이 없다
    const noOutput: readonly OutputSegment[] = [{ untilMs: toMs, stock: null }];
    const defaultOf = (unit: UnitRef): readonly OutputSegment[] | undefined =>
      unit.kind === UNIT_KIND_WORKER || unit.job.job === JOB_NONE ? undefined : noOutput;
    const outputOf = (unit: UnitRef): readonly OutputSegment[] | undefined => {
      const windows = pauses?.get(unit.id);
      const route = routes?.get(unit.id) ?? defaultOf(unit);
      return windows ? mergePauses(route, windows, from, toMs, base) : route;
    };
    const special = routes !== undefined || pauses !== undefined || units.some((unit) => defaultOf(unit));
    const offline = offlineOf(owner);
    // 작업 중 부상(D-521): 정산 전 직무 상태로 굴린다(직무가 있는 유닛만)
    if (injury) for (const unit of units) if (unit.job.job !== JOB_NONE) injury(unit, from, toMs, offline);
    // 판정은 @terra/sim 공용 함수(시뮬레이터와 같다). 여기서는 결과를 2차맵·소유 주체 행에 적기만 한다
    const result = settleOwnerPeriod(
      {
        ownerId: owner.id,
        jobs: units.map((unit) => unit.job),
        fromMs: from,
        toMs,
        offlineSinceMs: offline,
        outputs: special ? units.map(outputOf) : undefined,
        upkeepWeightPm: weightOf ? units.reduce((sum, unit) => sum + weightOf(unit.kind), 0) : undefined,
      },
      ledger,
      testSettleAccounts(ledger, owner.id),
    );
    units.forEach((unit, index) => {
      const next = result.jobs[index];
      if (next && !sameJob(unit.job, next)) unit.map.setJob(unit.id, { ...next });
    });
    owner.upkeepArrears += result.upkeepUnpaid;
    // 마지막 경계(= toMs 이하의 정시, settle.ts upkeepBoundaries)를 못 냈으면 그 시각, 냈으면 null. 경계가 없으면 그대로
    if (result.lastUpkeepPaid === true) owner.upkeepUnpaidAtMs = null;
    else if (result.lastUpkeepPaid === false)
      owner.upkeepUnpaidAtMs = Math.floor(toMs / UPKEEP_PERIOD_MS) * UPKEEP_PERIOD_MS;
    owner.settledAtMs = toMs;
    saveOwner(owner);
    after?.(owner.id, toMs);
    return { cycles: result.cycles, upkeepPaid: result.upkeepPaid, upkeepUnpaid: result.upkeepUnpaid };
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
      upkeepUnpaidAtMs: null,
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
    upkeepUnpaid(userId) {
      const found = ownerByUser.get(userId);
      const owner = found === undefined ? undefined : owners.get(found);
      return owner !== undefined && owner.upkeepUnpaidAtMs !== null;
    },
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
    routeOutputs(next) {
      router = next;
    },
    pauseOutputs(next) {
      pauser = next;
    },
    afterSettle(hook) {
      after = hook;
    },
    injureWork(hook) {
      injury = hook;
    },
    stop() {
      clearInterval(sweepTimer);
    },
  };
}

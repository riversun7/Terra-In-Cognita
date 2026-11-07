// 노동 계약 서비스(서버) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// 판정(지급·일시 중지·자동 해고·유예·보증금)은 @terra/sim economy/laborContract.ts 한 벌이다. 여기는 소유·존재 확인, 저장, 화면 자료.
// - 정산: 소유 주체 정산(world/settlement.ts)이 이 서비스의 outputsFor를 부른다 → 그 주체가 유닛 소유 주체인 계약을 같은 시각까지
//   정산하고(임금·임대료 거래), 유닛마다 산출 구간을 돌려준다(임금형 = 고용주 몫, 일시 중지 = 산출 없음, 임대형 = 임차인 몫).
//   그래서 계약 정산과 직무 산출이 같은 동기 처리 = 같은 커밋에 들어간다.
// - 명령: 바꾸기 전에 일하는 쪽 주체를 지금까지 정산한다(상호작용 전 정산). 돈이 움직이면 커밋을 기다린 뒤 답한다(U2).
// - 유닛·시설이 사라지거나 유닛 주인이 바뀌면 마지막 정산 시각에 끝낸다(남은 보증금은 돌려준다). 임대형은 유닛이 사라져도 유예에
//   들고(임차인 물건, D-161 해석), 시설이 사라지면 유예 없이(유예 중이면 유예만) 끝낸다.
// - 구인 게시판(jobBoard.ts): 시설 주인이 일자리를 내고 남의 유닛 주인이 받으면 임금형 계약(고용주 ≠ 유닛 주인)이 된다.
// - [임시] 화폐 = 서버 시험 화폐(s3_test_credit), 산출 = 시험 광석. 임금을 받는 곳 = 유닛 소유 주체 지갑(서버에 휴먼 지갑이 아직 없다,
//   기획 342). 임금 = 효율점수 × 단가 × 고용주 조정(N28) — 유닛 스탯이 아직 없어 효율점수는 새 유닛 평균 1차 스탯 하나,
//   단가는 도시 노동 시장이 아직 없어 N27 기준 단가 그대로다(rules.ts).
// - 시설 창고(docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)", D-516 382): 임대형 임차인 몫 산출은 그 건물 창고(원장 위치 = 그
//   건물, @terra/shared/goodsPlaces buildingLocation)에 쌓인다. 유예 동안 임차인이 꺼내 가고(storage_move out), 유예가 끝나면 남은 것이
//   시설 주인 것이 된다(옛 StorageUtils expireGraceStorage — 같은 건물 창고에서 주인만 바뀐다). 옮기기는 산출 거래를 넣은 뒤(정산 뒤 고리)
//   한다. 임금형 몫은 예전처럼 고용주 기본 창고다(시설에 일꾼 물건이 남지 않는다).
// - 건물 작업(짓기·수리 등)에 묶인 유닛은 계약을 맺지 못한다(unit_busy, D-516 364 — 작업 동안 직무 산출이 없다).
// - 비활성(수명이 다한 휴먼, D-517)은 일하지 않는다: 계약을 맺지 못하고 열린 계약은 "유닛 사라짐"으로 끝난다(docs/adr/2026-11-07-temple-religion.md).
import type { LaborResultCode } from "@terra/protocol";
import type {
  LaborContractView,
  LaborOverviewResponse,
  LaborBuildingView,
  LaborJobsResponse,
  LaborUnitView,
} from "@terra/shared/labor";
import {
  type LaborContract,
  type LaborEndReason,
  type OutputSegment,
  type SocietyCoefficients,
  checkLaborEscrow,
  depositCyclesLeft,
  laborAccounts,
  laborWarning,
  openLabor,
  requiredDeposit,
  setLeaseRent,
  settleLabor,
  terminateLabor,
  topUpLabor,
  wage,
  wagePerCycle,
} from "@terra/sim";
import { buildingLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import type { CityRow } from "../world/cities.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, ASSET_ORE, type Settlement } from "../world/settlement.ts";
import { type JobBoardFilter, type LaborPostInput, createJobBoard } from "./jobBoard.ts";
import { wageRulesOf } from "./rules.ts";
import { KEEP_ENDED_MS, type LoadedLabor, type RentRow, contractRow, rentRow } from "./store.ts";

const HOUR_MS = 3_600_000;

export type LaborCommandResult =
  | { ok: true; contractId?: number; jobId?: number }
  | { ok: false; code: LaborResultCode };

export interface LaborCreateInput {
  readonly kind: "wage" | "lease";
  readonly buildingId: number;
  readonly unitId: number;
  readonly adjustPm?: number | undefined;
  readonly termHours?: number | undefined;
}

export interface LaborService {
  /** 소유 주체 정산의 고리: 그 주체가 유닛 소유 주체인 계약을 toMs까지 정산하고, 유닛 ID → 산출 구간. 없으면 undefined */
  outputsFor(ownerId: number, fromMs: number, toMs: number): ReadonlyMap<number, OutputSegment[]> | undefined;
  create(userId: string, input: LaborCreateInput): Promise<LaborCommandResult>;
  terminate(userId: string, contractId: number): Promise<LaborCommandResult>;
  topUp(userId: string, contractId: number, amount: bigint): Promise<LaborCommandResult>;
  setRent(userId: string, buildingId: number, rent: bigint): Promise<LaborCommandResult>;
  /** 구인 내기(내 시설, 시설마다 열린 게시 하나 — 다시 내면 바꾼다) */
  postJob(userId: string, input: LaborPostInput): Promise<LaborCommandResult>;
  /** 구인 거두기(낸 사람만, 맺은 계약은 그대로) */
  withdrawJob(userId: string, jobId: number): Promise<LaborCommandResult>;
  /** 구인 받기(남의 시설 일자리를 내 유닛으로 → 임금형 계약) */
  acceptJob(userId: string, jobId: number, unitId: number): Promise<LaborCommandResult>;
  overview(userId: string): LaborOverviewResponse;
  /** 구인 게시판(남이 낸 열린 일자리, 도시·시설로 거름) */
  jobs(userId: string, filter: JobBoardFilter): LaborJobsResponse;
  /** 메모리 불변 조건(I14: 에스크로 = 보증금) */
  check(): string[];
  readonly contracts: ReadonlyMap<number, LaborContract>;
  /** 유닛에 열린 계약(일함·일시 중지)이 있거나 비활성(D-517)·수호신(기획 답 456 가)인가 — 건물 작업 일꾼·공격 유닛 확인 */
  unitBusy(unitId: number): boolean;
  /** 일하지 않는 유닛인가(비활성·수호신, unitAway 고리) — 건물 공격 수비 고르기가 뺀다(수호신은 도시 방어가 따로 넣는다) */
  unitAway(unitId: number): boolean;
  /** 건물에 지금 일하는 계약(active)이 있나 — 건물 사용 닳음(D-509) */
  buildingInUse(buildingId: number): boolean;
  /** 정산 뒤 고리(소유 주체 정산이 산출 거래를 넣은 뒤 부른다): 그 주체의 유예가 끝난 임대형 계약의 남은 물건을 시설 주인에게 */
  afterSettle(ownerId: number, toMs: number): void;
}

function isOpen(c: LaborContract): boolean {
  return c.state === "active" || c.state === "paused";
}

const fail = (code: LaborResultCode): LaborCommandResult => ({ ok: false, code });

/** 끝난 계약이 완전히 끝난 시각: 유예를 거쳤으면 유예 끝(물건이 넘어간 시각), 아니면 해지 시각 */
const finishedAt = (c: LaborContract): number => Math.max(c.endedAtMs ?? 0, c.leftoversMovedAtMs ?? 0);

export function createLaborService(options: {
  loaded: LoadedLabor;
  maps: ReadonlyMap<number, SecondMap>;
  /** 도시(부팅 때 읽은 것, 구인 게시판의 가까운 도시) */
  cities?: readonly CityRow[] | undefined;
  settlement: Settlement;
  ledger: Ledger;
  writer: WorldWriter;
  /** 세력·사회 계수표(설정 칸 실효 값, 부를 때마다 읽는다) */
  rules: () => SocietyCoefficients;
  now: () => number;
  ready: () => boolean;
  /**
   * 그 건물(시설)이 지금 일하나(건물 서비스: 짓는 중·30% 미만이면 false, 49 N50). 없으면 늘 true. false면 그 계약의 일한 구간은 산출이
   * 없다(임금·임대료는 계약대로 — 고치는 것은 주인 몫)
   */
  buildingWorks?: ((buildingId: number) => boolean) | undefined;
  /** 그 유닛이 건물 작업에 묶였나(건물 서비스). 묶였으면 계약을 맺지 못한다. 없으면 늘 false */
  unitInJob?: ((unitId: number) => boolean) | undefined;
  /**
   * 그 유닛이 일을 멈췄나(비활성 — 수명이 다한 휴먼, D-517, docs/adr/2026-11-07-temple-religion.md — 또는 수호신, 기획 답 456 가). 멈췄으면
   * 계약을 맺지 못하고, 열린 계약은 다음 정산에서 "유닛 사라짐"으로 끝난다(옛 LifeEngine _processWraith "활성 계약 종료"). 없으면 늘 false
   */
  unitAway?: ((unitId: number) => boolean) | undefined;
  /** 그 건물 산출 더하기 ‰(그 도시 수호신 생산 버프, 기획 답 470 가). 일한 구간에만 든다. 없으면 0 */
  outputBonusPm?: ((buildingId: number) => number) | undefined;
}): LaborService {
  const { maps, settlement, ledger, writer, now } = options;
  const contracts = new Map<number, LaborContract>(options.loaded.contracts.map((c) => [c.id, c]));
  const rents = new Map<number, RentRow>(options.loaded.rents.map((r) => [r.buildingId, r]));
  let lastId = options.loaded.maxId;
  const accounts = laborAccounts(ledger);
  const save = (c: LaborContract): void => writer.upsert("laborContracts", contractRow(c));

  /** 유닛 주인(없으면 undefined) */
  const unitOwnerOf = (unitId: number): number | undefined => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  /** 건물 주인(없는 건물이면 undefined, 주인 없음이면 null) */
  const buildingOwnerOf = (buildingId: number): number | null | undefined => {
    for (const map of maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return undefined;
  };
  const openContractOf = (unitId: number): LaborContract | undefined => {
    for (const c of contracts.values()) if (c.unitId === unitId && isOpen(c)) return c;
    return undefined;
  };
  const stockOf = (ownerId: number) => (): number => ledger.ownerAccount(ownerId, ASSET_ORE);
  /** 임대형 임차인 몫 = 그 건물 창고(위치 = 건물) */
  const buildingStockOf = (ownerId: number, buildingId: number) => (): number =>
    ledger.ownerAccount(ownerId, ASSET_ORE, buildingLocation(buildingId));
  /** 계약·건물 작업 중인 유닛 */
  const unitBusy = (unitId: number): boolean =>
    openContractOf(unitId) !== undefined ||
    (options.unitInJob?.(unitId) ?? false) ||
    (options.unitAway?.(unitId) ?? false);
  /** 이번 정산에서 유예가 끝난 임대형 계약(정산 뒤 고리가 남은 물건을 옮긴다) */
  const leftoverQueue: LaborContract[] = [];

  /** 사라짐·주인 바뀜이면 그 사유(유닛이 먼저). 그대로면 null */
  const goneReason = (c: LaborContract): LaborEndReason | null => {
    const unitOwner = unitOwnerOf(c.unitId);
    // 비활성(일하지 않음)도 유닛이 사라진 것처럼 끝낸다
    if (unitOwner === undefined || unitOwner !== c.workerOwnerId || (options.unitAway?.(c.unitId) ?? false))
      return "unit_gone";
    const buildingOwner = buildingOwnerOf(c.buildingId);
    return buildingOwner === undefined || buildingOwner !== c.ownerId ? "building_gone" : null;
  };
  /**
   * 사라짐·주인 바뀜이면 마지막 정산 시각에 해지한다(임금형 끝·임대형 유예, 시설이 사라지면 유예 없이). 유예 중이면 시설이
   * 사라졌을 때만 유예를 끝낸다(유닛은 유예 동안 계약에 묶이지 않는다). 해지했으면 true
   */
  const endIfGone = (c: LaborContract): boolean => {
    const reason = goneReason(c);
    if (reason === null || (c.state === "grace" && reason !== "building_gone")) return false;
    terminateLabor(c, c.settledAtMs, reason, ledger, accounts, wageRulesOf(options.rules()).labor);
    save(c);
    return true;
  };

  const outputsFor = (
    ownerId: number,
    fromMs: number,
    toMs: number,
  ): ReadonlyMap<number, OutputSegment[]> | undefined => {
    const mine = [...contracts.values()]
      .filter((c) => c.workerOwnerId === ownerId && c.state !== "ended")
      .toSorted((a, b) => a.id - b.id);
    if (mine.length === 0) return undefined;
    const society = options.rules();
    const rules = wageRulesOf(society).labor;
    const productionOn = society.switches.productionEnabled !== 0;
    const out = new Map<number, OutputSegment[]>();
    for (const c of mine) {
      // 사라진 유닛·시설의 산출은 나누지 않는다(유예에 들었으면 다음 정산부터 시각만 흐른다)
      if (endIfGone(c)) continue;
      const start = c.settledAtMs;
      const movedBefore = c.leftoversMovedAtMs;
      const segments = settleLabor(c, toMs, ledger, accounts, rules);
      save(c);
      // 이번 정산에서 유예가 끝났으면(한 번에 일함 → 유예 → 끝이어도) 정산 뒤에 남은 물건을 옮긴다
      if (c.kind === "lease" && c.leftoversMovedAtMs !== null && c.leftoversMovedAtMs !== movedBefore)
        leftoverQueue.push(c);
      if (c.state === "grace" || c.state === "ended") {
        if (!segments.some((segment) => segment.mode !== "free")) continue;
      }
      const list: OutputSegment[] = [];
      // 계약이 정산한 앞(주체 정산 구간이 더 이르면)은 계약 없는 몫
      if (start > fromMs) list.push({ untilMs: start, stock: productionOn ? stockOf(ownerId) : null });
      // 시설이 일하지 않으면(짓는 중·30% 미만, N50) 계약대로 일한 구간도 산출이 없다. 정산하는 때의 상태로 본다(분 단위 노화)
      const works = options.buildingWorks?.(c.buildingId) ?? true;
      // 그 도시 수호신 생산 버프(470 가): 일한 구간 산출에 ‰ 덤
      const bonusPm = works ? (options.outputBonusPm?.(c.buildingId) ?? 0) : 0;
      for (const segment of segments) {
        list.push({
          untilMs: segment.untilMs,
          ...(bonusPm > 0 && segment.mode === "work" ? { bonusPm } : {}),
          stock:
            !productionOn || segment.mode === "idle" || (segment.mode === "work" && !works)
              ? null
              : segment.mode === "work" && c.kind === "wage"
                ? stockOf(c.ownerId)
                : segment.mode === "work"
                  ? buildingStockOf(ownerId, c.buildingId)
                  : stockOf(ownerId),
        });
      }
      out.set(c.unitId, list);
    }
    return out.size > 0 ? out : undefined;
  };

  /** 명령을 받을 수 있나(세계 준비) + 사용자의 소유 주체 */
  const ownerFor = (userId: string, at: number): number | undefined =>
    options.ready() ? settlement.ownerOfUser(userId, at).id : undefined;

  const done = async (result: LaborCommandResult): Promise<LaborCommandResult> => {
    // 돈·소유가 바뀌는 명령은 커밋 뒤에 답한다(S3 U2)
    await writer.durable();
    return result;
  };

  const board = createJobBoard({
    loaded: options.loaded,
    maps,
    cities: options.cities ?? [],
    settlement,
    ledger,
    writer,
    accounts,
    rules: () => wageRulesOf(options.rules()),
    unitOwnerOf,
    buildingOwnerOf,
    unitBusy,
    nextContractId: () => lastId + 1,
    addContract: (c) => {
      lastId = Math.max(lastId, c.id);
      contracts.set(c.id, c);
      save(c);
    },
  });
  /** 구인 명령 공통: 세계 준비·내 주체 → 판단 → 바뀌었으면 커밋 뒤 답 */
  const jobCommand = async (
    userId: string,
    run: (me: number, at: number) => LaborCommandResult,
  ): Promise<LaborCommandResult> => {
    const at = now();
    const me = ownerFor(userId, at);
    if (me === undefined) return fail("busy");
    const result = run(me, at);
    return result.ok ? done(result) : result;
  };

  return {
    outputsFor,
    contracts,
    unitBusy: (unitId) => openContractOf(unitId) !== undefined || (options.unitAway?.(unitId) ?? false),
    unitAway: (unitId) => options.unitAway?.(unitId) ?? false,
    afterSettle(ownerId) {
      for (const c of leftoverQueue.splice(0)) {
        if (c.workerOwnerId !== ownerId) {
          leftoverQueue.push(c);
          continue;
        }
        // 같은 건물에 그 임차인의 다른 임대형 계약이 아직 열려 있거나 유예 중이면 그 물건은 그 계약 몫이라 그대로 둔다
        const shared = [...contracts.values()].some(
          (other) =>
            other.id !== c.id &&
            other.kind === "lease" &&
            other.workerOwnerId === c.workerOwnerId &&
            other.buildingId === c.buildingId &&
            other.state !== "ended",
        );
        if (shared) continue;
        const here = buildingLocation(c.buildingId);
        const entries: { account: number; amount: bigint }[] = [];
        // 먼저 모은다(옮길 계정을 만들며 장부를 도는 동안 계정이 늘지 않게)
        const left = [...ledger.accounts()].filter(
          (account) =>
            account.ownerId === c.workerOwnerId && account.location === here && account.balance > 0n,
        );
        for (const account of left) {
          entries.push({ account: account.id, amount: -account.balance });
          entries.push({
            account: ledger.ownerAccount(c.ownerId, account.asset, here),
            amount: account.balance,
          });
        }
        if (entries.length > 0)
          ledger.post({ kind: "labor_leftovers", atMs: c.leftoversMovedAtMs ?? 0, entries });
      }
    },
    buildingInUse(buildingId) {
      for (const c of contracts.values())
        if (c.buildingId === buildingId && c.state === "active") return true;
      return false;
    },
    async create(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(input.buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      const unitOwner = unitOwnerOf(input.unitId);
      if (unitOwner === undefined) return fail("unknown_unit");
      if (unitOwner !== me) return fail("forbidden");
      if (unitBusy(input.unitId)) return fail("unit_busy");
      const rules = wageRulesOf(options.rules());
      let ownerId: number;
      let rate: bigint;
      if (input.kind === "wage") {
        if (buildingOwner !== me) return fail("forbidden");
        const adjust = input.adjustPm ?? 1000;
        if (adjust < rules.adjustMinPm || adjust > rules.adjustMaxPm) return fail("invalid_terms");
        const daily = BigInt(wage(rules.efficiency, rules.rateMilli, adjust, rules.society));
        rate = wagePerCycle(daily, rules.labor);
        ownerId = me;
      } else {
        if (buildingOwner === null) return fail("not_for_lease");
        if (buildingOwner === me) return fail("invalid_terms");
        const posted = rents.get(input.buildingId);
        if (!posted || posted.rentPerHour <= 0n || posted.ownerId !== buildingOwner)
          return fail("not_for_lease");
        rate = posted.rentPerHour;
        ownerId = buildingOwner;
      }
      // 일하는 쪽(유닛 소유 주체 = 나)을 지금까지 정산한 뒤 맺는다: 계약 구간이 주체 정산 시각에서 시작한다
      settlement.settleOwner(me, at);
      const result = openLabor(
        {
          id: lastId + 1,
          kind: input.kind,
          ownerId,
          workerOwnerId: me,
          unitId: input.unitId,
          buildingId: input.buildingId,
          asset: ASSET_CREDIT,
          rate,
          atMs: at,
          endsAtMs: input.termHours === undefined ? null : at + input.termHours * HOUR_MS,
        },
        ledger,
        accounts,
        rules.labor,
      );
      if (!result.ok) return fail(result.code);
      lastId += 1;
      contracts.set(result.contract.id, result.contract);
      save(result.contract);
      return done({ ok: true, contractId: result.contract.id });
    },
    async terminate(userId, contractId) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      if (me !== c.ownerId && me !== c.workerOwnerId) return fail("forbidden");
      settlement.settleOwner(c.workerOwnerId, at);
      const rules = wageRulesOf(options.rules()).labor;
      if (!terminateLabor(c, at, me === c.ownerId ? "owner" : "worker", ledger, accounts, rules))
        return fail("not_open");
      save(c);
      return done({ ok: true });
    },
    async topUp(userId, contractId, amount) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      if (me !== c.ownerId) return fail("forbidden");
      if (c.kind !== "wage") return fail("invalid_terms");
      // 보증금이 나가는 고용주(남의 유닛을 고용했으면 일꾼 쪽과 다르다)와 계약을 정산하는 일꾼 쪽을 지금까지
      settlement.settleOwner(c.ownerId, at);
      settlement.settleOwner(c.workerOwnerId, at);
      const result = topUpLabor(c, amount, at, ledger, accounts, wageRulesOf(options.rules()).labor);
      if (!result.ok) return fail(result.code);
      save(c);
      return done({ ok: true });
    },
    async setRent(userId, buildingId, rent) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      if (buildingOwner !== me) return fail("forbidden");
      // 그 시설의 열린 임대 계약: 임차인을 지금까지 정산한 뒤(지난 시간은 옛 값) 다음 시간부터 새 값
      if (rent > 0n) {
        for (const c of [...contracts.values()].toSorted((a, b) => a.id - b.id)) {
          if (c.kind !== "lease" || c.buildingId !== buildingId || !isOpen(c)) continue;
          settlement.settleOwner(c.workerOwnerId, at);
          if (setLeaseRent(c, rent)) save(c);
        }
      }
      const row: RentRow = {
        buildingId,
        ownerId: me,
        asset: ASSET_CREDIT,
        rentPerHour: rent,
        updatedAtMs: at,
      };
      rents.set(buildingId, row);
      writer.upsert("laborRents", rentRow(row));
      return done({ ok: true });
    },
    postJob: (userId, input) => jobCommand(userId, (me, at) => board.post(me, input, at)),
    withdrawJob: (userId, jobId) => jobCommand(userId, (me, at) => board.withdraw(me, jobId, at)),
    acceptJob: (userId, jobId, unitId) => jobCommand(userId, (me, at) => board.accept(me, jobId, unitId, at)),
    jobs(userId, filter) {
      return {
        status: options.ready() ? "ready" : "not_ready",
        generatedAt: now(),
        ...board.board(settlement.findOwnerOfUser(userId), filter),
      };
    },
    overview(userId) {
      const at = now();
      const rules = wageRulesOf(options.rules());
      const me = settlement.findOwnerOfUser(userId);
      const view = (c: LaborContract): LaborContractView => ({
        id: c.id,
        kind: c.kind,
        role: c.ownerId === c.workerOwnerId ? "both" : c.ownerId === me ? "owner" : "worker",
        unitId: c.unitId,
        buildingId: c.buildingId,
        rate: String(c.rate),
        deposit: String(c.deposit),
        cyclesLeft: Number(depositCyclesLeft(c)),
        warning: laborWarning(c, rules.labor),
        state: c.state,
        startedAt: c.startedAtMs,
        endsAt: c.endsAtMs,
        nextDueAt: isOpen(c) ? c.nextDueMs : null,
        graceUntil: c.graceUntilMs,
        endedAt: c.endedAtMs,
        endReason: c.endReason,
        paidTotal: String(c.paidTotal),
        settledAt: c.settledAtMs,
        leftoversMovedAt: c.leftoversMovedAtMs,
      });
      const list =
        me === undefined
          ? []
          : [...contracts.values()]
              .filter(
                (c) =>
                  (c.ownerId === me || c.workerOwnerId === me) &&
                  (c.state !== "ended" || finishedAt(c) > at - KEEP_ENDED_MS),
              )
              .toSorted((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || b.id - a.id)
              .map(view);
      const buildings: LaborBuildingView[] = [];
      const units: LaborUnitView[] = [];
      for (const map of maps.values()) {
        map.forEachBuilding((building) => {
          const rent = rents.get(building.id);
          const posted =
            rent && rent.rentPerHour > 0n && rent.ownerId === building.ownerId
              ? String(rent.rentPerHour)
              : null;
          const own = me !== undefined && building.ownerId === me;
          if (own || (posted !== null && building.ownerId !== null))
            buildings.push({ id: building.id, own, rent: posted });
        });
        if (me !== undefined)
          map.forEachUnit((unit) => {
            if (unit.ownerId === me) units.push({ id: unit.id, kind: unit.kind, busy: unitBusy(unit.id) });
          });
      }
      return {
        status: options.ready() ? "ready" : "not_ready",
        generatedAt: at,
        currency: ASSET_CREDIT,
        balance: String(me === undefined ? 0n : ledger.balanceOf(me, ASSET_CREDIT)),
        rules: {
          wageCycleMs: rules.labor.wageCycleMs,
          depositDays: rules.labor.depositDays,
          warnDays: rules.labor.warnDays,
          rentCycleMs: rules.labor.rentCycleMs,
          graceMs: rules.labor.graceMs,
          adjustMinPm: rules.adjustMinPm,
          adjustMaxPm: rules.adjustMaxPm,
          efficiency: rules.efficiency,
          rateMilli: rules.rateMilli,
          depositCycles: Number(requiredDeposit(1n, rules.labor)),
        },
        contracts: list,
        buildings: buildings.toSorted((a, b) => Number(b.own) - Number(a.own) || a.id - b.id),
        units: units.toSorted((a, b) => a.id - b.id),
        jobs: board.mine(me),
      };
    },
    check: () => checkLaborEscrow(contracts.values(), ledger),
  };
}

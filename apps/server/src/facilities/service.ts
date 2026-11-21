// 건물(시설) 서비스(서버 권위) — docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15·N54, D-171·D-508·D-509·D-514
// 셈은 @terra/shared/facilityBuild(재료·건설 시간)·facilityRuntime(노화·수리·일꾼·장인)이고, 여기는 소유·자리·재료 빼기·작업·저장이다.
// - 짓기: 내 2차맵 빈 칸(필지가 아직 없다 — 확인 대기)에 시설 레벨 1. 재료를 주인 원장에서 빼고(materials.ts), 건물 칸을 놓고, 짓기 작업을
//   건다(같은 동기 처리 = 같은 커밋, 커밋 뒤 답 U2). 일꾼 없이도 지어지고 일꾼(내 유닛)이 있으면 줄어든다(N50).
// - 레벨업: 다음 레벨 재료·시간(M14). 올리는 동안 지금 레벨로 일한다. 수리: 한 번에 10% × 단계, 재료 = 지금 레벨 건설 재료 × 비율,
//   노동(유닛 하나 이상) 필요(D-171). 장비 수리: 공방 수리 줄 재료를 시작할 때 빼고, 끝날 때 보유 물건 서비스 repair(F11·F12)로 고친다.
// - 노화(D-509): 1분마다 다 지은 시설의 상태를 흐른 시간만큼 줄인다(쓰지 않으면 30%까지, 쓰면 — 일하는 노동 계약·장비 수리 작업 — 더,
//   30% 아래로도). ‰가 바뀔 때만 저장한다(저장한 (값, 시각) 짝이 늘 맞아 다시 켜도 같은 식으로 잇는다).
// - 작업 끝: 1초마다 끝난 작업을 끝 시각으로 적용한다(다시 켜면 지난 작업을 그 시각으로 바로 적용 — 복구).
// - 30% 미만·짓는 중인 시설은 일하지 않는다: 노동 계약 정산(labor/service.ts)이 works를 물어 그 구간 산출을 없앤다.
// - 영토 비콘(기획 336)은 영토 서비스가 짓기·노화를 하고, 수리 작업만 여기서 한다(같은 재료·노동 규칙). 비콘 재료는 그 세력에서 비콘
//   칸과 가장 가까운 도시의 내 도시 창고 + 그 도시의 내 창고 시설에서만(질문 410 ①, places.ts beaconMaterialScope).
// - 전투 피해(질문 381, "바뀜 (전투·건물)"): damage가 잃은 내구도만큼 상태를 줄인다(0 = 폐허 = 기능 정지, 칸은 그대로·수리로 되돌림).
//   공격 명령·전투 시작은 attack.ts, 결과 적용 고리는 world/battleTargets.ts.
// - "바뀜 (창고·직무)"(D-516 361·364·382): 재료는 건물이 선 도시 창고 + 그 도시의 내 창고 시설 + 그 2차맵 내 유닛 화물에서만 꺼낸다
//   (places.ts). 작업(짓기·레벨업·수리·장비 수리)에 묶인 유닛은 그 동안 원래 직무 산출을 내지 않는다(소유 주체 정산이 pausesFor를 물어
//   그 구간 산출을 버린다, 작업이 끝나거나 지워지기 전에 그 시각까지 정산한다). 창고 시설 넣기·꺼내기는 storage.ts.
// - 행정 건물(단계 government, D-510 폐허 정부): 주인 없는(또는 정부 건물이 0%·사라진, 487 다) 폐허 자리(그 칸에서 가장 가까운 도시·폐허 =
//   그 폐허)에만 짓고, 짓기 시작한 쪽이 폐허 주인이 된다(고리 GovernmentHook = 폐허 서비스, docs/adr/2026-11-07-ruins-restoration.md). 같은
//   동기 처리 = 같은 커밋. 시설 줄 도시는 그 폐허(되살아날 도시 ID)다 — 되살아난 도시의 행정 레벨 = 그 건물 레벨(489 다). 짓는 재료는
//   지금처럼 그 칸에서 가장 가까운 도시 창고·창고 시설·화물에서.
//   도시도 폐허도 없는 2차맵에도 짓는다(빈 2차맵 알박기, 기획 D-572 — 시설 줄 도시를 비워 두고 다 지으면 그 편의 새 도시, ruins/landClaim.ts).
import type { FacilityResultCode } from "@terra/protocol";
import { buildingLocation, cityLocation, cityOfCell } from "@terra/shared/goodsPlaces";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import { DEFAULT_LAND_CLAIM_MODE } from "@terra/shared/facilities";
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  advanceCondition,
  conditionWorks,
  maxDurabilityAt,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  withBuilders,
} from "@terra/shared/facilityRuntime";
import { PLACEMENT_SIZE, type StatRow, TEST_STAT_TABLE, craftScore } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityDef } from "./catalog.ts";
import { type GoodsScope, grantGoods, hasGoods, spendGoods } from "./materials.ts";
import { waterOk } from "./water.ts";
import { exchangeBuildProblem, exchangeKindOf } from "../market/exchangeBuildings.ts";
import { PLACE_CODES, averagePrimaries } from "./serviceHelpers.ts";
import {
  type EquipmentRepairDeps,
  type OutsourceQuote,
  type RepairItem,
  outsourceQuote,
  repairMaterialsHourly,
  shopWorkers,
  startEquipmentRepair,
} from "./equipmentRepair.ts";
import {
  PLOT_JOB,
  type PlotCommands,
  type PlotDeps,
  type PlotResult,
  addPlot,
  chooseTier,
  plotOpen,
  removePlot,
} from "./plots.ts";
import { type ClaimCommands, chooseClaim } from "./claimChoice.ts";
import {
  type PlaceWorld,
  beaconMaterialScope,
  buildingOfLocation,
  buildingPlace,
  cityAt,
  cityToFill,
  isStorage,
  materialScope,
} from "./places.ts";
import { type StorageMoveInput, moveStorage, rehomeBuildingGoods } from "./storage.ts";
import {
  type FacilityBuildInput,
  type FacilityCommandResult,
  type FacilityTarget,
  type GovernmentHook,
  type NpcBuildInput,
  type NpcJobInput,
  type OperatorBuild,
  type StorageOutHook,
  operatorMs,
  type FacilityServiceOptions,
} from "./serviceTypes.ts";
import type { BusinessCommand, BusinessCommandResult, BusinessCommands } from "../business/commands.ts";
import {
  type FacilityRecord,
  type JobKind,
  type JobMaterial,
  type JobRecord,
  facilityRow,
  jobRow,
} from "./state.ts";

/** 작업 끝 확인 간격(ms) */
export const JOB_TICK_MS = 1_000;
/** 노화 간격(ms, D-512 "분 단위") */
export const CONDITION_TICK_MS = 60_000;

export type {
  FacilityBuildInput,
  FacilityCommandResult,
  FacilityServiceOptions,
  FacilityTarget,
  GovernmentHook,
  NpcBuildInput,
  NpcJobInput,
  OperatorBuild,
  StorageOutHook,
} from "./serviceTypes.ts";

/** 면적 모듈 붙이기·떼기·기르는 티어 고르기(건물 채집소, 기획 D-567·D-569 1761·1765)는 plots.ts PlotCommands */
export interface FacilityService extends PlotCommands, ClaimCommands {
  build(userId: string, input: FacilityBuildInput): Promise<FacilityCommandResult>;
  /**
   * NPC 증축 짓기(질문 1101 나): 플레이어 짓기와 같이 그 도시 창고·창고 시설에서 재료를 빼고, 건물 칸을 놓고(레벨 0), 짓기 작업을 건다(일꾼 유닛을
   * 묶지 않는다 — NPC 휴먼은 소유 주체 정산을 받지 않아 일꾼 수는 시간 셈에만 든다). 동기(쓰기 대기열 같은 묶음)
   */
  npcBuild(input: NpcBuildInput): FacilityCommandResult;
  /**
   * NPC 레벨 올리기·수리(질문 1146 나·1114 가): 플레이어 upgrade·repair와 같이 그 건물이 선 도시 창고·창고 시설에서 재료를 빼고 작업을 건다(일꾼
   * 유닛을 묶지 않는다). 동기(쓰기 대기열 같은 묶음)
   */
  npcJob(input: NpcJobInput): FacilityCommandResult;
  /** 레벨 올리기. operator = 운영자 모드(재료 없이, 시간 0 — FacilityBuildInput.operator와 같다) */
  upgrade(
    userId: string,
    buildingId: number,
    unitIds: readonly number[],
    operator?: OperatorBuild,
  ): Promise<FacilityCommandResult>;
  repair(
    userId: string,
    target: FacilityTarget,
    steps: number,
    unitIds: readonly number[],
  ): Promise<FacilityCommandResult>;
  repairEquipment(
    userId: string,
    buildingId: number,
    holdingId: number,
    unitIds: readonly number[],
  ): Promise<FacilityCommandResult>;
  /** 남의 공방 외주 수리 견적(D-570 1785 — 그 공방 일꾼·시간·요금). 받을 수 없으면 결과 코드 */
  outsourceQuote(buildingId: number, item: RepairItem): OutsourceQuote | FacilityResultCode;
  /** 그 공방에서 지금 외주 수리를 맡을 수 있는 일꾼(ID 차례) */
  shopWorkers(buildingId: number): number[];
  /** 외주 시간당 재료비(적정가 몫, 기획 대조 2167 — equipmentRepair.ts repairMaterialsHourly) */
  repairMaterialsHourly(buildingId: number): bigint;
  /** 개발 시험 재료 받기: at(짓는 자리)이 속한 도시 창고로(없으면 첫 2차맵 가운데 칸, 도시가 없으면 내 첫 유닛 화물) */
  devFacilityGrant(
    userId: string,
    item: string,
    qty: number,
    at?: { readonly mapKey: number; readonly x: number; readonly y: number },
  ): Promise<FacilityCommandResult>;
  /** 창고 시설 넣기·꺼내기(storage.ts) */
  storageMove(userId: string, input: StorageMoveInput): Promise<FacilityCommandResult>;
  devFinish(userId: string, target: FacilityTarget): Promise<FacilityCommandResult>;
  /**
   * 전투 피해(질문 381): 잃은 내구도 점만큼 상태(ppm)를 줄인다(destroyed면 0 = 폐허, 칸은 그대로·수리로 되돌림 — 366). 짓는 중이어도 준다
   * (다 지으면 그 상태로 선다). 쓰기 대기열에만 쓴다(전투 결과 기록과 같은 커밋). 시설이 아니면 false
   */
  damage(buildingId: number, lost: number, destroyed: boolean, atMs: number): boolean;
  /** 끝난 작업을 적용한다(끝 시각 차례). 적용한 수 */
  finishDue(nowMs: number): number;
  /** 다 지은 시설의 상태를 nowMs까지 흐르게 한다. 저장한 수 */
  age(nowMs: number): number;
  /** 그 건물이 지금 일하나(시설이 아닌 건물 = 관리자 시험 건물은 늘 true) */
  works(buildingId: number): boolean;
  /** 공방에서 고치는 중인 물건인가 */
  holdingLocked(holdingId: number): boolean;
  /** 그 유닛이 건물 작업(짓기·레벨업·수리·장비 수리)에 묶였나 — 노동 계약을 맺지 못한다 */
  unitInJob(unitId: number): boolean;
  /**
   * 작업에 묶인 유닛 → 산출 없는 구간(작업 시작 ~ 끝, D-516 364). 소유 주체 정산이 부른다. 지금 메모리에 있는 작업만 본다(끝나거나 지우기 전에
   * 그 시각까지 정산하므로 지난 작업의 구간은 이미 정산됐다)
   */
  pausesFor(ownerId: number): ReadonlyMap<number, readonly { fromMs: number; untilMs: number }[]> | undefined;
  /** 물건 자리 셈의 세계(화면 자료가 쓴다) */
  readonly places: PlaceWorld;
  /** 행정 건물(폐허 정부) 짓기 고리를 붙인다(없으면 행정 건물은 not_ruin) */
  attachGovernment(hook: GovernmentHook): void;
  /**
   * 창고 꺼내기(out) 고리(질문 1091 가, gather/station.ts haulOut): 채집소 창고에서 꺼내면 운반꾼이 거리 시간 뒤에 도시 창고로 나른다. 고리가
   * undefined를 돌려주면(채집소 아님·거리 0) 예전처럼 바로 옮긴다
   */
  attachStorageOut(hook: StorageOutHook | undefined): void;
  /** 물자 거래소 건물 창고 넣기(in) 고리(기획 D-564 1628, gather/station.ts haulIn — 도시 창고 → 운반꾼 → 거래소 건물) */
  attachExchangeIn(hook: StorageOutHook | undefined): void;
  /**
   * 사업장 판매 물건 나르기(기획 D-569 1784, business/commands.ts carry): seller의 그 건물 창고 → buyer의 그 도시 창고를 운반꾼 고리로.
   * 고리가 없거나 맡지 않으면 undefined(부르는 쪽이 바로 옮긴다)
   */
  carryOut(
    sellerId: number,
    buyerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
    via?: StorageMoveInput["via"],
    keep?: { readonly asset: string; readonly amount: bigint },
  ): FacilityResultCode | null | undefined;
  /** 채집소 자동 옮김의 주인 구매(기획 D-569 1781, business/commands.ts sellTo). 장부 고리가 없으면 qty 그대로(값 없이 옮김 — 시험) */
  ownerSale(ownerId: number, buildingId: number, asset: string, qty: bigint, atMs: number): bigint;
  /** 사업장 장부 명령을 잇는다(건물 세계 — business/commands.ts, 프로토콜 34) */
  attachBusiness(commands: BusinessCommands | undefined): void;
  /** 사업장 장부 명령(정산·넣기·사기·값·선물 — 건물 게이트웨이가 넘긴다). 고리가 없으면 busy */
  businessCommand(
    userId: string,
    command: BusinessCommand,
    operator?: boolean,
  ): Promise<BusinessCommandResult>;
  /**
   * 다 지은 시설 줄을 그대로 넣는다(세계 씨앗 = NPC 시작 도시 기본 시설, facilities/npcSeed.ts). 건물 칸은 부르는 쪽이 먼저 놓는다.
   * 재료·작업 없이 쓰기 대기열에만 쓴다(건물 칸과 같은 묶음)
   */
  seedBuilt(record: FacilityRecord): void;
  /**
   * 처음 짓기 작업을 멈춘다(재료는 돌려주지 않는다 — 빈 2차맵 알박기에서 남의 도시가 서면, D-572 "자원과 시간만 날릴수있음", ruins/landClaim.ts).
   * 건물은 레벨 0(짓는 중 모습)인 채 남는다. 짓던 작업이 없으면 false
   */
  haltBuild(buildingId: number, atMs: number): boolean;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly jobs: ReadonlyMap<number, JobRecord>;
  stop(): void;
}

const fail = (code: FacilityResultCode): FacilityCommandResult => ({ ok: false, code });

export function createFacilityService(options: FacilityServiceOptions): FacilityService {
  const { maps, settlement, ledger, writer, now } = options;
  const facilities = new Map<number, FacilityRecord>(options.loaded.facilities.map((f) => [f.buildingId, f]));
  const jobs = new Map<number, JobRecord>(options.loaded.jobs.map((job) => [job.id, job]));
  let lastJobId = options.loaded.maxJobId;
  let government: GovernmentHook | undefined;
  let storageOut: StorageOutHook | undefined;
  let exchangeIn: StorageOutHook | undefined;
  let business: BusinessCommands | undefined;
  const runtime = (): FacilityRuntimeRules => options.rules().facilityRuntime;
  const saveFacility = (record: FacilityRecord): void => writer.upsert("facilities", facilityRow(record));
  /**
   * 작업을 지운다. 일꾼이 있으면 먼저 그 주체를 atMs(작업 끝 또는 지우는 때)까지 정산한다: 작업 동안의 직무 산출을 버린 채 정산되고,
   * 지운 뒤에는 다시 산출이 난다(D-516 364)
   */
  const dropJob = (job: JobRecord, atMs: number): void => {
    // 일꾼 주인마다(외주 수리는 공방 일꾼 주인도 — D-570 1785) 작업 끝까지 정산한다
    const owners = new Set(job.unitIds.length > 0 ? [job.ownerId] : []);
    for (const unitId of job.unitIds) owners.add(unitOwner(unitId) ?? job.ownerId);
    for (const owner of owners) settlement.settleOwner(owner, Math.min(atMs, job.doneAtMs));
    jobs.delete(job.id);
    writer.remove("facilityJobs", { id: job.id });
  };
  const places: PlaceWorld = {
    maps,
    facilities,
    catalog: options.catalog,
    cities: options.cities ?? (() => []),
    province: options.province,
  };
  /**
   * 건물 재료를 꺼내는 자리(그 건물이 선 도시·2차맵). 내 건물이면 그 사업장 창고를 먼저 쓴다(D-555 1505 — 레벨업·수리·장비 수리가 장부의
   * "유지" 칸에 그 사업장 몫으로 남는다)
   */
  const scopeOf = (me: number, buildingId: number): GoodsScope => {
    const place = buildingPlace(places, buildingId);
    if (!place) return [];
    const rest = materialScope(places, me, place.mapKey, place.cityId);
    return place.ownerId === me ? [buildingLocation(buildingId), ...rest] : rest;
  };
  /** 시설 줄에 도시가 없으면(직전 판 앱이 넣은 줄) 건물 칸에서 정해 적는다 */
  // 비어 있는 시설 줄 도시를 칸으로 채운다. 알박기 중(도시 없는 행정 건물)은 채우지 않는다(places.ts cityToFill)
  const fillCity = (record: FacilityRecord): void => {
    const cityId = cityToFill(places, record);
    if (cityId === null) return;
    record.cityId = cityId;
    saveFacility(record);
  };

  const buildingAt = (buildingId: number): { map: SecondMap; owner: number | null } | undefined => {
    for (const map of maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return { map, owner };
    }
    return undefined;
  };
  const unitOwner = (unitId: number): number | undefined => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  const jobOn = (pick: (job: JobRecord) => boolean): JobRecord | undefined => {
    for (const job of jobs.values()) if (pick(job)) return job;
    return undefined;
  };
  const unitInJob = (unitId: number): boolean => jobOn((job) => job.unitIds.includes(unitId)) !== undefined;
  const weightOf = (item: string) => options.catalog().weightOf(item);

  /** 일꾼 확인: 내 유닛, 겹치지 않음, 다른 작업·계약이 아님 */
  const checkUnits = (me: number, unitIds: readonly number[]): FacilityResultCode | null => {
    if (new Set(unitIds).size !== unitIds.length) return "unknown_unit";
    for (const unitId of unitIds) {
      const owner = unitOwner(unitId);
      if (owner === undefined) return "unknown_unit";
      if (owner !== me) return "forbidden";
      if (unitInJob(unitId) || options.labor?.unitBusy(unitId)) return "unit_busy";
    }
    return null;
  };

  /** 지금 레벨의 건설 재료·시간(수리 셈의 바탕) */
  /** 재료 줄에 받는 아이템을 붙인다(레벨 0 재료는 같은 원자재 종류 T0~T1 — 기획 D-562 1563·1564) */
  const withAccepts = (materials: readonly JobMaterial[]): JobMaterial[] => {
    const accepts = options.catalog().bareHandAccepts?.bind(options.catalog());
    return materials.map((stack) => (accepts ? { ...stack, accepts: accepts(stack.item) } : stack));
  };
  const levelCost = (def: FacilityDef, level: number): { materials: JobMaterial[]; ms: number } => {
    if (!def.build || level < 1) return { materials: [], ms: 0 };
    return {
      materials: withAccepts(buildCostAt(def.build, level)),
      ms: buildTimeAt(def.build, level, weightOf, options.rules().facilityBuild).ms,
    };
  };

  /** 상태를 nowMs까지 흐르게 한다(메모리만). 짓는 중이면 그대로 */
  const advance = (record: FacilityRecord, at: number): void => {
    if (record.level < 1 || at <= record.conditionAtMs) return;
    const inUse =
      (options.labor?.buildingInUse(record.buildingId) ?? false) ||
      jobOn((job) => job.kind === "equipment" && job.buildingId === record.buildingId) !== undefined;
    record.conditionPpm = advanceCondition(record.conditionPpm, at - record.conditionAtMs, inUse, runtime());
    record.conditionAtMs = at;
  };

  const newJob = (fields: Omit<JobRecord, "id">): JobRecord => {
    lastJobId += 1;
    const job: JobRecord = { ...fields, id: lastJobId };
    jobs.set(job.id, job);
    writer.upsert("facilityJobs", jobRow(job));
    return job;
  };

  /** 작업을 끝 시각으로 적용한다(대상이 사라졌으면 지우기만) */
  const finish = (job: JobRecord): void => {
    const at = job.doneAtMs;
    dropJob(job, at);
    if (job.kind === "beacon_repair") {
      if (job.beaconId !== null) options.territory?.()?.repairBeacon(job.beaconId, job.restorePpm ?? 0, at);
      return;
    }
    const record = job.buildingId === null ? undefined : facilities.get(job.buildingId);
    if (!record) return;
    if (job.kind === "build") {
      // 짓기 시작 때 가득(CONDITION_FULL)으로 둔 상태 그대로 선다. 짓는 동안 전투 피해를 받았으면 그만큼 준 채로(질문 381)
      record.level = job.targetLevel ?? 1;
      record.conditionAtMs = at;
    } else if (job.kind === "upgrade") {
      advance(record, at);
      record.level = job.targetLevel ?? record.level + 1;
    } else if (job.kind === "plot") {
      // 면적 모듈 하나 붙음(기획 D-569 1765)
      record.plots = Math.max(0, Math.trunc(record.plots ?? 0)) + 1;
    } else if (job.kind === "repair") {
      advance(record, at);
      record.conditionPpm = Math.min(CONDITION_FULL, record.conditionPpm + (job.restorePpm ?? 0));
    } else if (job.kind === "equipment" && job.holdingId !== null) {
      const def = options.catalog().facility(record.facilityId);
      const craftsmen = job.unitIds.map((unitId) => options.holdings.primariesOf(unitId));
      options.holdings.service.repair(job.holdingId, {
        facilityLevel: Math.max(1, record.level),
        rules: def?.repair ?? [],
        craftsman: averagePrimaries(craftsmen),
      });
    }
    saveFacility(record);
  };

  const ownerFor = (userId: string, at: number): number | undefined =>
    options.ready() ? settlement.ownerOfUser(userId, at).id : undefined;
  const done = async (result: FacilityCommandResult): Promise<FacilityCommandResult> => {
    // 재료·소유가 바뀌는 명령은 커밋 뒤에 답한다(S3 U2)
    await writer.durable();
    return result;
  };

  /** 내 시설(건물 주인 = 나) */
  const myFacility = (
    me: number,
    buildingId: number,
  ): { record: FacilityRecord; def: FacilityDef } | FacilityResultCode => {
    const building = buildingAt(buildingId);
    if (!building) return "unknown_building";
    if (building.owner !== me) return "forbidden";
    const record = facilities.get(buildingId);
    if (!record) return "not_facility";
    const def = options.catalog().facility(record.facilityId);
    if (!def) return "unknown_facility";
    fillCity(record);
    return { record, def };
  };

  /** 남이 쓰는 사업장 시설(외주 — 주인이 있는 시설 줄) */
  const shopFacility = (
    buildingId: number,
  ): { record: FacilityRecord; def: FacilityDef } | FacilityResultCode => {
    const building = buildingAt(buildingId);
    if (!building) return "unknown_building";
    if (building.owner === null) return "forbidden";
    const record = facilities.get(buildingId);
    if (!record) return "not_facility";
    const def = options.catalog().facility(record.facilityId);
    if (!def) return "unknown_facility";
    fillCity(record);
    return { record, def };
  };

  /** 면적 모듈 붙이기(plots.ts) 고리 */
  const plotDeps: PlotDeps<FacilityDef> = {
    now,
    ownerFor,
    myFacility,
    save: saveFacility,
    rules: () => options.rules().buildingGather,
    spend: (me, list, at, id) => spendGoods(ledger, me, list, at, "facility_plot", scopeOf(me, id)),
    levelMaterials: (def, level) => levelCost(def, level).materials,
    levelMs: (def, level) => levelCost(def, level).ms,
    withBuilders: (ms, builders) => withBuilders(ms, builders, runtime()),
    checkUnits,
    jobRunning: (id) => jobOn((job) => job.buildingId === id && job.kind !== "equipment") !== undefined,
    startJob: (input) => {
      const job = newJob({ ...PLOT_JOB, ...input });
      if (job.doneAtMs <= job.startedAtMs) finish(job);
    },
  };
  const plotDone = async (result: PlotResult): Promise<FacilityCommandResult> =>
    result.ok ? done(result) : result;

  const craftScoreOf = (unitId: number): number => {
    const table: readonly StatRow[] = options.holdings.statTable() ?? TEST_STAT_TABLE;
    return craftScore(options.holdings.primariesOf(unitId), table);
  };

  /** 장비 수리(equipmentRepair.ts — 내 공방·외주 D-570 1785) 고리 */
  const repairDeps: EquipmentRepairDeps = {
    ledger,
    holdings: options.holdings,
    runtime,
    destroyAtMax: () => options.rules().durability.destroyAtMax,
    business: () => business,
    owner: (buildingId) => buildingAt(buildingId)?.owner,
    myFacility,
    shopFacility,
    suspended: (buildingId) => options.suspended?.(buildingId) ?? false,
    jobOn,
    checkUnits,
    scopeOf,
    craftScoreOf,
    workersAt: (buildingId) => options.labor?.workersAt?.(buildingId) ?? [],
    unitTaken: (unitId) => unitInJob(unitId) || (options.labor?.unitAway?.(unitId) ?? false),
    startJob: (fields) => {
      const job = newJob(fields);
      if (job.doneAtMs <= job.startedAtMs) finish(job);
    },
  };

  const finishDue = (nowMs: number): number => {
    const due = [...jobs.values()]
      .filter((job) => job.doneAtMs <= nowMs)
      .toSorted((a, b) => a.doneAtMs - b.doneAtMs || a.id - b.id);
    for (const job of due) finish(job);
    return due.length;
  };

  const age = (nowMs: number): number => {
    let saved = 0;
    // Map을 돌면서 지금 줄을 지워도 된다(남은 줄은 그대로 돈다)
    for (const record of facilities.values()) {
      // 건물이 사라졌으면(관리자 지움) 시설 줄과 작업을 지운다
      if (!buildingAt(record.buildingId)) {
        for (const job of jobs.values()) if (job.buildingId === record.buildingId) dropJob(job, nowMs);
        // 창고 시설·임대 몫의 물건은 주인마다 그 도시 창고로(도시를 모르면 위치 없음)
        rehomeBuildingGoods(ledger, record.buildingId, record.cityId, nowMs);
        options.onGone?.(record.buildingId);
        facilities.delete(record.buildingId);
        writer.remove("facilities", { building_id: record.buildingId });
        continue;
      }
      fillCity(record);
      const before = Math.floor(record.conditionPpm / 1000);
      advance(record, nowMs);
      if (Math.floor(record.conditionPpm / 1000) !== before) {
        saveFacility(record);
        saved += 1;
      }
    }
    // 시설 줄이 없는 사라진 건물(관리자 시험 건물의 임대 몫)의 물건도 돌려놓는다(도시를 모르면 위치 없음)
    const gone = new Set<number>();
    for (const account of ledger.accounts()) {
      const buildingId = buildingOfLocation(account.location);
      if (
        buildingId !== undefined &&
        account.balance > 0n &&
        !facilities.has(buildingId) &&
        !buildingAt(buildingId)
      )
        gone.add(buildingId);
    }
    for (const buildingId of gone) rehomeBuildingGoods(ledger, buildingId, null, nowMs);
    options.onAge?.(nowMs);
    return saved;
  };

  const timers = options.manual
    ? []
    : [setInterval(() => finishDue(now()), JOB_TICK_MS), setInterval(() => age(now()), CONDITION_TICK_MS)];
  for (const timer of timers) timer.unref();

  return {
    facilities,
    jobs,
    finishDue,
    age,
    damage(buildingId, lost, destroyed, atMs) {
      const record = facilities.get(buildingId);
      const def = record ? options.catalog().facility(record.facilityId) : undefined;
      if (!record || !def) return false;
      advance(record, atMs);
      const max = maxDurabilityAt(def.durability, Math.max(1, record.level), runtime());
      const loss = destroyed ? record.conditionPpm : Math.ceil((lost * CONDITION_FULL) / Math.max(1, max));
      record.conditionPpm = Math.max(0, record.conditionPpm - loss);
      saveFacility(record);
      return true;
    },
    works(buildingId) {
      const record = facilities.get(buildingId);
      if (!record) return true;
      if (options.suspended?.(buildingId)) return false;
      return record.level >= 1 && conditionWorks(record.conditionPpm, runtime());
    },
    holdingLocked: (holdingId) =>
      jobOn((job) => job.kind === "equipment" && job.holdingId === holdingId) !== undefined,
    unitInJob,
    places,
    attachGovernment(hook) {
      government = hook;
    },
    attachStorageOut(hook) {
      storageOut = hook;
    },
    attachExchangeIn(hook) {
      exchangeIn = hook;
    },
    ownerSale: (ownerId, buildingId, asset, qty, atMs) =>
      business ? business.sellTo(ownerId, buildingId, asset, qty, atMs) : qty,
    carryOut(sellerId, buyerId, buildingId, asset, qty, atMs, via, keep) {
      if (qty <= 0n || qty > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
      const input = { buildingId, asset, qty: Number(qty), direction: "out" as const, via };
      return storageOut?.(buyerId, input, atMs, sellerId, keep);
    },
    attachBusiness(commands) {
      business = commands;
    },
    async businessCommand(userId, command, operator) {
      if (!business) return { ok: false, code: "busy" };
      return business.run(userId, command, operator === true);
    },
    seedBuilt(record) {
      facilities.set(record.buildingId, record);
      saveFacility(record);
    },
    haltBuild(buildingId, atMs) {
      const job = jobOn((entry) => entry.kind === "build" && entry.buildingId === buildingId);
      if (!job) return false;
      dropJob(job, atMs);
      return true;
    },
    pausesFor(ownerId) {
      // 작업에 묶인 유닛의 주인 기준(외주 수리는 맡긴 사람의 작업에 공방 일꾼이 묶인다 — D-570 1785)
      const out = new Map<number, { fromMs: number; untilMs: number }[]>();
      for (const job of jobs.values()) {
        for (const unitId of job.unitIds) {
          if ((unitOwner(unitId) ?? job.ownerId) !== ownerId) continue;
          const list = out.get(unitId) ?? [];
          list.push({ fromMs: job.startedAtMs, untilMs: job.doneAtMs });
          out.set(unitId, list);
        }
      }
      return out.size > 0 ? out : undefined;
    },

    async build(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const def = options.catalog().facility(input.facility);
      if (!def) return fail("unknown_facility");
      if (!def.footprint || !def.build || def.stage === "territory") return fail("not_buildable");
      const map = maps.get(input.mapKey);
      if (!map) return fail("unknown_map");
      // 물가 조건(질문 947 나, 팩 needsWaterWithin — 낚시터): 건물 칸 둘레 N 배치 칸 안에 물 칸이 있어야 한다(NPC 씨앗과 같은 함수)
      if (!waterOk(map, def, input.x, input.y, input.rotation)) return fail("needs_water");
      // 행정 건물(D-510): 주인 없는 폐허 자리 — 짓기 시작한 쪽이 주인. 도시·폐허 없는 2차맵이면 알박기(D-572, 시설 줄 도시는 비워 두고 다
      // 지으면 새 도시 — ruins/landClaim.ts)
      let ruinId: number | undefined;
      let landClaim = false;
      if (def.stage === "government") {
        const claim = government?.check(me, input.mapKey, input.x, input.y);
        if (!claim) return fail("not_ruin");
        if (!claim.ok) return fail(claim.code);
        if (claim.ruinId === null) landClaim = true;
        else ruinId = claim.ruinId;
      }
      const unitIds = input.unitIds ?? [];
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const operator = input.operator;
      const packCost = levelCost(def, 1);
      // 운영자 모드는 재료 없이(D-560 1239·D-564 1663)
      const cost = operator ? { ...packCost, materials: [] } : packCost;
      // 재료 자리(D-516 361): 짓는 칸이 속한 도시의 창고·창고 시설 + 그 2차맵 내 유닛 화물
      const cityId = cityAt(places, input.mapKey, input.x, input.y);
      // 거래소 건물(D-561): 잠긴 종류·도시 밖·그 도시에 같은 종류가 있으면 못 짓는다(market/exchangeBuildings.ts)
      const exchangeProblem = exchangeBuildProblem(options.catalog(), facilities.values(), def.id, cityId);
      if (exchangeProblem) return fail(exchangeProblem);
      const scope = materialScope(places, me, input.mapKey, cityId);
      if (!hasGoods(ledger, me, cost.materials, scope)) return fail("insufficient_materials");
      // 땅(docs/adr/2026-11-14-second-map-build.md): 다른 세력 도시 2차맵(정부 건물 있음)이면 못 짓는다(결과 코드는 forbidden — 화면은
      // 미리 묻기 facilities.landRule로 까닭을 안다). 정부 건물이 없는 2차맵은 다른 세력 영토 안이어도 짓는다(D-572 알박기 우선). 필지(D-149)는
      // 아직 없다 → 그 밖은 2차맵 빈 칸이면 짓는다. 칸 검사·놓기는 2차맵이 한다. 운영자 모드도 땅 규칙을 본다(D-564 1663 — 운영자 모드가 없애는 것은 재료·건설 시간뿐)
      if (options.land && !(await options.land(me, input.mapKey, { x: input.x, y: input.y })).allowed)
        return fail("forbidden");
      const placed = map.placeBuilding(
        {
          x: input.x,
          y: input.y,
          width: def.footprint.width,
          height: def.footprint.height,
          rotation: input.rotation,
        },
        me,
      );
      if (!placed.ok) return fail(PLACE_CODES[placed.code] ?? "out_of_bounds");
      if (placed.buildingId === undefined) return fail("internal_error");
      spendGoods(ledger, me, cost.materials, at, "facility_build", scope);
      const ms = operatorMs(withBuilders(cost.ms, unitIds.length, runtime()), operator);
      const record: FacilityRecord = {
        buildingId: placed.buildingId,
        facilityId: def.id,
        level: 0,
        conditionPpm: CONDITION_FULL,
        conditionAtMs: at + ms,
        builtAtMs: at,
        builtBy: userId,
        // 행정 건물은 그 폐허(되살아날 도시)의 시설이다(489 다). 알박기 행정 건물은 도시가 설 때까지 비운다
        cityId: landClaim ? null : (ruinId ?? cityId),
        // 알박기 고르기(D-574 — 독립 | 소속 국가 귀속). 고르기 없이 온 명령(51판 이하 기기)은 기본 선택
        ...(landClaim ? { claim: input.claim ?? { mode: DEFAULT_LAND_CLAIM_MODE, regime: null } } : {}),
      };
      facilities.set(record.buildingId, record);
      saveFacility(record);
      const job = newJob({
        kind: "build",
        ownerId: me,
        buildingId: record.buildingId,
        beaconId: null,
        holdingId: null,
        targetLevel: 1,
        restorePpm: null,
        unitIds: [...unitIds],
        materials: cost.materials,
        startedAtMs: at,
        doneAtMs: at + ms,
      });
      if (ms === 0) finish(job);
      if (ruinId !== undefined) government?.claimed(ruinId, me, record.buildingId, at);
      return done({ ok: true, buildingId: record.buildingId, doneAtMs: at + ms });
    },

    npcBuild(input) {
      const at = now();
      const def = options.catalog().facility(input.facility);
      if (!def) return fail("unknown_facility");
      if (!def.footprint || !def.build || def.stage === "territory" || def.stage === "government")
        return fail("not_buildable");
      const map = maps.get(input.mapKey);
      if (!map) return fail("unknown_map");
      if (!waterOk(map, def, input.x, input.y, 0)) return fail("needs_water");
      // 재료 자리: 그 도시 창고·그 도시의 내 창고 시설(유닛 화물은 보지 않는다 — NPC 휴먼은 화물을 들지 않는다)
      const scope = materialScope(places, input.ownerId, input.mapKey, input.cityId, false);
      const materials = withAccepts(input.materials);
      if (!hasGoods(ledger, input.ownerId, materials, scope)) return fail("insufficient_materials");
      const { width, height } = def.footprint;
      const placed = map.placeBuilding({ x: input.x, y: input.y, width, height, rotation: 0 }, input.ownerId);
      if (!placed.ok) return fail(PLACE_CODES[placed.code] ?? "out_of_bounds");
      if (placed.buildingId === undefined) return fail("internal_error");
      spendGoods(ledger, input.ownerId, materials, at, "facility_build", scope);
      const ms = Math.max(0, Math.trunc(input.ms));
      const record: FacilityRecord = {
        buildingId: placed.buildingId,
        facilityId: def.id,
        level: 0,
        conditionPpm: CONDITION_FULL,
        conditionAtMs: at + ms,
        builtAtMs: at,
        builtBy: null,
        cityId: input.cityId,
      };
      facilities.set(record.buildingId, record);
      saveFacility(record);
      const job = newJob({
        kind: "build",
        ownerId: input.ownerId,
        buildingId: record.buildingId,
        beaconId: null,
        holdingId: null,
        targetLevel: 1,
        restorePpm: null,
        unitIds: [],
        materials: [...input.materials],
        startedAtMs: at,
        doneAtMs: at + ms,
      });
      if (ms === 0) finish(job);
      return { ok: true, buildingId: record.buildingId, doneAtMs: at + ms };
    },

    npcJob(input) {
      const at = now();
      const found = myFacility(input.ownerId, input.buildingId);
      if (typeof found === "string") return fail(found);
      const { record, def } = found;
      if (jobOn((job) => job.buildingId === input.buildingId && job.kind !== "equipment"))
        return fail("job_running");
      // NPC 알박기 짓기(npc-claim-3, npc/npcClaims.ts): 레벨 0·도시 없는 행정 건물, 재료 = 날라 온 그 건물 창고, 도시는 채우지 않음(cityToFill)
      const claim = input.kind === "build";
      if (claim && (record.level >= 1 || record.cityId !== null || def.stage !== "government"))
        return fail("not_buildable");
      if (!claim && record.level < 1) return fail("under_construction");
      if (input.kind === "upgrade" && (record.level >= def.maxLevel || !def.build)) return fail("max_level");
      // 면적 모듈(기획 D-569 1768 — 플레이어와 같은 자리 규칙)
      const closed = input.kind === "plot" ? plotOpen(record, def, options.rules().buildingGather) : null;
      if (closed) return fail(closed);
      let restore = 0;
      if (input.kind === "repair") {
        advance(record, at);
        restore = Math.min(
          Math.max(0, Math.trunc(input.restorePpm ?? 0)),
          CONDITION_FULL - record.conditionPpm,
        );
        if (restore <= 0) return fail("not_damaged");
      }
      // 재료 자리: 그 건물이 선 도시의 도시 창고·그 도시의 NPC 창고 시설(유닛 화물은 보지 않는다 — npcBuild와 같다)
      const place = buildingPlace(places, input.buildingId);
      const scope = claim
        ? [buildingLocation(input.buildingId)]
        : place
          ? materialScope(places, input.ownerId, place.mapKey, place.cityId, false)
          : [];
      const reason = claim
        ? "facility_build"
        : input.kind === "upgrade"
          ? "facility_upgrade"
          : input.kind === "plot"
            ? "facility_plot"
            : "facility_repair";
      if (!spendGoods(ledger, input.ownerId, withAccepts(input.materials), at, reason, scope))
        return fail("insufficient_materials");
      const ms = Math.max(0, Math.trunc(input.ms));
      const job = newJob({
        kind: input.kind,
        ownerId: input.ownerId,
        buildingId: input.buildingId,
        beaconId: null,
        holdingId: null,
        targetLevel: input.kind === "upgrade" ? record.level + 1 : claim ? 1 : null,
        restorePpm: input.kind === "repair" ? restore : null,
        unitIds: [],
        materials: [...input.materials],
        startedAtMs: at,
        doneAtMs: at + ms,
      });
      if (ms === 0) finish(job);
      return { ok: true, doneAtMs: at + ms };
    },

    async upgrade(userId, buildingId, unitIds, operator) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const found = myFacility(me, buildingId);
      if (typeof found === "string") return fail(found);
      const { record, def } = found;
      if (jobOn((job) => job.buildingId === buildingId && job.kind !== "equipment"))
        return fail("job_running");
      if (record.level < 1) return fail("under_construction");
      if (record.level >= def.maxLevel || !def.build) return fail("max_level");
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const packCost = levelCost(def, record.level + 1);
      // 운영자 모드는 재료 없이, 시간 0(D-564 1663)
      const cost = operator ? { ...packCost, materials: [] } : packCost;
      if (!spendGoods(ledger, me, cost.materials, at, "facility_upgrade", scopeOf(me, buildingId)))
        return fail("insufficient_materials");
      const ms = operatorMs(withBuilders(cost.ms, unitIds.length, runtime()), operator);
      const job = newJob({
        kind: "upgrade",
        ownerId: me,
        buildingId,
        beaconId: null,
        holdingId: null,
        targetLevel: record.level + 1,
        restorePpm: null,
        unitIds: [...unitIds],
        materials: cost.materials,
        startedAtMs: at,
        doneAtMs: at + ms,
      });
      if (ms === 0) finish(job);
      return done({ ok: true, doneAtMs: at + ms });
    },

    plot: (userId, buildingId, unitIds, operator) =>
      plotDone(addPlot(plotDeps, userId, buildingId, unitIds, operator !== undefined)),
    plotRemove: (userId, buildingId) => plotDone(removePlot(plotDeps, userId, buildingId)),
    gatherTier: (userId, buildingId, tier) => plotDone(chooseTier(plotDeps, userId, buildingId, tier)),
    claimChoice: (userId, buildingId, claim) => plotDone(chooseClaim(plotDeps, userId, buildingId, claim)),

    async repair(userId, target, steps, unitIds) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      if (unitIds.length === 0) return fail("unknown_unit");
      let kind: JobKind;
      let condition: number;
      let cost: { materials: JobMaterial[]; ms: number };
      let buildingId: number | null = null;
      let beaconId: number | null = null;
      let scope: GoodsScope = [];
      if ("buildingId" in target) {
        const found = myFacility(me, target.buildingId);
        if (typeof found === "string") return fail(found);
        if (jobOn((job) => job.buildingId === target.buildingId && job.kind !== "equipment"))
          return fail("job_running");
        if (found.record.level < 1) return fail("under_construction");
        advance(found.record, at);
        kind = "repair";
        condition = found.record.conditionPpm;
        cost = levelCost(found.def, found.record.level);
        buildingId = target.buildingId;
        scope = scopeOf(me, target.buildingId);
      } else {
        const territory = options.territory?.();
        const state = territory?.beaconState(target.beaconId, at);
        if (!territory || !state) return fail("unknown_beacon");
        if (!(await territory.canManage(userId, target.beaconId))) return fail("forbidden");
        if (state.row.readyAtMs !== null && state.row.readyAtMs > now()) return fail("under_construction");
        if (jobOn((job) => job.beaconId === target.beaconId)) return fail("job_running");
        const def = options.catalog().facility("territory_beacon");
        // 재료 자리(질문 410 ①): 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시 창고 + 그 도시의 내 창고 시설(화물 없음)
        const supply = await territory.supplyCity(target.beaconId);
        scope = supply ? beaconMaterialScope(places, me, supply) : [];
        kind = "beacon_repair";
        condition = territory.beaconState(target.beaconId, now())?.conditionPpm ?? state.conditionPpm;
        cost = def ? levelCost(def, 1) : { materials: [], ms: 0 };
        beaconId = target.beaconId;
      }
      const started = now();
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const restore = repairRestorePpm(condition, steps, runtime());
      if (restore <= 0) return fail("not_damaged");
      const materials = withAccepts(repairMaterialsFor(cost.materials, restore));
      if (!spendGoods(ledger, me, materials, started, "facility_repair", scope))
        return fail("insufficient_materials");
      const ms = repairTimeMs(cost.ms, restore, unitIds.length, runtime());
      const job = newJob({
        kind,
        ownerId: me,
        buildingId,
        beaconId,
        holdingId: null,
        targetLevel: null,
        restorePpm: restore,
        unitIds: [...unitIds],
        materials,
        startedAtMs: started,
        doneAtMs: started + ms,
      });
      if (ms === 0) finish(job);
      return done({ ok: true, doneAtMs: started + ms });
    },

    async repairEquipment(userId, buildingId, holdingId, unitIds) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const result = startEquipmentRepair(repairDeps, me, buildingId, holdingId, unitIds, at);
      return result.ok ? done(result) : result;
    },

    outsourceQuote: (buildingId, item) => outsourceQuote(repairDeps, buildingId, item),
    shopWorkers: (buildingId) => shopWorkers(repairDeps, buildingId),
    repairMaterialsHourly: (buildingId) =>
      repairMaterialsHourly(repairDeps, buildingId, (item) => options.catalog().unitPriceOf?.(item) ?? 1n),

    async devFacilityGrant(userId, item, qty, place) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      if (!options.catalog().isGoods(item)) return fail("unknown_item");
      const mapKey = place?.mapKey ?? [...maps.keys()][0];
      const map = mapKey === undefined ? undefined : maps.get(mapKey);
      if (mapKey === undefined || !map) return fail("unknown_map");
      // 짓는 자리(없으면 2차맵 가운데 칸)가 속한 도시 창고. 그 2차맵에 도시가 없으면 내 첫 유닛 화물(재료를 꺼내는 자리와 같다)
      const center = PLACEMENT_SIZE >> 1;
      const city = cityOfCell(places.cities(), mapKey, place?.x ?? center, place?.y ?? center);
      let location: number | undefined = city ? cityLocation(city.id) : undefined;
      if (location === undefined) location = materialScope(places, me, mapKey, null)[0];
      if (location === undefined) return fail("no_place");
      grantGoods(ledger, me, item, qty, at, location);
      return done({ ok: true });
    },

    async storageMove(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const record = facilities.get(input.buildingId);
      if (record) {
        fillCity(record);
        advance(record, at);
      }
      // 사업장 창고 물건은 판매만(기획 D-569 1781): 주인은 꺼내지 못하고 business_buy로 판매가에 산다(돈은 사업장 매출). 창고 시설(주인 물건을
      // 맡아 두는 곳)은 사업장 물건이 아니라 꺼낸다
      if (input.direction === "out") {
        const place = buildingPlace(places, input.buildingId);
        const kept =
          isStorage(places, input.buildingId) ||
          exchangeKindOf(options.catalog(), record?.facilityId ?? "") !== undefined;
        if (place?.ownerId === me && facilities.has(input.buildingId) && !kept) return fail("sale_only");
      }
      // 물자 거래소 건물 넣기는 운반꾼이 도시 창고에서 실어 나른다(D-564 1628 — 거래소에는 실어 나른 물건만)
      if (
        input.direction === "in" &&
        exchangeKindOf(options.catalog(), record?.facilityId ?? "") === "goods" &&
        exchangeIn
      ) {
        if ((record?.level ?? 0) < 1) return fail("under_construction");
        const carried = exchangeIn(me, input, at);
        if (carried !== undefined) return carried === null ? done({ ok: true }) : fail(carried);
      }
      // 창고 꺼내기는 운반꾼이 나른다(질문 1091 가, D-569 1784 — 채집소는 그 일꾼, 다른 건물은 그 건물 일꾼·내 유닛). 고리가 맡지 않으면(옮김 셈 끔·
      // 거리 0·고리 없음) 예전처럼 바로
      const hauled = input.direction === "out" ? storageOut?.(me, input, at) : undefined;
      if (hauled !== undefined) return hauled === null ? done({ ok: true }) : fail(hauled);
      const code = moveStorage(
        { world: places, ledger, catalog: options.catalog(), rules: runtime() },
        me,
        input,
        at,
      );
      return code === null ? done({ ok: true }) : fail(code);
    },

    async devFinish(userId, target) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      if ("beaconId" in target) {
        const territory = options.territory?.();
        if (!territory?.beaconState(target.beaconId, at)) return fail("unknown_beacon");
        const job = jobOn((entry) => entry.beaconId === target.beaconId);
        if (job) {
          job.doneAtMs = at;
          finish(job);
        } else if (!territory.finishBeacon(target.beaconId, at)) return fail("not_damaged");
        return done({ ok: true });
      }
      if (!buildingAt(target.buildingId)) return fail("unknown_building");
      const due = [...jobs.values()].filter((job) => job.buildingId === target.buildingId);
      if (due.length === 0) return fail("not_damaged");
      for (const job of due) {
        job.doneAtMs = Math.max(job.startedAtMs, at);
        finish(job);
      }
      return done({ ok: true });
    },

    stop() {
      for (const timer of timers) clearInterval(timer);
    },
  };
}

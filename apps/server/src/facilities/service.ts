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
import type { LandCheck } from "./landRule.ts";
import type { FacilityResultCode } from "@terra/protocol";
import { type CityCell, cityLocation, cityOfCell } from "@terra/shared/goodsPlaces";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  advanceCondition,
  conditionWorks,
  equipmentRepairMs,
  maxDurabilityAt,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  withBuilders,
} from "@terra/shared/facilityRuntime";
import {
  PLACEMENT_SIZE,
  type Primaries,
  type Rotation,
  type SocietyCoefficients,
  type StatRow,
  TEST_STAT_TABLE,
  craftScore,
  repairMaterials,
  repairRuleFor,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { TerritoryService } from "../territory/service.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import type { FacilityCatalog, FacilityDef } from "./catalog.ts";
import { type GoodsScope, grantGoods, hasGoods, spendGoods } from "./materials.ts";
import { waterOk } from "./water.ts";
import {
  type PlaceWorld,
  beaconMaterialScope,
  buildingOfLocation,
  buildingPlace,
  cityAt,
  materialScope,
} from "./places.ts";
import { type StorageMoveInput, moveStorage, rehomeBuildingGoods } from "./storage.ts";
import {
  type FacilityRecord,
  type JobKind,
  type JobMaterial,
  type JobRecord,
  type LoadedFacilities,
  facilityRow,
  jobRow,
} from "./state.ts";

/** 작업 끝 확인 간격(ms) */
export const JOB_TICK_MS = 1_000;
/** 노화 간격(ms, D-512 "분 단위") */
export const CONDITION_TICK_MS = 60_000;

export type FacilityCommandResult =
  | { readonly ok: true; readonly buildingId?: number; readonly doneAtMs?: number }
  | { readonly ok: false; readonly code: FacilityResultCode };

export type FacilityTarget = { readonly buildingId: number } | { readonly beaconId: number };

/** 행정 건물(폐허 정부) 짓기 고리 — 폐허 서비스(src/ruins/service.ts)가 붙인다 */
/** 창고 꺼내기 고리: null = 맡아 처리함(성공), 코드 = 맡아 실패, undefined = 맡지 않음 */
export type StorageOutHook = (
  ownerId: number,
  input: StorageMoveInput,
  atMs: number,
) => FacilityResultCode | null | undefined;

export interface GovernmentHook {
  /** 그 칸이 주인 없는 폐허 자리인가(주체가 짓기 시작하면 주인이 될 수 있나) */
  check(
    ownerId: number,
    mapKey: number,
    x: number,
    y: number,
  ):
    | { readonly ok: true; readonly ruinId: number }
    | { readonly ok: false; readonly code: FacilityResultCode };
  /** 짓기를 시작했다(같은 동기 처리): 주인이 된다 */
  claimed(ruinId: number, ownerId: number, buildingId: number, atMs: number): void;
}

export interface FacilityBuildInput {
  readonly mapKey: number;
  readonly facility: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly unitIds?: readonly number[] | undefined;
  /**
   * 운영자 모드 건설(기획 D-560 1239 "건설도 제한 없이 다 가능" — 권한은 게이트웨이가 본다: 전체 보기 구독 + 모든 유닛 명령 권한): 재료를 쓰지 않고
   * 땅 규칙(다른 세력 도시 2차맵)을 보지 않는다. 짓는 시간은 운영자 배율로 나눈다(기본 1 = 보통 — D-560 1246). 칸 검사·물가 조건·행정 건물 폐허
   * 조건은 그대로(놓을 수 없는 자리·도시가 없는 정부는 만들지 않는다)
   */
  readonly operator?: OperatorBuild | undefined;
}

/** 운영자 모드 건설 표지(배율 = 짓는 시간 나눗수, 1 이상) */
export interface OperatorBuild {
  readonly pace: number;
}

/** 운영자 배율로 나눈 시간(1이면 그대로) */
const operatorMs = (ms: number, operator: OperatorBuild | undefined): number =>
  operator && operator.pace > 1 ? Math.floor(ms / operator.pace) : ms;

/**
 * NPC 증축 짓기 입력(질문 1101 나, npc/cityBuild.ts — 플레이어 짓기와 같은 규칙): 재료·시간은 @terra/sim buildPolicy가 플레이어와 같은 식
 * (buildCostAt·buildTimeAt·withBuilders)으로 셈해 넘긴다. 자리는 전략 배치 함수(npcPlacement.ts)가 고른 칸이다
 */
export interface NpcBuildInput {
  readonly ownerId: number;
  readonly mapKey: number;
  readonly cityId: number;
  readonly facility: string;
  readonly x: number;
  readonly y: number;
  readonly materials: readonly JobMaterial[];
  readonly ms: number;
}

/**
 * NPC 레벨 올리기·수리 입력(질문 1146 나·1114 가, npc/cityBuild.ts — 플레이어 레벨업·수리와 같은 규칙): 재료·시간·고칠 양은 @terra/sim
 * buildPolicy가 플레이어와 같은 식으로 셈해 넘긴다. 건물 주인 = ownerId여야 한다
 */
export interface NpcJobInput {
  readonly kind: "upgrade" | "repair";
  readonly ownerId: number;
  readonly buildingId: number;
  readonly materials: readonly JobMaterial[];
  readonly ms: number;
  /** 수리로 더할 상태(ppm). 레벨 올리기면 쓰지 않는다 */
  readonly restorePpm?: number | undefined;
}

export interface FacilityService {
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
  /** 레벨 올리기. operator = 운영자 모드(재료 없이, 시간 ÷ 배율 — FacilityBuildInput.operator와 같다) */
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
  /**
   * 다 지은 시설 줄을 그대로 넣는다(세계 씨앗 = NPC 시작 도시 기본 시설, facilities/npcSeed.ts). 건물 칸은 부르는 쪽이 먼저 놓는다.
   * 재료·작업 없이 쓰기 대기열에만 쓴다(건물 칸과 같은 묶음)
   */
  seedBuilt(record: FacilityRecord): void;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly jobs: ReadonlyMap<number, JobRecord>;
  stop(): void;
}

export interface FacilityServiceOptions {
  readonly loaded: LoadedFacilities;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  /** 세력·사회 계수표(설정 칸 실효 값: facilityBuild·facilityRuntime·durability), 부를 때마다 읽는다 */
  readonly rules: () => SocietyCoefficients;
  /** 실효 시설·아이템(건물 편집기 덮어쓰기가 바로 든다) */
  readonly catalog: () => FacilityCatalog;
  readonly holdings: WorldHoldings;
  /** 띄운 2차맵의 도시 자리(건물이 선 도시 = 가장 가까운 도시, 부를 때마다 읽는다). 없으면 도시 없음(재료는 화물만) */
  readonly cities?: (() => readonly CityCell[]) | undefined;
  /** 영토 서비스(비콘 수리). 없으면 비콘 수리는 unknown_beacon */
  readonly territory?: (() => TerritoryService | undefined) | undefined;
  /** 2차맵 건설 땅 규칙(landRule.ts, docs/adr/2026-11-14-second-map-build.md). 없으면 막지 않는다(시험·DB 없는 세계) */
  readonly land?: LandCheck | undefined;
  /** 유닛이 노동 계약 중인가 / 건물에 일하는 계약이 있나(사용 닳음) */
  readonly labor?:
    | {
        readonly unitBusy: (unitId: number) => boolean;
        readonly buildingInUse: (buildingId: number) => boolean;
      }
    | undefined;
  readonly now: () => number;
  readonly ready: () => boolean;
  /** 타이머 없이(시험이 finishDue·age를 부른다) */
  readonly manual?: boolean | undefined;
}

const fail = (code: FacilityResultCode): FacilityCommandResult => ({ ok: false, code });

/** 2차맵 배치 결과 코드 → 건물 결과 코드 */
const PLACE_CODES: Readonly<Record<string, FacilityResultCode>> = {
  out_of_bounds: "out_of_bounds",
  overlaps_building: "overlaps_building",
  overlaps_road: "overlaps_road",
  blocked_terrain: "blocked_terrain",
  overlaps_unit: "overlaps_unit",
  building_limit: "building_limit",
};

/** 1차 스탯 평균(내림) — 여러 장인이 함께 고칠 때 한 사람으로 친다 */
function averagePrimaries(list: readonly Primaries[]): Primaries {
  const n = Math.max(1, list.length);
  const sum = (key: keyof Primaries) => Math.floor(list.reduce((total, p) => total + p[key], 0) / n);
  return {
    str: sum("str"),
    dex: sum("dex"),
    agi: sum("agi"),
    vit: sum("vit"),
    int: sum("int"),
    wis: sum("wis"),
  };
}

export function createFacilityService(options: FacilityServiceOptions): FacilityService {
  const { maps, settlement, ledger, writer, now } = options;
  const facilities = new Map<number, FacilityRecord>(options.loaded.facilities.map((f) => [f.buildingId, f]));
  const jobs = new Map<number, JobRecord>(options.loaded.jobs.map((job) => [job.id, job]));
  let lastJobId = options.loaded.maxJobId;
  let government: GovernmentHook | undefined;
  let storageOut: StorageOutHook | undefined;
  const runtime = (): FacilityRuntimeRules => options.rules().facilityRuntime;
  const saveFacility = (record: FacilityRecord): void => writer.upsert("facilities", facilityRow(record));
  /**
   * 작업을 지운다. 일꾼이 있으면 먼저 그 주체를 atMs(작업 끝 또는 지우는 때)까지 정산한다: 작업 동안의 직무 산출을 버린 채 정산되고,
   * 지운 뒤에는 다시 산출이 난다(D-516 364)
   */
  const dropJob = (job: JobRecord, atMs: number): void => {
    if (job.unitIds.length > 0) settlement.settleOwner(job.ownerId, Math.min(atMs, job.doneAtMs));
    jobs.delete(job.id);
    writer.remove("facilityJobs", { id: job.id });
  };
  const places: PlaceWorld = {
    maps,
    facilities,
    catalog: options.catalog,
    cities: options.cities ?? (() => []),
  };
  /** 건물 재료를 꺼내는 자리(그 건물이 선 도시·2차맵) */
  const scopeOf = (me: number, buildingId: number): GoodsScope => {
    const place = buildingPlace(places, buildingId);
    return place ? materialScope(places, me, place.mapKey, place.cityId) : [];
  };
  /** 시설 줄에 도시가 없으면(직전 판 앱이 넣은 줄) 건물 칸에서 정해 적는다 */
  const fillCity = (record: FacilityRecord): void => {
    if (record.cityId !== null) return;
    const place = buildingPlace(places, record.buildingId);
    if (!place || place.cityId === null) return;
    record.cityId = place.cityId;
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
  const levelCost = (def: FacilityDef, level: number): { materials: JobMaterial[]; ms: number } => {
    if (!def.build || level < 1) return { materials: [], ms: 0 };
    return {
      materials: buildCostAt(def.build, level),
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

  const craftScoreOf = (unitId: number): number => {
    const table: readonly StatRow[] = options.holdings.statTable() ?? TEST_STAT_TABLE;
    return craftScore(options.holdings.primariesOf(unitId), table);
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
    seedBuilt(record) {
      facilities.set(record.buildingId, record);
      saveFacility(record);
    },
    pausesFor(ownerId) {
      const out = new Map<number, { fromMs: number; untilMs: number }[]>();
      for (const job of jobs.values()) {
        if (job.ownerId !== ownerId) continue;
        for (const unitId of job.unitIds) {
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
      // 행정 건물(D-510): 주인 없는 폐허 자리에만 — 짓기 시작한 쪽이 주인
      let ruinId: number | undefined;
      if (def.stage === "government") {
        const claim = government?.check(me, input.mapKey, input.x, input.y);
        if (!claim) return fail("not_ruin");
        if (!claim.ok) return fail(claim.code);
        ruinId = claim.ruinId;
      }
      const unitIds = input.unitIds ?? [];
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const operator = input.operator;
      const packCost = levelCost(def, 1);
      // 운영자 모드는 재료 없이(D-560 1239)
      const cost = operator ? { ...packCost, materials: [] } : packCost;
      // 재료 자리(D-516 361): 짓는 칸이 속한 도시의 창고·창고 시설 + 그 2차맵 내 유닛 화물
      const cityId = cityAt(places, input.mapKey, input.x, input.y);
      const scope = materialScope(places, me, input.mapKey, cityId);
      if (!hasGoods(ledger, me, cost.materials, scope)) return fail("insufficient_materials");
      // 땅(docs/adr/2026-11-14-second-map-build.md): 다른 세력 도시 2차맵이면 못 짓는다(결과 코드는 forbidden — 화면은 미리 묻기
      // facilities.landRule로 까닭을 안다). 필지(D-149)는 아직 없다 → 그 밖은 2차맵 빈 칸이면 짓는다. 칸 검사·놓기는 2차맵이 한다.
      // 운영자 모드는 땅 규칙을 보지 않는다(D-560 1239)
      if (!operator && options.land && !(await options.land(me, input.mapKey)).allowed) return fail("forbidden");
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
        // 행정 건물은 그 폐허(되살아날 도시)의 시설이다(489 다)
        cityId: ruinId ?? cityId,
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
      if (!hasGoods(ledger, input.ownerId, input.materials, scope)) return fail("insufficient_materials");
      const { width, height } = def.footprint;
      const placed = map.placeBuilding({ x: input.x, y: input.y, width, height, rotation: 0 }, input.ownerId);
      if (!placed.ok) return fail(PLACE_CODES[placed.code] ?? "out_of_bounds");
      if (placed.buildingId === undefined) return fail("internal_error");
      spendGoods(ledger, input.ownerId, input.materials, at, "facility_build", scope);
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
      if (record.level < 1) return fail("under_construction");
      if (input.kind === "upgrade" && (record.level >= def.maxLevel || !def.build)) return fail("max_level");
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
      const scope = place ? materialScope(places, input.ownerId, place.mapKey, place.cityId, false) : [];
      const reason = input.kind === "upgrade" ? "facility_upgrade" : "facility_repair";
      if (!spendGoods(ledger, input.ownerId, input.materials, at, reason, scope))
        return fail("insufficient_materials");
      const ms = Math.max(0, Math.trunc(input.ms));
      const job = newJob({
        kind: input.kind,
        ownerId: input.ownerId,
        buildingId: input.buildingId,
        beaconId: null,
        holdingId: null,
        targetLevel: input.kind === "upgrade" ? record.level + 1 : null,
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
      // 운영자 모드는 재료 없이, 시간 ÷ 배율(D-560 1239)
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
      const materials = repairMaterialsFor(cost.materials, restore);
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
      const found = myFacility(me, buildingId);
      if (typeof found === "string") return fail(found);
      const { record, def } = found;
      if (!def.repair || def.repair.length === 0) return fail("cannot_repair");
      if (record.level < 1) return fail("under_construction");
      if (!conditionWorks(record.conditionPpm, runtime())) return fail("facility_disabled");
      const holdings = options.holdings.service;
      const held = holdings.list(me, at).holdings.find((entry) => entry.id === holdingId);
      if (!held) return fail("unknown_holding");
      const itemDef = holdings.defOf(held.itemId);
      if (held.durability === null || held.maxDurability === null || !itemDef?.equip)
        return fail("not_equipment");
      if (held.slot !== null) return fail("equipped");
      if (jobOn((job) => job.holdingId === holdingId)) return fail("holding_busy");
      if (held.maxDurability <= options.rules().durability.destroyAtMax) return fail("broken");
      const lost = held.maxDurability - held.durability;
      if (lost <= 0) return fail("not_damaged");
      const rule = repairRuleFor(def.repair, {
        slot: itemDef.equip.slot,
        weaponType: itemDef.equip.weaponType,
      });
      if (!rule) return fail("cannot_repair");
      if (unitIds.length === 0) return fail("unknown_unit");
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const materials = repairMaterials(rule, itemDef.tier, lost, held.maxDurability);
      if (!spendGoods(ledger, me, materials, at, "equipment_repair", scopeOf(me, buildingId)))
        return fail("insufficient_materials");
      const scores = unitIds.map(craftScoreOf);
      const avg = scores.reduce((total, score) => total + score, 0) / Math.max(1, scores.length);
      const ms = equipmentRepairMs(
        { tier: itemDef.tier, lost, maxDurability: held.maxDurability, avgScore: avg, units: unitIds.length },
        runtime(),
      );
      const job = newJob({
        kind: "equipment",
        ownerId: me,
        buildingId,
        beaconId: null,
        holdingId,
        targetLevel: null,
        restorePpm: null,
        unitIds: [...unitIds],
        materials,
        startedAtMs: at,
        doneAtMs: at + ms,
      });
      if (ms === 0) finish(job);
      return done({ ok: true, doneAtMs: at + ms });
    },

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
      // 채집소 창고 꺼내기는 운반꾼이 나른다(질문 1091 가) — 고리가 맡지 않으면 예전처럼 바로
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

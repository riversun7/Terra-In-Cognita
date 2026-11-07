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
// - 영토 비콘(기획 336)은 영토 서비스가 짓기·노화를 하고, 수리 작업만 여기서 한다(같은 재료·노동 규칙).
import type { FacilityResultCode } from "@terra/protocol";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  advanceCondition,
  conditionWorks,
  equipmentRepairMs,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  withBuilders,
} from "@terra/shared/facilityRuntime";
import {
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
import { grantGoods, hasGoods, spendGoods } from "./materials.ts";
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

export interface FacilityBuildInput {
  readonly mapKey: number;
  readonly facility: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly unitIds?: readonly number[] | undefined;
}

export interface FacilityService {
  build(userId: string, input: FacilityBuildInput): Promise<FacilityCommandResult>;
  upgrade(userId: string, buildingId: number, unitIds: readonly number[]): Promise<FacilityCommandResult>;
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
  devFacilityGrant(userId: string, item: string, qty: number): Promise<FacilityCommandResult>;
  devFinish(userId: string, target: FacilityTarget): Promise<FacilityCommandResult>;
  /** 끝난 작업을 적용한다(끝 시각 차례). 적용한 수 */
  finishDue(nowMs: number): number;
  /** 다 지은 시설의 상태를 nowMs까지 흐르게 한다. 저장한 수 */
  age(nowMs: number): number;
  /** 그 건물이 지금 일하나(시설이 아닌 건물 = 관리자 시험 건물은 늘 true) */
  works(buildingId: number): boolean;
  /** 공방에서 고치는 중인 물건인가 */
  holdingLocked(holdingId: number): boolean;
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
  /** 영토 서비스(비콘 수리). 없으면 비콘 수리는 unknown_beacon */
  readonly territory?: (() => TerritoryService | undefined) | undefined;
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
  const runtime = (): FacilityRuntimeRules => options.rules().facilityRuntime;
  const saveFacility = (record: FacilityRecord): void => writer.upsert("facilities", facilityRow(record));
  const dropJob = (job: JobRecord): void => {
    jobs.delete(job.id);
    writer.remove("facilityJobs", { id: job.id });
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
    dropJob(job);
    if (job.kind === "beacon_repair") {
      if (job.beaconId !== null) options.territory?.()?.repairBeacon(job.beaconId, job.restorePpm ?? 0, at);
      return;
    }
    const record = job.buildingId === null ? undefined : facilities.get(job.buildingId);
    if (!record) return;
    if (job.kind === "build") {
      record.level = job.targetLevel ?? 1;
      record.conditionPpm = CONDITION_FULL;
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
        facilities.delete(record.buildingId);
        writer.remove("facilities", { building_id: record.buildingId });
        for (const job of jobs.values()) if (job.buildingId === record.buildingId) dropJob(job);
        continue;
      }
      const before = Math.floor(record.conditionPpm / 1000);
      advance(record, nowMs);
      if (Math.floor(record.conditionPpm / 1000) !== before) {
        saveFacility(record);
        saved += 1;
      }
    }
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
    works(buildingId) {
      const record = facilities.get(buildingId);
      if (!record) return true;
      return record.level >= 1 && conditionWorks(record.conditionPpm, runtime());
    },
    holdingLocked: (holdingId) =>
      jobOn((job) => job.kind === "equipment" && job.holdingId === holdingId) !== undefined,

    async build(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const def = options.catalog().facility(input.facility);
      if (!def) return fail("unknown_facility");
      if (!def.footprint || !def.build || def.stage === "territory") return fail("not_buildable");
      const map = maps.get(input.mapKey);
      if (!map) return fail("unknown_map");
      const unitIds = input.unitIds ?? [];
      const unitProblem = checkUnits(me, unitIds);
      if (unitProblem) return fail(unitProblem);
      const cost = levelCost(def, 1);
      if (!hasGoods(ledger, me, cost.materials)) return fail("insufficient_materials");
      // 땅: 서버에 필지가 아직 없다(D-149) → 2차맵 빈 칸이면 짓는다(확인 대기). 칸 검사·놓기는 2차맵이 한다
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
      spendGoods(ledger, me, cost.materials, at, "facility_build");
      const ms = withBuilders(cost.ms, unitIds.length, runtime());
      const record: FacilityRecord = {
        buildingId: placed.buildingId,
        facilityId: def.id,
        level: 0,
        conditionPpm: CONDITION_FULL,
        conditionAtMs: at + ms,
        builtAtMs: at,
        builtBy: userId,
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
      return done({ ok: true, buildingId: record.buildingId, doneAtMs: at + ms });
    },

    async upgrade(userId, buildingId, unitIds) {
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
      const cost = levelCost(def, record.level + 1);
      if (!spendGoods(ledger, me, cost.materials, at, "facility_upgrade"))
        return fail("insufficient_materials");
      const ms = withBuilders(cost.ms, unitIds.length, runtime());
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
      } else {
        const territory = options.territory?.();
        const state = territory?.beaconState(target.beaconId, at);
        if (!territory || !state) return fail("unknown_beacon");
        if (!(await territory.canManage(userId, target.beaconId))) return fail("forbidden");
        if (state.row.readyAtMs !== null && state.row.readyAtMs > now()) return fail("under_construction");
        if (jobOn((job) => job.beaconId === target.beaconId)) return fail("job_running");
        const def = options.catalog().facility("territory_beacon");
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
      if (!spendGoods(ledger, me, materials, started, "facility_repair"))
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
      if (!spendGoods(ledger, me, materials, at, "equipment_repair")) return fail("insufficient_materials");
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

    async devFacilityGrant(userId, item, qty) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      if (!options.catalog().isGoods(item)) return fail("unknown_item");
      grantGoods(ledger, me, item, qty, at);
      return done({ ok: true });
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

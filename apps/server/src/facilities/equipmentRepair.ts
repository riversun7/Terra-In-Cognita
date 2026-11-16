// 공방 장비 수리(서버 권위) — D-512 323·D-514 351, 외주 D-564 1682, 바뀜 D-570 1785(docs/adr/2026-11-15-business-ledger.md "바뀜 (D-570)").
// 건물 서비스(service.ts)가 고리(EquipmentRepairDeps)를 넘겨 부른다(service.ts 1,000줄 상한 — 장비 수리를 이 모듈로 옮겼다).
// - 내 공방: 내 장인(unitIds)·내 재료로 고친다. 요금 없음.
// - 남의 공방(외주 — 바뀜 (기획 D-570 1785 "그 공방(사업장) 일꾼이 고치고 요금은 주인이 정한다"), 예전: 시설만 빌려 내 장인이, 요금 = 재료 기준
//   값 × 20%): 그 공방 일꾼(직무 배치·임금형 계약 — 임대형 임차인은 빼고, 다른 작업에 묶이지 않았고 일하는 상태)이 모두 고친다(보낸 unitIds는
//   보지 않는다). 재료는 맡기는 사람이 그 공방 자리(그 도시 창고·그 2차맵 내 유닛 화물)에서 낸다(예전과 같다). 요금 = 주인이 정한 시간당 요금 ×
//   걸리는 시간(business/commands.ts repairFee — 정하지 않았으면 적정가, 0이면 받지 않음 = service_closed). 일꾼이 없으면 no_shop_worker. 요금은
//   그 공방 금고로(소득세). 작업 동안 그 일꾼들의 원래 직무 산출은 쉰다(service.ts pausesFor — 유닛 주인 기준).
import type { FacilityResultCode } from "@terra/protocol";
import { type FacilityRuntimeRules, conditionWorks, equipmentRepairMs } from "@terra/shared/facilityRuntime";
import { repairMaterials, repairRuleFor } from "@terra/sim";
import type { LaborWorkerEntry } from "../labor/service.ts";
import type { BusinessCommands } from "../business/commands.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { FacilityDef } from "./catalog.ts";
import { type GoodsScope, hasGoods, spendGoods } from "./materials.ts";
import type { FacilityCommandResult } from "./serviceTypes.ts";
import type { FacilityRecord, JobMaterial, JobRecord } from "./state.ts";

export interface EquipmentRepairDeps {
  readonly ledger: Ledger;
  readonly holdings: WorldHoldings;
  readonly runtime: () => FacilityRuntimeRules;
  readonly destroyAtMax: () => number;
  readonly business: () => BusinessCommands | undefined;
  /** 건물 주인(없는 건물이면 undefined) */
  owner(buildingId: number): number | null | undefined;
  myFacility(
    me: number,
    buildingId: number,
  ): { record: FacilityRecord; def: FacilityDef } | FacilityResultCode;
  shopFacility(buildingId: number): { record: FacilityRecord; def: FacilityDef } | FacilityResultCode;
  suspended(buildingId: number): boolean;
  jobOn(pick: (job: JobRecord) => boolean): JobRecord | undefined;
  checkUnits(me: number, unitIds: readonly number[]): FacilityResultCode | null;
  scopeOf(me: number, buildingId: number): GoodsScope;
  craftScoreOf(unitId: number): number;
  /** 그 시설 일꾼(노동 계약 서비스 workersAt). 없으면 빈 목록 */
  workersAt(buildingId: number): readonly LaborWorkerEntry[];
  /** 유닛이 다른 작업에 묶였거나 일하지 않나(작업·비활성) */
  unitTaken(unitId: number): boolean;
  startJob(job: Omit<JobRecord, "id">): void;
}

/** 외주 수리 견적: 고칠 그 공방 일꾼·걸리는 시간·요금 */
export interface OutsourceQuote {
  readonly workers: readonly number[];
  readonly ms: number;
  readonly fee: bigint;
}

/** 수리할 장비 한 벌 */
export interface RepairItem {
  readonly tier: number;
  readonly lost: number;
  readonly maxDurability: number;
}

/** 그 공방에서 지금 고칠 수 있는 일꾼(직무 배치·임금형 — 임대형 임차인은 빼고, 다른 작업에 묶이지 않은 유닛, ID 차례) */
export function shopWorkers(deps: EquipmentRepairDeps, buildingId: number): number[] {
  return deps
    .workersAt(buildingId)
    .filter((entry) => entry.via !== "lease" && !deps.unitTaken(entry.unitId))
    .map((entry) => entry.unitId)
    .toSorted((a, b) => a - b);
}

/** 걸리는 시간(장인 평균 실력 — 공방 일꾼 또는 내 장인) */
function repairMs(deps: EquipmentRepairDeps, item: RepairItem, unitIds: readonly number[]): number {
  const scores = unitIds.map((unitId) => deps.craftScoreOf(unitId));
  const avg = scores.reduce((total, score) => total + score, 0) / Math.max(1, scores.length);
  return equipmentRepairMs(
    {
      tier: item.tier,
      lost: item.lost,
      maxDurability: item.maxDurability,
      avgScore: avg,
      units: unitIds.length,
    },
    deps.runtime(),
  );
}

/** 외주 견적(D-570 1785). 일꾼이 없으면 no_shop_worker, 요금 0(받지 않음)이면 service_closed */
export function outsourceQuote(
  deps: EquipmentRepairDeps,
  buildingId: number,
  item: RepairItem,
): OutsourceQuote | FacilityResultCode {
  const workers = shopWorkers(deps, buildingId);
  if (workers.length === 0) return "no_shop_worker";
  const ms = repairMs(deps, item, workers);
  const fee = deps.business()?.repairFee(buildingId, ms);
  if (fee === null) return "service_closed";
  return { workers, ms, fee: fee ?? 0n };
}

const fail = (code: FacilityResultCode): FacilityCommandResult => ({ ok: false, code });

/** 장비 수리 시작(위 머리 주석). 작업 시간이 0이면 부르는 쪽 startJob이 바로 끝낸다 */
export function startEquipmentRepair(
  deps: EquipmentRepairDeps,
  me: number,
  buildingId: number,
  holdingId: number,
  unitIds: readonly number[],
  at: number,
): FacilityCommandResult {
  const outsource = deps.owner(buildingId) !== me;
  const found = outsource ? deps.shopFacility(buildingId) : deps.myFacility(me, buildingId);
  if (typeof found === "string") return fail(found);
  const { record, def } = found;
  if (!def.repair || def.repair.length === 0) return fail("cannot_repair");
  // 멈춘 사업장(1504·D-570 1789)은 외주를 받지 않는다
  if (outsource && deps.suspended(buildingId)) return fail("facility_disabled");
  if (record.level < 1) return fail("under_construction");
  if (!conditionWorks(record.conditionPpm, deps.runtime())) return fail("facility_disabled");
  const held = deps.holdings.service.list(me, at).holdings.find((entry) => entry.id === holdingId);
  if (!held) return fail("unknown_holding");
  const itemDef = deps.holdings.service.defOf(held.itemId);
  if (held.durability === null || held.maxDurability === null || !itemDef?.equip)
    return fail("not_equipment");
  if (held.slot !== null) return fail("equipped");
  if (deps.jobOn((job) => job.holdingId === holdingId)) return fail("holding_busy");
  if (held.maxDurability <= deps.destroyAtMax()) return fail("broken");
  const lost = held.maxDurability - held.durability;
  if (lost <= 0) return fail("not_damaged");
  const rule = repairRuleFor(def.repair, { slot: itemDef.equip.slot, weaponType: itemDef.equip.weaponType });
  if (!rule) return fail("cannot_repair");
  const item = { tier: itemDef.tier, lost, maxDurability: held.maxDurability };
  let workers: readonly number[] = unitIds;
  let fee = 0n;
  let ms: number;
  if (outsource) {
    const quote = outsourceQuote(deps, buildingId, item);
    if (typeof quote === "string") return fail(quote);
    workers = quote.workers;
    fee = quote.fee;
    ms = quote.ms;
  } else {
    if (unitIds.length === 0) return fail("unknown_unit");
    const unitProblem = deps.checkUnits(me, unitIds);
    if (unitProblem) return fail(unitProblem);
    ms = repairMs(deps, item, unitIds);
  }
  const materials: JobMaterial[] = repairMaterials(rule, itemDef.tier, lost, held.maxDurability);
  const scope = deps.scopeOf(me, buildingId);
  if (!hasGoods(deps.ledger, me, materials, scope)) return fail("insufficient_materials");
  // 외주 요금: 낼 수 있는지 먼저 보고(재료를 빼기 전), 재료를 뺀 뒤 그 사업장 금고로(소득세)
  const business = deps.business();
  if (fee > 0n && !business?.canPay(me, fee)) return fail("insufficient_funds");
  if (!spendGoods(deps.ledger, me, materials, at, "equipment_repair", scope))
    return fail("insufficient_materials");
  if (fee > 0n) business?.chargeService(me, buildingId, fee, "equipment_repair_fee", at);
  deps.startJob({
    kind: "equipment",
    ownerId: me,
    buildingId,
    beaconId: null,
    holdingId,
    targetLevel: null,
    restorePpm: null,
    unitIds: [...workers],
    materials,
    startedAtMs: at,
    doneAtMs: at + ms,
  });
  return { ok: true, doneAtMs: at + ms };
}

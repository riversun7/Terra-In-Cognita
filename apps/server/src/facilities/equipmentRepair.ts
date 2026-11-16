// 공방 장비 수리(서버 권위) — D-512 323·D-514 351, 외주 D-564 1682, 바뀜 D-570 1785(docs/adr/2026-11-15-business-ledger.md "바뀜 (D-570)").
// 건물 서비스(service.ts)가 고리(EquipmentRepairDeps)를 넘겨 부른다(service.ts 1,000줄 상한 — 장비 수리를 이 모듈로 옮겼다).
// - 내 공방: 내 장인(unitIds)·내 재료로 고친다. 요금 없음.
// - 남의 공방(외주 — 바뀜 (기획 D-570 1785 "그 공방(사업장) 일꾼이 고치고 요금은 주인이 정한다"), 예전: 시설만 빌려 내 장인이, 요금 = 재료 기준
//   값 × 20%): 그 공방 일꾼(직무 배치·임금형 계약 — 임대형 임차인은 빼고, 다른 작업에 묶이지 않았고 일하는 상태)이 모두 고친다(보낸 unitIds는
//   보지 않는다). 요금 = 주인이 정한 시간당 요금 ×
//   걸리는 시간(business/commands.ts repairFee — 정하지 않았으면 적정가, 0이면 받지 않음 = service_closed). 일꾼이 없으면 no_shop_worker. 요금은
//   그 공방 금고로(소득세). 작업 동안 그 일꾼들의 원래 직무 산출은 쉰다(service.ts pausesFor — 유닛 주인 기준).
// - 바뀜 (기획 D-573 2048 원문 "맡기는 사람은 서비스 비용만 지불하는거고 모든 재료나 인건비는 사업장이 부담하는거지"): 외주 재료는 맡기는 사람이 아니라
//   그 공방이 낸다 — 공방 주인의 사업장 창고(건물 위치, D-555 1505 "운영 자금·재료는 건물마다의 창고")에서 빼고(장부 "물건" 칸, 종류
//   outsource_repair — D-555 1505 "수리는 사업장 창고 먼저": 모자라면 공방 주인의 그 자리), 인건비는 그 공방 일꾼 임금(이미 사업장 금고에서 나간다). 공방
//   쪽에 재료가 없으면 insufficient_materials(맡기는 사람의 재료는 보지 않는다). 예전(business-4 [임시]): 맡기는 사람이 그 공방 자리에서 냈다.
// - 바뀜 (기획 대조 2167 — D-570 1822 "적정가격 계산은 필요 재료비 인건비, 수수료 세금 등", D-573 2048): 외주 시간당 적정가에 공방이 내는 재료비를 넣는다
//   (요금에 들어 있다 — 재료를 따로 받지 않는다). 시간당 재료비(repairMaterialsHourly) = 그 공방 수리 줄마다 (기본 재료 기준 값 × 한 시간 ÷ 티어 1 장비를
//   0에서 가득 고치는 시간 — 지금 그 공방 일꾼 실력·수로 잰다)의 가장 큰 값. 재료 양(기본 × 티어 × 잃은 몫)과 시간(기본 × 티어 × 잃은 몫)이 같은 꼴로
//   늘어 장비마다 비율이 거의 같다(올림·최소 1 재료만 다르다). 요금을 정하지 않은 공방은 이 적정가 × 걸리는 시간으로 받는다.
import type { FacilityResultCode } from "@terra/protocol";
import { type FacilityRuntimeRules, conditionWorks, equipmentRepairMs } from "@terra/shared/facilityRuntime";
import { repairMaterials, repairRuleFor } from "@terra/sim";
import type { LaborWorkerEntry } from "../labor/workerEntry.ts";
import type { BusinessCommands } from "../business/commands.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { FacilityDef } from "./catalog.ts";
import { buildingLocation } from "@terra/shared/goodsPlaces";
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

const HOUR_MS = 3_600_000n;

/**
 * 외주 시간당 재료비(위 머리 주석 "바뀜 (2167)", 화폐 최소 단위 — 재료 기준 값 unitPrice). 수리 줄이 없거나 공방이 아니면 0. 일꾼이 없으면 기본 실력
 * 일꾼 하나로 잰다
 */
export function repairMaterialsHourly(
  deps: EquipmentRepairDeps,
  buildingId: number,
  unitPrice: (item: string) => bigint,
): bigint {
  const found = deps.shopFacility(buildingId);
  if (typeof found === "string") return 0n;
  const workers = shopWorkers(deps, buildingId);
  const reference = { tier: 1, lost: 1000, maxDurability: 1000 };
  const ms = BigInt(
    Math.max(1, workers.length > 0 ? repairMs(deps, reference, workers) : refMs(deps, reference)),
  );
  let best = 0n;
  for (const rule of found.def.repair ?? []) {
    let worth = 0n;
    for (const stack of repairMaterials(rule, reference.tier, reference.lost, reference.maxDurability))
      worth += BigInt(stack.qty) * unitPrice(stack.item);
    const hourly = (worth * HOUR_MS + ms - 1n) / ms;
    if (hourly > best) best = hourly;
  }
  return best;
}

/** 일꾼 없이 잰 시간(기본 실력 0·한 사람) */
function refMs(deps: EquipmentRepairDeps, item: RepairItem): number {
  return equipmentRepairMs({ ...item, avgScore: 0, units: 1 }, deps.runtime());
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
  // 재료를 내는 쪽: 내 공방 = 나(내 자리), 외주 = 그 공방 주인의 사업장 창고(D-573 2048)
  const payer = outsource ? (deps.owner(buildingId) ?? null) : me;
  if (payer === null) return fail("unknown_building");
  // 사업장 창고 먼저(D-555 1505 "수리는 사업장 창고 먼저"), 모자라면 공방 주인의 그 자리(그 도시 창고·내 창고 시설·유닛 화물)
  const shopScope = deps.scopeOf(payer, buildingId);
  const scope: GoodsScope = outsource
    ? [buildingLocation(buildingId), ...(shopScope === "anywhere" ? [] : shopScope)]
    : deps.scopeOf(me, buildingId);
  if (!hasGoods(deps.ledger, payer, materials, scope)) return fail("insufficient_materials");
  // 외주 요금: 낼 수 있는지 먼저 보고(재료를 빼기 전), 재료를 뺀 뒤 그 사업장 금고로(소득세)
  const business = deps.business();
  if (fee > 0n && !business?.canPay(me, fee)) return fail("insufficient_funds");
  if (
    !spendGoods(deps.ledger, payer, materials, at, outsource ? "outsource_repair" : "equipment_repair", scope)
  )
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

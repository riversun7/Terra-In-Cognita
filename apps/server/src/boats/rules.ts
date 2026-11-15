// 배 체계 셈(순수 함수) — 기획 D-547(배 체계 개편 1481~1500), docs/adr/2026-11-15-shipyard-harbor.md. 서버 배 서비스·건물 판·시험이 같은 함수를 쓴다.
// - 배 종류(1484): 조선소 시설의 boats 칸. 같은 ID가 여러 조선소에 있으면 시설 차례로 처음 것.
// - 조선소 도크(1483): 기본 shipyardDocks, 도크 모듈이면 레벨 1 위로 한 레벨마다 shipyardDockModule 더. 건조 특화는 시간, 수리 특화는 수리 재료·시간에 ‰를 곱한다.
// - 정박장 자리(1487) = 레벨 × berthsPerLevel, 교역 부두 임시 자리(1488) = 레벨 × tradeSlotsPerLevel.
// - 배 내구도(1485·1486·1493): 집 정박장에 들었으면 wearBerthedPd, 집이 있고 밖이면 wearAwayPd, 집이 없으면 wearAwayPd × wearHomelessMul(‰/일), 고치는 중이면 닳지 않는다.
// - 빠르기(1495): 배 종류 speedPm, 내구도 0이면 brokenSpeedPm을 더 곱한다(잃지 않는다).
// - 수리(1494): 재료 = ⌈종류 재료 × 잃은 몫 × repairCostPm ÷ 1000⌉, 시간 = 만드는 시간 × 잃은 몫 × repairTimePm ÷ 1000(수리 특화는 하나마다 둘 다 × repairSpecPm ÷ 1000).
// - 운행 정지(1500): 시설 상태(ppm)가 harborStopPm‰ 아래면 새 배·임시 정박·새 작업을 받지 않는다(D-559 1527 — 30%).
// D-559(docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559"):
// - 모듈(1521): 레벨 2부터 레벨마다 하나 더. 같은 모듈 여러 개는 효과가 모두 겹친다(D-564 1681): 도크 늘림은 하나마다 shipyardDockModule,
//   건조·수리 특화는 하나마다 특화 ‰를 한 번 더 곱한다(둘 = × 특화 × 특화).
// - 도크(1523): 다 만들거나 고친 배는 꺼낼 때까지 도크에 있다(처지 docked — 닳지 않는다). 남의 배는 다 된 뒤 storageFreeHours가 지나면 하루(올림)마다 보관료.
// - 연료(1529·1540): 움직인 시간 × 한 시간 연료(오버히트면 × overheatFuelPm). 연료 0이면 표류(noFuelSpeedPm). 오버히트는 빠르기 × overheatSpeedPm,
//   움직인 한 시간마다 내구도 overheatHullPh‰ 더(엔진실 한 명마다 engineCrewHeatPm 줄임). 갑판병은 바다에서 한 시간에 deckRepairPh‰씩 deckRepairCapPm까지 고친다.
// 정수로만 셈한다(BigInt는 쓰지 않는다 — 값이 작다).
import type { BoatCoefficients } from "@terra/sim";
import { HULL_FULL, type ShipyardModule, moduleCount, shipyardModuleSlots } from "@terra/shared/harbor";
import type { BoatTypeDef, FacilityCatalog, FacilityDef } from "../facilities/catalog.ts";
import type { JobMaterial } from "../facilities/state.ts";
import { OPERATOR_SPEED_FACTOR } from "../world/operatorPace.ts";

const DAY_MS = 86_400_000;

/** 배의 지금 처지(닳는 빠르기를 정한다) */
export type BoatMode = "berthed" | "away" | "homeless" | "repair" | "docked";

/** 배 시설 역할 판정 */
export const isShipyard = (def: Pick<FacilityDef, "harbor"> | undefined): boolean =>
  def?.harbor === "shipyard";
export const isBerth = (def: Pick<FacilityDef, "harbor"> | undefined): boolean => def?.harbor === "berth";
export const isTradeDock = (def: Pick<FacilityDef, "harbor"> | undefined): boolean =>
  def?.harbor === "trade_dock";

/** 배 종류 표(조선소 시설 차례로, 같은 ID는 처음 것) */
export function boatTypesOf(catalog: Pick<FacilityCatalog, "facilities">): ReadonlyMap<string, BoatTypeDef> {
  const out = new Map<string, BoatTypeDef>();
  for (const def of catalog.facilities)
    if (isShipyard(def)) for (const type of def.boats ?? []) if (!out.has(type.id)) out.set(type.id, type);
  return out;
}

/** 배 값 = 종류 재료 × costPm ÷ 1000(반올림, 0이면 뺀다) */
export function boatCost(type: Pick<BoatTypeDef, "materials">, costPm: number): JobMaterial[] {
  return type.materials
    .map((stack) => ({ item: stack.item, qty: Math.round((stack.qty * Math.max(0, costPm)) / 1000) }))
    .filter((stack) => stack.qty > 0);
}

/** 특화 모듈 수만큼 ‰를 거듭 곱한다(D-564 1681 "모두 겹침", 곱할 때마다 내림) */
export function stackSpec(
  value: number,
  modules: readonly ShipyardModule[],
  module: ShipyardModule,
  specPm: number,
): number {
  let out = value;
  for (const entry of modules) if (entry === module) out = Math.floor((out * Math.max(0, specPm)) / 1000);
  return out;
}

/** 배 만드는 시간(ms) = 종류 시간 × buildTimePm ÷ 1000(건조 특화 하나마다 × buildSpecPm ÷ 1000), 운영자 모드는 운영자 빠르기로 나눈다 */
export function boatBuildMs(
  type: Pick<BoatTypeDef, "buildMs">,
  rules: Pick<BoatCoefficients, "buildTimePm" | "shipyardBuildSpecPm">,
  modules: readonly ShipyardModule[],
  operator: boolean,
): number {
  let ms = Math.floor((Math.max(0, type.buildMs) * Math.max(0, rules.buildTimePm)) / 1000);
  ms = stackSpec(ms, modules, "build", rules.shipyardBuildSpecPm);
  return operator ? Math.floor(ms / OPERATOR_SPEED_FACTOR) : ms;
}

/** 조선소 도크 수(1483·D-559 1521): 기본 + 도크 늘림 모듈 하나마다 shipyardDockModule. 자리 수를 넘는 모듈은 세지 않는다 */
export function shipyardDocks(
  level: number,
  modules: readonly ShipyardModule[],
  rules: Pick<BoatCoefficients, "shipyardDocks" | "shipyardDockModule">,
): number {
  if (level < 1) return 0;
  const base = Math.max(1, rules.shipyardDocks);
  const docks = moduleCount(modules, level, "docks");
  return base + docks * Math.max(0, rules.shipyardDockModule);
}

/** 모듈을 붙일 수 있나(레벨 2부터) */
export const moduleUnlocked = (level: number): boolean => shipyardModuleSlots(level) > 0;

/** 정박장 정박 자리(1487) */
export const berthCapacity = (level: number, rules: Pick<BoatCoefficients, "berthsPerLevel">): number =>
  Math.max(0, level) * Math.max(0, rules.berthsPerLevel);

/** 교역 부두 임시 자리(1488) */
export const tradeSlots = (level: number, rules: Pick<BoatCoefficients, "tradeSlotsPerLevel">): number =>
  Math.max(0, level) * Math.max(0, rules.tradeSlotsPerLevel);

/** 처지마다 하루에 닳는 양(‰/일) */
export function wearPerDayPm(
  mode: BoatMode,
  rules: Pick<BoatCoefficients, "wearBerthedPd" | "wearAwayPd" | "wearHomelessMul">,
): number {
  switch (mode) {
    case "berthed":
      return Math.max(0, rules.wearBerthedPd);
    case "away":
      return Math.max(0, rules.wearAwayPd);
    case "homeless":
      return Math.max(0, rules.wearAwayPd) * Math.max(1, rules.wearHomelessMul);
    case "repair":
    case "docked":
      return 0;
    default: {
      const unknown: never = mode;
      return unknown;
    }
  }
}

/** fromMs 때 hullPpm인 배가 mode로 toMs까지 닳은 값(0 아래로 가지 않는다) */
export function wornHull(
  hullPpm: number,
  fromMs: number,
  toMs: number,
  mode: BoatMode,
  rules: Pick<BoatCoefficients, "wearBerthedPd" | "wearAwayPd" | "wearHomelessMul">,
): number {
  const span = Math.max(0, toMs - fromMs);
  const loss = Math.floor((wearPerDayPm(mode, rules) * 1000 * span) / DAY_MS);
  return Math.max(0, Math.min(HULL_FULL, hullPpm - loss));
}

/** 배 빠르기 배율(‰): 종류 speedPm, 내구도 0이면 brokenSpeedPm, 연료가 없으면 noFuelSpeedPm, 오버히트면 overheatSpeedPm을 더 곱한다 */
export function boatSpeedPm(
  type: Pick<BoatTypeDef, "speedPm"> | undefined,
  hullPpm: number,
  rules: Pick<BoatCoefficients, "brokenSpeedPm" | "noFuelSpeedPm" | "overheatSpeedPm">,
  fuel: { readonly empty: boolean; readonly overheat: boolean } = { empty: false, overheat: false },
): number {
  let speed = type?.speedPm ?? 1000;
  if (hullPpm <= 0) speed = Math.floor((speed * Math.max(1, rules.brokenSpeedPm)) / 1000);
  if (fuel.empty) speed = Math.floor((speed * Math.max(1, rules.noFuelSpeedPm)) / 1000);
  else if (fuel.overheat) speed = Math.floor((speed * Math.max(1000, rules.overheatSpeedPm)) / 1000);
  return Math.max(1, speed);
}

/** 이보다 덜 닳았으면(1‰ 미만) 고칠 것이 없다고 본다(ppm) */
export const REPAIR_MIN_PPM = 1000;

/** 수리 재료·시간(1494). 가득(잃은 것 1‰ 미만)이면 null */
export function repairPlan(
  type: Pick<BoatTypeDef, "materials" | "buildMs">,
  hullPpm: number,
  rules: Pick<
    BoatCoefficients,
    | "costPm"
    | "buildTimePm"
    | "repairCostPm"
    | "repairTimePm"
    | "shipyardRepairSpecPm"
    | "shipyardBuildSpecPm"
  >,
  modules: readonly ShipyardModule[],
  operator: boolean,
): { readonly materials: JobMaterial[]; readonly ms: number } | null {
  const lost = HULL_FULL - Math.max(0, Math.min(HULL_FULL, hullPpm));
  if (lost < REPAIR_MIN_PPM) return null;
  // 수리 특화 하나마다 ‰를 한 번 더 곱한다(D-564 1681)
  const spec = stackSpec(1000, modules, "repair", rules.shipyardRepairSpecPm);
  // 분모 = 가득(ppm) × 1000(repairCostPm) × 1000(costPm) × 1000(spec)
  const scale = BigInt(HULL_FULL) * 1_000_000_000n;
  const materials = operator
    ? []
    : type.materials
        .map((stack) => {
          const top =
            BigInt(stack.qty) *
            BigInt(lost) *
            BigInt(Math.max(0, rules.repairCostPm)) *
            BigInt(Math.max(0, rules.costPm)) *
            BigInt(spec);
          return { item: stack.item, qty: Number((top + scale - 1n) / scale) };
        })
        .filter((stack) => stack.qty > 0);
  const buildMs = boatBuildMs(type, rules, [], false);
  const share = Math.floor((buildMs * lost) / HULL_FULL);
  let ms = Math.floor((share * Math.max(0, rules.repairTimePm) * spec) / 1_000_000);
  if (operator) ms = Math.floor(ms / OPERATOR_SPEED_FACTOR);
  return { materials, ms: Math.max(0, ms) };
}

/** 배 시설이 새 배·임시 정박·새 작업을 받나(1500): 상태 ppm ≥ harborStopPm × 1000 */
export const harborOpen = (conditionPpm: number, rules: Pick<BoatCoefficients, "harborStopPm">): boolean =>
  conditionPpm >= Math.max(0, rules.harborStopPm) * 1000;

/** 정박료로 낼 날 수(feePaidToMs부터 nowMs까지 다 지난 날) */
export const dueDays = (feePaidToMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - feePaidToMs) / DAY_MS));

export const HOUR_MS = 3_600_000;
export { DAY_MS };

/** 도크 장기 보관료(D-559 1523): 다 된 뒤 freeHours가 지나면 하루(올림)마다 feePerDay. 고치는 중(sinceMs null)이면 0 */
export function storageDue(
  sinceMs: number | null,
  nowMs: number,
  feePerDay: number,
  rules: Pick<BoatCoefficients, "storageFreeHours">,
): bigint {
  if (sinceMs === null || feePerDay <= 0) return 0n;
  const billed = nowMs - sinceMs - Math.max(0, rules.storageFreeHours) * HOUR_MS;
  if (billed <= 0) return 0n;
  return BigInt(Math.ceil(billed / DAY_MS)) * BigInt(Math.floor(feePerDay));
}

/** 연료 통(천분의 단위): 배 종류 칸, 없으면 설정 칸 */
export const fuelTankMilli = (
  type: Pick<BoatTypeDef, "fuelCapacity"> | undefined,
  rules: Pick<BoatCoefficients, "fuelCapacity">,
): number => Math.max(1, type?.fuelCapacity ?? rules.fuelCapacity) * 1000;

/** movingMs 동안 움직인 배가 쓴 연료(천분의 단위, 오버히트면 × overheatFuelPm) */
export function fuelBurnMilli(
  type: Pick<BoatTypeDef, "fuelPerHour"> | undefined,
  movingMs: number,
  overheat: boolean,
  rules: Pick<BoatCoefficients, "fuelPerHour" | "overheatFuelPm">,
): number {
  const perHour = Math.max(0, type?.fuelPerHour ?? rules.fuelPerHour);
  const base = Math.floor((perHour * 1000 * Math.max(0, movingMs)) / HOUR_MS);
  return overheat ? Math.floor((base * Math.max(1000, rules.overheatFuelPm)) / 1000) : base;
}

/** 오버히트로 movingMs 동안 더 닳는 내구도(ppm): 한 시간 overheatHullPh‰, 엔진실 한 명마다 engineCrewHeatPm 줄임 */
export function overheatWearPpm(
  movingMs: number,
  engineCrew: number,
  rules: Pick<BoatCoefficients, "overheatHullPh" | "engineCrewHeatPm">,
): number {
  const relief = Math.min(1000, Math.max(0, engineCrew) * Math.max(0, rules.engineCrewHeatPm));
  const perHour = Math.floor((Math.max(0, rules.overheatHullPh) * (1000 - relief)) / 1000);
  return Math.floor((perHour * 1000 * Math.max(0, movingMs)) / HOUR_MS);
}

/** 갑판병 기본 수리(ppm): spanMs 동안 한 명마다 deckRepairPh‰, deckRepairCapPm 넘게는 올리지 않는다 */
export function deckRepairPpm(
  hullPpm: number,
  deckCrew: number,
  spanMs: number,
  rules: Pick<BoatCoefficients, "deckRepairPh" | "deckRepairCapPm">,
): number {
  const cap = Math.max(0, Math.min(1000, rules.deckRepairCapPm)) * 1000;
  if (deckCrew <= 0 || hullPpm >= cap) return 0;
  const gain = Math.floor(
    (Math.max(0, rules.deckRepairPh) * 1000 * deckCrew * Math.max(0, spanMs)) / HOUR_MS,
  );
  return Math.max(0, Math.min(gain, cap - hullPpm));
}

/** 두 시각 구간이 겹치는 길이(ms) — 움직인 시간 셈(움직임 [출발, 도착] ∩ [셈한 시각, 지금]) */
export const overlapMs = (aFrom: number, aTo: number, bFrom: number, bTo: number): number =>
  Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));

// 배 체계 셈(순수 함수) — 기획 D-547(배 체계 개편 1481~1500), docs/adr/2026-11-15-shipyard-harbor.md. 서버 배 서비스·건물 판·시험이 같은 함수를 쓴다.
// - 배 종류(1484): 조선소 시설의 boats 칸. 같은 ID가 여러 조선소에 있으면 시설 차례로 처음 것.
// - 조선소 도크(1483): 기본 shipyardDocks, 도크 모듈이면 레벨 1 위로 한 레벨마다 shipyardDockModule 더. 건조 특화는 시간, 수리 특화는 수리 재료·시간에 ‰를 곱한다.
// - 정박장 자리(1487) = 레벨 × berthsPerLevel, 교역 부두 임시 자리(1488) = 레벨 × tradeSlotsPerLevel.
// - 배 내구도(1485·1486·1493): 집 정박장에 들었으면 wearBerthedPd, 집이 있고 밖이면 wearAwayPd, 집이 없으면 wearAwayPd × wearHomelessMul(‰/일), 고치는 중이면 닳지 않는다.
// - 빠르기(1495): 배 종류 speedPm, 내구도 0이면 brokenSpeedPm을 더 곱한다(잃지 않는다).
// - 수리(1494): 재료 = ⌈종류 재료 × 잃은 몫 × repairCostPm ÷ 1000⌉, 시간 = 만드는 시간 × 잃은 몫 × repairTimePm ÷ 1000(수리 특화는 둘 다 × repairSpecPm ÷ 1000).
// - 운행 정지(1500): 시설 상태(ppm)가 harborStopPm‰ 아래면 새 배·임시 정박·새 작업을 받지 않는다.
// 정수로만 셈한다(BigInt는 쓰지 않는다 — 값이 작다).
import type { BoatCoefficients } from "@terra/sim";
import { HULL_FULL, SHIPYARD_MODULE_LEVEL, type ShipyardModule } from "@terra/shared/harbor";
import type { BoatTypeDef, FacilityCatalog, FacilityDef } from "../facilities/catalog.ts";
import type { JobMaterial } from "../facilities/state.ts";
import { OPERATOR_SPEED_FACTOR } from "../world/operatorPace.ts";

const DAY_MS = 86_400_000;

/** 배의 지금 처지(닳는 빠르기를 정한다) */
export type BoatMode = "berthed" | "away" | "homeless" | "repair";

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

/** 배 만드는 시간(ms) = 종류 시간 × buildTimePm ÷ 1000(건조 특화 × buildSpecPm ÷ 1000), 운영자 모드는 운영자 빠르기로 나눈다 */
export function boatBuildMs(
  type: Pick<BoatTypeDef, "buildMs">,
  rules: Pick<BoatCoefficients, "buildTimePm" | "shipyardBuildSpecPm">,
  module: ShipyardModule | null,
  operator: boolean,
): number {
  let ms = Math.floor((Math.max(0, type.buildMs) * Math.max(0, rules.buildTimePm)) / 1000);
  if (module === "build") ms = Math.floor((ms * Math.max(0, rules.shipyardBuildSpecPm)) / 1000);
  return operator ? Math.floor(ms / OPERATOR_SPEED_FACTOR) : ms;
}

/** 조선소 도크 수(1483) */
export function shipyardDocks(
  level: number,
  module: ShipyardModule | null,
  rules: Pick<BoatCoefficients, "shipyardDocks" | "shipyardDockModule">,
): number {
  if (level < 1) return 0;
  const base = Math.max(1, rules.shipyardDocks);
  return module === "docks" ? base + Math.max(0, level - 1) * Math.max(0, rules.shipyardDockModule) : base;
}

/** 모듈을 붙일 수 있나(레벨 2부터) */
export const moduleUnlocked = (level: number): boolean => level >= SHIPYARD_MODULE_LEVEL;

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

/** 배 빠르기 배율(‰): 종류 speedPm, 내구도 0이면 brokenSpeedPm을 더 곱한다 */
export function boatSpeedPm(
  type: Pick<BoatTypeDef, "speedPm"> | undefined,
  hullPpm: number,
  rules: Pick<BoatCoefficients, "brokenSpeedPm">,
): number {
  const base = type?.speedPm ?? 1000;
  return hullPpm <= 0 ? Math.max(1, Math.floor((base * Math.max(1, rules.brokenSpeedPm)) / 1000)) : base;
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
  module: ShipyardModule | null,
  operator: boolean,
): { readonly materials: JobMaterial[]; readonly ms: number } | null {
  const lost = HULL_FULL - Math.max(0, Math.min(HULL_FULL, hullPpm));
  if (lost < REPAIR_MIN_PPM) return null;
  const spec = module === "repair" ? Math.max(0, rules.shipyardRepairSpecPm) : 1000;
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
  const buildMs = boatBuildMs(type, rules, null, false);
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

// NPC 빈 2차맵 알박기의 재료·운반·짓는 시간 규칙 — 시뮬(simulator/npcClaim.ts)과 서버(apps/server/src/npc/npcClaims.ts)가 같은 함수를 쓴다
// (@terra/sim/claim). 기획 D-212 "NPC도 같은 규칙", D-555 1505 "운영 자금이나 재료 등이 건물마다 가지고 있는 창고/금고에 저장되어 사용 …
// 자동운반이란 어떤 유닛이든 실제로 옮겨야한다", D-555 1509 "NPC만으로도 그대로 똑같이", D-564 1626 "NPC 운반은 시간 계산 가능"
// (질문 docs/questions/2026-11-21-npc-claim.md 2331 가·2333 가 — 국고 값 소각 [임시]를 바꿈).
// - 재료 = 팩 행정 건물(단계 government, 짓기 재료가 있는 첫 시설) 레벨 1 짓기 재료(buildCostAt — 유저 알박기와 같다). 자리 = 알박기 자리에서
//   가장 가까운 내 도시의 도시 창고(레벨 0 재료는 같은 원자재 종류 T0~T1 — allocateMaterials, 증축과 같다).
// - 운반 시간 = 옮김 셈(society/logistics.ts haulMs — 채집소 → 창고와 같은 식): 재료 무게(묶음 무게 × 수량, 짓는 시간과 같은 무게) ×
//   2차맵 거리(칸 = 2차맵 거리 × SECOND_MAP_CELLS) ÷ 나르는 사람(그 도시 일 없는 휴먼, npc_build_builders_max까지, 적어도 1).
// - 짓는 시간 = 행정 건물 레벨 1 짓는 시간(무게 × M14) → 같은 사람들이 돕는다(withBuilders — 증축과 같은 식).
// - 상한·조건(세력마다 동시에 짓는 수·도시 수·쉬는 날·휴먼) = claimGate. 세계 상한은 부르는 쪽이 본다(시뮬 = 설정 칸 npc_claim_world_cities,
//   서버 = 도시 2차맵 상한 MAX_CITY_MAPS·그때 띄우기 상한).
// 정수·BigInt만 쓴다(결정적).
import { SECOND_MAP_CELLS } from "@terra/protocol";
import { allocateMaterials } from "@terra/shared/bareHandMaterials";
import { type BuildStackJson, buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import { withBuilders } from "@terra/shared/facilityRuntime";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { haulMs } from "../society/logistics.ts";
import { itemAsset, lotSizeOf } from "./catalog.ts";
import type { Economy } from "./economy.ts";
import { DAY_MS } from "./metrics.ts";
import { idleHumans, lotWeightOf } from "./npcBuild.ts";
import { marketRefPrice } from "./npcTrade.ts";
import type { SimFaction, SimWorld } from "./world.ts";

export type { BuildStackJson } from "@terra/shared/facilityBuild";

/** 팩 행정 건물(단계 government, 짓기 재료가 있는 첫 시설)의 짓기 칸. 없으면 undefined */
function governmentBuild(economy: Pick<Economy, "catalog">) {
  for (const spec of economy.catalog.facilities.values())
    if (spec.stage === "government" && spec.build) return spec.build;
  return undefined;
}

/** 알박기 재료 = 행정 건물 레벨 1 짓기 재료(수량 0 뺌). 팩에 행정 건물이 없으면 undefined(알박기 없음) */
export function claimMaterialsOf(economy: Pick<Economy, "catalog">): BuildStackJson[] | undefined {
  const build = governmentBuild(economy);
  return build ? buildCostAt(build, 1).filter((stack) => stack.qty > 0) : undefined;
}

/** 재료 무게(g) = 묶음 무게 × 수량의 합(짓는 시간과 같은 무게, 무게를 모르는 아이템은 0) */
export function claimWeightG(economy: Economy, materials: readonly BuildStackJson[]): bigint {
  let grams = 0n;
  for (const stack of materials) {
    const weight = lotWeightOf(economy, stack.item);
    if (weight !== undefined) grams += BigInt(weight) * BigInt(Math.max(0, stack.qty));
  }
  return grams;
}

/** 그 도시에서 나르고 짓는 사람 = 일 없는 휴먼(경비대·시설 일꾼 빼고, npc_build_builders_max까지) */
export function claimHelpers(
  economy: Economy,
  world: SimWorld,
  faction: SimFaction,
  cityId: number,
  c: SocietyCoefficients,
): number {
  let guards = 0;
  for (const unitId of faction.units) {
    const unit = world.units.get(unitId);
    if (unit?.city === cityId && unit.guard === true) guards += 1;
  }
  return Math.min(Math.max(0, c.npc.buildBuildersMax), idleHumans(economy, world, cityId, guards));
}

/** 짓는 시간(ms) = 행정 건물 레벨 1 짓는 시간 → helpers가 돕는다. 행정 건물이 없으면 0 */
export function claimBuildMs(economy: Economy, c: SocietyCoefficients, helpers: number): number {
  const build = governmentBuild(economy);
  if (!build) return 0;
  const base = buildTimeAt(build, 1, (item) => lotWeightOf(economy, item), c.facilityBuild).ms;
  return withBuilders(base, Math.max(0, Math.trunc(helpers)), c.facilityRuntime);
}

/** 운반 시간(ms) = 옮김 셈(무게 × 2차맵 거리 × SECOND_MAP_CELLS 칸 ÷ 나르는 사람, 적어도 1). 옮김 셈을 끄면 0 */
export function claimHaulMs(
  weightG: bigint,
  mapDistance: number,
  carriers: number,
  c: SocietyCoefficients,
): number {
  const cells = Math.max(0, Math.trunc(mapDistance)) * SECOND_MAP_CELLS;
  return haulMs(weightG, cells, Math.max(1, Math.trunc(carriers)), c);
}

/** 꺼낼 아이템별 수량(레벨 0 재료는 같은 원자재 종류 T0~T1). 모자라면 undefined */
export function claimMaterialPlan(
  economy: Pick<Economy, "catalog">,
  materials: readonly BuildStackJson[],
  stockOf: (item: string) => bigint,
): Map<string, bigint> | undefined {
  return allocateMaterials(materials, economy.catalog.bareHandAccepts, stockOf);
}

/** 재료 값(그 도시 지난 값 × 묶음 수, 국고 예비금 판단 — 판단 틀 claimScore의 cost) */
export function claimValue(economy: Economy, cityId: number, materials: readonly BuildStackJson[]): bigint {
  let value = 0n;
  for (const stack of materials) {
    const asset = itemAsset(stack.item);
    const lot = lotSizeOf(economy.catalog, asset);
    const qty = BigInt(Math.max(0, stack.qty));
    value += ((qty + lot - 1n) / lot) * marketRefPrice(economy, cityId, asset);
  }
  return value;
}

/**
 * 세력 상한·조건(세계 상한 빼고): 동시에 짓는 수(0 = 끔) 아래, 이 도시 수부터 멈춤, 시작 뒤 쉬는 날, (도시 + 1) × 도시마다 휴먼 ≤ 휴먼.
 * active = 그 세력이 지금 짓는(나르는 중 포함) 알박기 수, lastStartMs = 마지막으로 시작한 시각(없으면 undefined)
 */
export function claimGate(
  faction: SimFaction,
  nowMs: number,
  active: number,
  lastStartMs: number | undefined,
  c: SocietyCoefficients,
): boolean {
  const n = c.npc;
  const max = Math.max(0, Math.trunc(n.claimMaxActive));
  if (max === 0 || !faction.alive || faction.player === true || faction.cities.size === 0) return false;
  if (faction.cities.size >= Math.max(1, Math.trunc(n.claimMaxCities))) return false;
  if (active >= max) return false;
  if (
    lastStartMs !== undefined &&
    nowMs < lastStartMs + Math.max(0, Math.trunc(n.claimCooldownDays)) * DAY_MS
  )
    return false;
  return faction.units.size >= (faction.cities.size + 1) * Math.max(0, Math.trunc(n.claimHumansPerCity));
}

// NPC 도시 계획(나라 특산) — 기획 답 531 다·553 나·554 다·600 나(D-518), docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"·"WP10 경제
// 마무리"·"WP12 특산·이름 마무리".
// 서버 NPC 도시 경제(apps/server/src/npc/economy.ts)가 도시마다 생산 시설과 처음 창고를 정할 때 쓴다. 시뮬 시나리오 경제는 같은 뜻의
// 시설 계획(cityPlan — 레시피를 적는다)·처음 재고(stock)를 그대로 쓰므로 부르지 않는다(시뮬 출력은 그대로).
// 1. 시설(553 나): 그 도시에 선 생산 건물은 그 시설의 특산 레시피를 돌린다 — 특산(나라 성격 cityJobs) 가운데 그 시설 것을 차례로, 같은 시설
//    건물이 여럿이면 건물 ID 차례로 특산 차례를 돌아가며 받는다. 그 시설 특산이 없으면 팩의 첫 레시피(옛 규칙). 건물이 받지 못한 특산(그
//    시설 건물이 없거나, 건물 수보다 그 시설 특산이 많아 남은 것)은 그 도시 휴먼이 도시 직무로 Lv1에서 돌린다(531 다·600 나 — 나라 특산은
//    건물 수와 상관없이 다 나오고, 건물은 레벨·자리만큼 더 낸다).
// 2. 처음 창고(554 다): 생필품 = 휴먼 수 × 몇 시간분(나라 성격 칸, 없으면 48시간), 특산 물건 = 나라 성격 칸의 고정 양(팩 수량 = 묶음 단위).
import type { RecipeSpec } from "../economy/production.ts";
import type { NecessitySpec } from "../economy/upkeep.ts";
import { type CatalogFacility, itemAsset, lotSizeOf } from "./catalog.ts";

/** 생산하는 시설 단계(채집·가공·부품·완제품). 창고·행정·신전 같은 시설은 생산하지 않는다 */
const PRODUCING_STAGES = new Set(["gather", "process", "parts", "finish"]);
/** 처음 창고 생필품 기본 시간(나라 성격 칸이 없을 때, 시뮬 목표 재고 48시간과 같다) */
export const START_NECESSITY_HOURS = 48;

/** 그 도시에 선 건물 하나(다 지은 것, 주인 = 도시 주인) */
export interface CityBuilding {
  readonly buildingId: number;
  readonly facility: string;
  readonly level: number;
}

/** 특산 직무 하나(시설 + 레시피) */
export interface CityJob {
  readonly facility: string;
  readonly recipe: string;
}

/** 도시 계획의 생산 시설 하나: 건물(buildingId)이거나 특산 직무(jobIndex = 특산 차례) */
export interface PlannedFacility {
  readonly buildingId: number | null;
  readonly jobIndex: number | null;
  readonly facility: string;
  readonly recipe: string;
  readonly level: number;
  /** 자리 수(레벨 × 레벨당 자리) */
  readonly slots: number;
}

/** 계획에 쓰는 목록 몫(서버는 prepareCatalog 결과를 넘긴다) */
export interface CityPlanCatalog {
  readonly recipes: ReadonlyMap<string, RecipeSpec>;
  readonly facilities: ReadonlyMap<string, CatalogFacility>;
}

/**
 * 도시의 생산 시설(위 머리 주석 1): 건물(건물 ID 차례) 다음에 건물이 받지 못한 특산 직무(특산 차례). 생산하지 않는 시설·레시피가 없는
 * 시설·레시피의 시설이 직무 시설과 다른 직무는 뺀다(팩 성격 칸은 참조만 검사한다)
 */
export function planCityFacilities(
  buildings: readonly CityBuilding[],
  jobs: readonly CityJob[],
  catalog: CityPlanCatalog,
): PlannedFacility[] {
  const out: PlannedFacility[] = [];
  const valid = (job: CityJob): boolean => catalog.recipes.get(job.recipe)?.facility === job.facility;
  const firstRecipe = (facility: string): string | undefined => {
    for (const recipe of catalog.recipes.values()) if (recipe.facility === facility) return recipe.id;
    return undefined;
  };
  /** 시설마다 건물이 이미 받은 특산 수(같은 시설 건물이 차례로 다음 특산을 받는다) */
  const taken = new Map<string, number>();
  for (const building of buildings.toSorted((a, b) => a.buildingId - b.buildingId)) {
    const spec = catalog.facilities.get(building.facility);
    if (!spec || !PRODUCING_STAGES.has(spec.stage)) continue;
    const special = jobs.filter((job) => job.facility === building.facility && valid(job));
    const turn = taken.get(building.facility) ?? 0;
    taken.set(building.facility, turn + 1);
    const recipe =
      special.length > 0 ? special[turn % special.length]?.recipe : firstRecipe(building.facility);
    if (recipe === undefined) continue;
    out.push({
      buildingId: building.buildingId,
      jobIndex: null,
      facility: building.facility,
      recipe,
      level: building.level,
      slots: spec.slotsPerLevel * building.level,
    });
  }
  /** 시설마다 지금까지 본 특산 차례(그 시설 특산 가운데 몇 번째인가) */
  const seen = new Map<string, number>();
  jobs.forEach((job, index) => {
    if (!valid(job)) return;
    const turn = seen.get(job.facility) ?? 0;
    seen.set(job.facility, turn + 1);
    // 건물이 받은 특산(그 시설 특산 차례 < 그 시설 건물 수)은 건물이 돌린다. 남은 것만 휴먼이(600 나)
    if (turn < (taken.get(job.facility) ?? 0)) return;
    const spec = catalog.facilities.get(job.facility);
    if (!spec) return;
    out.push({
      buildingId: null,
      jobIndex: index,
      facility: job.facility,
      recipe: job.recipe,
      level: 1,
      slots: spec.slotsPerLevel,
    });
  });
  return out;
}

/** 처음 창고 계산에 쓰는 목록 몫 */
export interface StartStockCatalog {
  readonly startPrice: ReadonlyMap<string, bigint>;
  readonly lotSize: ReadonlyMap<string, bigint>;
  readonly necessities: readonly NecessitySpec[];
}

/**
 * 도시 하나의 처음 창고(위 머리 주석 2): 생필품마다 휴먼 수 × 양 × 시간 ÷ 주기, 그다음 특산 물건마다 팩 수량 × 묶음 크기(같은 물건이면 더한다).
 * 휴먼이 0이어도 한 명으로 친다(새 도시가 첫날 굶지 않게, 옛 규칙). 없는 물건·0 이하는 뺀다. 자산 코드 → 양(목록 차례)
 */
export function cityStartStock(
  catalog: StartStockCatalog,
  humans: number,
  hours: number = START_NECESSITY_HOURS,
  special: readonly { readonly item: string; readonly qty: number }[] = [],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const add = (asset: string, qty: bigint): void => {
    if (qty > 0n) out.set(asset, (out.get(asset) ?? 0n) + qty);
  };
  const people = BigInt(Math.max(1, Math.trunc(humans)));
  const time = BigInt(Math.max(0, Math.trunc(hours)));
  for (const spec of catalog.necessities)
    add(spec.asset, (people * spec.perUnit * time) / BigInt(Math.max(1, spec.periodHours)));
  for (const line of special) {
    const asset = itemAsset(line.item);
    if (catalog.startPrice.has(asset))
      add(asset, BigInt(Math.max(0, Math.trunc(line.qty))) * lotSizeOf(catalog, asset));
  }
  return out;
}

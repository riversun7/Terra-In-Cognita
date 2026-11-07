// 분류 목록 — 분류 하나가 팩 폴더의 파일 하나(<분류>.json, 내용은 {"entries": [...]})다.
// 실제 분류와 필드는 기획(docs/design/)이 정한다. M0는 형식 확인용 items 하나, 기본 필드만 둔다.
// S2: 행성 정의(planets)와 바이옴 표(biomes)를 더했다(ADR 2026-10-29-s2-planet-lod, 임시 데이터).
// 행성 표본(planet_templates): 편집기 시작점만, 서버가 굽지 않는다(ADR 2026-10-29-planet-editor-stage1 "행성 표본").
// R4a: 효과 사전·스킬·유닛 종류(장비 칸)와 아이템 장비 칸(docs/adr/2026-10-31-combat-core.md 7절).
// R2: 아이템에 대분류·티어·기준 가치(core@28부터 시작 시세)·켬/끔을 더하고, 레시피·시설·생필품·국가 프리셋을 더했다(ADR 2026-10-31-economy-core).
// 2차맵 소품(map_props): 2차맵 생성기의 배치 규칙(ADR 2026-10-31-second-map-from-planet 4절, 임시 데이터).
// 전투 계산식(formulas): 개발자 모드에서 고치는 식(docs/adr/2026-11-01-formula-editor.md).
// 아이템 분류 자료(item_subcategories·item_tags·weapon_types)와 아이템 공통 칸·묶음(docs/adr/2026-11-01-item-editor.md 2절).
// 채집·채굴 티어 확률표(gather_tiers, 49 N43·D-506): 유효 스탯 구간마다 T0~T9 가중치(docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)").
// 경로 랭킹 목록(ranking_paths, D-392·20 §7·§8): 경로마다 공개 여부·재는 것(docs/adr/2026-11-07-ranking.md).
// 2차맵 원자재 오브젝트(gather_objects): 채집 자리 종류·아이템·일·다시 자람(docs/adr/2026-11-07-gather-objects.md, 임시 데이터).
import { z } from "zod";
import {
  facilityEntrySchema,
  gatherTierEntrySchema,
  nationPresetEntrySchema,
  necessityEntrySchema,
  recipeEntrySchema,
} from "./economy.ts";
import {
  itemEntrySchema,
  itemSubcategoryEntrySchema,
  itemTagEntrySchema,
  weaponTypeEntrySchema,
} from "./items.ts";
import { mapPropEntrySchema } from "./mapProps.ts";
import { gatherObjectEntrySchema } from "./gatherObjects.ts";
import { effectEntrySchema, skillEntrySchema, unitKindEntrySchema } from "./combat.ts";
import { biomeEntrySchema, planetEntrySchema, planetTemplateEntrySchema } from "./planets.ts";
import { formulaEntrySchema } from "./formulas.ts";
import { rankingPathEntrySchema } from "./ranking.ts";
import { statRowEntrySchema } from "./stats.ts";
import { tuningEntrySchema } from "./tuning.ts";

export interface CategoryDefinition {
  /** 항목 하나의 스키마. id 필드(contentId)를 꼭 가진다. 다른 항목 참조는 ref("<분류>")로 선언한다 */
  entry: z.ZodType<{ id: string }>;
  /** true면 다른 항목이 한 번도 참조하지 않는 항목을 고아로 보고 실패한다 */
  mustBeReferenced?: boolean;
}

/** 분류 이름 → 정의. 분류 이름은 ID와 같은 형식(영어 snake_case)이다 */
export type CategoryRegistry = Readonly<Record<string, CategoryDefinition>>;

/**
 * 항목 파일의 바깥 모양. 항목은 ID를 키로 한 객체가 아니라 배열로 둔다:
 * JSON.parse는 같은 키가 두 번 나오면 말없이 뒤의 것만 남겨서, 중복 ID를 찾을 수 없다.
 */
export function entriesFileSchema(entry: z.ZodType<{ id: string }>) {
  return z.strictObject({ entries: z.array(entry) });
}

export { itemEntrySchema, type ItemEntry } from "./items.ts";

export const CATEGORIES: CategoryRegistry = {
  items: { entry: itemEntrySchema },
  item_subcategories: { entry: itemSubcategoryEntrySchema },
  item_tags: { entry: itemTagEntrySchema },
  weapon_types: { entry: weaponTypeEntrySchema },
  facilities: { entry: facilityEntrySchema },
  recipes: { entry: recipeEntrySchema },
  necessities: { entry: necessityEntrySchema },
  nation_presets: { entry: nationPresetEntrySchema },
  gather_tiers: { entry: gatherTierEntrySchema },
  ranking_paths: { entry: rankingPathEntrySchema },
  stat_rows: { entry: statRowEntrySchema },
  formulas: { entry: formulaEntrySchema },
  effects: { entry: effectEntrySchema },
  skills: { entry: skillEntrySchema },
  unit_kinds: { entry: unitKindEntrySchema },
  tuning: { entry: tuningEntrySchema },
  biomes: { entry: biomeEntrySchema },
  planets: { entry: planetEntrySchema },
  planet_templates: { entry: planetTemplateEntrySchema },
  map_props: { entry: mapPropEntrySchema },
  gather_objects: { entry: gatherObjectEntrySchema },
};

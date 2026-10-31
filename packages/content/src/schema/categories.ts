// 분류 목록 — 분류 하나가 팩 폴더의 파일 하나(<분류>.json, 내용은 {"entries": [...]})다.
// 실제 분류와 필드는 기획(docs/design/)이 정한다. M0는 형식 확인용 items 하나, 기본 필드만 둔다.
// S2: 행성 정의(planets)와 바이옴 표(biomes)를 더했다(ADR 2026-10-29-s2-planet-lod, 임시 데이터).
// 행성 표본(planet_templates): 편집기 시작점만, 서버가 굽지 않는다(ADR 2026-10-29-planet-editor-stage1 "행성 표본").
// R2: 아이템에 대분류·티어·기준 가치·켬/끔을 더하고, 레시피·시설·생필품·국가 프리셋을 더했다(ADR 2026-10-31-economy-core).
// 2차맵 소품(map_props): 2차맵 생성기의 배치 규칙(ADR 2026-10-31-second-map-from-planet 4절, 임시 데이터).
import { z } from "zod";
import {
  facilityEntrySchema,
  itemEntrySchema,
  nationPresetEntrySchema,
  necessityEntrySchema,
  recipeEntrySchema,
} from "./economy.ts";
import { mapPropEntrySchema } from "./mapProps.ts";
import { biomeEntrySchema, planetEntrySchema, planetTemplateEntrySchema } from "./planets.ts";
import { statRowEntrySchema } from "./stats.ts";

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

export { itemEntrySchema, type ItemEntry } from "./economy.ts";

export const CATEGORIES: CategoryRegistry = {
  items: { entry: itemEntrySchema },
  facilities: { entry: facilityEntrySchema },
  recipes: { entry: recipeEntrySchema },
  necessities: { entry: necessityEntrySchema },
  nation_presets: { entry: nationPresetEntrySchema },
  stat_rows: { entry: statRowEntrySchema },
  biomes: { entry: biomeEntrySchema },
  planets: { entry: planetEntrySchema },
  planet_templates: { entry: planetTemplateEntrySchema },
  map_props: { entry: mapPropEntrySchema },
};

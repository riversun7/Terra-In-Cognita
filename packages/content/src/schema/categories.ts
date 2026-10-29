// 분류 목록 — 분류 하나가 팩 폴더의 파일 하나(<분류>.json, 내용은 {"entries": [...]})다.
// 실제 분류와 필드는 기획(docs/design/)이 정한다. M0는 형식 확인용 items 하나, 기본 필드만 둔다.
// S2: 행성 정의(planets)와 바이옴 표(biomes)를 더했다(ADR 2026-10-29-s2-planet-lod, 임시 데이터).
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";
import { biomeEntrySchema, planetEntrySchema } from "./planets.ts";

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

export const itemEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
});
export type ItemEntry = z.output<typeof itemEntrySchema>;

export const CATEGORIES: CategoryRegistry = {
  items: { entry: itemEntrySchema },
  biomes: { entry: biomeEntrySchema },
  planets: { entry: planetEntrySchema },
};

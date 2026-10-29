// [시험 도우미] 콘텐츠 팩의 행성·바이옴 항목 — 편집기 시험만 쓴다(화면 묶음에 들어가지 않는다).
// 팩 값이 바뀌어도(생성기 다양성 고침 등) 시험은 해시·수치를 적지 않고 생성기 결과끼리 견주므로 그대로 돈다.
import biomesFile from "../../../../../content/core/biomes.json" with { type: "json" };
import planetsFile from "../../../../../content/core/planets.json" with { type: "json" };
import { type DraftEntry, isDraftEntry } from "./editorModel.ts";
import type { PreviewDefinition } from "./previewTypes.ts";

/** 팩 바이옴 항목 전부 */
export const PACK_BIOMES: readonly unknown[] = biomesFile.entries;

function packPlanet(id: string): DraftEntry {
  const entry: unknown = planetsFile.entries.find((planet) => planet.id === id);
  if (!isDraftEntry(entry)) throw new Error(`content pack has no planet ${id}`);
  return entry;
}

/** S2 시험 행성 항목(면 레벨 9) */
export const TEST_PLANET: DraftEntry = packPlanet("s2_test_planet");

/** 항목 → 미리보기 정의(팩 바이옴) */
export function definitionOf(entry: DraftEntry): PreviewDefinition {
  return { entry, biomes: PACK_BIOMES };
}

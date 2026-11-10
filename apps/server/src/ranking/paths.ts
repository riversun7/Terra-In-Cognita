// 경로 랭킹 목록 — 콘텐츠 팩 `ranking_paths`(D-392 공개 여부 표시, 20 §7·§8)를 화면·집계 모양으로 읽는다.
// 팩이 검증을 통과했으므로 다시 읽기는 실패하지 않는다. 팩에 분류 파일이 없으면 빈 목록(랭킹 판 없음).
import { type ContentPack, rankingPathEntrySchema } from "@terra/content";
import type { LocalizedName } from "@terra/shared/faction";
import type { RankingPathInfo } from "@terra/shared/ranking";
import { z } from "zod";
import { type NationPreset, nationName } from "../npc/nations.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";

const entriesSchema = z.array(rankingPathEntrySchema);

export function rankingPathsOf(pack: ContentPack): RankingPathInfo[] {
  return entriesSchema.parse(pack.entries.get("ranking_paths") ?? []).map((entry) => ({
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    area: entry.area,
    open: entry.open,
    measures: entry.measures.map((item) => ({ measure: item.measure, weightPm: item.weightPm })),
  }));
}

/**
 * 세력 코드 → 이름(세력 행 code가 프리셋 ID인 시험 국가, src/npc/nations.ts). 판의 세력 이름에 쓴다. 국가 1(시험 NPC 세력 s3_test_npc)은
 * 사이보그 만들기·지도와 같은 이름(16번째 프리셋, nationName)이다 — 전에는 코드가 그대로 보였다
 */
export type NationNames = ReadonlyMap<string, LocalizedName>;

const nationSchema = z.array(
  z.looseObject({ id: z.string(), name: z.strictObject({ ko: z.string(), en: z.string() }) }),
);

export function nationNamesOf(pack: ContentPack): NationNames {
  const names = new Map<string, LocalizedName>(
    nationSchema.parse(pack.entries.get("nation_presets") ?? []).map((entry) => [entry.id, entry.name]),
  );
  const first = nationName(TEST_NPC_FACTION_CODE, nationPresetsOf(pack));
  if (first) names.set(TEST_NPC_FACTION_CODE, first);
  return names;
}

/**
 * 실효 국가 프리셋 목록에서 세력 이름 표를 다시 채운다(시작 국가 설정 편집기가 이름을 바꾸면 판의 세력 이름도 따라간다 —
 * docs/adr/2026-11-10-nation-editor.md 5절). 같은 Map을 제자리에서 고친다(읽는 쪽은 그 Map 하나를 들고 있다)
 */
export function syncNationNames(names: Map<string, LocalizedName>, presets: readonly NationPreset[]): void {
  names.clear();
  for (const preset of presets) names.set(preset.code, preset.name);
  const first = nationName(TEST_NPC_FACTION_CODE, presets);
  if (first) names.set(TEST_NPC_FACTION_CODE, first);
}

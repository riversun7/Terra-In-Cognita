// 팩 국가 프리셋 → 시험 국가 코드·이름 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460 "시험 세력 + 팩 프리셋 셋")
import { type ContentPack, nationPresetEntrySchema } from "@terra/content";
import type { NationPreset } from "./nations.ts";

/** 켜진 국가 프리셋(팩 차례). 프리셋 ID가 세력 코드가 된다 */
export function nationPresetsOf(pack: ContentPack): NationPreset[] {
  return (pack.entries.get("nation_presets") ?? [])
    .map((raw) => nationPresetEntrySchema.parse(JSON.parse(JSON.stringify(raw))))
    .filter((entry) => entry.enabled)
    .map((entry) => ({ code: entry.id, name: { ko: entry.name.ko, en: entry.name.en } }));
}

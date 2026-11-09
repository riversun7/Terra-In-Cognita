// 팩 국가 프리셋 → 시험 국가 코드·이름·성격 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460 "시험 세력 + 팩 프리셋 셋"),
// 나라 성격·도시 이름(기획 답 504 다·510 다·531 다·533 다·554 다, D-518 — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"·"WP10"),
// 지도자 이름(같은 ADR "WP-NPC"), 휴먼 이름 조각(같은 ADR "WP-NPC4", 기획 답 773 나)
import { type ContentPack, nationPresetEntrySchema } from "@terra/content";
import type { NationPreset } from "./nations.ts";

/** 켜진 국가 프리셋(팩 차례). 프리셋 ID가 세력 코드가 된다 */
export function nationPresetsOf(pack: ContentPack): NationPreset[] {
  return (pack.entries.get("nation_presets") ?? [])
    .map((raw) => nationPresetEntrySchema.parse(JSON.parse(JSON.stringify(raw))))
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const personality = entry.personality;
      return {
        code: entry.id,
        name: { ko: entry.name.ko, en: entry.name.en },
        ...(personality
          ? {
              personality: {
                ...(personality.startCities === undefined ? {} : { startCities: personality.startCities }),
                ...(personality.startNecessityHours === undefined
                  ? {}
                  : { startNecessityHours: personality.startNecessityHours }),
                ...(personality.cityJobs
                  ? {
                      cityJobs: personality.cityJobs.map((job) => ({
                        facility: job.facility.id,
                        recipe: job.recipe.id,
                      })),
                    }
                  : {}),
                ...(personality.startStock
                  ? {
                      startStock: personality.startStock.map((stack) => ({
                        item: stack.item.id,
                        qty: stack.qty,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
        ...(entry.cityNames ? { cityNames: [...entry.cityNames] } : {}),
        ...(entry.leaderName ? { leaderName: { ko: entry.leaderName.ko, en: entry.leaderName.en } } : {}),
        ...(entry.shortName ? { shortName: entry.shortName } : {}),
        ...(entry.color ? { color: entry.color } : {}),
        currency: {
          code: entry.currency.code,
          name: { ko: entry.currency.name.ko, en: entry.currency.name.en },
          ...(entry.currency.symbol ? { symbol: entry.currency.symbol } : {}),
          ...(entry.currency.ticker ? { ticker: entry.currency.ticker } : {}),
        },
        ...(entry.humanNames
          ? {
              humanNames: {
                given: [...entry.humanNames.given],
                family: [...(entry.humanNames.family ?? [])],
              },
            }
          : {}),
      };
    });
}

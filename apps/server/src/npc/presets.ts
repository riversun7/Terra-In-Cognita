// 팩 국가 프리셋 → 시험 국가 코드·이름·성격 — docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가(D-460 "시험 세력 + 팩 프리셋 셋"),
// 나라 성격·도시 이름(기획 답 504 다·510 다·531 다·533 다·554 다, D-518 — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"·"WP10"),
// 지도자 이름(같은 ADR "WP-NPC"), 휴먼 이름 조각(같은 ADR "WP-NPC4", 기획 답 773 나),
// 국가마다 세계 씨앗 값·국가 마크 사양·실효 프리셋(시작 국가 설정 편집기 /dev/nations — docs/adr/2026-11-10-nation-editor.md)
import { type ContentPack, type NationPresetEntry, nationPresetEntrySchema } from "@terra/content";
import type { NationPreset } from "./nations.ts";

/** 값이 있는 수 칸만 남긴다(exactOptionalPropertyTypes: 없는 칸은 키째 뺀다) */
function numbers<K extends string>(
  values: Readonly<Record<K, number | undefined>>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key in values) {
    const value = values[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** 파싱한 국가 프리셋(켜진 것만, 준 차례) → 서버가 쓰는 모양. 프리셋 ID가 세력 코드가 된다 */
export function nationPresetsFrom(entries: readonly NationPresetEntry[]): NationPreset[] {
  return entries
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const personality = entry.personality;
      return {
        code: entry.id,
        name: { ko: entry.name.ko, en: entry.name.en },
        ...(personality
          ? {
              personality: {
                ...numbers({
                  startCities: personality.startCities,
                  startNecessityHours: personality.startNecessityHours,
                  startHousing: personality.startHousing,
                  startPopulationPm: personality.startPopulationPm,
                  startFarms: personality.startFarms,
                  startLumberCamps: personality.startLumberCamps,
                  startMines: personality.startMines,
                  startStorehouses: personality.startStorehouses,
                }),
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
        ...(entry.emblem ? { emblem: { ...entry.emblem } } : {}),
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

/** 켜진 국가 프리셋(팩 차례). 프리셋 ID가 세력 코드가 된다 */
export function nationPresetsOf(pack: ContentPack): NationPreset[] {
  return nationPresetsFrom(
    (pack.entries.get("nation_presets") ?? []).map((raw) =>
      nationPresetEntrySchema.parse(JSON.parse(JSON.stringify(raw))),
    ),
  );
}

/**
 * 실효 국가 프리셋 목록(팩 + 이 세계의 덮어쓰기 — 시작 국가 설정 편집기). 서버 곳곳이 같은 배열 하나를 들고 있으므로(세계 씨앗·NPC 사회·
 * 세력 이름·운영자 콘솔), 편집기가 저장하면 그 배열의 내용을 제자리에서 바꾼다: 읽는 쪽은 쓸 때마다 배열을 다시 읽어 다음 조회부터 새 값을
 * 본다(바로 든다, D-461). 배열 자체는 바뀌지 않는다(같은 참조).
 * - source: 지금 실효 프리셋(ContentEditState.effective().nationPresets — 스냅숏마다 같은 객체)
 * - sync(): source가 바뀌었으면 내용을 바꾼다(바뀌었는지 돌려준다). 덮어쓰기를 실은 뒤·저장한 뒤 부른다
 */
export function createLivePresets(source: () => readonly NationPresetEntry[]): {
  readonly list: readonly NationPreset[];
  sync(): boolean;
} {
  let seen: readonly NationPresetEntry[] | undefined;
  const list: NationPreset[] = [];
  const sync = (): boolean => {
    const now = source();
    if (now === seen) return false;
    seen = now;
    // 한 번에 바꿔 끼운다(동기 — 읽는 쪽이 반쯤 바뀐 목록을 보지 않는다)
    list.splice(0, list.length, ...nationPresetsFrom(now));
    return true;
  };
  sync();
  return { list, sync };
}

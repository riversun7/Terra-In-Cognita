// 정부 판 시장 글 — 기획 답 744 나, docs/adr/2026-11-07-play-flow.md "WP-NPC2"·"WP-NPC4"(휴먼 이름, 기획 답 773 나). 엔진·React를 가져오지 않는다
// (시험 대상, mayorText.test.ts).
import type { GovernmentMayor } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

/**
 * 시장 이름 줄: 휴먼 이름이 있으면 "이름 · Lv레벨"(이름은 번역하지 않는다 D-476), 없으면(그 나라 이름 목록 없음) "휴먼 #유닛 ID · Lv레벨"
 * (유닛 ID는 자리 구분 없이)
 */
export function mayorTitle(
  mayor: Pick<GovernmentMayor, "unitId" | "level"> & { readonly name?: string | null },
  locale: Locale = getLocale(),
): string {
  if (mayor.name) return m.government_mayor_named({ name: mayor.name, level: mayor.level }, { locale });
  return m.government_mayor_title({ id: String(mayor.unitId), level: mayor.level }, { locale });
}

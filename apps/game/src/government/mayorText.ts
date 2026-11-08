// 정부 판 시장 글 — 기획 답 744 나, docs/adr/2026-11-07-play-flow.md "WP-NPC2". 엔진·React를 가져오지 않는다(시험 대상, mayorText.test.ts).
import type { GovernmentMayor } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

/** 시장 이름 줄: 휴먼은 이름이 아직 없어 "휴먼 #유닛 ID · Lv레벨"(유닛 ID는 자리 구분 없이) */
export function mayorTitle(
  mayor: Pick<GovernmentMayor, "unitId" | "level">,
  locale: Locale = getLocale(),
): string {
  return m.government_mayor_title({ id: String(mayor.unitId), level: mayor.level }, { locale });
}

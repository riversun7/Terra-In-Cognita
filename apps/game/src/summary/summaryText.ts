// 복귀 요약 문구 — 칸 이름, 덮는 길이, 그릴 칸(순수 함수, 시험 대상). 대화상자 조각(SummaryDialog.tsx)에만 들어간다.
// 키로 고르는 문구는 정적 표에 둔다(m[키]는 oxlint가 막는다). 칸 종류가 늘면 satisfies가 빠진 이름을 알려 준다.
import type { SummaryGetResponse, SummarySection, SummarySectionKind } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";

/** 칸 종류 → 이름 */
export const SECTION_LABELS = {
  production: m.summary_section_production,
  raid: m.summary_section_raid,
  injury: m.summary_section_injury,
  world_news: m.summary_section_world_news,
  market: m.summary_section_market,
} satisfies Record<SummarySectionKind, () => string>;

function isKnownSection(kind: string): kind is SummarySectionKind {
  return Object.hasOwn(SECTION_LABELS, kind);
}

export type VisibleSection = SummarySection & { readonly kind: SummarySectionKind };

/** 그릴 칸: 아는 종류(더 새 서버의 모르는 칸은 뺀다)이고 사건이 있는 칸, 받은 차례로 */
export function visibleSections(summary: SummaryGetResponse): VisibleSection[] {
  const result: VisibleSection[] = [];
  for (const section of summary.sections) {
    const { kind } = section;
    if (isKnownSection(kind) && section.count > 0) result.push({ ...section, kind });
  }
  return result;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 요약이 덮는 길이(마지막 확인 → 지금): 분(올림, 1분부터) → 60분이 되면 시간(반올림) → 48시간이 되면 날(반올림).
 * 단위 경계에서 "60분"·"48시간"으로 보이지 않고 다음 단위로 넘어간다. 며칠 비운 뒤에도 "1,284시간"처럼 보이지 않는다.
 * 지난 길이라 반올림한다(남은 시간인 마감은 inboxText.ts formatDue가 내림한다). 단위 이름은 Intl이 언어에 맞게 붙인다.
 */
export function formatSpan(ms: number, locale: string): string {
  const span = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const unitText = (value: number, unit: "minute" | "hour" | "day") =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
  const minutes = Math.max(1, Math.ceil(span / MINUTE));
  if (minutes < 60) return unitText(minutes, "minute");
  const hours = Math.max(1, Math.round(span / HOUR));
  if (hours < 48) return unitText(hours, "hour");
  return unitText(Math.round(span / DAY), "day");
}

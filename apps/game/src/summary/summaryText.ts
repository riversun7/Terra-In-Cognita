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
 * 요약이 덮는 길이(마지막 확인 → 지금): 1시간 안은 분(올림, 1분부터), 48시간 안은 시간, 그 뒤는 날(반올림).
 * 며칠 비운 뒤에도 "1,284시간"처럼 보이지 않게 날로 올린다. 단위 이름은 Intl이 언어에 맞게 붙인다.
 */
export function formatSpan(ms: number, locale: string): string {
  const span = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const [value, unit] =
    span < HOUR
      ? [Math.max(1, Math.ceil(span / MINUTE)), "minute"]
      : span < 2 * DAY
        ? [Math.round(span / HOUR), "hour"]
        : [Math.round(span / DAY), "day"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}

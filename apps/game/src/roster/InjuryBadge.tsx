// 부상 단계 표 — 기획 D-521(초록(정상) · 흰 · 노랑 · 빨강, 자연 치유는 한 단계씩), docs/adr/2026-11-08-injury.md.
// 색 점(--color-injury-*, 흰 점은 테두리로 보인다) + 단계 이름 + 다음 단계까지 남은 시간. 글자는 본문 색이라 색만으로 뜻을 전하지 않는다.
import type { RosterInjury } from "@terra/shared/roster";
import { type Locale, getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import { remaining } from "./rosterText.ts";

const STAGE_NAMES = [
  (locale: Locale) => m.injury_stage_0({}, { locale }),
  (locale: Locale) => m.injury_stage_1({}, { locale }),
  (locale: Locale) => m.injury_stage_2({}, { locale }),
  (locale: Locale) => m.injury_stage_3({}, { locale }),
] as const;

/** 단계 이름(0 초록(정상) · 1 흰 · 2 노랑 · 3 빨강) */
export function injuryStageName(stage: number, locale: Locale = getLocale()): string {
  return STAGE_NAMES[Math.min(3, Math.max(0, Math.trunc(stage)))]?.(locale) ?? "";
}

/** "빨강 · 2일 후 노랑" — 다음 단계(한 단계 아래)까지 남은 시간. 초록이면 이름만 */
export function injuryText(injury: RosterInjury, now: number, locale: Locale = getLocale()): string {
  const name = injuryStageName(injury.stage, locale);
  if (injury.stage <= 0 || injury.untilMs === null) return name;
  const time = remaining(injury.untilMs, now, locale);
  return time
    ? `${name} · ${m.injury_next({ time, next: injuryStageName(injury.stage - 1, locale) }, { locale })}`
    : name;
}

export function InjuryBadge({
  injury,
  now,
  showHealthy = false,
}: {
  injury: RosterInjury;
  now: number;
  /** 초록(정상)도 보이나(상세). 목록은 다친 유닛만 */
  showHealthy?: boolean;
}) {
  if (injury.stage <= 0 && !showHealthy) return null;
  return (
    <span className="injury-badge" data-stage={injury.stage} data-part="injury-badge">
      <span className="injury-dot" aria-hidden="true" />
      <span>{injuryText(injury, now)}</span>
    </span>
  );
}

/** 빨강 → 노랑 → 흰 → 초록 길(지금 단계에 표, 지난 단계는 흐리게) — 상세 판 */
export function InjuryTrack({ stage }: { stage: number }) {
  return (
    <span className="injury-track" aria-hidden="true">
      {[3, 2, 1, 0].map((step) => (
        <span
          key={step}
          className="injury-track-step"
          data-stage={step}
          data-current={step === stage ? "true" : undefined}
          data-past={step > stage ? "true" : undefined}
        >
          <span className="injury-dot" />
        </span>
      ))}
    </span>
  );
}

// 정부 판의 도시 하루 값(만족도·발전도·생필품 충족) — 기획 정리 743 나(정부 판 = 서버가 하루마다 셈하는 값), docs/adr/2026-11-07-play-flow.md
// "WP-NPC3". 서버가 이미 셈한 값을 읽어 보이기만 한다(서버 src/government/cityDay.ts). 값이 없으면 "—"(휴먼 없음·도시 경제 없음·아직 하루 끝 전).
// 세 값 모두 같은 날(지난 하루 끝)의 값이다 — 생필품도 하루 끝에 저장한 값(기획 정리 781 나, "WP-NPC4").
// 정부 대화상자(GovernmentDialog.tsx)가 사실 줄 아래에 둔다.
// 바뀜(사용자 지적 2026-11-15 "너무 단일톤이라 정보가 제대로 보이지도않고"): 값마다 막대를 둔다(70 이상 초록·40 이상 금색·그 아래 빨강, 글자 값은 그대로).
import type { GovernmentCityDay } from "@terra/shared/government";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { necessitiesText, pointsText } from "./governmentData.ts";

/** 0~100 → 막대 높낮이(색 이름) */
function levelOf(percent: number): "high" | "mid" | "low" {
  return percent >= 70 ? "high" : percent >= 40 ? "mid" : "low";
}

/** 하루 값 한 줄(이름표 + 값 + 막대). percent = 0~100(모르면 null — 막대 없음) */
function DayFact({
  label,
  value,
  part,
  percent,
}: {
  label: string;
  value: string;
  part: string;
  percent: number | null;
}) {
  const clamped = percent === null ? null : Math.max(0, Math.min(100, percent));
  return (
    <div
      className="gov-fact gov-meter-fact"
      data-part={part}
      data-level={clamped === null ? undefined : levelOf(clamped)}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
      {clamped === null ? null : (
        <span className="gov-meter" aria-hidden="true">
          <span className="gov-meter-fill" style={{ inlineSize: `${String(clamped)}%` }} />
        </span>
      )}
    </div>
  );
}

export function GovernmentDay({ day }: { readonly day: GovernmentCityDay }) {
  const titleId = useId();
  return (
    <section className="gov-section gov-band" aria-labelledby={titleId} data-part="government-day">
      <h3 id={titleId} className="gov-section-title">
        {m.government_day_title()}
      </h3>
      <dl className="gov-facts">
        <DayFact
          part="government-satisfaction"
          label={m.government_field_satisfaction()}
          value={pointsText(day.satisfaction)}
          percent={day.satisfaction}
        />
        <DayFact
          part="government-development"
          label={m.government_field_development()}
          value={pointsText(day.development)}
          percent={day.development}
        />
        <DayFact
          part="government-necessities"
          label={m.government_field_necessities()}
          value={necessitiesText(day.necessitiesPm)}
          percent={day.necessitiesPm === null ? null : day.necessitiesPm / 10}
        />
      </dl>
      <p className="gov-muted">{m.government_day_note()}</p>
    </section>
  );
}

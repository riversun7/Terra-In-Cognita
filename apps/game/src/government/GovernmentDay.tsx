// 정부 판의 도시 하루 값(만족도·발전도·생필품 충족) — 기획 정리 743 나(정부 판 = 서버가 하루마다 셈하는 값), docs/adr/2026-11-07-play-flow.md
// "WP-NPC3". 서버가 이미 셈한 값을 읽어 보이기만 한다(서버 src/government/cityDay.ts). 값이 없으면 "—"(휴먼 없음·도시 경제 없음·오늘 셈 전).
// 정부 대화상자(GovernmentDialog.tsx)가 사실 줄 아래에 둔다.
import type { GovernmentCityDay } from "@terra/shared/government";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { necessitiesText, pointsText } from "./governmentData.ts";

/** 하루 값 한 줄(이름표 + 값) — 정부 대화상자 사실 줄(gov-fact)과 같은 모양 */
function DayFact({ label, value, part }: { label: string; value: string; part: string }) {
  return (
    <div className="gov-fact" data-part={part}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function GovernmentDay({ day }: { readonly day: GovernmentCityDay }) {
  const titleId = useId();
  return (
    <section className="gov-section" aria-labelledby={titleId} data-part="government-day">
      <h3 id={titleId} className="gov-section-title">
        {m.government_day_title()}
      </h3>
      <dl className="gov-facts">
        <DayFact
          part="government-satisfaction"
          label={m.government_field_satisfaction()}
          value={pointsText(day.satisfaction)}
        />
        <DayFact
          part="government-development"
          label={m.government_field_development()}
          value={pointsText(day.development)}
        />
        <DayFact
          part="government-necessities"
          label={m.government_field_necessities()}
          value={necessitiesText(day.necessitiesPm)}
        />
      </dl>
      <p className="gov-muted">{m.government_day_note()}</p>
    </section>
  );
}

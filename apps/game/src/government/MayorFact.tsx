// 정부 판의 시장 최우선 카드 — 기획 답 744 나(NPC 도시는 그 도시 휴먼 가운데 하나를 서버가 자동으로 시장으로 지정), docs/adr/2026-11-07-play-flow.md
// "WP-NPC2". 이름은 휴먼 이름 규칙(기획 답 773 나, "WP-NPC4"), 그 나라 이름 목록이 없으면 "휴먼 #유닛 ID"다.
// 바뀜(사용자 요청 2026-11-25): 정부 패널에서 시장을 가장 눈에 띄는 1순위 카드로 두고 클릭 시 시장 세부 팝업(EntityRef)을 연다.
import type { GovernmentMayor } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { EntityRef } from "../ui/EntityRef.tsx";
import { mayorTitle } from "./mayorText.ts";

export function MayorFact({
  mayor,
  cityName,
}: {
  mayor: GovernmentMayor | null;
  cityName?: string | undefined;
}) {
  const title = mayor === null ? m.government_mayor_none() : mayorTitle(mayor);
  return (
    <div
      className="gov-person gov-mayor-hero"
      data-part="government-mayor"
      data-role="mayor"
      data-unit={mayor?.unitId}
    >
      <dt className="gov-role">{m.government_field_mayor()}</dt>
      <dd className="gov-person-body">
        {mayor === null ? (
          <span className="gov-person-name" data-empty="true">
            {title}
          </span>
        ) : (
          <EntityRef
            kind="unit"
            role="mayor"
            name={title}
            className="gov-mayor-ref"
            popup={{
              kind: "unit",
              role: "mayor",
              title,
              kindLabel: m.entity_kind_mayor(),
              subtitle: cityName,
              facts: [
                {
                  label: m.government_field_mayor(),
                  value: m.government_mayor_satisfaction({ value: mayor.satisfaction }),
                },
                { label: m.entity_unit_field_id(), value: `#${mayor.unitId}` },
              ],
            }}
          />
        )}
        {mayor !== null ? (
          <span className="gov-person-note">
            {m.government_mayor_satisfaction({ value: mayor.satisfaction })}
          </span>
        ) : null}
        {mayor?.baseline ? (
          <span className="gov-person-note gov-mayor-note">{m.government_mayor_baseline()}</span>
        ) : null}
      </dd>
    </div>
  );
}

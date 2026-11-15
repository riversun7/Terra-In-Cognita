// 정부 판의 시장 한 줄 — 기획 답 744 나(NPC 도시는 그 도시 휴먼 가운데 하나를 서버가 자동으로 시장으로 지정), docs/adr/2026-11-07-play-flow.md
// "WP-NPC2". 이름은 휴먼 이름 규칙(기획 답 773 나, "WP-NPC4"), 그 나라 이름 목록이 없으면 "휴먼 #유닛 ID"다.
// 바뀜(사용자 지적 2026-11-15 "시장 스탯은 보여줄 필요가 없다 … 유저이름 소유자나 시장같은것도 다르게 보이게"): 1차 스탯 묶음을 빼고,
// 사람 줄(PersonFact.tsx, 역할 색 — 시장은 파랑)로 이름과 만족도만 보인다.
import type { GovernmentMayor } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { PersonFact } from "./PersonFact.tsx";
import { mayorTitle } from "./mayorText.ts";

export function MayorFact({ mayor }: { mayor: GovernmentMayor | null }) {
  return (
    <PersonFact
      part="government-mayor"
      role="mayor"
      label={m.government_field_mayor()}
      name={mayor === null ? m.government_mayor_none() : mayorTitle(mayor)}
      empty={mayor === null}
      unitId={mayor?.unitId}
      notes={
        mayor === null
          ? []
          : [
              { text: m.government_mayor_satisfaction({ value: mayor.satisfaction }) },
              ...(mayor.baseline ? [{ text: m.government_mayor_baseline(), part: "gov-mayor-note" }] : []),
            ]
      }
    />
  );
}

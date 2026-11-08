// 정부 판의 시장 한 줄 — 기획 답 744 나(NPC 도시는 그 도시 휴먼 가운데 하나를 서버가 자동으로 시장으로 지정, 이름·스탯만 보임),
// docs/adr/2026-11-07-play-flow.md "WP-NPC2". 정부 대화상자(GovernmentDialog.tsx)의 사실 줄과 같은 틀(dt·dd)에 이름·레벨·만족도와
// 1차 스탯 묶음(STR·VIT / INT·WIS / DEX·AGI, D-448 — 구인 카드와 같은 모양)을 놓는다. 이름은 휴먼 이름 규칙(기획 답 773 나, "WP-NPC4"),
// 그 나라 이름 목록이 없으면 "휴먼 #유닛 ID"다.
import type { GovernmentMayor } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { RECRUIT_STAT_PAIRS } from "../recruit/recruitModel.ts";
import { mayorTitle } from "./mayorText.ts";
import "../economy/recruit.css";
import "./mayor.css";

const STAT_CODE = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
} as const;

export function MayorFact({ mayor }: { mayor: GovernmentMayor | null }) {
  return (
    <div className="gov-fact gov-mayor" data-part="government-mayor" data-unit={mayor?.unitId}>
      <dt>{m.government_field_mayor()}</dt>
      {mayor === null ? (
        <dd>{m.government_mayor_none()}</dd>
      ) : (
        <dd className="gov-mayor-body">
          <span className="gov-mayor-name">{mayorTitle(mayor)}</span>
          <span className="gov-mayor-mood">
            {m.government_mayor_satisfaction({ value: mayor.satisfaction })}
          </span>
          <span className="recruit-stats gov-mayor-stats">
            {RECRUIT_STAT_PAIRS.map((pair) => (
              <span key={pair.join("-")} className="recruit-pair">
                {pair.map((stat) => (
                  <span key={stat} className="recruit-stat" data-stat={stat}>
                    <span className="recruit-stat-code">{STAT_CODE[stat]()}</span>
                    <span className="eco-num">{mayor.stats[stat]}</span>
                  </span>
                ))}
              </span>
            ))}
          </span>
          {mayor.baseline ? <span className="gov-mayor-note">{m.government_mayor_baseline()}</span> : null}
        </dd>
      )}
    </div>
  );
}

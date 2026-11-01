// 상세 전투 스펙 — 옛 프로젝트 SecondaryStatsCard를 그대로 따른다(사용자 요청 2026-11-01 "차라리 원래 프로젝트를 그냥 따라해라").
// ADR 2026-11-01-ui-visibility "바뀜": 묶음 칸(VITALS 전투자원·OFFENSE 공격·DEFENSE 방어·MOBILITY 기동·EFFICIENCY 효율) 안에 줄마다
// ▶ 펼침 + 아이콘 + 이름 + 한 색 막대 + 오른쪽 값. 색은 2차 스탯 색(--color-sec-*, 1차 스탯 색과 겹치지 않음). 1차 스탯 기여로 칠하지 않는다.
// 펼치면 옛 화면의 공식 상자: "공식 … | 캡 …", 입력 줄(STR(43)×1.5 = 64.5 …), "= 결과". 값·항은 서버가 팩 stat_rows 식으로 계산해 보낸다.
import {
  type CyborgBody,
  PRIMARY_STATS,
  type RosterNames,
  type RosterStatBreakdown,
} from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { PreviewTag } from "../roster/parts.tsx";
import { formatMilli, formatNumber, formatStat, localName, primaryCode } from "../roster/rosterText.ts";
import { type CombatGroup, barFill, combatGroups, termMilliSum } from "./cyborgText.ts";
import { StatIcon } from "./statIcons.tsx";
import "./combatSpecs.css";

const GROUP_TEXT = {
  vitals: { tag: m.cyborg_sec_vitals_tag, name: m.cyborg_sec_vitals },
  offense: { tag: m.cyborg_sec_offense_tag, name: m.cyborg_sec_offense },
  defense: { tag: m.cyborg_sec_defense_tag, name: m.cyborg_sec_defense },
  mobility: { tag: m.cyborg_sec_mobility_tag, name: m.cyborg_sec_mobility },
  efficiency: { tag: m.cyborg_sec_efficiency_tag, name: m.cyborg_sec_efficiency },
  other: { tag: m.cyborg_sec_other_tag, name: m.cyborg_sec_other },
} satisfies Record<CombatGroup, { tag: () => string; name: () => string }>;

const pct = (share: number): string => `${String(Math.round(share * 1000) / 10)}%`;
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${formatNumber(value)}`;

export function CombatSpecs({ body, names }: { body: CyborgBody; names: RosterNames }) {
  const id = useId();
  const totals = PRIMARY_STATS.map((stat) => {
    const { base, bonus } = body.stats.primaries[stat];
    return `${primaryCode(stat)}:${formatNumber(base + bonus)}`;
  }).join(" ");
  return (
    <section className="panel combat-card" aria-labelledby={`${id}-title`}>
      <div className="combat-card-head">
        <svg className="combat-card-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </svg>
        <h2 id={`${id}-title`} className="combat-card-title">
          {m.cyborg_combat_title()}
        </h2>
        <span className="combat-card-sub">{m.cyborg_combat_subtitle()}</span>
        {body.preview ? <PreviewTag /> : null}
      </div>
      <div className="combat-card-body">
        {combatGroups(body.breakdown).map(({ group, rows }) => (
          <section key={group} className="combat-group" data-group={group} aria-labelledby={`${id}-${group}`}>
            <h3 id={`${id}-${group}`} className="combat-group-head">
              <span className="combat-group-tag" translate="no">
                {GROUP_TEXT[group].tag()}
              </span>
              <span className="combat-group-name">{GROUP_TEXT[group].name()}</span>
            </h3>
            <ul className="combat-rows">
              {rows.map((row) => (
                <CombatRow key={row.id} row={row} name={localName(names.stats[row.id], row.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="combat-card-foot" translate="no">
        {m.roster_level({ level: formatNumber(body.level) })} | {totals}
      </p>
    </section>
  );
}

/** 옛 StatRow: 줄 전체가 누르는 곳(▶/▼), 펼치면 공식 상자 */
function CombatRow({ row, name }: { row: RosterStatBreakdown; name: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const shown = formatStat(row);
  const probability = row.shape === "probability" && row.cap !== null && row.halfConstant !== null;
  return (
    <li className="combat-row" data-sec={row.id} data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="combat-toggle"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="combat-caret" aria-hidden="true" />
        <StatIcon id={row.id} />
        <span className="combat-main">
          <span className="combat-label">{name}</span>
          <span className="combat-bar" aria-hidden="true">
            <span className="combat-bar-fill" style={{ inlineSize: pct(barFill(row)) }} />
          </span>
        </span>
        <span className="combat-value">{shown}</span>
      </button>
      <div id={`${id}-detail`} className="combat-detail" hidden={!open}>
        <p className="combat-formula">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {probability ? m.cyborg_formula_probability() : m.cyborg_formula_quantity()}
          {probability && row.cap !== null && row.halfConstant !== null
            ? ` | ${m.cyborg_formula_cap({
                cap: formatStat({ id: row.id, shape: "probability", value: row.cap }),
                half: formatNumber(row.halfConstant),
              })}`
            : null}
        </p>
        {row.shape === "quantity" && row.base !== 0 ? (
          <p className="combat-line">
            {m.cyborg_term_base()} {formatNumber(row.base)}
          </p>
        ) : null}
        {row.terms.map((term) => (
          <p key={term.stat} className="combat-line" translate="no">
            {primaryCode(term.stat)}({formatNumber(term.value)})×{formatMilli(term.weightPm)} ={" "}
            {formatMilli(term.milli)}
          </p>
        ))}
        <p className="combat-line">
          {m.cyborg_term_weighted({
            sum: formatMilli(termMilliSum(row)),
            weighted: formatNumber(row.weighted),
          })}
        </p>
        {row.extra !== 0 ? (
          <p className="combat-line">
            {m.cyborg_term_gear()} {signed(row.extra)}
          </p>
        ) : null}
        {probability && row.cap !== null && row.halfConstant !== null ? (
          <p className="combat-line">
            {m.cyborg_term_score()} {formatNumber(row.score)} → {formatNumber(row.cap)}×
            {formatNumber(row.score)}÷(
            {formatNumber(row.score)}+{formatNumber(row.halfConstant)}) = {formatNumber(row.value)}‰
          </p>
        ) : null}
        <p className="combat-line combat-result">
          = {shown === formatNumber(row.value) ? shown : `${formatNumber(row.value)} → ${shown}`}
        </p>
      </div>
    </li>
  );
}

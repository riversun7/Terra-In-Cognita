// 사이보그 화면 — 핵심 사양(1차 스탯 두 칸씩 묶음, 몸·보너스 막대)과 상세 전투 스펙(2차 스탯 48 §3.2 묶음, 줄마다 막대 + 누르면 풀이).
// ADR 2026-11-01-ui-visibility: 옛 프로젝트 /character의 "핵심 사양"·"상세 전투 스펙"처럼 수와 색을 더 보인다(톤은 디자인 시스템 그대로).
// - 풀이는 서버가 팩 stat_rows 식으로 계산해 보낸 항(1차 × 가중치, 기본, 장비, 확률 상한·반감 상수, 결과)을 그대로 보인다(기기는 다시 계산하지 않음).
// - 평소에는 처음 값·레벨 성장을 나누지 않고 K도 보이지 않는다(D-417). 만렙이면 서버가 처음 값·K를 보내고(growth),
//   막대를 처음 값·레벨 성장·장비 세 칸으로 나누고 스탯마다 K를 보인다(D-449).
import type { CyborgBody, RosterNames, RosterStatBreakdown } from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { PreviewTag, Section } from "../roster/parts.tsx";
import { StatPairs, pairValuesOf, statScale } from "../roster/StatPairs.tsx";
import { formatMilli, formatNumber, formatStat, localName, primaryCode } from "../roster/rosterText.ts";
import { groupStats, statGroupLabel } from "../roster/statGroups.ts";
import { specSegments, termMilliSum } from "./cyborgText.ts";
import "./cyborgSpecs.css";

export function CoreSpec({ body }: { body: CyborgBody }) {
  const id = useId();
  const values = pairValuesOf(body.stats.primaries, body.growth);
  const legend: readonly { kind: string; text: string }[] = body.growth
    ? [
        { kind: "initial", text: m.cyborg_core_legend_initial() },
        { kind: "growth", text: m.cyborg_core_legend_growth() },
        { kind: "bonus", text: m.cyborg_core_legend_bonus() },
      ]
    : [
        { kind: "body", text: m.cyborg_core_legend_body() },
        { kind: "bonus", text: m.cyborg_core_legend_bonus() },
      ];
  const sum = Object.values(values).reduce((total, value) => total + value.body + value.bonus, 0);
  return (
    <Section
      id={`${id}-core`}
      title={m.cyborg_core_title()}
      end={
        body.preview ? (
          <PreviewTag />
        ) : (
          <span className="roster-tag">{m.cyborg_core_sum({ sum: formatNumber(sum) })}</span>
        )
      }
    >
      <ul className="spec-legend">
        {legend.map((item) => (
          <li key={item.kind} className="spec-legend-item" data-kind={item.kind}>
            <span className="spec-legend-swatch" aria-hidden="true" />
            {item.text}
          </li>
        ))}
      </ul>
      <StatPairs values={values} max={statScale(values, 20)} label={m.roster_primary_title()} size="lg" />
      <p className="roster-note">{body.growth ? m.cyborg_core_note_max() : m.cyborg_core_note()}</p>
    </Section>
  );
}

export function CombatSpec({ body, names }: { body: CyborgBody; names: RosterNames }) {
  const id = useId();
  return (
    <Section id={`${id}-combat`} title={m.cyborg_combat_title()} end={body.preview ? <PreviewTag /> : null}>
      <p className="roster-note">{m.cyborg_combat_note()}</p>
      <div className="spec-groups">
        {groupStats(body.breakdown).map(({ group, rows }) => (
          <section key={group} className="spec-group" data-group={group} aria-labelledby={`${id}-${group}`}>
            <h3 id={`${id}-${group}`} className="spec-group-title">
              {statGroupLabel(group)}
            </h3>
            <ul className="spec-rows">
              {rows.map((row) => (
                <SpecRow key={row.id} row={row} name={localName(names.stats[row.id], row.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Section>
  );
}

const pct = (share: number): string => `${String(Math.round(share * 1000) / 10)}%`;
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${formatNumber(value)}`;

/** 한 줄: 이름·값·막대(누르는 곳) + 펼친 풀이 */
function SpecRow({ row, name }: { row: RosterStatBreakdown; name: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const shown = formatStat(row);
  const { fill, segments } = specSegments(row);
  return (
    <li className="spec-row" data-stat-row={row.id} data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="spec-toggle"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="spec-name">{name}</span>
        <span className="spec-value">{shown}</span>
        <span className="spec-chevron" aria-hidden="true" />
        <span className="spec-bar" aria-hidden="true">
          <span className="spec-bar-fill" style={{ inlineSize: pct(fill) }}>
            {segments.map((segment, index) => (
              <span
                // 같은 종류 칸은 하나씩이라 종류·스탯으로 열쇠를 만든다
                key={segment.kind === "stat" ? segment.stat : `${segment.kind}-${String(index)}`}
                className="spec-seg"
                data-kind={segment.kind}
                data-stat={segment.kind === "stat" ? segment.stat : undefined}
                style={{ inlineSize: pct(segment.share) }}
              />
            ))}
          </span>
        </span>
      </button>
      <div id={`${id}-detail`} className="spec-detail" hidden={!open}>
        <p className="spec-formula">
          <span className="spec-label">{m.cyborg_formula_label()}</span>
          <span>
            {row.shape === "probability" ? m.cyborg_formula_probability() : m.cyborg_formula_quantity()}
          </span>
          {row.shape === "probability" && row.cap !== null && row.halfConstant !== null ? (
            <span className="spec-formula-curve">
              {m.cyborg_formula_curve({
                cap: formatStat({ id: row.id, shape: "probability", value: row.cap }),
                half: formatNumber(row.halfConstant),
              })}
            </span>
          ) : null}
        </p>
        <p className="spec-label">{m.cyborg_inputs_label()}</p>
        <ul className="spec-terms">
          {row.shape === "quantity" && row.base !== 0 ? (
            <li className="spec-term">
              <span className="spec-term-name">{m.cyborg_term_base()}</span>
              <span className="spec-term-out">{formatNumber(row.base)}</span>
            </li>
          ) : null}
          {row.terms.map((term) => (
            <li key={term.stat} className="spec-term" data-stat={term.stat}>
              <span className="spec-term-name">
                <span className="stat-chip" translate="no">
                  {primaryCode(term.stat)}
                </span>
                {formatNumber(term.value)} × {formatMilli(term.weightPm)}
              </span>
              <span className="spec-term-out">{formatMilli(term.milli)}</span>
            </li>
          ))}
          <li className="spec-term spec-term-sum">
            <span className="spec-term-name">
              {m.cyborg_term_weighted({
                sum: formatMilli(termMilliSum(row)),
                weighted: formatNumber(row.weighted),
              })}
            </span>
          </li>
          {row.extra !== 0 ? (
            <li className="spec-term">
              <span className="spec-term-name">{m.cyborg_term_gear()}</span>
              <span className="spec-term-out">{signed(row.extra)}</span>
            </li>
          ) : null}
        </ul>
        {row.shape === "probability" && row.cap !== null && row.halfConstant !== null ? (
          <p className="spec-curve">
            <span className="spec-label">{m.cyborg_term_score()}</span>
            <span>
              {formatNumber(row.score)} → {formatNumber(row.cap)} × {formatNumber(row.score)} ÷ (
              {formatNumber(row.score)} + {formatNumber(row.halfConstant)}) = {formatNumber(row.value)}‰
            </span>
          </p>
        ) : null}
        <p className="spec-result">
          <span className="spec-label">{m.cyborg_result_label()}</span>
          <strong className="spec-result-value">
            {shown === formatNumber(row.value) ? shown : `${formatNumber(row.value)} = ${shown}`}
          </strong>
        </p>
      </div>
    </li>
  );
}

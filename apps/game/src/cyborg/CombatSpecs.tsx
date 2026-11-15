// 상세 전투 스펙 — 옛 프로젝트 SecondaryStatsCard를 그대로 따른다(사용자 요청 2026-11-01 "차라리 원래 프로젝트를 그냥 따라해라").
// ADR 2026-11-01-ui-visibility "바뀜": 묶음 칸(VITALS 전투자원·OFFENSE 공격·DEFENSE 방어·MOBILITY 기동·EFFICIENCY 효율) 안에 줄마다
// ▶ 펼침 + 아이콘 + 이름 + 한 색 막대 + 오른쪽 값. 색은 2차 스탯 색(--color-sec-*, 1차 스탯 색과 겹치지 않음). 1차 스탯 기여로 칠하지 않는다.
// 펼치면 옛 화면의 공식 상자: "공식 HP = STR × 1.5 + … + 장비 + 버프"(그 행의 식을 글로 — D-556), 입력 줄(STR(43)×1.5 = 64.5 …), "= 결과".
// 값·항은 서버가 팩 stat_rows 식으로 계산해 보낸다. 식 글은 행 식이면 그 식, 가중치 행이면 판정과 같은 결과의 행 식(statRowExpression)이다.
// 판정 값(서버 CyborgBody.combat, 입은 장비가 든 몸): 공격 묶음 끝에 실제 공격력·명중·크리·간격, 스태미나 회복 줄은 실제 회복(D-511).
// 버프 몫(질문 354 → D-515 "기본값과 버프를 나눠 보인다"): 줄 값·풀이는 걸린 효과를 뺀 기본(서버 breakdown·combat), 값 옆 알약과
// 막대 빗금 칸이 몫(CyborgBody.buffs — 1차 스탯 버프 몫 + 방어율·회피·크리 배율·쉴드 재생 등 전투 수치 버프, 판정과 같은 셈).
// 펼치면 공식 끝에 "버프 +n → 전투 m". 몫이 하나라도 있으면 카드 머리 아래에 알약의 뜻을 적는다.
// 2026-11-12: 기동 묶음에 이동 속도 줄(서버 걷기 빠르기, CombatAttack MoveSpeedRow), 효율 묶음에 원자재별 채집 줄(CombatGather.tsx).
import {
  type CyborgBody,
  PRIMARY_STATS,
  type RosterBuffs,
  type RosterCombat,
  type RosterModifierStat,
  type RosterNames,
  type RosterStatBreakdown,
} from "@terra/shared/roster";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { PreviewTag } from "../roster/parts.tsx";
import {
  formatMilli,
  formatNumber,
  formatStat,
  formatStatShare,
  localName,
  primaryCode,
} from "../roster/rosterText.ts";
import { breakdownText } from "../roster/formulaLabels.ts";
import { AttackRows, BuffLines, MoveSpeedRow, SpecRow, StaminaRealLines, shareOf } from "./CombatAttack.tsx";
import { GatherRows } from "./CombatGather.tsx";
import { FormulaTextLines } from "./FormulaTextLines.tsx";
import { type CombatGroup, combatGroups, termMilliSum } from "./cyborgText.ts";
import "./combatSpecs.css";

/** 2차 행 → 그 행을 바꾸는 전투 수치 버프(펼친 공식의 "전투 수치 버프 +n%" 줄) */
const ROW_MODIFIER: Readonly<Record<string, RosterModifierStat>> = {
  defense_rate: "defense_rate",
  evade: "evade",
  crit_multiplier: "crit_multiplier",
  shield_regen: "shield_regen",
};

/** 몫이 하나라도 있나(알약 뜻 줄을 보일지) */
function hasShare(buffs: RosterBuffs | undefined): boolean {
  if (!buffs) return false;
  return (
    Object.keys(buffs.rows).length > 0 ||
    buffs.attack !== 0 ||
    buffs.hit !== 0 ||
    buffs.crit !== 0 ||
    buffs.interval !== 0 ||
    buffs.staminaRegen !== 0 ||
    buffs.penetration.buffPm !== 0 ||
    buffs.moveSpeedPm !== 0
  );
}

const GROUP_TEXT = {
  vitals: { tag: m.cyborg_sec_vitals_tag, name: m.cyborg_sec_vitals },
  offense: { tag: m.cyborg_sec_offense_tag, name: m.cyborg_sec_offense },
  defense: { tag: m.cyborg_sec_defense_tag, name: m.cyborg_sec_defense },
  mobility: { tag: m.cyborg_sec_mobility_tag, name: m.cyborg_sec_mobility },
  efficiency: { tag: m.cyborg_sec_efficiency_tag, name: m.cyborg_sec_efficiency },
  other: { tag: m.cyborg_sec_other_tag, name: m.cyborg_sec_other },
} satisfies Record<CombatGroup, { tag: () => string; name: () => string }>;

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
      {hasShare(body.buffs) ? (
        <p className="combat-buff-legend">
          <span className="buff-swatch" aria-hidden="true" />
          {m.cyborg_buff_legend()}
        </p>
      ) : null}
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
                <CombatRow
                  key={row.id}
                  row={row}
                  name={localName(names.stats[row.id], row.id)}
                  combat={body.combat}
                  buffs={body.buffs}
                />
              ))}
              {group === "offense" && body.combat ? (
                <AttackRows combat={body.combat} names={names} buffs={body.buffs} level={body.level} />
              ) : null}
              {group === "mobility" && (body.move || (body.buffs && body.buffs.moveSpeedPm !== 0)) ? (
                <MoveSpeedRow move={body.move} buffs={body.buffs} />
              ) : null}
              {group === "efficiency" && body.gather ? <GatherRows rows={body.gather} /> : null}
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

/**
 * 옛 StatRow: 줄 전체가 누르는 곳(▶/▼), 펼치면 공식 상자. 스태미나 회복 줄은 판정 값(실제 회복 = 행 값 × 적정 STA 비율, D-511)을
 * 보이고 공식 상자 끝에 그 셈을 더한다(판정 값이 없는 시안·옛 서버는 행 값). 버프 몫이 있으면 값 옆 알약·막대 빗금 칸, 공식 끝에 버프 줄
 */
function CombatRow({
  row,
  name,
  combat,
  buffs,
}: {
  row: RosterStatBreakdown;
  name: string;
  combat: RosterCombat | undefined;
  buffs: RosterBuffs | undefined;
}) {
  const regen = row.id === "stamina_regen" ? combat?.staminaRegen : undefined;
  const rowShown = formatStat(row);
  const base = regen ? regen.real : row.value;
  const share = (regen ? buffs?.staminaRegen : buffs?.rows[row.id]) ?? 0;
  const shareText = formatStatShare({ id: row.id, shape: row.shape, value: share });
  const bar = shareOf(row, base, share, shareText);
  const modifier = ROW_MODIFIER[row.id];
  return (
    <SpecRow
      sec={row.id}
      real={regen ? "stamina_regen" : undefined}
      name={name}
      shown={formatStat({ ...row, value: base })}
      fill={bar.fill}
      buff={bar.buff}
    >
      {row.formula ? (
        <FormulaLines row={row} name={name} shown={rowShown} />
      ) : (
        <WeightLines row={row} name={name} shown={rowShown} />
      )}
      {regen ? <StaminaRealLines regen={regen} formula={combat?.formulas?.staminaRegen} /> : null}
      {bar.buff ? (
        <BuffLines
          share={shareText}
          total={formatStat({ ...row, value: base + share })}
          modifierPm={modifier ? buffs?.modifiers[modifier] : undefined}
        />
      ) : null}
    </SpecRow>
  );
}

/** 줄 결과 단위: 확률 모양·크리 배율 점수는 ‰ */
const rowUnit = (row: RosterStatBreakdown) =>
  row.shape === "probability" || row.id === "crit_multiplier" ? ("pm" as const) : ("none" as const);

/** 행 식으로 셈한 행(개발자 모드 계산식, docs/adr/2026-11-01-formula-editor.md): 식 글(D-556)과 항마다 값 */
function FormulaLines({ row, name, shown }: { row: RosterStatBreakdown; name: string; shown: string }) {
  const text = breakdownText(row);
  return (
    <>
      {text ? (
        <FormulaTextLines name={name} text={text} unit={rowUnit(row)} />
      ) : (
        <p className="combat-formula" translate="no">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {row.formula?.source}
        </p>
      )}
      {row.formula?.terms.map((term, index) => (
        <p key={`${index}-${term.text}`} className="combat-line" translate="no">
          {term.sign < 0 ? "− " : ""}
          {term.text} = {formatMilli(term.value)}
        </p>
      ))}
      <p className="combat-line combat-result">= {shown}</p>
    </>
  );
}

/** 가중치 행: 식 글(D-556)·확률 모양 뜻·항·가중합·장비 */
function WeightLines({ row, name, shown }: { row: RosterStatBreakdown; name: string; shown: string }) {
  const probability = row.shape === "probability" && row.cap !== null && row.halfConstant !== null;
  const text = breakdownText(row);
  const shapeText = `${probability ? m.cyborg_formula_probability() : m.cyborg_formula_quantity()}${
    probability && row.cap !== null && row.halfConstant !== null
      ? ` | ${m.cyborg_formula_cap({
          cap: formatStat({ id: row.id, shape: "probability", value: row.cap }),
          half: formatNumber(row.halfConstant),
        })}`
      : ""
  }`;
  return (
    <>
      {text ? (
        <>
          <FormulaTextLines name={name} text={text} unit={rowUnit(row)} explainCurve={false} />
          {probability && row.cap !== null && row.halfConstant !== null ? (
            <p className="combat-formula-note">
              {m.formula_curve_note()} |{" "}
              {m.cyborg_formula_cap({
                cap: formatStat({ id: row.id, shape: "probability", value: row.cap }),
                half: formatNumber(row.halfConstant),
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="combat-formula">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {shapeText}
        </p>
      )}
      {row.shape === "quantity" && row.base !== 0 ? (
        <p className="combat-line">
          {m.cyborg_term_base()} {formatNumber(row.base)}
        </p>
      ) : null}
      {row.terms.length > 1 ? (
        // 식의 가중치와 이 유닛 값에서의 몫을 나눠 읽게(기획 D-562 1611~1613 "왜 반영율이 1:1이 아니냐")
        <p className="combat-formula-note" data-part="term-legend">
          {m.cyborg_term_legend()}
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
    </>
  );
}

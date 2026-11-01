// 계산식 미리 보기 — 표본 유닛 하나의 결과·항마다 풀이·1차 스탯별 영향(사용자 결정 D-488 "식 입력 후 옆에 각 스탯별 영향력 비중"),
// 무기마다 적정치 표. docs/adr/2026-11-01-formula-editor.md "화면". 값은 모두 고정 소수점(1000배)으로 받는다.
import {
  type FormulaListResponse,
  type FormulaSlot,
  type FormulaWeaponView,
  fxFormat,
} from "@terra/shared/formula";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { m } from "../../paraglide/messages.js";
import { primaryCode } from "./balanceMessages.ts";
import type { FormulaPreview } from "./formulaModel.ts";
import { unitText } from "./formulaMessages.ts";

/** 화면 1차 → 규칙 차례 번호(STR·DEX·AGI·VIT·INT·WIS) */
const RULE_INDEX: Readonly<Record<PrimaryStat, number>> = { str: 0, dex: 1, agi: 2, vit: 3, int: 4, wis: 5 };

/** 결과 글: 정수 칸은 내림, 소수 칸은 셋째 자리까지 + 단위 */
export function resultText(raw: number, slot: FormulaSlot): string {
  const value = slot.result === "fixed" ? fxFormat(raw) : String(Math.floor(raw / 1000));
  return `${value}${unitText(slot.unit)}`;
}

const signed = (raw: number): string => (raw > 0 ? `+${fxFormat(raw)}` : fxFormat(raw));
const percent = (pm: number | null): string => (pm === null ? "—" : `${(pm / 10).toFixed(1)}%`);

export function PreviewPanel({ preview, slot }: { preview: FormulaPreview; slot: FormulaSlot }) {
  const { explanation, influence } = preview;
  const warn = slot.warn;
  const shown = slot.result === "fixed" ? preview.value / 1000 : Math.floor(preview.value / 1000);
  const total = influence.contribution.reduce((sum, value) => sum + Math.abs(value), 0);
  return (
    <div className="fx-preview" data-out-of-range={preview.outOfRange ? "" : undefined}>
      <p className="fx-result">
        <span className="fx-result-label">{m.dev_formula_result()}</span>{" "}
        <strong className="fx-result-value" translate="no">
          {resultText(preview.value, slot)}
        </strong>
      </p>
      {preview.rollRange ? (
        <p className="field-hint" translate="no">
          {m.dev_formula_result_range({
            min: resultText(preview.rollRange.min, slot),
            max: resultText(preview.rollRange.max, slot),
          })}
        </p>
      ) : null}
      {preview.outOfRange && warn ? (
        <p className="fx-warn" role="status">
          {warn.max === null
            ? m.dev_formula_warn_min({ value: shown, min: warn.min })
            : m.dev_formula_warn_range({ value: shown, min: warn.min, max: warn.max })}
        </p>
      ) : null}
      {explanation.divZero ? <p className="fx-warn">{m.dev_formula_warn_div_zero()}</p> : null}
      {preview.unused ? <p className="field-hint fx-unused">{m.dev_formula_unused()}</p> : null}
      {explanation.lets.length > 0 ? (
        <>
          <h4 className="fx-subtitle">{m.dev_formula_locals()}</h4>
          <ul className="fx-terms" translate="no">
            {explanation.lets.map((item) => (
              <li key={item.name}>
                <span className="fx-term-text">
                  {item.name} = {item.text}
                </span>
                <span className="fx-term-value">{fxFormat(item.value)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h4 className="fx-subtitle">
        {explanation.wrappers.length > 0
          ? m.dev_formula_wrapped({ fn: explanation.wrappers.join("(") })
          : m.dev_formula_terms()}
      </h4>
      <ul className="fx-terms" translate="no">
        {explanation.terms.map((term, index) => (
          <li key={`${index}-${term.text}`} data-sign={term.sign < 0 ? "minus" : "plus"}>
            <span className="fx-term-text">
              {term.sign < 0 ? "− " : index > 0 ? "+ " : ""}
              {term.text}
            </span>
            <span className="fx-term-value">{fxFormat(term.value)}</span>
          </li>
        ))}
      </ul>
      <h4 className="fx-subtitle">{m.dev_formula_influence_title()}</h4>
      <p className="field-hint">{m.dev_formula_influence_hint()}</p>
      {total === 0 && influence.plus10.every((value) => value === 0) ? (
        <p className="field-hint">{m.dev_formula_influence_none()}</p>
      ) : (
        <ul className="fx-influence">
          {PRIMARY_STATS.map((stat) => {
            const index = RULE_INDEX[stat];
            const share = influence.sharePm[index] ?? null;
            const width = share === null ? 0 : Math.max(0, Math.min(1000, Math.abs(share))) / 10;
            return (
              <li
                key={stat}
                data-field={stat}
                data-zero={(influence.contribution[index] ?? 0) === 0 ? "" : undefined}
              >
                <span className="fx-inf-code">{primaryCode(stat)}</span>
                <span className="fx-inf-bar" aria-hidden="true">
                  <span className="fx-inf-fill" style={{ inlineSize: `${width}%` }} />
                </span>
                <span className="fx-inf-share">{percent(share)}</span>
                <span className="fx-inf-plus" translate="no">
                  {m.dev_formula_plus10({ delta: signed(influence.plus10[index] ?? 0) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 표본 1차·레벨에서 무기마다 적정 비율(2차 점수 ÷ 적정치, 상한)을 보인다. 맨손 일반 공격은 맨손 식 */
export function AppropriateTable({
  list,
  stats,
  level,
  weaponName,
}: {
  list: FormulaListResponse;
  stats: Readonly<Record<string, number>>;
  level: number;
  weaponName: (weapon: FormulaWeaponView) => string;
}) {
  const cap = list.coefficients.capPm / 1000;
  const ratio = (stat: number, appropriate: number): string =>
    appropriate <= 0 ? "—" : `${Math.min(cap, stat / appropriate).toFixed(2)}×`;
  const attackOf = (weapon: FormulaWeaponView): number =>
    weapon.kind === "physical" ? (stats.physical_attack ?? 0) : (stats.elemental_attack ?? 0);
  const optDex = level * 1.5 + 10;
  return (
    <div className="fx-scroll" tabIndex={0} role="region" aria-label={m.dev_formula_items_title()}>
      <table className="fx-table fx-items">
        <thead>
          <tr>
            <th scope="col" className="fx-th-stat">
              {m.dev_formula_col_weapon()}
            </th>
            <th scope="col">{m.dev_formula_col_attack()}</th>
            <th scope="col">{m.dev_formula_col_hit()}</th>
            <th scope="col">{m.dev_formula_col_crit()}</th>
            <th scope="col">{m.dev_formula_col_speed()}</th>
          </tr>
        </thead>
        <tbody>
          {list.weapons.map((weapon) => (
            <tr key={weapon.id} data-weapon={weapon.id}>
              <th scope="row" className="fx-row-name">
                <span className="fx-row-label">{weaponName(weapon)}</span>
              </th>
              <td translate="no">
                {weapon.unarmed
                  ? `${m.dev_formula_bare_rule()} · DEX ${optDex.toFixed(1)}`
                  : `${weapon.attack} / ${weapon.attackAppropriate} · ${ratio(attackOf(weapon), weapon.attackAppropriate)}`}
              </td>
              <td translate="no">
                {weapon.hitAppropriate} · {ratio(stats.hit ?? 0, weapon.hitAppropriate)}
              </td>
              <td translate="no">
                {weapon.critAppropriate} · {ratio(stats.crit_chance ?? 0, weapon.critAppropriate)}
              </td>
              <td translate="no">
                {weapon.speedAppropriate} · {ratio(stats.action_speed ?? 0, weapon.speedAppropriate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

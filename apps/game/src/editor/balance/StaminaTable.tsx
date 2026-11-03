// 계산식 탭의 스태미나 표(D-511 적정 스탯 개념) — 표본 유닛(1차·레벨)이 무기마다 기본 공격을 할 때 한 번 소모·간격·초당 소모와
// 초당 회복을 견준다. 일반 공격은 이어져야 한다(D-511): 초당 소모가 회복보다 크면 "줄어듦". 담은 식(적정 STA·소모·회복)이 바로 든다.
import type { FormulaWeaponView } from "@terra/shared/formula";
import { m } from "../../paraglide/messages.js";
import type { SampleStamina } from "./formulaModel.ts";

/** 소수 한 자리(끝 0은 뺀다) */
const one = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
};

export function StaminaTable({
  rows,
  weaponName,
}: {
  rows: readonly SampleStamina[];
  weaponName: (weapon: FormulaWeaponView) => string;
}) {
  const first = rows[0];
  if (!first) return null;
  return (
    <>
      <p className="fx-stamina-unit" data-testid="formula-stamina-unit">
        {m.dev_formula_stamina_unit({
          appropriate: one(first.appropriateMilli / 1000),
          score: first.score,
          max: first.max,
          regen: one(first.regenPerMinute / 60),
        })}
      </p>
      <div className="fx-scroll" tabIndex={0} role="region" aria-label={m.dev_formula_stamina_title()}>
        <table className="fx-table fx-items fx-stamina">
          <thead>
            <tr>
              <th scope="col" className="fx-th-stat">
                {m.dev_formula_col_weapon()}
              </th>
              <th scope="col">{m.dev_formula_col_stamina_cost()}</th>
              <th scope="col">{m.dev_formula_col_interval()}</th>
              <th scope="col">{m.dev_formula_col_stamina_per_second()}</th>
              <th scope="col">{m.dev_formula_col_stamina_regen()}</th>
              <th scope="col">{m.dev_formula_col_sustain()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.weapon.id}
                data-weapon={row.weapon.id}
                data-sustain={row.sustained ? "ok" : "drains"}
              >
                <th scope="row" className="fx-row-name">
                  <span className="fx-row-label">{weaponName(row.weapon)}</span>
                </th>
                <td>{one(row.costMilli / 1000)}</td>
                <td>{row.intervalMs}</td>
                <td>{one(row.costMilli / row.intervalMs)}</td>
                <td>{one(row.regenPerMinute / 60)}</td>
                <td>
                  <span className={row.sustained ? "fx-sustain-ok" : "fx-sustain-drains"}>
                    {row.sustained ? m.dev_formula_sustain_ok() : m.dev_formula_sustain_drains()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 행동별 소모 화면의 스태미나 기준(D-511) — 서버가 판정 함수로 셈한 보통 유닛(1차 처음 모두 10, 레벨대로 자람) 값을 보인다:
// 레벨마다 적정 STA(계산식 stamina_appropriate)·STA 점수·최대·실제 회복(계산식 real_stamina_regen), 줄마다 기본 공격 초당 소모.
// 일반 공격은 이어져야 한다(D-511): 초당 소모가 초당 회복보다 크면 "줄어듦"으로 알린다. 값은 스킬 편집기·계산식 탭에서 맞춘다.
import type { StaminaBasisAttack, StaminaBasisView } from "@terra/shared/skillEditor";
import { m } from "../../paraglide/messages.js";

/** 소수 한 자리(끝 0은 뺀다) */
const one = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
};

/** 초당 회복(분당 → 초당) */
const regenPerSecond = (perMinute: number): number => perMinute / 60;

/** 기본 공격 초당 소모(한 번 소모 ÷ 간격) */
export const costPerSecond = (attack: StaminaBasisAttack): number =>
  attack.intervalMs <= 0 ? 0 : attack.costMilli / attack.intervalMs;

/** 기준 레벨 글(머리 칸: "Lv 1 · Lv 30") */
export function basisLevelsText(basis: StaminaBasisView): string {
  return basis.levels.map((level) => m.dev_skills_basis_level({ level: level.level })).join(" · ");
}

/** 레벨마다 보통 유닛 스태미나 표 */
export function StaminaBasisTable({ basis }: { basis: StaminaBasisView }) {
  if (basis.levels.length === 0) return null;
  return (
    <div className="sk-basis" data-testid="stamina-basis">
      <h3 className="sk-basis-title">{m.dev_skills_basis_title()}</h3>
      <p className="field-hint">{m.dev_skills_basis_lead()}</p>
      <div className="sk-table-wrap" tabIndex={0} role="region" aria-label={m.dev_skills_basis_title()}>
        <table className="sk-basis-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_skills_basis_col_level()}</th>
              <th scope="col">{m.dev_skills_basis_col_primary()}</th>
              <th scope="col">{m.dev_skills_basis_col_appropriate()}</th>
              <th scope="col">{m.dev_skills_basis_col_score()}</th>
              <th scope="col">{m.dev_skills_basis_col_max()}</th>
              <th scope="col">{m.dev_skills_basis_col_regen()}</th>
            </tr>
          </thead>
          <tbody>
            {basis.levels.map((level) => (
              <tr key={level.level} data-level={level.level}>
                <th scope="row">{m.dev_skills_basis_level({ level: level.level })}</th>
                <td>{level.primary}</td>
                <td data-cell="appropriate">{one(level.appropriateMilli / 1000)}</td>
                <td>{level.score}</td>
                <td>{level.max}</td>
                <td data-cell="regen">{one(regenPerSecond(level.regenPerMinute))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 줄 하나의 기본 공격 초당 소모(레벨마다)와 이어지는지 */
export function SustainCell({
  basis,
  attacks,
}: {
  basis: StaminaBasisView | null;
  attacks: readonly StaminaBasisAttack[] | undefined;
}) {
  if (!basis || !attacks || attacks.length === 0) return <td className="sk-col-sustain">—</td>;
  const drains = attacks.some((attack, index) => {
    const level = basis.levels[index];
    return level !== undefined && costPerSecond(attack) > regenPerSecond(level.regenPerMinute);
  });
  return (
    <td className="sk-col-sustain" data-sustain={drains ? "drains" : "ok"}>
      <span className="sk-sustain-values">
        {attacks.map((attack) => one(costPerSecond(attack))).join(" · ")}
      </span>
      <span className={`sk-chip ${drains ? "sk-sustain-drains" : "sk-sustain-ok"}`}>
        {drains ? m.dev_skills_sustain_drains() : m.dev_skills_sustain_ok()}
      </span>
    </td>
  );
}

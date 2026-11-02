// 유닛 미리 보기 판 — 서버 미리 보기(battleLab.preview): 1차(처음·성장·장비·합), 2차 스탯과 풀이(펼침), 전투 사양 요약,
// 레벨 표(Lv 1 → 만렙, 고른 값 하나의 선 그림 + 표). 수는 모두 서버가 실효 표로 계산한 것이다(화면은 공식 수를 모른다).
import type { LabCatalogResponse, LabPreviewResponse, LabSecondaryView } from "@terra/shared/battleLab";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode, primaryName } from "../balanceMessages.ts";
import { appropriateText, numberText, percentText } from "./labModel.ts";
import { itemName, skillName, statName } from "./labMessages.ts";

/** 풀이 한 줄 글: 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 = 점수 [→ 상한 × 점수 ÷ (점수 + 반감)] */
function formulaText(row: LabSecondaryView, locale: string): string {
  const n = (value: number) => numberText(value, locale);
  const terms = row.terms
    .map((term) => `${primaryCode(term.stat)} ${n(term.value)} × ${n(term.weightPm)}‰`)
    .join(" + ");
  const parts = [
    row.shape === "quantity" ? n(row.base) : null,
    terms === "" ? null : `(${terms}) ÷ 1000`,
    row.extra !== 0 ? n(row.extra) : null,
  ]
    .filter((part) => part !== null)
    .join(" + ");
  if (row.shape === "probability" && row.cap !== null && row.halfConstant !== null)
    return `${m.dev_lab_formula_score()} ${parts || "0"} = ${n(row.score)} → ${n(row.cap)} × ${n(row.score)} ÷ (${n(row.score)} + ${n(row.halfConstant)}) = ${n(row.value)}`;
  return `${parts || "0"} = ${n(row.value)}`;
}

/** 레벨 값 선 그림(SVG, viewBox 단위 = 화면 크기와 무관). 값이 같으면 가운데 가로선 */
function LevelChart({
  points,
  label,
}: {
  points: readonly { level: number; value: number }[];
  label: string;
}) {
  const width = 300;
  const height = 120;
  const pad = 6;
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const first = points[0]?.level ?? 1;
  const last = points.at(-1)?.level ?? first;
  const x = (level: number) => pad + ((level - first) / Math.max(1, last - first)) * (width - pad * 2);
  const y = (value: number) =>
    high === low ? height / 2 : height - pad - ((value - low) / (high - low)) * (height - pad * 2);
  const path = points
    .map(
      (point, index) => `${index === 0 ? "M" : "L"}${x(point.level).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="bl-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <path className="bl-chart-line" d={path} />
    </svg>
  );
}

export function UnitPreview(props: {
  readonly preview: LabPreviewResponse | null;
  readonly error: string | null;
  readonly stale: boolean;
  readonly catalog: LabCatalogResponse;
  readonly locale: string;
}) {
  const { preview, catalog, locale } = props;
  const id = useId();
  const [series, setSeries] = useState<string>("hp");
  const n = (value: number) => numberText(value, locale);
  const rows = catalog.statRows;
  const seriesIndex = rows.findIndex((row) => row.id === series);
  const primaryPick = PRIMARY_STATS.find((stat) => `p:${stat}` === series);
  const points = (preview?.levels ?? []).map((entry) => ({
    level: entry.level,
    value: primaryPick ? entry.primaries[primaryPick] : (entry.secondary[seriesIndex] ?? 0),
  }));
  const seriesLabel = primaryPick ? primaryName(primaryPick) : statName(catalog, series, locale);
  const combat = preview?.combat;
  const combatRows: [string, string][] = combat
    ? [
        [m.dev_lab_c_hp(), `${n(combat.maxHp)} / ${n(combat.armorHp)} / ${n(combat.shieldHp)}`],
        [
          m.dev_lab_c_attack(),
          // 스탯 공격력 + 무기 공격력 → 실제(D-502)
          `${combat.basic === "physical" ? m.dev_lab_weapon_physical() : m.dev_lab_weapon_elemental()} ${n(combat.attacks.basic.statAttack)} + ${n(combat.weaponAttack)} → ${n(combat.realAttack)}`,
        ],
        [
          m.dev_lab_c_hit_crit(),
          `${percentText(combat.hitPm, locale)}% · ${percentText(combat.critPm, locale)}% × ${percentText(combat.critMulPm, locale)}%`,
        ],
        [m.dev_lab_c_interval(), m.dev_lab_ms({ value: n(combat.attackIntervalMs) })],
        [m.dev_lab_c_range(), n(combat.range)],
        [
          m.dev_lab_c_stamina(),
          `${n(combat.staminaMax)} · ${m.dev_lab_per_attack({ value: n(Math.round(combat.staminaPerAttackMilli / 100) / 10) })} · ${m.dev_lab_per_minute({ value: n(combat.staminaRegen) })}`,
        ],
        [m.dev_lab_c_mp(), `${n(combat.mpMax)} · ${m.dev_lab_per_minute({ value: n(combat.mpRegen) })}`],
        [m.dev_lab_c_shield_regen(), m.dev_lab_per_minute({ value: n(combat.shieldRegen) })],
        [
          m.dev_lab_c_defense(),
          `${percentText(combat.defenseRatePm, locale)}% · ${percentText(combat.elementalDefenseRatePm, locale)}% · ${percentText(combat.evadePm, locale)}%`,
        ],
        [m.dev_lab_c_sight(), n(combat.sight)],
      ]
    : [];
  const sourceOf = (stat: PrimaryStat) => preview?.primaries[stat];

  return (
    <section
      className="bp-panel bl-preview"
      aria-labelledby={`${id}-title`}
      aria-busy={props.stale || undefined}
    >
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_lab_preview_title()}
        </h2>
        {props.stale ? <span className="bl-chip">{m.dev_lab_preview_updating()}</span> : null}
      </div>
      {props.error ? (
        <p className="field-error" role="alert">
          {props.error}
        </p>
      ) : null}
      {!preview ? <p className="field-hint">{m.dev_balance_loading()}</p> : null}
      {preview && preview.dropped.length > 0 ? (
        <p className="field-hint bl-warn-text" role="status">
          {m.dev_lab_dropped({
            list: preview.dropped
              .map((entry) =>
                entry.kind === "skill"
                  ? skillName(catalog, entry.id, locale)
                  : entry.kind === "gear_row"
                    ? statName(catalog, entry.id, locale)
                    : itemName(catalog, entry.id, locale),
              )
              .join(", "),
          })}
        </p>
      ) : null}
      {preview ? (
        <>
          <div className="bl-scroll">
            <table className="bl-table bl-primary-view">
              <caption className="visually-hidden">{m.dev_lab_primary_caption()}</caption>
              <thead>
                <tr>
                  <th scope="col">{m.dev_lab_col_stat()}</th>
                  <th scope="col">{m.dev_lab_col_initial()}</th>
                  <th scope="col">{m.dev_lab_col_grown()}</th>
                  <th scope="col">{m.dev_lab_col_bonus()}</th>
                  <th scope="col">{m.dev_lab_col_total()}</th>
                </tr>
              </thead>
              <tbody>
                {PRIMARY_STATS.map((stat) => (
                  <tr key={stat} data-field={stat}>
                    <th scope="row" className="bl-stat-code">
                      {primaryCode(stat)}
                    </th>
                    <td>{n(sourceOf(stat)?.initial ?? 0)}</td>
                    <td>{n(sourceOf(stat)?.grown ?? 0)}</td>
                    <td>{n(sourceOf(stat)?.bonus ?? 0)}</td>
                    <td className="bl-strong">{n(sourceOf(stat)?.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            {m.dev_lab_skills_used({
              list:
                preview.skills.used.map((skill) => skillName(catalog, skill, locale)).join(", ") ||
                m.dev_lab_none(),
              slots: preview.skills.slots,
            })}
          </p>
          <h3 className="bl-subtitle">{m.dev_lab_secondary_title()}</h3>
          <ul className="bl-secondary">
            {preview.secondary.map((row) => (
              <li key={row.id} data-row={row.id}>
                <details>
                  <summary>
                    <span className="bl-sec-name">{statName(catalog, row.id, locale)}</span>
                    <span className="bl-sec-value">
                      {row.shape === "probability" ? `${percentText(row.value, locale)}%` : n(row.value)}
                    </span>
                  </summary>
                  <p className="bl-formula">{formulaText(row, locale)}</p>
                </details>
              </li>
            ))}
          </ul>
          <h3 className="bl-subtitle">{m.dev_lab_combat_title()}</h3>
          <dl className="bl-combat">
            {combatRows.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {combat ? (
            <>
              <h3 className="bl-subtitle">{m.dev_lab_attacks_title()}</h3>
              <p className="field-hint">{m.dev_lab_attacks_hint()}</p>
              <div className="bl-scroll">
                <table className="bl-table bl-attacks">
                  <thead>
                    <tr>
                      <th scope="col">{m.dev_lab_col_attack()}</th>
                      <th scope="col">{m.dev_lab_col_source()}</th>
                      <th scope="col">{m.dev_lab_col_stat_attack()}</th>
                      <th scope="col">{m.dev_lab_weapon_attack()}</th>
                      <th scope="col">{m.dev_lab_col_appropriate()}</th>
                      <th scope="col">{m.dev_lab_col_ratio()}</th>
                      <th scope="col">{m.dev_lab_col_real()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["basic", m.dev_lab_attack_basic()],
                        ["physical", m.dev_lab_attack_physical()],
                        ["elemental", m.dev_lab_attack_elemental()],
                      ] as const
                    ).map(([key, label]) => {
                      const view = combat.attacks[key];
                      return (
                        <tr key={key} data-attack={key} data-source={view.source}>
                          <th scope="row">{label}</th>
                          <td>
                            {view.source === "natural"
                              ? m.dev_lab_source_natural()
                              : m.dev_lab_source_weapon()}
                          </td>
                          <td>{n(view.statAttack)}</td>
                          <td>{n(view.weaponAttack)}</td>
                          <td>{`${n(view.primary)} ÷ ${appropriateText(view.appropriateMilli, locale)}`}</td>
                          <td>{`× ${percentText(view.ratioPm, locale)}%`}</td>
                          <td className="bl-strong">{n(view.realAttack)}</td>
                        </tr>
                      );
                    })}
                    {(
                      [
                        ["hit", m.dev_lab_appropriate_hit(), `${percentText(combat.hitPm, locale)}%`],
                        ["crit", m.dev_lab_appropriate_crit(), `${percentText(combat.critPm, locale)}%`],
                        [
                          "speed",
                          m.dev_lab_appropriate_speed(),
                          m.dev_lab_ms({ value: n(combat.attackIntervalMs) }),
                        ],
                      ] as const
                    ).map(([key, label, real]) => (
                      <tr key={key} data-appropriate={key}>
                        <th scope="row">{label}</th>
                        <td>
                          {combat.attacks.basic.source === "natural"
                            ? m.dev_lab_source_natural()
                            : m.dev_lab_source_weapon()}
                        </td>
                        <td>—</td>
                        <td>—</td>
                        <td>{`${n(combat.appropriate[key].stat)} ÷ ${appropriateText(combat.appropriate[key].appropriateMilli, locale)}`}</td>
                        <td>{`${key === "speed" ? "÷" : "×"} ${percentText(combat.appropriate[key].ratioPm, locale)}%`}</td>
                        <td className="bl-strong">{real}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <h3 className="bl-subtitle">{m.dev_lab_levels_title()}</h3>
          <div className="field bl-series">
            <label className="field-label" htmlFor={`${id}-series`}>
              {m.dev_lab_series()}
            </label>
            <select id={`${id}-series`} value={series} onChange={(event) => setSeries(event.target.value)}>
              <optgroup label={m.dev_lab_series_primary()}>
                {PRIMARY_STATS.map((stat) => (
                  <option key={stat} value={`p:${stat}`}>
                    {primaryName(stat)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={m.dev_lab_series_secondary()}>
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {statName(catalog, row.id, locale)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <LevelChart points={points} label={m.dev_lab_chart_label({ name: seriesLabel })} />
          <p className="field-hint bl-chart-range">
            {m.dev_lab_chart_range({
              first: n(points[0]?.value ?? 0),
              last: n(points.at(-1)?.value ?? 0),
              level: points.at(-1)?.level ?? 1,
            })}
          </p>
          <details className="bl-details">
            <summary>{m.dev_lab_levels_table()}</summary>
            <div className="bl-scroll bl-levels-wrap">
              <table className="bl-table bl-levels">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_lab_col_level()}</th>
                    {PRIMARY_STATS.map((stat) => (
                      <th key={stat} scope="col" data-field={stat}>
                        {primaryCode(stat)}
                      </th>
                    ))}
                    {rows.map((row) => (
                      <th key={row.id} scope="col">
                        {statName(catalog, row.id, locale)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.levels.map((entry) => (
                    <tr key={entry.level}>
                      <th scope="row">{entry.level}</th>
                      {PRIMARY_STATS.map((stat) => (
                        <td key={stat}>{n(entry.primaries[stat])}</td>
                      ))}
                      {entry.secondary.map((value, index) => (
                        // oxlint-disable-next-line react/no-array-index-key -- 2차 행 차례가 열쇠다(머리 줄과 같은 차례)
                        <td key={index}>{n(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

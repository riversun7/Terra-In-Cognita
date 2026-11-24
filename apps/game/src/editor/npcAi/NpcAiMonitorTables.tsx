// 작동 모니터 탭의 표들 — 도시별 필수요소, 고른 도시의 재고·시설·가문, 유닛 표(문제 거르기). 서버가 준 값을 보이기만 한다.
import { useState } from "react";
import type { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import {
  type MonitorLevel,
  type PillarKey,
  durationParts,
  levelOf,
  pillarLevels,
  pillarRatios,
  productionLevel,
  rationLevel,
  stockLevel,
} from "./npcAiMonitorModel.ts";

export type MonitorResponse = Awaited<ReturnType<typeof api.npcAi.monitor.query>>;
export type MonitorView = Extract<MonitorResponse, { status: "ready" }>["view"];
type City = MonitorView["cities"][number];
type Detail = NonNullable<MonitorView["city"]>;
type House = Detail["houses"][number];
type Facility = Detail["facilities"][number];
type Unit = MonitorView["units"][number];
export type MonitorIssue = Unit["issues"][number];
export type MonitorActivity = Unit["activity"];
type HouseFlag = House["flags"][number];

export const LEVEL_LABELS: Readonly<Record<MonitorLevel, () => string>> = {
  ok: m.dev_npc_ai_mon_level_ok,
  warn: m.dev_npc_ai_mon_level_warn,
  bad: m.dev_npc_ai_mon_level_bad,
  none: m.dev_npc_ai_mon_level_none,
};

export const ACTIVITY_LABELS: Readonly<Record<MonitorActivity, () => string>> = {
  post: m.dev_npc_ai_mon_act_post,
  haul: m.dev_npc_ai_mon_act_haul,
  forage: m.dev_npc_ai_mon_act_forage,
  need: m.dev_npc_ai_mon_act_need,
  rest: m.dev_npc_ai_mon_act_rest,
  patrol: m.dev_npc_ai_mon_act_patrol,
  evade: m.dev_npc_ai_mon_act_evade,
  down: m.dev_npc_ai_mon_act_down,
  travel: m.dev_npc_ai_mon_act_travel,
  none: m.dev_npc_ai_mon_act_none,
};

const ISSUE_LABELS: Readonly<Record<MonitorIssue, () => string>> = {
  unfed: m.dev_npc_ai_mon_issue_unfed,
  unpaid: m.dev_npc_ai_mon_issue_unpaid,
  homeless: m.dev_npc_ai_mon_issue_homeless,
  injured: m.dev_npc_ai_mon_issue_injured,
  strike: m.dev_npc_ai_mon_issue_strike,
  stuck: m.dev_npc_ai_mon_issue_stuck,
  off_map: m.dev_npc_ai_mon_issue_off_map,
};
const ISSUES: readonly MonitorIssue[] = [
  "unfed",
  "unpaid",
  "homeless",
  "injured",
  "strike",
  "stuck",
  "off_map",
];

const FLAG_LABELS: Readonly<Record<HouseFlag, () => string>> = {
  food_short: m.dev_npc_ai_mon_flag_food_short,
  morale_low: m.dev_npc_ai_mon_flag_morale_low,
  unruly: m.dev_npc_ai_mon_flag_unruly,
};

const ROLE_LABELS: Readonly<Record<Unit["role"], () => string>> = {
  worker: m.dev_npc_ai_mon_role_worker,
  idle: m.dev_npc_ai_mon_role_idle,
  guard: m.dev_npc_ai_mon_role_guard,
};

const HOUSING_LABELS: Readonly<Record<Unit["housing"], () => string>> = {
  lodging: m.dev_npc_ai_mon_housing_lodging,
  home: m.dev_npc_ai_mon_housing_home,
  homeless: m.dev_npc_ai_mon_housing_homeless,
};

/** 표의 기둥 칸 차례(도시·가문 공통) */
const PILLAR_COLUMNS: readonly { readonly key: PillarKey; readonly label: () => string }[] = [
  { key: "food", label: m.dev_npc_ai_mon_col_food },
  { key: "income", label: m.dev_npc_ai_mon_col_pay },
  { key: "housing", label: m.dev_npc_ai_mon_col_housing },
  { key: "recovery", label: m.dev_npc_ai_mon_col_health },
  { key: "motion", label: m.dev_npc_ai_mon_col_motion },
];

export const timeOf = (ms: number): string => new Date(ms).toLocaleTimeString();

/** 최소 단위 글자 → 자릿수 나눈 글자 */
const amountOf = (value: string): string => BigInt(value).toLocaleString();

export const cityLabel = (city: { readonly id: number; readonly name: string | null }): string =>
  city.name
    ? m.dev_npc_ai_mon_city_name({ name: city.name, id: city.id })
    : m.dev_npc_ai_mon_city_id({ id: city.id });

function durationLabel(ms: number): string {
  const { h, m: minutes, s } = durationParts(ms);
  if (h > 0) return m.dev_npc_ai_mon_dur_hm({ h, m: minutes });
  return minutes > 0 ? m.dev_npc_ai_mon_dur_m({ m: minutes }) : m.dev_npc_ai_mon_dur_s({ s });
}

export function LevelBadge({ level }: { readonly level: MonitorLevel }) {
  return (
    <span className="dev-badge na-mon-level" data-level={level}>
      {LEVEL_LABELS[level]()}
    </span>
  );
}

/** 정상 / 전체 칸(전체가 0이면 줄표) */
function RatioCell({
  ok,
  total,
  level,
}: {
  readonly ok: number;
  readonly total: number;
  readonly level: MonitorLevel;
}) {
  return (
    <td className="dev-num na-mon-cell" data-level={level}>
      {total === 0 ? m.dev_npc_ai_mon_dash() : m.dev_npc_ai_mon_ratio({ ok, total })}
    </td>
  );
}

function PillarCells({ row }: { readonly row: City | House }) {
  const ratios = pillarRatios(row);
  const levels = pillarLevels(row);
  return (
    <>
      {PILLAR_COLUMNS.map((column) => (
        <RatioCell
          key={column.key}
          ok={ratios[column.key].ok}
          total={ratios[column.key].total}
          level={levels[column.key]}
        />
      ))}
    </>
  );
}

/** 재고로 버티는 시간 글자(1,000시간 넘으면 "이상") */
function coverLabel(hours: number | null): string {
  if (hours === null) return m.dev_npc_ai_mon_unknown();
  return hours >= 1000 ? m.dev_npc_ai_mon_hours_plenty({ hours: 1000 }) : m.dev_npc_ai_mon_hours({ hours });
}

export function CityTable({
  cities,
  pickedId,
  onPick,
}: {
  readonly cities: readonly City[];
  readonly pickedId: number | undefined;
  readonly onPick: (cityId: number | undefined) => void;
}) {
  if (cities.length === 0) return <p className="na-hint">{m.dev_npc_ai_mon_no_cities()}</p>;
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col">{m.dev_npc_ai_mon_col_city()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_issues()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_pop()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_workers()}</th>
            {PILLAR_COLUMNS.map((column) => (
              <th key={column.key} scope="col">
                {column.label()}
              </th>
            ))}
            <th scope="col">{m.dev_npc_ai_mon_col_production()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_ration()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_stock()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_satisfaction()}</th>
            <th scope="col">{m.dev_npc_ai_mon_col_strikes()}</th>
          </tr>
        </thead>
        <tbody>
          {cities.map((city) => {
            const all = city.humans + city.guards;
            const levels = pillarLevels(city);
            const picked = city.id === pickedId;
            return (
              <tr key={city.id} data-picked={picked ? "" : undefined}>
                <th scope="row">
                  <button
                    type="button"
                    className="button-text"
                    aria-pressed={picked}
                    onClick={() => onPick(picked ? undefined : city.id)}
                  >
                    {cityLabel(city)}
                  </button>
                </th>
                <td className="dev-num na-mon-cell" data-level={levelOf(city.issues, all)}>
                  {city.issues}
                </td>
                <td className="dev-num na-mon-cell" data-level={all > city.cap ? "warn" : "ok"}>
                  {m.dev_npc_ai_mon_ratio({ ok: all, total: city.cap })}
                </td>
                <td className="dev-num">
                  {m.dev_npc_ai_mon_ratio({ ok: city.income.workers, total: city.humans })}
                </td>
                <PillarCells row={city} />
                <td className="dev-num na-mon-cell" data-level={productionLevel(city.production)}>
                  {city.production
                    ? m.dev_npc_ai_mon_ratio({
                        ok: city.production.running,
                        total: city.production.facilities,
                      })
                    : m.dev_npc_ai_mon_dash()}
                </td>
                <td className="dev-num na-mon-cell" data-level={rationLevel(city.due, city.short)}>
                  {city.due === 0
                    ? m.dev_npc_ai_mon_dash()
                    : m.dev_npc_ai_mon_ratio({ ok: city.due - city.short, total: city.due })}
                </td>
                <td className="dev-num na-mon-cell" data-level={stockLevel(city.minCoverHours)}>
                  {coverLabel(city.minCoverHours)}
                </td>
                <td className="dev-num na-mon-cell" data-level={levels.order}>
                  {city.order.avgSatisfaction}
                </td>
                <td className="dev-num">{city.order.strikes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function facilityState(facility: Facility): { readonly level: MonitorLevel; readonly label: string } {
  if (facility.workers === 0) return { level: "warn", label: m.dev_npc_ai_mon_fac_unstaffed() };
  if (!facility.running) return { level: "bad", label: m.dev_npc_ai_mon_fac_stalled() };
  return {
    level: "ok",
    label:
      facility.endsAtMs === null
        ? m.dev_npc_ai_mon_fac_running()
        : m.dev_npc_ai_mon_fac_running_until({ time: timeOf(facility.endsAtMs) }),
  };
}

/** 고른 도시의 생필품 재고·시설·가문 */
export function CityDetail({ city, detail }: { readonly city: City; readonly detail: Detail }) {
  const running = detail.facilities.filter((facility) => facility.running).length;
  return (
    <section className="panel na-card">
      <div className="na-card-head">
        <h2>{m.dev_npc_ai_mon_detail_title({ city: cityLabel(city) })}</h2>
        {detail.treasury !== null && detail.currency !== null ? (
          <p className="na-hint">
            {m.dev_npc_ai_mon_detail_treasury({
              amount: amountOf(detail.treasury),
              currency: detail.currency,
            })}
          </p>
        ) : null}
      </div>
      <div className="na-mon-detail">
        <div className="na-stack">
          <h3 className="na-subcard-title">{m.dev_npc_ai_mon_stock_title()}</h3>
          {detail.stocks.length === 0 ? (
            <p className="na-hint">{m.dev_npc_ai_mon_no_stock()}</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_npc_ai_mon_col_asset()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_have()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_per_round()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_rounds()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_period()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_cover()}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.stocks.map((stock) => (
                    <tr key={stock.asset}>
                      <th scope="row" className="dev-code">
                        {stock.asset}
                      </th>
                      <td className="dev-num">{amountOf(stock.have)}</td>
                      <td className="dev-num">{amountOf(stock.perRound)}</td>
                      <td className="dev-num">{stock.rounds ?? m.dev_npc_ai_mon_unknown()}</td>
                      <td className="dev-num">
                        {m.dev_npc_ai_mon_period_hours({ hours: stock.periodHours })}
                      </td>
                      <td className="dev-num na-mon-cell" data-level={stockLevel(stock.coverHours)}>
                        {coverLabel(stock.coverHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="na-stack">
          <h3 className="na-subcard-title">
            {m.dev_npc_ai_mon_fac_title({ running, total: detail.facilities.length })}
          </h3>
          {detail.facilities.length === 0 ? (
            <p className="na-hint">{m.dev_npc_ai_mon_no_fac()}</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_npc_ai_mon_col_facility()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_recipe()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_level()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_fac_workers()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_duty()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_state()}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.facilities.map((facility) => {
                    const state = facilityState(facility);
                    return (
                      <tr key={facility.id}>
                        <th scope="row">
                          <span className="dev-code">{facility.facility}</span>{" "}
                          <span className="dev-muted">
                            {facility.buildingId === null
                              ? m.dev_npc_ai_mon_fac_city_job()
                              : m.dev_npc_ai_mon_fac_building({ id: facility.buildingId })}
                          </span>
                        </th>
                        <td className="dev-code">{facility.recipe}</td>
                        <td className="dev-num">{facility.level}</td>
                        <td className="dev-num">{facility.workers}</td>
                        <td className="dev-num">{facility.dutyPm}</td>
                        <td className="na-mon-cell" data-level={state.level}>
                          {state.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="na-stack">
          <h3 className="na-subcard-title">
            {m.dev_npc_ai_mon_houses_title({ count: detail.houses.length })}
          </h3>
          {detail.houses.length === 0 ? (
            <p className="na-hint">{m.dev_npc_ai_mon_no_houses()}</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_npc_ai_mon_col_house()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_members()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_workers()}</th>
                    {PILLAR_COLUMNS.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label()}
                      </th>
                    ))}
                    <th scope="col">{m.dev_npc_ai_mon_col_satisfaction()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_strikes()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_vault()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_flags()}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.houses.map((house) => (
                    <tr key={house.id}>
                      <th scope="row">
                        {house.name
                          ? m.dev_npc_ai_mon_house_name({ name: house.name, id: house.id })
                          : m.dev_npc_ai_mon_house_id({ id: house.id })}
                      </th>
                      <td className="dev-num">{house.humans + house.guards}</td>
                      <td className="dev-num">
                        {m.dev_npc_ai_mon_ratio({ ok: house.income.workers, total: house.humans })}
                      </td>
                      <PillarCells row={house} />
                      <td className="dev-num na-mon-cell" data-level={pillarLevels(house).order}>
                        {house.humans + house.guards === 0
                          ? m.dev_npc_ai_mon_dash()
                          : house.order.avgSatisfaction}
                      </td>
                      <td className="dev-num">{house.order.strikes}</td>
                      <td className="dev-num">{amountOf(house.vault)}</td>
                      <td>
                        {house.flags.map((flag) => (
                          <span key={flag} className="dev-badge na-mon-level" data-level="bad">
                            {FLAG_LABELS[flag]()}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type UnitFilter = MonitorIssue | "all" | "issues";

function movementLabel(unit: Unit): string {
  if (unit.idleMs === null) return m.dev_npc_ai_mon_dash();
  return unit.moving
    ? m.dev_npc_ai_mon_move_walking()
    : m.dev_npc_ai_mon_move_standing({ time: durationLabel(unit.idleMs) });
}

/** 유닛 표: 문제 종류로 거른다. 도시를 골랐으면 그 도시 유닛 모두, 아니면 세계의 문제 유닛 */
export function UnitTable({
  units,
  found,
  city,
  cities,
}: {
  readonly units: readonly Unit[];
  readonly found: number;
  readonly city: City | undefined;
  readonly cities: readonly City[];
}) {
  const [filter, setFilter] = useState<UnitFilter>("all");
  const troubled = units.filter((unit) => unit.issues.length > 0);
  const rows =
    filter === "all"
      ? units
      : filter === "issues"
        ? troubled
        : units.filter((unit) => unit.issues.includes(filter));
  const nameOf = new Map(cities.map((entry) => [entry.id, cityLabel(entry)]));
  const chips: { readonly key: UnitFilter; readonly label: string }[] = [
    { key: "all", label: m.dev_npc_ai_mon_filter_all({ count: units.length }) },
    ...(city
      ? [{ key: "issues" as const, label: m.dev_npc_ai_mon_filter_issues({ count: troubled.length }) }]
      : []),
    ...ISSUES.map((issue) => ({
      key: issue,
      label: m.dev_npc_ai_mon_issue_count({
        label: ISSUE_LABELS[issue](),
        count: units.filter((unit) => unit.issues.includes(issue)).length,
      }),
    })),
  ];
  return (
    <section className="panel na-card">
      <div className="na-card-head">
        <h2>
          {city
            ? m.dev_npc_ai_mon_units_title_city({ city: cityLabel(city), count: found })
            : m.dev_npc_ai_mon_units_title_world({ count: found })}
        </h2>
        {city ? null : <p className="na-hint">{m.dev_npc_ai_mon_units_desc_world()}</p>}
        {found > units.length ? (
          <p className="na-hint">{m.dev_npc_ai_mon_units_truncated({ found, shown: units.length })}</p>
        ) : null}
      </div>
      <div className="na-mon-chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="na-mon-chip"
            aria-pressed={filter === chip.key}
            onClick={() => setFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="na-hint">{m.dev_npc_ai_mon_no_units()}</p>
      ) : (
        <div className="dev-table-wrap na-mon-units">
          <table className="dev-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_npc_ai_mon_col_unit()}</th>
                {city ? null : <th scope="col">{m.dev_npc_ai_mon_col_city()}</th>}
                <th scope="col">{m.dev_npc_ai_mon_col_house()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_role()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_activity()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_motion()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_fed()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_paid()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_housing()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_injury()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_satisfaction()}</th>
                <th scope="col">{m.dev_npc_ai_mon_col_problems()}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((unit) => {
                const has = (issue: MonitorIssue): MonitorLevel | undefined =>
                  unit.issues.includes(issue) ? "bad" : undefined;
                return (
                  <tr key={unit.id}>
                    <th scope="row" className="dev-num">
                      {m.dev_npc_ai_mon_unit_id({ id: unit.id })}
                    </th>
                    {city ? null : (
                      <td>{nameOf.get(unit.city) ?? m.dev_npc_ai_mon_city_id({ id: unit.city })}</td>
                    )}
                    <td className="dev-num">
                      {unit.house === null
                        ? m.dev_npc_ai_mon_dash()
                        : m.dev_npc_ai_mon_unit_id({ id: unit.house })}
                    </td>
                    <td className="na-mon-cell" data-level={has("strike")}>
                      {ROLE_LABELS[unit.role]()}
                    </td>
                    <td className="na-mon-cell" data-level={has("off_map")}>
                      {ACTIVITY_LABELS[unit.activity]()}
                    </td>
                    <td className="na-mon-cell" data-level={has("stuck")}>
                      {movementLabel(unit)}
                    </td>
                    <td className="dev-num na-mon-cell" data-level={has("unfed")}>
                      {unit.fedPm ?? m.dev_npc_ai_mon_unknown()}
                    </td>
                    <td className="dev-num na-mon-cell" data-level={has("unpaid")}>
                      {unit.paid === null ? m.dev_npc_ai_mon_pay_none() : unit.paid.toLocaleString()}
                    </td>
                    <td className="na-mon-cell" data-level={has("homeless")}>
                      {HOUSING_LABELS[unit.housing]()}
                    </td>
                    <td className="na-mon-cell" data-level={has("injured")}>
                      {unit.injury > 0
                        ? m.dev_npc_ai_mon_injury_stage({ stage: unit.injury })
                        : m.dev_npc_ai_mon_injury_none()}
                    </td>
                    <td className="dev-num">{unit.satisfaction}</td>
                    <td>
                      {unit.issues.map((issue) => (
                        <span key={issue} className="dev-badge na-mon-level" data-level="bad">
                          {ISSUE_LABELS[issue]()}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

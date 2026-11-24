// 탭 6: AI 작동 모니터 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (모니터 탭)". 서버 npcAi.monitor를 10초마다 읽어 보이기만 한다.
// 위: 스위치·세계 합계·마지막 기록(하루 끝 가문세·돌봄, 일꾼 차례 바뀜, 비접속 유저 관리인). 아래: 도시 표(지시 불복 많은 차례) → 도시를 고르면
// 그 도시 가문 표(집계·깃발·금고).
import { useEffect, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";

type MonitorResponse = Awaited<ReturnType<typeof api.npcAi.monitor.query>>;
type MonitorReady = Extract<MonitorResponse, { status: "ready" }>;
type MonitorCity = MonitorReady["view"]["cities"][number];
type HouseFlag = keyof MonitorCity["flags"];

/** 새로 읽는 주기 */
const REFRESH_MS = 10_000;

const FLAG_LABELS: Readonly<Record<HouseFlag, () => string>> = {
  food_short: m.dev_npc_ai_mon_flag_food_short,
  morale_low: m.dev_npc_ai_mon_flag_morale_low,
  unruly: m.dev_npc_ai_mon_flag_unruly,
};
const FLAGS: readonly HouseFlag[] = ["food_short", "morale_low", "unruly"];

const timeOf = (ms: number): string => new Date(ms).toLocaleTimeString();

const cityLabel = (city: { readonly id: number; readonly name: string | null }): string =>
  city.name
    ? m.dev_npc_ai_mon_city_name({ name: city.name, id: city.id })
    : m.dev_npc_ai_mon_city_id({ id: city.id });

function Kpi({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
}) {
  return (
    <div className="na-override-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="na-hint">{hint}</span> : null}
    </div>
  );
}

export function NpcAiMonitorTab() {
  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      api.npcAi.monitor.query(cityId === undefined ? {} : { cityId }).then(
        (res) => {
          if (cancelled) return;
          setData(res);
          setFailed(false);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cityId]);

  if (!data) {
    return (
      <div className="na-tab-body">
        <p className="na-hint">{failed ? m.dev_npc_ai_mon_failed() : m.dev_npc_ai_mon_loading()}</p>
      </div>
    );
  }
  if (data.status !== "ready") {
    return (
      <div className="na-tab-body">
        <p className="na-hint">{m.dev_npc_ai_mon_not_ready()}</p>
      </div>
    );
  }

  const { view, steward } = data;
  const { totals } = view;
  const none = m.dev_npc_ai_mon_none_yet();
  const switches = [
    { label: m.dev_npc_ai_mon_switch_npc(), on: view.switches.npcAi === 1 },
    { label: m.dev_npc_ai_mon_switch_unit(), on: view.switches.unitAi === 1 },
    { label: m.dev_npc_ai_mon_switch_house(), on: view.switches.houseAi === 1 },
  ];
  const picked = view.city ? view.cities.find((city) => city.id === view.city?.id) : undefined;

  return (
    <div className="na-tab-body">
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_mon_desc()}</p>
          <p className="na-hint" aria-live="polite">
            {m.dev_npc_ai_mon_read_at({ time: timeOf(view.generatedAt), day: view.day })}
            {failed ? ` · ${m.dev_npc_ai_mon_failed()}` : ""}
          </p>
        </div>
        <div className="na-switch-grid">
          {switches.map((entry) => (
            <div key={entry.label} className="na-switch-card" data-on={entry.on ? "" : undefined}>
              <strong className="na-switch-title">{entry.label}</strong>
              <span className="dev-badge">{entry.on ? m.dev_npc_ai_mon_on() : m.dev_npc_ai_mon_off()}</span>
            </div>
          ))}
        </div>
        <div className="na-mon-kpis">
          <Kpi
            label={m.dev_npc_ai_mon_kpi_humans()}
            value={String(totals.humans)}
            hint={m.dev_npc_ai_mon_kpi_humans_hint({ guards: totals.guards, cities: totals.cities })}
          />
          <Kpi label={m.dev_npc_ai_mon_kpi_satisfaction()} value={String(totals.avgSatisfaction)} />
          <Kpi
            label={m.dev_npc_ai_mon_kpi_strikes()}
            value={String(totals.strikes)}
            hint={m.dev_npc_ai_mon_kpi_strikes_hint()}
          />
          <Kpi label={m.dev_npc_ai_mon_kpi_unpaid()} value={String(totals.unpaid)} />
          <Kpi label={m.dev_npc_ai_mon_kpi_unfed()} value={String(totals.unfed)} />
          <Kpi label={m.dev_npc_ai_mon_kpi_drafted()} value={String(totals.drafted)} />
          <Kpi
            label={m.dev_npc_ai_mon_kpi_houses()}
            value={String(totals.houses)}
            hint={m.dev_npc_ai_mon_kpi_houses_hint({ flagged: totals.flaggedHouses })}
          />
        </div>
      </section>

      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_last_title()}</h2>
        </div>
        <dl className="na-mon-last">
          <dt>{m.dev_npc_ai_mon_last_house_day()}</dt>
          <dd>
            {view.lastHouseDay
              ? m.dev_npc_ai_mon_last_house_day_value({
                  time: timeOf(view.lastHouseDay.atMs),
                  taxed: view.lastHouseDay.taxed,
                  cared: view.lastHouseDay.cared,
                })
              : none}
          </dd>
          <dt>{m.dev_npc_ai_mon_last_labor()}</dt>
          <dd>
            {view.lastLaborChange
              ? m.dev_npc_ai_mon_last_labor_value({
                  time: timeOf(view.lastLaborChange.atMs),
                  cities: view.lastLaborChange.cities,
                  total: view.laborChanges,
                })
              : none}
          </dd>
          <dt>{m.dev_npc_ai_mon_last_steward()}</dt>
          <dd>
            {steward && steward.lastSweepAtMs !== null
              ? m.dev_npc_ai_mon_last_steward_value({
                  time: timeOf(steward.lastSweepAtMs),
                  away: steward.lastAway,
                  accepted: steward.lastAccepted,
                  total: steward.totalAccepted,
                })
              : none}
          </dd>
        </dl>
      </section>

      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_cities_title({ count: view.cities.length })}</h2>
          <p className="na-hint">{m.dev_npc_ai_mon_cities_desc()}</p>
        </div>
        {view.cities.length === 0 ? (
          <p className="na-hint">{m.dev_npc_ai_mon_no_cities()}</p>
        ) : (
          <div className="dev-table-wrap">
            <table className="dev-table">
              <thead>
                <tr>
                  <th scope="col">{m.dev_npc_ai_mon_col_city()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_humans()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_satisfaction()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_fed()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_strikes()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_unpaid()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_unfed()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_drafted()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_houses()}</th>
                  <th scope="col">{m.dev_npc_ai_mon_col_flags()}</th>
                </tr>
              </thead>
              <tbody>
                {view.cities.map((city) => (
                  <tr key={city.id} aria-selected={city.id === cityId}>
                    <td>
                      <button
                        type="button"
                        className="button-text"
                        aria-pressed={city.id === cityId}
                        onClick={() => setCityId(city.id === cityId ? undefined : city.id)}
                      >
                        {cityLabel(city)}
                      </button>
                    </td>
                    <td className="dev-num">{city.humans}</td>
                    <td className="dev-num">{city.avgSatisfaction}</td>
                    <td className="dev-num">{city.avgFedPm ?? m.dev_npc_ai_mon_unknown()}</td>
                    <td className="dev-num">{city.strikes}</td>
                    <td className="dev-num">{city.unpaid}</td>
                    <td className="dev-num">{city.unfed}</td>
                    <td className="dev-num">{city.drafted}</td>
                    <td className="dev-num">{city.houses}</td>
                    <td>
                      {FLAGS.filter((flag) => city.flags[flag] > 0).map((flag) => (
                        <span key={flag} className="dev-badge">
                          {FLAG_LABELS[flag]()} {city.flags[flag]}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {view.city ? (
        <section className="panel na-card">
          <div className="na-card-head">
            <h2>
              {m.dev_npc_ai_mon_houses_title({
                city: picked ? cityLabel(picked) : m.dev_npc_ai_mon_city_id({ id: view.city.id }),
                count: view.city.houses.length,
              })}
            </h2>
          </div>
          {view.city.houses.length === 0 ? (
            <p className="na-hint">{m.dev_npc_ai_mon_no_houses()}</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_npc_ai_mon_col_house()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_members()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_satisfaction()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_fed()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_unfed()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_sullen()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_vault()}</th>
                    <th scope="col">{m.dev_npc_ai_mon_col_flags()}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.city.houses.map((house) => (
                    <tr key={house.id}>
                      <td>
                        {house.name
                          ? m.dev_npc_ai_mon_house_name({ name: house.name, id: house.id })
                          : m.dev_npc_ai_mon_house_id({ id: house.id })}
                      </td>
                      <td className="dev-num">{house.status.members}</td>
                      <td className="dev-num">
                        {house.status.avgSatisfaction ?? m.dev_npc_ai_mon_unknown()}
                      </td>
                      <td className="dev-num">{house.status.avgFedPm}</td>
                      <td className="dev-num">{house.status.unfed}</td>
                      <td className="dev-num">{house.status.sullen}</td>
                      <td className="dev-num">{house.vault}</td>
                      <td>
                        {house.flags.map((flag) => (
                          <span key={flag} className="dev-badge">
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
        </section>
      ) : null}
    </div>
  );
}

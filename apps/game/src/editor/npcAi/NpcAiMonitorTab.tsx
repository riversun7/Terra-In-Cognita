// 탭 6: 필수요소 모니터 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (모니터 탭)"·"바뀜 (모니터 개편)". 서버 npcAi.monitor를 10초마다 읽어 보이기만 한다.
// 위에서 아래로: 총평·스위치 → 세계 필수요소 점검(식사·벌이·주거·회복·움직임·질서·생산, 정상/주의/문제) → 지금 하는 일 분포 → 도시별 필수요소 표
// → (도시를 고르면) 그 도시 재고·시설·가문 → 유닛 표(문제 종류로 거르기). 표는 NpcAiMonitorTables.tsx, 판정은 npcAiMonitorModel.ts.
import { useEffect, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import {
  ACTIVITY_LABELS,
  CityDetail,
  CityTable,
  LevelBadge,
  type MonitorActivity,
  type MonitorResponse,
  type MonitorView,
  UnitTable,
  timeOf,
} from "./NpcAiMonitorTables.tsx";
import {
  type MonitorLevel,
  countLevels,
  pillarLevels,
  pillarRatios,
  productionLevel,
  rationLevel,
  sharePct,
  stockLevel,
} from "./npcAiMonitorModel.ts";

/** 새로 읽는 주기 */
const REFRESH_MS = 10_000;

/** 지금 하는 일 줄의 차례와 색조 */
const ACTIVITY_ROWS: readonly { readonly key: MonitorActivity; readonly level: MonitorLevel }[] = [
  { key: "post", level: "ok" },
  { key: "haul", level: "ok" },
  { key: "forage", level: "ok" },
  { key: "need", level: "ok" },
  { key: "rest", level: "none" },
  { key: "patrol", level: "none" },
  { key: "evade", level: "warn" },
  { key: "travel", level: "none" },
  { key: "down", level: "bad" },
  { key: "none", level: "bad" },
];

function PillarCard({
  title,
  level,
  main,
  sub,
  ok,
  total,
}: {
  readonly title: string;
  readonly level: MonitorLevel;
  readonly main: string;
  readonly sub: string;
  readonly ok: number;
  readonly total: number;
}) {
  return (
    <div className="na-mon-pillar" data-level={level}>
      <div className="na-mon-pillar-head">
        <strong>{title}</strong>
        <LevelBadge level={level} />
      </div>
      <span className="na-mon-pillar-main">{main}</span>
      <span className="na-mon-track" aria-hidden="true">
        <span className="na-mon-fill" style={{ inlineSize: `${sharePct(ok, total)}%` }} />
      </span>
      <span className="na-hint">{sub}</span>
    </div>
  );
}

/** 도시 생필품 재고 요약: 하루 이상 버티는 도시·못 버티는 도시·바닥난 도시 */
function stockSummary(view: MonitorView): {
  readonly ok: number;
  readonly warn: number;
  readonly bad: number;
  readonly total: number;
  readonly level: MonitorLevel;
} {
  const levels = view.cities.map((city) => stockLevel(city.minCoverHours));
  const count = (level: MonitorLevel): number => levels.filter((entry) => entry === level).length;
  const [ok, warn, bad] = [count("ok"), count("warn"), count("bad")];
  const total = ok + warn + bad;
  return { ok, warn, bad, total, level: total === 0 ? "none" : bad > 0 ? "bad" : warn > 0 ? "warn" : "ok" };
}

function Pillars({ view }: { readonly view: MonitorView }) {
  const t = view.totals;
  const ratios = pillarRatios(t);
  const levels = pillarLevels(t);
  const production = { facilities: t.facilities, stalled: t.stalled, unstaffed: t.unstaffed };
  const stock = stockSummary(view);
  return (
    <div className="na-mon-pillars">
      <PillarCard
        title={m.dev_npc_ai_mon_p_food()}
        level={levels.food}
        main={m.dev_npc_ai_mon_p_food_main(ratios.food)}
        sub={m.dev_npc_ai_mon_p_food_sub({ bad: t.food.bad, unknown: t.food.unknown })}
        {...ratios.food}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_income()}
        level={levels.income}
        main={m.dev_npc_ai_mon_p_income_main({ workers: t.income.workers, humans: t.humans })}
        sub={m.dev_npc_ai_mon_p_income_sub({
          paid: t.income.paid,
          unpaid: t.income.unpaid,
          idle: t.income.idle,
        })}
        ok={t.income.workers}
        total={t.humans}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_housing()}
        level={levels.housing}
        main={m.dev_npc_ai_mon_p_housing_main(ratios.housing)}
        sub={m.dev_npc_ai_mon_p_housing_sub(t.housing)}
        {...ratios.housing}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_recovery()}
        level={levels.recovery}
        main={m.dev_npc_ai_mon_p_recovery_main(ratios.recovery)}
        sub={m.dev_npc_ai_mon_p_recovery_sub(t.recovery)}
        {...ratios.recovery}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_motion()}
        level={levels.motion}
        main={m.dev_npc_ai_mon_p_motion_main(ratios.motion)}
        sub={m.dev_npc_ai_mon_p_motion_sub({
          moving: t.motion.moving,
          standing: t.motion.standing,
          stuck: t.motion.stuck,
          off: t.motion.offMap,
          away: t.motion.away,
        })}
        {...ratios.motion}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_order()}
        level={levels.order}
        main={m.dev_npc_ai_mon_p_order_main({ sat: t.order.avgSatisfaction })}
        sub={m.dev_npc_ai_mon_p_order_sub({
          strikes: t.order.strikes,
          drafted: t.drafted,
          flagged: t.flaggedHouses,
          houses: t.houses,
        })}
        ok={t.order.avgSatisfaction}
        total={100}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_ration()}
        level={rationLevel(t.due, t.short)}
        main={m.dev_npc_ai_mon_p_ration_main({ ok: t.due - t.short, total: t.due })}
        sub={m.dev_npc_ai_mon_p_ration_sub({ short: t.short })}
        ok={t.due - t.short}
        total={t.due}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_stock()}
        level={stock.level}
        main={m.dev_npc_ai_mon_p_stock_main({ ok: stock.ok, total: stock.total })}
        sub={m.dev_npc_ai_mon_p_stock_sub({ warn: stock.warn, bad: stock.bad })}
        ok={stock.ok}
        total={stock.total}
      />
      <PillarCard
        title={m.dev_npc_ai_mon_p_production()}
        level={productionLevel(production)}
        main={m.dev_npc_ai_mon_p_production_main({ ok: t.running, total: t.facilities })}
        sub={m.dev_npc_ai_mon_p_production_sub({ stalled: t.stalled, unstaffed: t.unstaffed })}
        ok={t.running}
        total={t.facilities}
      />
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
  const all = totals.humans + totals.guards;
  const none = m.dev_npc_ai_mon_none_yet();
  const switches = [
    { label: m.dev_npc_ai_mon_switch_npc(), on: view.switches.npcAi === 1 },
    { label: m.dev_npc_ai_mon_switch_unit(), on: view.switches.unitAi === 1 },
    { label: m.dev_npc_ai_mon_switch_house(), on: view.switches.houseAi === 1 },
  ];
  const verdict = countLevels([
    ...Object.values(pillarLevels(totals)),
    rationLevel(totals.due, totals.short),
    stockSummary(view).level,
    productionLevel({ facilities: totals.facilities, stalled: totals.stalled, unstaffed: totals.unstaffed }),
  ]);
  const healthy = verdict.bad === 0 && verdict.warn === 0 && verdict.none === 0 && totals.issues === 0;
  // 서버가 돌려준 도시 상세가 지금 고른 도시의 것일 때만 보인다(새로 읽는 사이의 옛 응답을 거른다)
  const picked = view.city ? view.cities.find((city) => city.id === view.city?.id) : undefined;

  return (
    <div className="na-tab-body">
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_mon_desc()}</p>
        </div>
        <div className="na-mon-status">
          <span
            className="na-mon-verdict"
            data-level={healthy ? "ok" : verdict.bad > 0 ? "bad" : "warn"}
            aria-live="polite"
          >
            {healthy
              ? m.dev_npc_ai_mon_verdict_ok()
              : m.dev_npc_ai_mon_verdict_issues({
                  bad: verdict.bad,
                  warn: verdict.warn,
                  none: verdict.none,
                  units: totals.issues,
                })}
          </span>
          {switches.map((entry) => (
            <span key={entry.label} className="dev-badge na-mon-level" data-level={entry.on ? "ok" : "bad"}>
              {entry.label} {entry.on ? m.dev_npc_ai_mon_on() : m.dev_npc_ai_mon_off()}
            </span>
          ))}
          <span className="na-hint">
            {m.dev_npc_ai_mon_read_at({ time: timeOf(view.generatedAt), day: view.day })}
            {failed ? ` · ${m.dev_npc_ai_mon_failed()}` : ""}
          </span>
        </div>
      </section>

      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_pillars_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_mon_pillars_desc({ units: all })}</p>
        </div>
        <Pillars view={view} />
      </section>

      <div className="na-grid-2">
        <section className="panel na-card">
          <div className="na-card-head">
            <h2>{m.dev_npc_ai_mon_activity_title()}</h2>
            <p className="na-hint">{m.dev_npc_ai_mon_activity_desc()}</p>
          </div>
          <ul className="na-mon-rows">
            {ACTIVITY_ROWS.map((row) => {
              const count = totals.activity[row.key];
              return (
                <li key={row.key} className="na-mon-row" data-level={count > 0 ? row.level : "none"}>
                  <span>{ACTIVITY_LABELS[row.key]()}</span>
                  <span className="na-mon-track" aria-hidden="true">
                    <span className="na-mon-fill" style={{ inlineSize: `${sharePct(count, all)}%` }} />
                  </span>
                  <span className="na-num">{count}</span>
                </li>
              );
            })}
          </ul>
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
      </div>

      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_mon_cities_title({ count: totals.cities })}</h2>
          <p className="na-hint">{m.dev_npc_ai_mon_cities_desc()}</p>
        </div>
        <CityTable cities={view.cities} pickedId={cityId} onPick={setCityId} />
      </section>

      {picked && view.city ? <CityDetail city={picked} detail={view.city} /> : null}

      <UnitTable
        key={picked?.id ?? 0}
        units={view.units}
        found={view.unitsFound}
        city={picked}
        cities={view.cities}
      />
    </div>
  );
}

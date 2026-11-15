// 2차맵 채집소 판 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요"(NAS에서 벌목장·광산이 보이지만 쓸 수 있는 기능이 없다),
// docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)". 건물 판(GatherPanel.tsx) 안에 그 건물이 채집소면 보인다.
// - 레벨·반경(지도에 고리로 그린다)·버프(채집량·피로·다시 자람)·반경 안 원자재(캘 수 있음·다시 자라는 중·남은 번수)·채집소 창고(무게·내 몫·
//   [도시 창고로 옮기기]·자동 옮김 다음 시각)·일꾼(상태·묶음·피로, [고른 유닛을 일꾼으로]·[빼기])·[고른 유닛으로 직접 캐기]·레벨 올리기(재료·시간).
// - 판정은 서버다. 바꾸는 명령은 이미 있는 WebSocket 명령: labor_assign·labor_unassign, facility_upgrade, storage_move(out), gather_start.
// - 보내는 유닛 = 건물 판과 같다(고른 유닛, 없으면 이 2차맵의 내 사이보그). 모바일 우선: 판은 세로로 넘친 만큼만 안에서 넘긴다.
// - 농장(facility 채집소, 오브젝트 없음 — 기획 정리 756 ②): 반경 고리·원자재·[직접 캐기]는 없고, 수확·피로 버프·채집소 창고·자동 옮김·일꾼·
//   레벨 올리기는 같다.
// - 바뀜 (기획 D-566 1721·D-567·D-568): 건물 채집소(농장·목장·약초원)는 "facility" 채집소다 — 개요에 기르는 티어(2 × 레벨 − 1)·권장 스탯 합,
//   관리 칸에 면적 모듈(붙은 수·자리·면적 배율·다음 재료, [모듈 붙이기] = facility_plot, 프로토콜 41).
// - 바뀜 (기획 D-569 1761·1765): 관리 칸의 모듈·기를 티어는 StationPlots.tsx(티어 고르기·모듈 짓는 시간·떼기, 프로토콜 45).
// - 바뀜 (2026-11-15 건물 화면 개편, docs/adr/2026-11-15-building-screen.md): 자료는 건물 판이 한 번 읽어(useStation) 칸마다 나눠 준다(part —
//   개요·일꾼·창고·관리 칸). 반경 고리는 건물 판이 고른 건물에 맞춰 그린다(칸과 상관없이).
import type { GatherStationResponse } from "@terra/shared/gatherStation";
import { useEffect, useState } from "react";
import { formatDuration } from "../../economy/economyText.ts";
import { sendFacilityCommand } from "../../economy/facilityCommands.ts";
import { FACILITY_ERROR_TEXT } from "../../economy/facilityText.ts";
import { sendLaborCommand } from "../../economy/laborCommands.ts";
import { LABOR_ERROR_TEXT } from "../../economy/laborText.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { navigate } from "../../shell/routerStore.ts";
import { sendGatherCommand } from "./gatherCommands.ts";
import { type PlotCommand, StationPlots } from "./StationPlots.tsx";
import { gatherErrorText, minutesText, nameText } from "./gatherData.ts";
import type { GatherState } from "./gatherState.ts";
import {
  STATION_POLL_MS,
  buffsText,
  kgOf,
  loadGatherStation,
  nearestReady,
  nextLevelText,
  qtyOf,
  restText,
  usedPct,
  workerStateText,
  workerViaText,
} from "./stationData.ts";

/** 프로토콜 입력 한도(storage_move qty, 게임 값 아님) */
const MOVE_MAX = 1_000_000;

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 채집소 판의 칸: summary = 레벨·반경·버프·원자재, workers = 일꾼, storage = 채집소 창고, upgrade = 레벨 올리기 */
export type StationPart = "summary" | "workers" | "storage" | "upgrade";

/** 채집소 자료(열 때와 STATION_POLL_MS마다, 명령 뒤에는 refresh로 바로). 다른 건물 자료가 섞이지 않게 건물 ID를 본다 */
export function useStation(buildingId: number): {
  readonly station: GatherStationResponse | null;
  readonly refresh: () => Promise<void>;
} {
  const [station, setStation] = useState<GatherStationResponse | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      try {
        const response = await loadGatherStation(buildingId);
        if (!stopped) setStation(response.buildingId === buildingId ? response : null);
      } catch {
        // 다음 차례에 다시 묻는다
      }
      if (!stopped) timer = setTimeout(() => void tick(), STATION_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [buildingId]);

  /** 명령 뒤 바로 다시 묻는다 */
  const refresh = async (): Promise<void> => {
    try {
      const response = await loadGatherStation(buildingId);
      setStation(response.buildingId === buildingId ? response : null);
    } catch {
      // 다음 차례에 다시 묻는다
    }
  };
  return { station: station?.buildingId === buildingId ? station : null, refresh };
}

interface StationPanelProps {
  readonly state: GatherState;
  readonly mapKey: number;
  readonly buildingId: number;
  /** 보내는 유닛(고른 유닛, 없으면 이 2차맵의 내 사이보그) */
  readonly actor: number | null;
  /** 결과 안내(건물 판 아래 한 줄) */
  readonly notify: (text: string) => void;
  /** 채집소 자료(useStation) */
  readonly station: GatherStationResponse | null;
  readonly refresh: () => Promise<void>;
  /** 보일 칸 */
  readonly part: StationPart;
  /** 운영자 모드(남의 채집소도 레벨 올리기 — 서버가 다시 본다) */
  readonly operator?: boolean | undefined;
}

export function StationPanel({
  state,
  mapKey,
  buildingId,
  actor,
  notify,
  station,
  refresh,
  part,
  operator = false,
}: StationPanelProps) {
  const [sending, setSending] = useState(false);
  const ok = station?.status === "ok" && station.buildingId === buildingId ? station : null;
  if (!ok || ok.kind === null) return null;
  const kind = ok.kind;

  const now = serverNow();
  const run = async (task: () => Promise<string>): Promise<void> => {
    setSending(true);
    const text = await task();
    setSending(false);
    notify(text);
    await refresh();
  };
  const assign = (unitId: number) =>
    void run(async () => {
      const outcome = await sendLaborCommand({ t: "labor_assign", buildingId, unitId });
      return outcome.ok ? m.station_done() : LABOR_ERROR_TEXT[outcome.code]();
    });
  const unassign = (unitId: number) =>
    void run(async () => {
      const outcome = await sendLaborCommand({ t: "labor_unassign", unitId });
      return outcome.ok ? m.station_done() : LABOR_ERROR_TEXT[outcome.code]();
    });
  const haul = () =>
    void run(async () => {
      // 내 몫 물자마다 창고 꺼내기(out = 그 도시의 내 도시 창고로)
      for (const line of ok.storage.goods) {
        const qty = /^[0-9]{1,30}$/.test(line.qty) ? Math.min(MOVE_MAX, Number(line.qty)) : 0;
        if (qty <= 0) continue;
        const outcome = await sendFacilityCommand({
          t: "storage_move",
          buildingId,
          asset: line.asset,
          qty,
          direction: "out",
        });
        // 운반꾼(이 채집소 일꾼)이 없거나 모두 바쁨(질문 1090 가·1091 가)
        if (!outcome.ok && (outcome.code === "unknown_unit" || outcome.code === "unit_busy"))
          return m.station_haul_no_porter();
        if (!outcome.ok) return FACILITY_ERROR_TEXT[outcome.code]();
      }
      return m.station_haul_done();
    });
  const upgrade = () =>
    void run(async () => {
      const outcome = await sendFacilityCommand({ t: "facility_upgrade", buildingId });
      return outcome.ok ? m.station_done() : FACILITY_ERROR_TEXT[outcome.code]();
    });
  // 면적 모듈 붙이기·떼기·기를 티어(D-569 1761·1765 — StationPlots.tsx)
  const sendPlot = (command: PlotCommand) =>
    void run(async () => {
      const outcome = await sendFacilityCommand({ ...command, buildingId });
      return outcome.ok ? m.station_done() : FACILITY_ERROR_TEXT[outcome.code]();
    });
  const plots = ok.plots ?? null;
  const target = ok.kind === "objects" ? nearestReady(ok, state.objects, state.kinds, now) : undefined;
  const gatherHere = () =>
    void run(async () => {
      if (actor === null || !target) return m.station_gather_none();
      const outcome = await sendGatherCommand({
        t: "gather_start",
        unitId: actor,
        mapKey,
        objectId: target.id,
      });
      return outcome.ok ? m.gather_sent() : gatherErrorText(outcome.code);
    });

  const pct = usedPct(ok.storage);
  const objects = ok.objects;
  const full = ok.workers.length >= ok.slots;
  const upgrading = ok.upgradingUntilMs !== null && ok.upgradingUntilMs > now;
  const affordable = ok.upgrade?.materials.every((stack) => stack.have >= stack.qty) ?? false;
  const show = (which: StationPart): boolean => part === which;
  return (
    <div
      className="gather-station"
      data-part="gather-station"
      data-station-part={part}
      data-kind={ok.kind}
      data-building={buildingId}
    >
      {show("summary") ? (
        <>
          <p className="gather-station-head">
            <span className="gather-station-title">{m.station_title({ level: ok.level })}</span>
            {ok.buffs && ok.buffs.radiusCells !== null ? (
              <span className="gather-muted"> · {m.station_radius({ cells: ok.buffs.radiusCells })}</span>
            ) : null}
          </p>
          {ok.level < 1 ? <p className="gather-muted">{m.station_not_built()}</p> : null}
          {ok.level >= 1 && !ok.works ? <p className="gather-station-warn">{m.station_disabled()}</p> : null}
          {ok.kind === "facility" ? <p className="gather-muted">{m.station_facility_note()}</p> : null}
          {plots ? (
            <p data-part="station-grow">
              {m.station_grow_tier({
                tier: plots.tier,
                stat: plots.recommendedStat,
                area: (plots.areaPm / 10).toFixed(0),
              })}
            </p>
          ) : null}

          {ok.buffs ? <p data-part="station-buffs">{buffsText(ok.buffs)}</p> : null}
          {objects ? (
            <section className="gather-station-part" aria-label={m.station_objects_title()}>
              <p className="gather-station-subtitle">{m.station_objects_title()}</p>
              {objects.total === 0 ? (
                <p className="gather-station-warn" data-part="station-no-objects">
                  {m.station_objects_none()}
                </p>
              ) : (
                <>
                  <p data-part="station-objects">
                    {m.station_objects_line({
                      total: objects.total,
                      ready: objects.ready,
                      depleted: objects.depleted,
                    })}
                  </p>
                  <p className="gather-muted">
                    {m.station_objects_uses({ left: objects.usesLeft, max: objects.usesMax })}
                    {objects.nextRegrowAtMs !== null
                      ? ` · ${m.station_objects_next({ time: minutesText(objects.nextRegrowAtMs - now) })}`
                      : ""}
                  </p>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {show("storage") ? (
        <section className="gather-station-part" aria-label={m.station_storage_title()}>
          <p className="gather-station-subtitle">{m.station_storage_title()}</p>
          {pct !== null && ok.storage.capacityGrams !== null ? (
            <div className="gather-station-meter-row">
              <div
                className="gather-station-meter"
                role="meter"
                aria-label={m.station_storage_title()}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={`${pct}%`}
                data-full={pct >= 100 ? "true" : undefined}
              >
                <span className="gather-station-meter-fill" style={{ inlineSize: `${pct}%` }} />
              </div>
              <span className="gather-station-meter-text">
                {m.station_storage_used({
                  used: kgOf(ok.storage.usedGrams),
                  cap: kgOf(ok.storage.capacityGrams),
                })}
              </span>
            </div>
          ) : null}
          {ok.storage.goods.length === 0 ? (
            <p className="gather-muted">{m.station_storage_empty()}</p>
          ) : (
            <ul className="gather-station-list">
              {ok.storage.goods.map((line) => (
                <li key={line.asset}>
                  {m.station_storage_line({
                    name: nameText(line.name, line.item ?? line.asset),
                    qty: qtyOf(line.qty),
                  })}
                </li>
              ))}
            </ul>
          )}
          <p className="gather-muted" data-part="station-haul">
            {ok.cityId === null
              ? m.station_haul_no_city()
              : ok.haul.nextAtMs === null
                ? m.station_haul_off()
                : m.station_haul_next({ time: minutesText(ok.haul.nextAtMs - now) })}
          </p>
          {ok.haul.cells !== undefined && ok.haul.cells !== null ? (
            <p className="gather-muted" data-part="station-haul-route">
              {(ok.haul.toStore ? m.station_haul_route_store : m.station_haul_route_city)({
                cells: ok.haul.cells,
                time: minutesText(ok.haul.tripMs ?? 0),
              })}
              {ok.haul.arriveAtMs !== undefined && ok.haul.arriveAtMs !== null && ok.haul.arriveAtMs > now
                ? ` · ${
                    ok.haul.porterUnitId !== undefined && ok.haul.porterUnitId !== null
                      ? m.station_haul_porter({
                          id: ok.haul.porterUnitId,
                          time: minutesText(ok.haul.arriveAtMs - now),
                        })
                      : m.station_haul_carrying({ time: minutesText(ok.haul.arriveAtMs - now) })
                  }`
                : ""}
            </p>
          ) : null}
          {ok.mine && ok.cityId !== null && ok.storage.goods.length > 0 ? (
            <div className="gather-actions">
              <button type="button" className="button-small" disabled={sending} onClick={haul}>
                {m.station_haul()}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {show("workers") ? (
        <section className="gather-station-part" aria-label={m.station_workers_label()}>
          <p className="gather-station-subtitle">
            {m.station_workers_title({ count: ok.workers.length, slots: ok.slots })}
          </p>
          {ok.workers.length === 0 ? (
            <p className="gather-muted">{m.station_workers_none()}</p>
          ) : (
            <ul className="gather-station-list">
              {ok.workers.map((worker) => (
                <li
                  key={worker.unitId}
                  className="gather-station-worker"
                  data-state={worker.state}
                  data-unit={worker.unitId}
                >
                  <span>
                    {m.station_worker_line({ id: worker.unitId, via: workerViaText(worker) })}
                    {worker.mine ? ` · ${m.station_worker_mine()}` : ""}
                    {" · "}
                    <strong>{workerStateText(worker.state, kind)}</strong>
                    <span className="gather-muted">
                      {" · "}
                      {m.station_worker_lots({
                        lots: worker.lots,
                        fatigue: worker.fatigue,
                        max: ok.fatigueMax,
                      })}
                      {worker.rest ? ` · ${restText(worker.rest)}` : ""}
                    </span>
                  </span>
                  {worker.mine && worker.via === "assign" ? (
                    <button
                      type="button"
                      className="button-small"
                      disabled={sending}
                      onClick={() => unassign(worker.unitId)}
                    >
                      {m.station_unassign()}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="gather-muted">
            {ok.kind === "objects" ? m.station_workers_note() : m.station_workers_note_facility()}
          </p>
          {ok.workers.some((worker) => worker.rest) ? (
            <p className="gather-muted" data-part="station-rest-hint">
              {m.station_rest_hint()}
            </p>
          ) : null}
          <div className="gather-actions">
            {ok.mine && ok.level >= 1 ? (
              <button
                type="button"
                className="button-small button-primary"
                disabled={sending || actor === null || full}
                onClick={() => {
                  if (actor !== null) assign(actor);
                }}
              >
                {m.station_assign()}
              </button>
            ) : null}
            {ok.kind === "objects" ? (
              <button
                type="button"
                className="button-small"
                disabled={sending || actor === null || !target}
                onClick={gatherHere}
              >
                {m.station_gather_here()}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {show("upgrade") && (ok.mine || operator) ? (
        <section className="gather-station-part" aria-label={m.station_upgrade_title()}>
          <p className="gather-station-subtitle">{m.station_upgrade_title()}</p>
          {upgrading ? (
            <p>{m.station_upgrading({ time: formatDuration((ok.upgradingUntilMs ?? now) - now) })}</p>
          ) : ok.upgrade ? (
            <>
              <p className="gather-muted">
                {m.station_upgrade_cost({
                  materials: ok.upgrade.materials
                    .map((stack) =>
                      m.station_upgrade_material({
                        name: nameText(stack.name, stack.item),
                        have: qtyOf(String(stack.have)),
                        qty: qtyOf(String(stack.qty)),
                      }),
                    )
                    .join(" · "),
                })}
              </p>
              {ok.upgrade.buffs ? (
                <p className="gather-muted">{nextLevelText(ok.upgrade.level, ok.upgrade.buffs)}</p>
              ) : null}
              <div className="gather-actions">
                <button
                  type="button"
                  className="button-small"
                  disabled={sending || !affordable}
                  onClick={upgrade}
                >
                  {m.station_upgrade_button({
                    level: ok.upgrade.level,
                    time: formatDuration(ok.upgrade.timeMs),
                  })}
                </button>
              </div>
            </>
          ) : ok.level >= ok.maxLevel ? (
            <p className="gather-muted">{m.station_upgrade_max()}</p>
          ) : null}
          {plots ? (
            <StationPlots
              plots={plots}
              now={now}
              sending={sending}
              operator={operator}
              send={(command) => sendPlot(command)}
            />
          ) : null}
        </section>
      ) : null}
      {show("summary") ? (
        <div className="gather-actions">
          <button
            type="button"
            className="button-small"
            onClick={() => navigate({ route: "economy_production" })}
          >
            {m.station_open_economy()}
          </button>
        </div>
      ) : null}
    </div>
  );
}

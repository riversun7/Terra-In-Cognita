// 2차맵 채집·들어가기 판 — docs/adr/2026-11-07-gather-objects.md 6절, 사용자 지적(2026-11-07) 문제 2·3. 모바일 우선:
// - 오브젝트를 누르면(표시 단추·둘레 땅) 아래 작은 판: 이름·나오는 것·남은 번수(떨어졌으면 다시 자라는 시간)·맡는 시설 → [채집]·[정보]·[닫기].
// - 건물을 누르면: 이름·레벨·내 것인가·들어가면 하는 일·안에 있는 유닛 → [들어가기]·[닫기].
// - 보내는 유닛 = 화면이 정한 명령 유닛 하나(anchorUnit.ts commandUnit — 아래 안내 줄의 고른 유닛, 남의 유닛이면 기준 유닛, 없으면 내 사이보그).
//   이름은 안내 줄과 같은 이름(mapUnits.ts unitLabel, 사용자 지적 2026-11-09 문제3). 남의 유닛이면 서버가 forbidden — 그 까닭을 보인다.
// - 내 유닛의 채집 줄 한 줄(단계·화물·넣는 곳·끝난 까닭) + [멈추기].
// - 건물이 채집소(벌목장·광산·농장)면 건물 판 안에 채집소 판(StationPanel.tsx — 사용자 지적 2026-11-08 "원자재채집소의 기능도 필요").
// - 건물 한 번 누르기 = 판 하나(사용자 지적 2026-11-09 문제4): 행정 건물의 정부 몫(buildingExtra)도 이 건물 판 안에 넣고, 판이 열린 동안은
//   채집 줄을 숨긴다(닫으면 다시 보인다).
// 자료는 gatherState(React 밖)에 두고 판 번호를 구독한다. 바꾸는 명령은 WebSocket(gatherCommands.ts)이다.
import type { GatherBuildingResponse, GatherLoopView } from "@terra/shared/gather";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { type GatherOutcome, sendGatherCommand } from "./gatherCommands.ts";
import {
  LOOPS_IDLE_POLL_MS,
  LOOPS_POLL_MS,
  OBJECTS_POLL_MS,
  depositText,
  enterText,
  gatherErrorText,
  kgText,
  loadGatherBuilding,
  loadGatherLoops,
  loadGatherObjects,
  minutesText,
  nameText,
  phaseText,
  stopText,
} from "./gatherData.ts";
import type { GatherState } from "./gatherState.ts";
import { StationPanel } from "./StationPanel.tsx";
import "./gather.css";

/** 명령 안내를 지우기까지(ms) */
const NOTICE_MS = 6_000;

interface GatherPanelProps {
  readonly state: GatherState;
  readonly mapKey: number;
  /** 명령을 받을 유닛(화면이 정한다 — anchorUnit.ts commandUnit, 없으면 null) */
  readonly actor: number | null;
  /** 유닛 이름(아래 안내 줄과 같은 이름 — mapUnits.ts unitLabel) */
  readonly unitLabel: (unitId: number) => string;
  /** 건물 판 안에 더 넣을 몫(행정 건물의 정부 몫 — 누른 건물 하나에 판 하나) */
  readonly buildingExtra?: ReactNode;
}

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 한 줄로 보일 내 채집: 고른 유닛의 줄, 없으면 진행 중인 첫 줄, 없으면 가장 최근 끝난 줄 */
function loopFor(
  loops: readonly GatherLoopView[],
  mapKey: number,
  unitId: number | null,
): GatherLoopView | null {
  const here = loops.filter((loop) => loop.mapKey === mapKey);
  return (
    here.find((loop) => loop.unitId === unitId) ??
    here.find((loop) => loop.phase !== "done") ??
    here.toSorted((a, b) => b.updatedAt - a.updatedAt)[0] ??
    null
  );
}

function loopText(loop: GatherLoopView): string {
  if (loop.phase === "done") {
    if (loop.enterResult) return enterText(loop.enterResult, loop.depositedUnits);
    return loop.stop ? stopText(loop.stop) : phaseText(loop.phase);
  }
  if (loop.kindId === null) return phaseText(loop.phase);
  return m.gather_loop_line({
    phase: phaseText(loop.phase),
    kg: kgText(loop.carriedGrams),
    max: kgText(loop.capacityGrams),
  });
}

export function GatherPanel({ state, mapKey, actor, unitLabel, buildingExtra }: GatherPanelProps) {
  const version = useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => state.version,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [building, setBuilding] = useState<GatherBuildingResponse | null>(null);
  const [sending, setSending] = useState(false);
  const sheet = state.sheet;

  // 오브젝트: 열 때와 OBJECTS_POLL_MS마다
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      try {
        const response = await loadGatherObjects(mapKey);
        if (!stopped && response.status === "ok") state.setObjects(response);
      } catch {
        // 다음 차례에 다시 묻는다
      }
      if (!stopped) timer = setTimeout(() => void tick(), OBJECTS_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state, mapKey]);

  // 내 채집 줄: 진행 중이면 LOOPS_POLL_MS, 아니면 LOOPS_IDLE_POLL_MS마다
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      let active = false;
      try {
        const response = await loadGatherLoops();
        if (!stopped && response.status === "ok") {
          state.setLoops(response.loops);
          active = response.loops.some((loop) => loop.phase !== "done");
        }
      } catch {
        // 다음 차례에 다시 묻는다
      }
      if (!stopped) timer = setTimeout(() => void tick(), active ? LOOPS_POLL_MS : LOOPS_IDLE_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state]);

  // 건물 판: 고른 건물 자료
  const buildingId = sheet?.kind === "building" ? sheet.id : null;
  useEffect(() => {
    if (buildingId === null) return () => undefined;
    const controller = new AbortController();
    loadGatherBuilding(buildingId, controller.signal)
      .then((response) => setBuilding(response))
      .catch(() => setBuilding(null));
    return () => controller.abort();
  }, [buildingId]);

  // 안내는 잠시 보이고 지운다
  useEffect(() => {
    if (notice === null) return () => undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = async (): Promise<void> => {
    try {
      const [objects, loops] = await Promise.all([loadGatherObjects(mapKey), loadGatherLoops()]);
      if (objects.status === "ok") state.setObjects(objects);
      if (loops.status === "ok") state.setLoops(loops.loops);
    } catch {
      // 다음 차례에 다시 묻는다
    }
  };

  const send = async (run: () => Promise<GatherOutcome>): Promise<void> => {
    setSending(true);
    const outcome = await run();
    setSending(false);
    setNotice(outcome.ok ? m.gather_sent() : gatherErrorText(outcome.code));
    if (outcome.ok) state.open(null);
    await refresh();
  };

  const loop = loopFor(state.loops, mapKey, actor);
  const object = sheet?.kind === "object" ? state.objectById(sheet.id) : undefined;
  const kind = object ? state.kinds[object.kind] : undefined;
  const now = serverNow();
  const depleted = object !== undefined && object.usesLeft <= 0 && object.regrowAtMs > now;
  const actorText = actor === null ? m.gather_actor_none() : m.gather_actor_unit({ unit: unitLabel(actor) });

  return (
    <div
      className="gather-panel"
      data-sheet={sheet?.kind ?? "none"}
      data-objects={state.objects.length}
      data-version={version}
    >
      {loop && sheet === null ? (
        <div
          className="map-panel gather-loop"
          role="status"
          data-phase={loop.phase}
          data-stop={loop.stop ?? undefined}
          data-unit={loop.unitId}
        >
          <p>
            {unitLabel(loop.unitId)} · {loopText(loop)}
          </p>
          {loop.phase !== "done" && loop.deposit ? (
            <p className="gather-muted">{depositText(loop.deposit)}</p>
          ) : null}
          {loop.phase !== "done" && loop.kindId !== null ? (
            <button
              type="button"
              className="button-small gather-stop"
              disabled={sending}
              onClick={() => void send(() => sendGatherCommand({ t: "gather_stop", unitId: loop.unitId }))}
            >
              {m.gather_action_stop()}
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className="map-panel gather-notice" role="status">
          {notice}
        </p>
      ) : null}
      {sheet?.kind === "object" && object ? (
        <section
          className="map-panel gather-sheet"
          aria-label={m.gather_sheet_label()}
          data-object={object.id}
          data-state={depleted ? "depleted" : "ready"}
        >
          <h2 className="gather-title">{nameText(kind?.name ?? null, m.gather_object_unknown())}</h2>
          <p>{m.gather_object_item({ item: nameText(kind?.itemName ?? null, kind?.item ?? "") })}</p>
          <p>
            {depleted
              ? m.gather_object_regrow({ time: minutesText(object.regrowAtMs - now) })
              : m.gather_object_uses({ left: object.usesLeft, uses: kind?.uses ?? object.usesLeft })}
          </p>
          <p className="gather-muted">
            {kind?.facility
              ? m.gather_object_facility({ facility: nameText(kind.facilityName, kind.facility) })
              : m.gather_object_direct()}
          </p>
          {details && kind ? (
            <p className="gather-muted gather-details">
              {m.gather_object_details({
                lots: kind.lots,
                seconds: Math.round(kind.workMs / 1000),
                regrow: minutesText(kind.regrowMs),
              })}
            </p>
          ) : null}
          {kind?.direct === false ? <p className="gather-muted">{m.gather_object_station_only()}</p> : null}
          <p className="gather-actor">{actorText}</p>
          <div className="gather-actions">
            <button
              type="button"
              hidden={kind?.direct === false}
              className="button-small button-primary gather-sheet-gather"
              disabled={actor === null || depleted || sending}
              onClick={() => {
                if (actor === null) return;
                void send(() =>
                  sendGatherCommand({ t: "gather_start", unitId: actor, mapKey, objectId: object.id }),
                );
              }}
            >
              {m.gather_action_gather()}
            </button>
            <button
              type="button"
              className="button-small gather-sheet-info"
              aria-pressed={details}
              onClick={() => setDetails(!details)}
            >
              {m.gather_action_info()}
            </button>
            <button
              type="button"
              className="button-small gather-sheet-close"
              onClick={() => state.open(null)}
            >
              {m.gather_action_close()}
            </button>
          </div>
        </section>
      ) : null}
      {sheet?.kind === "building" ? (
        <section
          className="map-panel gather-sheet gather-sheet-scroll"
          aria-label={m.gather_building_label()}
          data-building={sheet.id}
        >
          <h2 className="gather-title">
            {nameText(building?.name ?? null, m.gather_building_unknown())}
            {building && building.level > 0 ? ` · ${m.gather_building_level({ level: building.level })}` : ""}
          </h2>
          {building?.status === "ok" ? (
            <>
              <p className="gather-muted">
                {building.mine ? m.gather_building_mine() : m.gather_building_other()}
              </p>
              <p>
                {building.accepts
                  ? m.gather_building_accepts()
                  : building.hires
                    ? m.gather_building_hires()
                    : m.gather_building_stays()}
              </p>
              <p className="gather-inside-title">{m.gather_building_inside()}</p>
              {building.inside.length === 0 ? (
                <p className="gather-muted">{m.gather_building_inside_none()}</p>
              ) : (
                <ul className="gather-inside">
                  {building.inside.map((unit) => (
                    <li key={unit.unitId} data-unit={unit.unitId} data-via={unit.via}>
                      {unit.via === "work"
                        ? m.gather_building_inside_work({ id: unit.unitId })
                        : m.gather_building_inside_unit({ id: unit.unitId })}
                      {unit.own ? ` · ${m.gather_building_inside_own()}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {buildingExtra}
          <StationPanel
            state={state}
            mapKey={mapKey}
            buildingId={sheet.id}
            actor={actor}
            notify={setNotice}
          />
          <p className="gather-actor">{actorText}</p>
          <div className="gather-actions">
            <button
              type="button"
              className="button-small button-primary gather-sheet-enter"
              disabled={actor === null || sending}
              onClick={() => {
                if (actor === null) return;
                void send(() => sendGatherCommand({ t: "unit_enter", unitId: actor, buildingId: sheet.id }));
              }}
            >
              {m.gather_action_enter()}
            </button>
            <button
              type="button"
              className="button-small gather-sheet-close"
              onClick={() => state.open(null)}
            >
              {m.gather_action_close()}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

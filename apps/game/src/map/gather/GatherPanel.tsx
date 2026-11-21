// 2차맵 채집·들어가기 판 — docs/adr/2026-11-07-gather-objects.md 6절, 사용자 지적(2026-11-07) 문제 2·3. 모바일 우선:
// - 오브젝트를 누르면(표시 단추·둘레 땅) 아래 작은 판: 이름·나오는 것·남은 번수(떨어졌으면 다시 자라는 시간)·맡는 시설 → [채집]·[정보]·[닫기].
// - 건물을 누르면: 건물 판(building/BuildingPanel.tsx — 머리 이름표·칸·관리·장부·지분, 2026-11-15 개편) → [들어가기]·[닫기].
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
  loopPhaseText,
  phaseText,
  stopText,
} from "./gatherData.ts";
import type { GatherState } from "./gatherState.ts";
import { BuildingPanel } from "../building/BuildingPanel.tsx";
import { boatGatherOf } from "../boats/boatText.ts";
import { GatherMeters } from "./GatherMeters.tsx";
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
  /** 명령 유닛이 배에 탔나(배에서 캐기 — 기획 D-541 1280 가). 없으면 false */
  readonly actorAboard?: boolean;
  /** 운영자 모드(건물 판 관리 칸 — 남의 건물도, 서버가 다시 본다) */
  readonly operator?: boolean;
  /** 건물 ID → 이름(들어가는 줄에 붙인다, 모르면 null) */
  readonly buildingName?: ((buildingId: number) => string | null) | undefined;
}
const noName = (): null => null;

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

function loopText(loop: GatherLoopView, buildingName: (buildingId: number) => string | null): string {
  if (loop.phase === "done") {
    if (loop.enterResult) return enterText(loop.enterResult, loop.depositedUnits);
    return loop.stop ? stopText(loop.stop) : phaseText(loop.phase);
  }
  if (loop.kindId === null) return loopPhaseText(loop, buildingName);
  return m.gather_loop_line({
    phase: loopPhaseText(loop, buildingName),
    kg: kgText(loop.carriedGrams),
    max: kgText(loop.capacityGrams),
  });
}

export function GatherPanel({
  state,
  mapKey,
  actor,
  unitLabel,
  buildingExtra,
  actorAboard = false,
  operator = false,
  buildingName = noName,
}: GatherPanelProps) {
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
    // 보낸 것은 채집 줄(아래 한 줄)이 바로 알린다 — "보냈습니다"를 따로 띄우지 않고, 실패 까닭만 잠깐 띄운다
    setNotice(outcome.ok ? null : gatherErrorText(outcome.code));
    if (outcome.ok) state.open(null);
    await refresh();
  };

  const loop = loopFor(state.loops, mapKey, actor);
  const object = sheet?.kind === "object" ? state.objectById(sheet.id) : undefined;
  const kind = object ? state.kinds[object.kind] : undefined;
  const now = serverNow();
  const depleted = object !== undefined && object.usesLeft <= 0 && object.regrowAtMs > now;
  const afloat = boatGatherOf(kind, object?.route !== undefined, actorAboard);
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
          {/* 고른 유닛의 줄이면 이름은 아래 안내 줄에 있으니 빼고 할 일만(중복 줄이기) */}
          <p>
            {loop.unitId === actor
              ? loopText(loop, buildingName)
              : `${unitLabel(loop.unitId)} · ${loopText(loop, buildingName)}`}
          </p>
          {loop.phase !== "done" ? <GatherMeters loop={loop} now={now} /> : null}
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
          <div className="gather-sheet-head">
            <h2 className="gather-title">{nameText(kind?.name ?? null, m.gather_object_unknown())}</h2>
            <span className="gather-badge" data-state={depleted ? "depleted" : "ready"}>
              {depleted
                ? m.gather_object_regrow({ time: minutesText(object.regrowAtMs - now) })
                : m.gather_object_uses({ left: object.usesLeft, uses: kind?.uses ?? object.usesLeft })}
            </span>
          </div>
          {kind?.ladderName ? (
            <p data-yield="ladder">
              {kind.ladderTiers
                ? m.gather_object_ladder_tiers({
                    ladder: nameText(kind.ladderName, ""),
                    min: kind.ladderTiers.min,
                    max: kind.ladderTiers.max,
                  })
                : m.gather_object_ladder({ ladder: nameText(kind.ladderName, "") })}
            </p>
          ) : kind?.table && kind.table.length > 0 ? (
            <p data-yield="table">
              {m.gather_object_table({
                items: kind.table
                  .map((row) =>
                    m.gather_object_table_row({
                      item: nameText(row.itemName, row.item),
                      pct: row.weightPm / 10,
                    }),
                  )
                  .join(", "),
              })}
            </p>
          ) : (
            <p>{m.gather_object_item({ item: nameText(kind?.itemName ?? null, kind?.item ?? "") })}</p>
          )}
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
          {afloat === "boat_only" ? <p className="gather-muted">{m.gather_object_boat_only()}</p> : null}
          {afloat === "from_boat" ? (
            <p className="gather-muted" data-afloat="from_boat">
              {m.gather_object_from_boat()}
            </p>
          ) : null}
          {afloat === "not_from_boat" ? (
            <p className="gather-muted" data-afloat="not_from_boat">
              {m.gather_object_not_from_boat()}
            </p>
          ) : null}
          <div className="gather-footer">
            <p className="gather-actor">{actorText}</p>
            <div className="gather-actions">
              <button
                type="button"
                hidden={kind?.direct === false || afloat === "boat_only" || afloat === "not_from_boat"}
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
          </div>
        </section>
      ) : null}
      {sheet?.kind === "building" ? (
        <BuildingPanel
          key={sheet.id}
          state={state}
          mapKey={mapKey}
          buildingId={sheet.id}
          building={building}
          reloadBuilding={() => {
            void loadGatherBuilding(sheet.id)
              .then((response) => setBuilding(response))
              .catch(() => undefined);
          }}
          actor={actor}
          actorText={actorText}
          unitLabel={unitLabel}
          extra={buildingExtra}
          operator={operator}
          sending={sending}
          onEnter={() => {
            if (actor === null) return;
            void send(() => sendGatherCommand({ t: "unit_enter", unitId: actor, buildingId: sheet.id }));
          }}
          onLeave={(unitId) => void send(() => sendGatherCommand({ t: "gather_stop", unitId }))}
          onClose={() => state.open(null)}
          notify={setNotice}
        />
      ) : null}
    </div>
  );
}

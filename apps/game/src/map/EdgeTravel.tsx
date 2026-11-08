// 2차맵 화면 [옆 2차맵으로] — 사용자 지적 2026-11-08 "2차맵 넘어서 이동이 되지 않음", docs/adr/2026-11-07-play-flow.md "WP14 2차맵에서 옆 2차맵으로".
// 2차맵 안 이동(move_unit)은 그 2차맵 안에서만 걷는다. 변을 넘는 길은 서버 2차맵 사이 이동(travel_start, WP9 규칙: 변까지 걷고 넘고, 띄우지 않은
// 2차맵은 설 수 없다)이라 이 판이 그 명령을 보낸다(상태를 바꾸는 명령은 WebSocket — AGENTS 4장).
// - 보낼 유닛: 고른 내 유닛, 고르지 않았으면 이 2차맵의 내 사이보그(edgeTravelData.ts edgeUnitOf — 화면이 넘긴다).
// - [옆 2차맵으로] → 변 넷(나침반 이름)마다 서버 확인 단계(world.travelPlan, 그 유닛): 열린 옆 2차맵은 거리·걸리는 시간·[보내기], 열리지 않은
//   2차맵은 까닭(unknown_map — 설 수 없다)과 [1차맵에서 고르기](1차맵 명령 흐름은 열리지 않은 2차맵을 건너뛰어 간다). 직무 중이면 끝난다고 알린다.
// - 변 화살표(덧그림): 유닛이 변 가까이 오면 그 변 위에 단추 — 누르면 같은 판이 그 변을 먼저 보인다.
// - 보낸 뒤: 유닛 머리 위 이름표(옆 2차맵까지 남은 시간)·아래 한 줄(남은 시간·도착 예상·[멈추기]). 넘어가면 짧은 안내 뒤 그 2차맵으로 바꾼다
//   (D-139 — 내 사이보그를 따라 연 화면은 useTravelFollow가 이미 바꾼다). 닿거나 멈추면 그 까닭을 한 줄로.
import { type SecondMapEngine, secondMapPlace } from "@terra/engine";
import type { MapUnit } from "@terra/shared/mapUnits";
import type { WorldTravel, WorldTravelPlan, WorldTravelProblem } from "@terra/shared/worldMap";
import type { TravelResultCode } from "@terra/protocol";
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { type EdgeTarget, edgeTargets, nearestEdge } from "./edgeTravelData.ts";
import { type EdgeOverlayState, attachEdgeOverlay } from "./edgeTravelOverlay.ts";
import { unitName } from "./mapUnits.ts";
import { northOnMap } from "./secondMapCompass.ts";
import { CrossingNotice } from "./SecondMapTravel.tsx";
import { sendTravelCommand } from "./travelCommands.ts";
import {
  TRAVEL_POLL_MS,
  clockText,
  durationText,
  kmText,
  loadTravelPlan,
  loadTravels,
  travelOf,
  travelProblemText,
  travelStopText,
} from "./travelData.ts";
import { formatAtParam } from "./mapTarget.ts";
import "./edgeTravel.css";

/** 넘어갈 때 안내를 보이는 시간(ms, D-139 "화면이 짧게 바뀐다" — useCyborgTravel과 같다) */
const CROSSING_MS = 900;
/** 엔진이 서기를 기다리는 간격(ms, 덧그림을 붙인다 — 화면 효과가 이 판보다 늦게 돈다) */
const ENGINE_WAIT_MS = 200;

type SidePlan =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly plan: WorldTravelPlan }
  | { readonly kind: "problem"; readonly problem: WorldTravelProblem | "unknown" };

interface Sheet {
  readonly unitId: number;
  readonly targets: readonly EdgeTarget[];
  /** 변 화살표로 열었으면 그 옆 2차맵 */
  readonly focus: number | null;
}

interface EdgeTravelProps {
  readonly mapKey: number;
  /** 보낼 유닛(없으면 단추도 없다) */
  readonly unit: MapUnit | null;
  readonly engineRef: RefObject<SecondMapEngine | null>;
  readonly hostRef: RefObject<HTMLDivElement | null>;
  /** 화면이 이미 따라가는 유닛(내 사이보그를 따라 연 화면) — 그 유닛이 넘어가면 이 판은 화면을 바꾸지 않는다 */
  readonly screenFollows: number | null;
}

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 변 이름(나침반, 모르면 차례) */
function sideName(target: EdgeTarget, index: number): string {
  switch (target.compass) {
    case "north":
      return m.map_edge_side_north();
    case "east":
      return m.map_edge_side_east();
    case "south":
      return m.map_edge_side_south();
    case "west":
      return m.map_edge_side_west();
    default:
      return m.map_edge_side_other({ n: index + 1 });
  }
}

/** 보낼 수 없는 까닭: 열리지 않은 옆 2차맵은 "설 수 없다", 나머지는 1차맵 명령 판과 같은 문구 */
function edgeProblemText(
  problem: WorldTravelProblem | TravelResultCode | "offline" | "timeout" | "unknown",
): string {
  if (problem === "unknown_map") return m.map_edge_closed();
  if (problem === "unknown") return m.world_travel_problem_retry();
  return travelProblemText(problem);
}

function sideState(plan: SidePlan | undefined): "loading" | "open" | "closed" | "blocked" {
  if (!plan || plan.kind === "loading") return "loading";
  if (plan.kind === "ready") return "open";
  return plan.problem === "unknown_map" ? "closed" : "blocked";
}

export function EdgeTravel({ mapKey, unit, engineRef, hostRef, screenFollows }: EdgeTravelProps) {
  const titleId = useId();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [plans, setPlans] = useState<ReadonlyMap<number, SidePlan>>(() => new Map());
  const [sent, setSent] = useState<number | null>(null);
  const [travel, setTravel] = useState<WorldTravel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const plansAbort = useRef<AbortController | null>(null);
  const north = useMemo(() => {
    const place = secondMapPlace(mapKey);
    return place ? northOnMap(place) : null;
  }, [mapKey]);
  // 변 화살표의 변들(옆 2차맵·나침반 — 목표 칸은 판을 열 때 지금 자리로 다시 잰다)
  const arrowTargets = useMemo(
    () => (unit ? edgeTargets(mapKey, { x: unit.cellX + 0.5, y: unit.cellY + 0.5 }, north) : []),
    [mapKey, unit, north],
  );
  const going = sent !== null && travel?.state === "going" && travel.unitId === sent ? travel : null;
  const crossedTo = going && !going.hidden && going.mapKey !== mapKey ? going.mapKey : null;
  const showCrossing = crossedTo !== null && sent !== screenFollows;
  const finished = sent !== null && travel !== null && travel.state !== "going" ? travel : null;

  /** 판을 연다: 지금 자리로 변 넷의 목표 칸을 재고 서버 확인 단계를 묻는다 */
  const openSheet = (focus: EdgeTarget | null): void => {
    if (!unit) return;
    const live = engineRef.current?.unitState(unit.unitId) ?? null;
    const targets = edgeTargets(
      mapKey,
      { x: live?.x ?? unit.cellX + 0.5, y: live?.y ?? unit.cellY + 0.5 },
      north,
    );
    plansAbort.current?.abort(new DOMException("edge plans replaced", "AbortError"));
    const controller = new AbortController();
    plansAbort.current = controller;
    setSheet({ unitId: unit.unitId, targets, focus: focus?.mapKey ?? null });
    setNotice(null);
    setPlans(new Map(targets.map((target) => [target.mapKey, { kind: "loading" }] as const)));
    for (const target of targets) {
      loadTravelPlan(
        { mapKey: target.mapKey, x: target.x, y: target.y, unitId: unit.unitId },
        controller.signal,
      ).then(
        (answer) => {
          if (controller.signal.aborted) return;
          const next: SidePlan = answer.plan
            ? { kind: "ready", plan: answer.plan }
            : { kind: "problem", problem: answer.problem ?? "unknown" };
          setPlans((previous) => new Map(previous).set(target.mapKey, next));
        },
        () => {
          if (!controller.signal.aborted)
            setPlans((previous) =>
              new Map(previous).set(target.mapKey, { kind: "problem", problem: "unknown" }),
            );
        },
      );
    }
  };

  const closeSheet = (): void => {
    plansAbort.current?.abort(new DOMException("edge sheet closed", "AbortError"));
    plansAbort.current = null;
    setSheet(null);
  };

  const send = (target: EdgeTarget): void => {
    if (!unit || sending) return;
    const unitId = unit.unitId;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({
      t: "travel_start",
      unitId,
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      kind: "move",
    }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) {
        setNotice(edgeProblemText(outcome.code));
        return;
      }
      closeSheet();
      setTravel(null);
      setSent(unitId);
    });
  };

  const cancel = (): void => {
    if (sent === null || sending) return;
    setSending(true);
    const unitId = sent;
    void sendTravelCommand({ t: "travel_cancel", unitId }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) setNotice(edgeProblemText(outcome.code));
      // 멈춘 상태를 바로 받는다(다음 묻기까지 기다리지 않게)
      loadTravels().then(
        (answer) => {
          if (answer.status === "ready") setTravel(travelOf(answer.travels, unitId));
        },
        () => undefined,
      );
    });
  };

  // 보낸 유닛의 길: 가는 동안 TRAVEL_POLL_MS마다(보낸 뒤 바로 한 번 — sent·travel이 바뀌어 다시 돈다), 끝나면 멈춘다(마지막 상태는 남긴다)
  const stillGoing = sent !== null && (travel === null || travel.state === "going");
  useEffect(() => {
    if (sent === null || !stillGoing) return () => undefined;
    const controller = new AbortController();
    const pull = (): void => {
      loadTravels(controller.signal).then(
        (answer) => {
          if (!controller.signal.aborted && answer.status === "ready")
            setTravel(travelOf(answer.travels, sent));
        },
        () => undefined,
      );
    };
    pull();
    const timer = setInterval(pull, TRAVEL_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort(new DOMException("edge travel poll stopped", "AbortError"));
    };
  }, [sent, stillGoing]);

  // 넘어갔다: 짧은 안내 뒤 그 2차맵의 그 자리로 바꾼다(D-139). 화면이 이미 따라가는 유닛이면 그쪽이 바꾼다
  useEffect(() => {
    if (crossedTo === null || !going || !showCrossing) return () => undefined;
    const at = formatAtParam(going.cellX, going.cellY);
    const timer = setTimeout(
      () => navigate({ route: "map", search: { key: String(crossedTo), at } }, { replace: true }),
      CROSSING_MS,
    );
    return () => clearTimeout(timer);
  }, [crossedTo, going, showCrossing]);

  // 덧그림: 엔진이 서면 붙인다(화면 효과가 엔진을 만든다 — 이 판의 효과가 먼저 돈다)
  const overlay = useRef<EdgeOverlayState>({
    arrows: null,
    chip: null,
    sideName: (target) => sideName(target, 0),
  });
  const openRef = useRef<(target: EdgeTarget) => void>(() => undefined);
  useEffect(() => {
    openRef.current = (target) => openSheet(target);
  });
  useEffect(() => {
    let detach: (() => void) | null = null;
    const tryAttach = (): boolean => {
      const engine = engineRef.current;
      const host = hostRef.current;
      if (!engine || !host) return false;
      detach = attachEdgeOverlay(engine, host, overlay, (target) => openRef.current(target));
      return true;
    };
    if (tryAttach()) return () => detach?.();
    const timer = setInterval(() => {
      if (tryAttach()) clearInterval(timer);
    }, ENGINE_WAIT_MS);
    return () => {
      clearInterval(timer);
      detach?.();
    };
  }, [engineRef, hostRef, overlay, openRef]);
  const chipText = going ? m.map_edge_chip({ duration: durationText(going.arriveAt - serverNow()) }) : null;
  useEffect(() => {
    overlay.current = {
      arrows: unit && !going && sheet === null ? { unitId: unit.unitId, targets: arrowTargets } : null,
      chip: going && chipText !== null ? { unitId: going.unitId, text: chipText } : null,
      sideName: (target) => sideName(target, arrowTargets.indexOf(target)),
    };
    engineRef.current?.requestFrame();
  }, [unit, going, sheet, arrowTargets, chipText, engineRef]);

  const crossing = <CrossingNotice show={showCrossing} />;

  if (going) {
    const offset = serverLink.clockOffsetMs();
    return (
      <>
        {crossing}
        <div
          className="map-panel map-edge-going"
          role="status"
          data-edge="going"
          data-edge-unit={going.unitId}
        >
          <p>
            {m.map_edge_going({
              unit: unit?.unitId === going.unitId ? unitName(unit) : m.map_unit_number({ id: going.unitId }),
              duration: durationText(going.arriveAt - serverNow()),
              time: clockText(going.arriveAt, offset),
            })}
          </p>
          <button type="button" className="button-small map-edge-cancel" disabled={sending} onClick={cancel}>
            {m.world_travel_cancel()}
          </button>
        </div>
      </>
    );
  }

  const open = sheet !== null && unit !== null && sheet.unitId === unit.unitId ? sheet : null;
  if (open && unit) {
    const nearest = nearestEdge(open.targets);
    const states = open.targets.map((target) => sideState(plans.get(target.mapKey)));
    const working = open.targets.some((target) => {
      const plan = plans.get(target.mapKey);
      return plan?.kind === "ready" && plan.plan.working;
    });
    // 판은 화면 아래에 붙는 판으로 지도 화면 밖(문서 끝)에 그린다: 키가 커서 아래 판 줄에 두면 오른쪽 가운데 1·2차맵 전환 단추(shell
    // overlays.css .map-switch, 층 5)에 가린다. 판이 열린 동안은 이 판이 그 단추 위(층 6)다 — 판에 [1차맵에서 고르기]·[닫기]가 있다
    return createPortal(
      <section
        className="map-panel map-edge map-edge-sheet"
        aria-labelledby={titleId}
        data-edge="open"
        data-edge-unit={unit.unitId}
      >
        <h2 id={titleId} className="map-edge-title">
          {m.map_edge_title()}
        </h2>
        <p className="map-edge-unit">{m.map_edge_unit({ unit: unitName(unit) })}</p>
        <ul className="map-edge-sides">
          {open.targets.map((target, index) => {
            const plan = plans.get(target.mapKey);
            const state = states[index] ?? "loading";
            const status =
              plan?.kind === "ready"
                ? m.map_edge_plan({
                    km: kmText(plan.plan.distanceM),
                    duration: durationText(plan.plan.durationMs),
                  })
                : plan?.kind === "problem"
                  ? edgeProblemText(plan.problem)
                  : m.map_edge_planning();
            return (
              <li
                key={target.mapKey}
                className="map-edge-side"
                data-state={state}
                data-side={target.compass ?? `${target.ox},${target.oy}`}
                data-map={target.mapKey}
                data-focus={open.focus === target.mapKey ? "true" : undefined}
              >
                <div className="map-edge-side-text">
                  <span className="map-edge-side-name">
                    {sideName(target, index)}
                    {nearest === target ? (
                      <span className="map-edge-badge">{m.map_edge_nearest()}</span>
                    ) : null}
                  </span>
                  <span className="map-edge-side-state">{status}</span>
                </div>
                {state === "open" ? (
                  <button
                    type="button"
                    className="button-small button-primary map-edge-send"
                    disabled={sending}
                    onClick={() => send(target)}
                  >
                    {m.map_edge_send()}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {working ? <p className="map-edge-note">{m.world_travel_working()}</p> : null}
        {states.includes("closed") ? <p className="map-edge-note">{m.map_edge_closed_hint()}</p> : null}
        {notice ? (
          <p className="map-edge-notice" role="alert">
            {notice}
          </p>
        ) : null}
        <div className="map-edge-actions">
          <button
            type="button"
            className="button-small map-edge-planet"
            onClick={() =>
              navigate({ route: "map_planet", search: { key: String(mapKey) } }, { replace: true })
            }
          >
            {m.map_edge_pick_planet()}
          </button>
          <button type="button" className="button-small map-edge-close" onClick={closeSheet}>
            {m.world_city_close()}
          </button>
        </div>
      </section>,
      document.body,
    );
  }

  if (!unit && !finished && !notice) return crossing;
  return (
    <>
      {crossing}
      <div className="map-actions map-edge-row" data-edge={finished ? finished.state : "idle"}>
        {finished || notice ? (
          <p className="map-panel map-command map-edge-result" role="status">
            {notice ??
              (finished?.state === "arrived"
                ? m.map_edge_arrived()
                : finished?.stop
                  ? travelStopText(finished.stop)
                  : m.world_travel_problem_retry())}
          </p>
        ) : null}
        {unit ? (
          <button type="button" className="button-small map-edge-open" onClick={() => openSheet(null)}>
            {m.map_edge_open()}
          </button>
        ) : null}
      </div>
    </>
  );
}

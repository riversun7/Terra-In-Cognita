// 1차맵 명령 판 — 볼 수 없는 2차맵 도시의 [정찰 보내기]가 여는 1차맵 명령 흐름(기획 60 §4.2 D-6019 "대상 → 명령 → 파티 → 확인 → 확정").
// docs/adr/2026-11-07-play-flow.md "WP7"·"WP9 2차맵 사이 이동", 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제 2차맵을 지나간다)·질문 571 가.
// - 확인: 서버가 정한 길(지나는 2차맵 수·곧은 거리·걸리는 시간·도착 예상, tRPC world.travelPlan). 직무 중이면 떠나면 끝난다고 알린다(582).
// - 확정: WebSocket travel_start(상태를 바꾸는 명령, AGENTS 4장). 가는 중이면 2차맵 몇 번째인지·남은 시간과 [멈추기](travel_cancel).
// - 가는 중인 길은 TRAVEL_POLL_MS마다 다시 묻는다(world.travels). 이 도시의 2차맵에 닿으면 onArrived(화면이 도시 목록·내 자리를 다시 받아
//   [들어가기]를 띄운다 — 시야 규칙 513 다).
// [임시] 보낼 유닛은 내 사이보그 하나(파티 고르기는 유닛 여럿을 보낼 때), 명령은 정찰·이동 둘이고 둘 다 걸어서 간다(정찰의 다른 점은 질문 591).
import type { TravelKind } from "@terra/protocol";
import type {
  WorldMapCity,
  WorldMapFaction,
  WorldPosition,
  WorldTravel,
  WorldTravelPlan,
  WorldTravelProblem,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
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
  travelTarget,
} from "./travelData.ts";
import { cityLabel, factionColor } from "./worldMapData.ts";

interface PlanetCommandPanelProps {
  readonly city: WorldMapCity;
  readonly factions: readonly WorldMapFaction[];
  /** 내 사이보그 자리(없으면 보낼 유닛 없음) */
  readonly me: WorldPosition | null;
  /** 내 사이보그가 이 도시의 2차맵에 닿았다(화면이 도시 목록·내 자리를 다시 받는다) */
  readonly onArrived: () => void;
  readonly onClose: () => void;
}

type PlanState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly plan: WorldTravelPlan }
  | { readonly kind: "problem"; readonly problem: WorldTravelProblem | "unknown" };

/** 판 상태(시험 data-travel): 보낼 유닛 없음·확인 받는 중·보낼 수 있음·보낼 수 없음·가는 중 */
type PanelState = "no_unit" | "loading" | "ready" | "blocked" | "going";

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export function PlanetCommandPanel({ city, factions, me, onArrived, onClose }: PlanetCommandPanelProps) {
  const titleId = useId();
  const noteId = useId();
  const [order, setOrder] = useState<TravelKind>("scout");
  const [plan, setPlan] = useState<PlanState>({ kind: "loading" });
  const [travel, setTravel] = useState<WorldTravel | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const unitId = me?.unitId ?? null;
  // 지난번에 본 이 유닛의 길 상태(가는 중 → 도착을 한 번만 알린다)
  const lastState = useRef<WorldTravel["state"] | null>(null);

  const applyTravels = useCallback(
    (answer: WorldTravelsResponse): void => {
      if (unitId === null) return;
      const mine = travelOf(answer.travels, unitId);
      const arrived = mine?.state === "arrived" && travelTarget(mine) === city.mapKey;
      if (arrived && lastState.current === "going") onArrived();
      lastState.current = mine?.state ?? null;
      setTravel(mine);
    },
    [unitId, city.mapKey, onArrived],
  );

  const applyPlan = useCallback((answer: Awaited<ReturnType<typeof loadTravelPlan>>): void => {
    if (answer.plan) setPlan({ kind: "ready", plan: answer.plan });
    else setPlan({ kind: "problem", problem: answer.problem ?? "unknown" });
  }, []);

  // 확인 단계: 서버가 정한 길(그 도시 시청 칸 둘레까지)
  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    loadTravelPlan({ mapKey: city.mapKey, x: city.cellX, y: city.cellY }, controller.signal).then(
      (answer) => {
        if (!controller.signal.aborted) applyPlan(answer);
      },
      () => {
        if (!controller.signal.aborted) setPlan({ kind: "problem", problem: "unknown" });
      },
    );
    return () => controller.abort(new DOMException("command panel closed", "AbortError"));
  }, [unitId, city.mapKey, city.cellX, city.cellY, applyPlan]);

  // 가는 중인 길: 열 때와 TRAVEL_POLL_MS마다
  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    const pull = (): void => {
      loadTravels(controller.signal).then(
        (answer) => {
          if (!controller.signal.aborted) applyTravels(answer);
        },
        () => undefined,
      );
    };
    pull();
    const timer = setInterval(pull, TRAVEL_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort(new DOMException("command panel closed", "AbortError"));
    };
  }, [unitId, applyTravels]);

  const refresh = (): void => {
    loadTravels().then(applyTravels, () => undefined);
    loadTravelPlan({ mapKey: city.mapKey, x: city.cellX, y: city.cellY }).then(applyPlan, () => undefined);
  };

  const confirm = (): void => {
    if (unitId === null || sending) return;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({
      t: "travel_start",
      unitId,
      mapKey: city.mapKey,
      x: city.cellX,
      y: city.cellY,
      kind: order,
    }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) setNotice(travelProblemText(outcome.code));
      refresh();
    });
  };

  const cancel = (): void => {
    if (unitId === null || sending) return;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({ t: "travel_cancel", unitId }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) setNotice(travelProblemText(outcome.code));
      refresh();
    });
  };

  const going = travel?.state === "going" ? travel : null;
  const goingHere = going !== null && travelTarget(going) === city.mapKey;
  const stoppedHere = travel?.state === "stopped" && travelTarget(travel) === city.mapKey ? travel : null;
  const state: PanelState =
    unitId === null
      ? "no_unit"
      : goingHere
        ? "going"
        : plan.kind === "loading"
          ? "loading"
          : plan.kind === "ready"
            ? "ready"
            : "blocked";
  const offset = serverLink.clockOffsetMs();
  const lines: string[] = [];
  if (state === "going" && going) {
    lines.push(m.world_travel_going({ at: going.leg + 1, total: going.route.length }));
    lines.push(
      m.world_travel_eta({
        duration: durationText(going.arriveAt - serverNow()),
        time: clockText(going.arriveAt, offset),
      }),
    );
  } else if (plan.kind === "ready" && unitId !== null) {
    if (stoppedHere?.stop) lines.push(travelStopText(stoppedHere.stop));
    lines.push(m.world_travel_route({ maps: plan.plan.route.length, km: kmText(plan.plan.distanceM) }));
    lines.push(
      m.world_travel_duration({
        duration: durationText(plan.plan.durationMs),
        time: clockText(plan.plan.arriveAt, offset),
      }),
    );
    if (plan.plan.working) lines.push(m.world_travel_working());
    if (going) lines.push(m.world_travel_replace());
  } else if (plan.kind === "loading" && unitId !== null) {
    lines.push(m.world_travel_planning());
  } else if (plan.kind === "problem" && unitId !== null) {
    lines.push(plan.problem === "unknown" ? m.world_travel_problem_retry() : travelProblemText(plan.problem));
  }

  return (
    <section
      className="map-panel planet-city planet-command"
      aria-labelledby={titleId}
      data-city={city.id}
      data-order={order}
      data-travel={state}
      data-route-maps={plan.kind === "ready" ? plan.plan.route.length : undefined}
      data-travel-leg={going ? going.leg : undefined}
      data-nation={factionColor(factions, city.factionId)}
    >
      <div className="planet-city-head">
        <span className="planet-city-dot" aria-hidden="true" />
        <h2 id={titleId} className="planet-city-name">
          {m.world_command_title()}
        </h2>
      </div>
      <p className="planet-city-nation">{m.world_command_target({ target: cityLabel(factions, city) })}</p>
      <div className="planet-segment" role="group" aria-label={m.world_command_kind_label()}>
        <button
          type="button"
          className="button-small"
          aria-pressed={order === "scout"}
          disabled={state === "going"}
          onClick={() => setOrder("scout")}
        >
          {m.world_command_scout()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={order === "move"}
          disabled={state === "going"}
          onClick={() => setOrder("move")}
        >
          {m.world_command_move()}
        </button>
      </div>
      <p className="planet-city-nation">
        {unitId === null ? m.world_command_party_none() : m.world_command_party_cyborg()}
      </p>
      <div className="planet-command-plan" id={noteId} role="status">
        {lines.map((line, index) => (
          // 같은 문장이 두 번 나올 수 있어 순서도 키에 넣는다
          <p key={`${index}-${line}`}>{line}</p>
        ))}
        {notice ? <p className="planet-command-notice">{notice}</p> : null}
      </div>
      <div className="planet-city-actions">
        {state === "going" ? (
          <button
            type="button"
            className="button-small planet-command-cancel"
            disabled={sending}
            onClick={cancel}
          >
            {m.world_travel_cancel()}
          </button>
        ) : (
          <button
            type="button"
            className="button-small button-primary planet-command-confirm"
            disabled={state !== "ready" || sending}
            aria-describedby={noteId}
            onClick={confirm}
          >
            {m.world_command_confirm()}
          </button>
        )}
        <button type="button" className="button-small" onClick={onClose}>
          {m.world_city_close()}
        </button>
      </div>
    </section>
  );
}

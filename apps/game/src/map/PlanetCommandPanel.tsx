// 1차맵 명령 판 — 도시 판 [정찰 보내기]와 1차맵에서 고른 지역의 [이곳으로 이동]이 여는 1차맵 명령 흐름(기획 60 §4.2 D-6019 "대상 → 명령 →
// 파티 → 확인 → 확정"). 대상은 commandTarget.ts(도시 시청 칸 또는 고른 자리의 2차맵·배치 칸 — 바뀜 2026-11-09, 사용자 요청 "1차맵에서
// 해당지역으로 이동").
// docs/adr/2026-11-07-play-flow.md "WP7"·"WP9 2차맵 사이 이동"·"WP11 이동 2", 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제 2차맵을 지나간다)·
// 질문 571 가·591 나·593 나·594 나.
// - 확인: 서버가 정한 길(지나는 2차맵 수·곧은 거리·걸리는 시간·도착 예상, tRPC world.travelPlan), 건너뛰는 2차맵(593 나), 비용·위험 구간
//   (내가 아는 것만, 594 나). 직무 중이면 떠나면 끝난다고 알린다(582). 정찰·이동의 다른 점을 한 줄로 보인다(591 나).
// - 확정: WebSocket travel_start(상태를 바꾸는 명령, AGENTS 4장). 가는 중이면 2차맵 몇 번째인지(건너뛰는 중·정찰이 돌아오는 중)·남은 시간과
//   [멈추기](travel_cancel).
// - 가는 중인 길은 1차맵 화면이 묻는다(useMyTravel — 가는 동안 내 자리 표시가 따라가고, 이 도시에 닿거나 정찰이 이 도시를 보고 돌아서면
//   화면이 도시 목록·내 자리를 다시 받아 [들어가기]를 띄운다 — 시야 규칙 513 다).
// - 보낼 유닛(바뀜 2026-11-09): 내 사이보그가 있는 2차맵의 내 유닛 가운데 하나(world.mapUnits, 명령할 수 없는 유닛 뺌 — commandTarget.ts
//   sendableUnits). 하나뿐이면 "보낼 유닛: 내 사이보그" 한 줄. 사이보그가 아닌 유닛의 길은 이 판이 묻는다(useMyTravel), 사이보그 길은 화면이 준다.
//   여러 유닛을 한 번에 보내기(파티)는 아직 없다(서버 명령이 유닛 하나).
import type { TravelKind } from "@terra/protocol";
import type { MapUnit } from "@terra/shared/mapUnits";
import type {
  WorldMapFaction,
  WorldPosition,
  WorldTravel,
  WorldTravelPlan,
  WorldTravelProblem,
} from "@terra/shared/worldMap";
import { useCallback, useEffect, useId, useState } from "react";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { type CommandTarget, sendableUnits } from "./commandTarget.ts";
import { loadMapUnits, sortMapUnits, unitName } from "./mapUnits.ts";
import { sendTravelCommand } from "./travelCommands.ts";
import {
  type PlanLine,
  clockText,
  dangerLines,
  durationText,
  goingText,
  kmText,
  loadTravelPlan,
  travelProblemText,
  travelStopText,
  travelTarget,
} from "./travelData.ts";
import { useMyTravel } from "./useMyTravel.ts";
import { factionColor } from "./worldMapData.ts";

interface PlanetCommandPanelProps {
  /** 대상(도시 또는 고른 지역 — commandTarget.ts). 바뀌면 화면이 판을 새로 만든다(key) */
  readonly target: CommandTarget;
  readonly factions: readonly WorldMapFaction[];
  /** 내 사이보그 자리(없으면 보낼 유닛 없음). 보낼 유닛 목록은 이 2차맵에서 고른다 */
  readonly me: WorldPosition | null;
  /** 내 사이보그의 길(1차맵 화면이 묻는다, useMyTravel) */
  readonly travel: WorldTravel | null;
  /** 명령 뒤 길을 다시 묻게 한다 */
  readonly onTravelChanged: () => void;
  readonly onClose: () => void;
  /**
   * 운영자 모드(dev·admin + 기기 기억 — 기획 D-560 1239): [텔레포트]로 걷지 않고 바로 옮긴다(travel_start teleport). 권한은 서버가 다시 본다
   */
  readonly operator?: boolean | undefined;
}

/** 확인 단계 답. unit = 그 답을 물은 유닛(유닛을 바꾸면 새 답이 올 때까지 받는 중으로 본다) */
type PlanState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly unit: number; readonly plan: WorldTravelPlan }
  | { readonly kind: "problem"; readonly unit: number; readonly problem: WorldTravelProblem | "unknown" };

const LOADING: PlanState = { kind: "loading" };

/** 판 상태(시험 data-travel): 보낼 유닛 없음·확인 받는 중·보낼 수 있음·보낼 수 없음·가는 중 */
type PanelState = "no_unit" | "loading" | "ready" | "blocked" | "going";

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 이 2차맵으로 가는(정찰이면 이 2차맵을 보고 돌아오는) 길인가 */
function aboutMap(travel: WorldTravel, mapKey: number): boolean {
  return travelTarget(travel) === mapKey || travel.scoutedMapKey === mapKey;
}

/** 사이보그가 아닌 유닛 길 알림은 쓰지 않는다(도시 목록·내 자리 다시 받기는 내 사이보그 길만) */
const ignoreTravelEvent = (): void => undefined;

export function PlanetCommandPanel({
  target,
  factions,
  me,
  travel,
  onTravelChanged,
  onClose,
  operator = false,
}: PlanetCommandPanelProps) {
  const titleId = useId();
  const noteId = useId();
  const partyId = useId();
  // 도시: 볼 수 있으면 이동, 볼 수 없으면 정찰이 먼저(513·WP14). 고른 지역: 이동이 먼저
  const [order, setOrder] = useState<TravelKind>(target.order);
  const [answered, setPlan] = useState<PlanState>(LOADING);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 보낼 수 있는 내 유닛(내 사이보그가 있는 2차맵, 받기 전 null)과 고른 유닛(null = 내 사이보그)
  const [units, setUnits] = useState<readonly MapUnit[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const cyborgId = me?.unitId ?? null;
  const myMapKey = me?.mapKey ?? null;
  const unitId = cyborgId === null ? null : (chosen ?? cyborgId);
  // 사이보그가 아닌 유닛을 고르면 그 유닛의 길을 이 판이 묻는다
  const other = useMyTravel(unitId !== cyborgId ? unitId : null, ignoreTravelEvent);
  const travelOfUnit = unitId === cyborgId ? travel : other.travel;
  const refreshOther = other.refresh;

  // 보낼 유닛 목록: 판을 열 때 한 번(내 사이보그 2차맵의 내 유닛). 실패하면 내 사이보그만
  useEffect(() => {
    if (myMapKey === null) return () => undefined;
    const controller = new AbortController();
    loadMapUnits(myMapKey, controller.signal).then(
      (answer) => {
        if (!controller.signal.aborted && answer.status === "ready")
          setUnits(sendableUnits(sortMapUnits(answer.units)));
      },
      () => undefined,
    );
    return () => controller.abort(new DOMException("command panel closed", "AbortError"));
  }, [myMapKey]);

  const applyPlan = useCallback((unit: number, answer: Awaited<ReturnType<typeof loadTravelPlan>>): void => {
    if (answer.plan) setPlan({ kind: "ready", unit, plan: answer.plan });
    else setPlan({ kind: "problem", unit, problem: answer.problem ?? "unknown" });
  }, []);

  // 서버 확인 단계 입력(사이보그면 unitId를 넣지 않는다 — 서버가 내 사이보그 본체로 본다)
  const planInput = useCallback(
    (id: number) => ({
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      ...(id === cyborgId ? {} : { unitId: id }),
    }),
    [target.mapKey, target.x, target.y, cyborgId],
  );

  // 확인 단계: 서버가 정한 길(도시면 시청 칸, 고른 지역이면 고른 배치 칸 둘레까지). 유닛을 바꾸면 다시 묻는다
  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    loadTravelPlan(planInput(unitId), controller.signal).then(
      (answer) => {
        if (!controller.signal.aborted) applyPlan(unitId, answer);
      },
      () => {
        if (!controller.signal.aborted) setPlan({ kind: "problem", unit: unitId, problem: "unknown" });
      },
    );
    return () => controller.abort(new DOMException("command panel closed", "AbortError"));
  }, [unitId, planInput, applyPlan]);

  const refresh = (): void => {
    onTravelChanged();
    refreshOther();
    if (unitId === null) return;
    const unit = unitId;
    loadTravelPlan(planInput(unit)).then(
      (answer) => applyPlan(unit, answer),
      () => undefined,
    );
  };

  const confirm = (): void => {
    if (unitId === null || sending) return;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({
      t: "travel_start",
      unitId,
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      kind: order,
    }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) setNotice(travelProblemText(outcome.code));
      refresh();
    });
  };

  /** 운영자 텔레포트(D-560 1239): 길 없이 목적 칸 둘레로 바로 옮긴다(가던 길은 버린다) */
  const teleport = (): void => {
    if (unitId === null || sending) return;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({
      t: "travel_start",
      unitId,
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      kind: "move",
      teleport: true,
    }).then((outcome) => {
      setSending(false);
      setNotice(outcome.ok ? m.world_command_teleported() : travelProblemText(outcome.code));
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

  // 지금 고른 유닛의 답만 쓴다(유닛을 바꾼 직후 = 받는 중)
  const plan = answered.kind !== "loading" && answered.unit === unitId ? answered : LOADING;
  const going = travelOfUnit?.state === "going" ? travelOfUnit : null;
  const goingHere = going !== null && aboutMap(going, target.mapKey);
  const stoppedHere =
    travelOfUnit?.state === "stopped" && aboutMap(travelOfUnit, target.mapKey) ? travelOfUnit : null;
  const backHere = travelOfUnit?.state === "arrived" && travelOfUnit.scoutedMapKey === target.mapKey;
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
  const lines: (string | PlanLine)[] = [];
  if (state === "going" && going) {
    lines.push(goingText(going));
    lines.push(
      m.world_travel_eta({
        duration: durationText(going.arriveAt - serverNow()),
        time: clockText(going.arriveAt, offset),
      }),
    );
  } else if (plan.kind === "ready" && unitId !== null) {
    if (stoppedHere?.stop) lines.push(travelStopText(stoppedHere.stop));
    if (backHere) lines.push(m.world_travel_returned());
    lines.push(m.world_travel_route({ maps: plan.plan.route.length, km: kmText(plan.plan.distanceM) }));
    lines.push(
      m.world_travel_duration({
        duration: durationText(plan.plan.durationMs),
        time: clockText(plan.plan.arriveAt, offset),
      }),
    );
    if (plan.plan.hiddenMaps > 0) lines.push(m.world_travel_hidden_maps({ count: plan.plan.hiddenMaps }));
    if (plan.plan.opensMap) lines.push(m.world_travel_opens_map());
    lines.push(...dangerLines(plan.plan, factions));
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
      data-city={target.cityId ?? undefined}
      data-target-map={target.mapKey}
      data-target-at={`${String(target.x)},${String(target.y)}`}
      data-unit={unitId ?? undefined}
      data-units={units?.length}
      data-order={order}
      data-travel={state}
      data-route-maps={plan.kind === "ready" ? plan.plan.route.length : undefined}
      data-dangers={plan.kind === "ready" ? plan.plan.dangers.length : undefined}
      data-hidden-maps={plan.kind === "ready" ? plan.plan.hiddenMaps : undefined}
      data-travel-leg={going ? going.leg : undefined}
      data-returning={going?.returning ? "true" : undefined}
      data-travel-hidden={going?.hidden ? "true" : undefined}
      data-nation={target.factionId === null ? undefined : factionColor(factions, target.factionId)}
    >
      <div className="planet-city-head">
        <span className="planet-city-dot" aria-hidden="true" />
        <h2 id={titleId} className="planet-city-name">
          {m.world_command_title()}
        </h2>
      </div>
      <p className="planet-city-nation">{m.world_command_target({ target: target.label })}</p>
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
      <p className="planet-city-nation planet-command-note">
        {(going && state === "going" ? going.kind : order) === "scout"
          ? m.world_command_scout_note()
          : m.world_command_move_note()}
      </p>
      {unitId !== null && units !== null && units.length > 1 ? (
        <div className="planet-command-party">
          <p id={partyId} className="planet-city-nation">
            {m.world_command_party_label()}
          </p>
          <div className="planet-command-units" role="group" aria-labelledby={partyId}>
            {units.map((unit) => (
              <button
                key={unit.unitId}
                type="button"
                className="button-small planet-command-unit"
                data-unit={unit.unitId}
                aria-pressed={unit.unitId === unitId}
                disabled={sending}
                onClick={() => {
                  setChosen(unit.unitId === cyborgId ? null : unit.unitId);
                  setNotice(null);
                }}
              >
                {unitName(unit)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="planet-city-nation">
          {unitId === null ? m.world_command_party_none() : m.world_command_party_cyborg()}
        </p>
      )}
      <div className="planet-command-plan" id={noteId} role="status">
        {lines.map((line, index) => {
          const text = typeof line === "string" ? line : line.text;
          const danger = typeof line !== "string" && line.danger;
          // 같은 문장이 두 번 나올 수 있어 순서도 키에 넣는다
          return (
            <p key={`${index}-${text}`} className={danger ? "planet-command-danger" : undefined}>
              {text}
            </p>
          );
        })}
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
        {operator && unitId !== null ? (
          <button
            type="button"
            className="button-small map-operator-button planet-command-teleport"
            disabled={sending}
            onClick={teleport}
          >
            {m.world_command_teleport()}
          </button>
        ) : null}
        <button type="button" className="button-small" onClick={onClose}>
          {m.world_city_close()}
        </button>
      </div>
    </section>
  );
}

// 1차맵 화면의 내 사이보그 길(tRPC world.travels) — docs/adr/2026-11-07-play-flow.md "WP11 이동 2".
// - 열 때 한 번 묻고, 가는 중이면 TRAVEL_POLL_MS마다 다시 묻는다(가는 동안 1차맵 내 자리 표시가 따라간다 — WP9은 열 때·도착 때만 받았다).
// - refresh = 명령([확정]·[멈추기]) 뒤 바로 다시 묻기.
// - 가는 중 → 끝(도착·멈춤)이면 ended, 정찰이 목표를 보고 돌아서면 scouted를 한 번 알린다(화면이 도시 목록·내 자리를 다시 받는다).
// 1차맵 명령 판도 이 값을 받는다(따로 묻지 않는다).
import type { WorldPosition, WorldTravel } from "@terra/shared/worldMap";
import { useCallback, useEffect, useRef, useState } from "react";
import { TRAVEL_POLL_MS, loadTravels, travelOf, travelTarget } from "./travelData.ts";

export type MyTravelEvent =
  | { readonly kind: "ended"; readonly travel: WorldTravel | null }
  | { readonly kind: "scouted"; readonly travel: WorldTravel };

export function useMyTravel(
  unitId: number | null,
  onEvent: (event: MyTravelEvent) => void,
): { travel: WorldTravel | null; refresh: () => void } {
  const [travel, setTravel] = useState<WorldTravel | null>(null);
  const last = useRef<WorldTravel | null>(null);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  const pull = useCallback(
    (signal?: AbortSignal): void => {
      if (unitId === null) return;
      loadTravels(signal).then(
        (answer) => {
          if (signal?.aborted) return;
          const next = travelOf(answer.travels, unitId);
          const before = last.current;
          last.current = next;
          setTravel(next);
          if (before?.state !== "going") return;
          if (next?.state !== "going") handler.current({ kind: "ended", travel: next });
          else if (!before.returning && next.returning) handler.current({ kind: "scouted", travel: next });
        },
        () => undefined,
      );
    },
    [unitId],
  );

  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    pull(controller.signal);
    const timer = setInterval(() => {
      if (last.current?.state === "going") pull(controller.signal);
    }, TRAVEL_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort(new DOMException("travel poll stopped", "AbortError"));
    };
  }, [unitId, pull]);

  const refresh = useCallback(() => pull(), [pull]);
  return { travel: unitId === null ? null : travel, refresh };
}

/** 가는 중이면 내 자리 표시를 길의 지금 자리로(1차맵 표시만 — 2차맵 키·칸도 따라간다) */
export function liveMe(me: WorldPosition | null, travel: WorldTravel | null): WorldPosition | null {
  if (!me || travel?.state !== "going" || travel.unitId !== me.unitId) return me;
  return {
    ...me,
    mapKey: travel.mapKey,
    cellX: travel.cellX,
    cellY: travel.cellY,
    latDeg: travel.latDeg,
    lonDeg: travel.lonDeg,
    hidden: travel.hidden,
  };
}

/** 이 길 알림이 그 2차맵 명령 판을 닫게 하나(그 도시에 닿음·정찰이 그 도시를 보고 돌아섬 → 도시 판 [들어가기]) */
export function reachedMap(event: MyTravelEvent): number | null {
  if (event.kind === "scouted") return event.travel.scoutedMapKey;
  return event.travel?.state === "arrived" && !event.travel.returning ? travelTarget(event.travel) : null;
}

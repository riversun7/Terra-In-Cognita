// 내 사이보그의 2차맵 사이 이동 길(tRPC world.travels)을 TRAVEL_POLL_MS마다 다시 묻는 훅 — 2차맵 화면의 가는 중 줄·따라가기(D-139).
// docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동". unitId가 null이면 묻지 않는다(그 2차맵에 내 사이보그가 없었다).
import type { WorldTravel } from "@terra/shared/worldMap";
import { useEffect, useState } from "react";
import { navigate } from "../shell/routerStore.ts";
import { TRAVEL_POLL_MS, loadTravels, travelOf } from "./travelData.ts";

/** 2차맵을 넘을 때 안내를 보이는 시간(ms, D-139 "화면이 짧게 바뀐다") */
const CROSSING_MS = 900;

export function useCyborgTravel(unitId: number | null): WorldTravel | null {
  const [travel, setTravel] = useState<WorldTravel | null>(null);
  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    const pull = (): void => {
      loadTravels(controller.signal).then(
        (answer) => {
          if (!controller.signal.aborted) setTravel(travelOf(answer.travels, unitId));
        },
        () => undefined,
      );
    };
    pull();
    const timer = setInterval(pull, TRAVEL_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort(new DOMException("travel poll stopped", "AbortError"));
    };
  }, [unitId]);
  return unitId === null ? null : travel;
}

/** 그 2차맵으로 바꾼다(바꾸기 — 뒤로 = 지도를 떠남). 키만 넘겨 그 2차맵의 내 사이보그에 카메라를 맞춘다 */
export function openMap(mapKey: number): void {
  navigate({ route: "map", search: { key: String(mapKey) } }, { replace: true });
}

/**
 * 2차맵 화면의 가는 중인 길: going = 내 사이보그가 가는 중인 길, crossedTo = 이 2차맵을 떠나 넘어간 2차맵(아직 이 화면이면).
 * following(기준 유닛이 내 사이보그)이면 넘어갈 때 CROSSING_MS 뒤 onCross(그 2차맵) — 화면이 로딩 없이 넘거나(엔진 rebase) 주소를 바꾼다
 * (D-139, docs/adr/2026-11-08-seamless-second-map.md WP-3). 보통은 이웃 구독이 먼저 사이보그를 보고 넘는다 — 이것은 그다음 길이다
 */
export function useTravelFollow(
  unitId: number | null,
  mapKey: number,
  following: boolean,
  onCross: (mapKey: number) => void = openMap,
): { going: WorldTravel | null; crossedTo: number | null } {
  const travel = useCyborgTravel(unitId);
  const going = travel?.state === "going" ? travel : null;
  // 띄우지 않은 2차맵을 건너뛰는 중이면 따라가지 않는다(열 수 없다 — 다음 띄운 2차맵에 나타나면 그때, WP11 593 나)
  const crossedTo = going !== null && !going.hidden && going.mapKey !== mapKey ? going.mapKey : null;
  useEffect(() => {
    if (crossedTo === null || !following) return () => undefined;
    const timer = setTimeout(() => onCross(crossedTo), CROSSING_MS);
    return () => clearTimeout(timer);
  }, [crossedTo, following, onCross]);
  return { going, crossedTo };
}

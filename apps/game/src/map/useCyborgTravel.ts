// 내 사이보그의 2차맵 사이 이동 길(tRPC world.travels)을 TRAVEL_POLL_MS마다 다시 묻는 훅 — 2차맵 화면의 가는 중 줄·따라가기(D-139).
// 걸어서 넘을 때 안내 판은 띄우지 않는다(사용자 지적 2026-11-11, docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)").
// docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동". unitId가 null이면 묻지 않는다(그 2차맵에 내 사이보그가 없었다).
import type { WorldTravel } from "@terra/shared/worldMap";
import { useEffect, useState } from "react";
import { navigate } from "../shell/routerStore.ts";
import { TRAVEL_POLL_MS, loadTravels, travelOf } from "./travelData.ts";

/** 길 조회 답과 그것을 물은 때(기기 시계 ms) */
interface TravelAnswer {
  readonly travel: WorldTravel | null;
  readonly askedAt: number;
}

const NO_ANSWER: TravelAnswer = { travel: null, askedAt: 0 };

function useTravelAnswer(unitId: number | null): TravelAnswer {
  const [answer, setAnswer] = useState<TravelAnswer>(NO_ANSWER);
  useEffect(() => {
    if (unitId === null) return () => undefined;
    const controller = new AbortController();
    const pull = (): void => {
      const askedAt = Date.now();
      loadTravels(controller.signal).then(
        (reply) => {
          if (!controller.signal.aborted) setAnswer({ travel: travelOf(reply.travels, unitId), askedAt });
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
  return unitId === null ? NO_ANSWER : answer;
}

export function useCyborgTravel(unitId: number | null): WorldTravel | null {
  return useTravelAnswer(unitId).travel;
}

/** 그 2차맵으로 바꾼다(바꾸기 — 뒤로 = 지도를 떠남). 키만 넘겨 그 2차맵의 내 사이보그에 카메라를 맞춘다 */
export function openMap(mapKey: number): void {
  navigate({ route: "map", search: { key: String(mapKey) } }, { replace: true });
}

/**
 * 2차맵 화면의 가는 중인 길: going = 내 사이보그가 가는 중인 길, crossedTo = 이 2차맵을 떠나 넘어간 2차맵(아직 이 화면이면).
 * following(기준 유닛이 내 사이보그)이면 넘어갔을 때 곧바로 onCross(그 2차맵) — 화면이 로딩 없이 넘거나(엔진 rebase) 주소를 바꾼다
 * (D-139, docs/adr/2026-11-08-seamless-second-map.md WP-3). 보통은 이웃 흐름이 먼저 사이보그를 보고 넘는다 — 이것은 그다음 길이다.
 * crossedAt = 화면이 마지막으로 스스로 넘은 때(기기 시계 ms): 그보다 먼저 물은 답은 옛 자리라 넘기 신호로 쓰지 않는다. 전에는 5초마다 묻는
 * 답이 옛 2차맵을 가리키면 0.9초 뒤 떠나온 2차맵으로 되돌아갔다가 다음 답에 다시 넘었다(사용자 지적 2026-11-11 "화면전환의 흔적" —
 * "바뀜 (2026-11-11)"에 잰 값). 안내 판과 0.9초 기다림도 없앴다(걸어서 넘는 동안 화면에 아무것도 뜨지 않는다)
 */
export function useTravelFollow(
  unitId: number | null,
  mapKey: number,
  following: boolean,
  onCross: (mapKey: number) => void = openMap,
  crossedAt?: { readonly current: number },
): { going: WorldTravel | null; crossedTo: number | null } {
  const { travel, askedAt } = useTravelAnswer(unitId);
  const going = travel?.state === "going" ? travel : null;
  // 띄우지 않은 2차맵을 건너뛰는 중이면 따라가지 않는다(열 수 없다 — 다음 띄운 2차맵에 나타나면 그때, WP11 593 나)
  const crossedTo = going !== null && !going.hidden && going.mapKey !== mapKey ? going.mapKey : null;
  useEffect(() => {
    if (crossedTo === null || !following) return;
    // 화면이 넘은 뒤에 물은 답만 믿는다
    if (crossedAt && askedAt <= crossedAt.current) return;
    onCross(crossedTo);
  }, [crossedTo, following, onCross, askedAt, crossedAt]);
  return { going, crossedTo };
}

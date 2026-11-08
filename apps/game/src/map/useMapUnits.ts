// 2차맵의 내 유닛 목록(tRPC world.mapUnits)을 MAP_UNITS_POLL_MS마다 다시 묻는 훅 — docs/adr/2026-11-07-unit-control.md.
// 받지 못하면 앞 목록을 그대로 두고 failed만 켠다(다음 묻기에 다시). 화면을 닫으면 멈춘다.
// 바뀜(기획 답 630~637): 받은 목록을 유닛 화면 차례로 늘어놓고(637 나), 다른 곳 내 유닛 수(632 다)·카메라 범위(630)를 함께 둔다.
import type { MapUnit, MapViewArea } from "@terra/shared/mapUnits";
import { useEffect, useState } from "react";
import { MAP_UNITS_POLL_MS, loadMapUnits, sortMapUnits } from "./mapUnits.ts";

export interface MapUnitsState {
  /** 아직 한 번도 받지 못했으면 null */
  readonly units: readonly MapUnit[] | null;
  /** 마지막 묻기가 실패했다 */
  readonly failed: boolean;
  /** 이 2차맵 밖의 내 유닛 수(받기 전 0) */
  readonly elsewhere: number;
  /** 카메라 범위(받기 전 null — 범위를 걸지 않는다) */
  readonly view: MapViewArea | null;
  /** 이 답의 2차맵(받기 전 null). 옆 2차맵으로 넘은 뒤 새 답이 오기 전에는 옛 2차맵 답이다 — 화면은 지금 2차맵 답만 쓴다 */
  readonly mapKey: number | null;
  /** 마지막으로 받은 목록의 서버 시각(부상 남은 시간 표시, 받기 전 undefined) */
  readonly at?: number | undefined;
}

export const NO_MAP_UNITS: MapUnitsState = {
  units: null,
  failed: false,
  elsewhere: 0,
  view: null,
  mapKey: null,
};
const INITIAL = NO_MAP_UNITS;

export function useMapUnits(mapKey: number): MapUnitsState {
  const [state, setState] = useState<MapUnitsState>(INITIAL);
  useEffect(() => {
    const controller = new AbortController();
    const pull = (): void => {
      loadMapUnits(mapKey, controller.signal).then(
        (answer) => {
          if (controller.signal.aborted) return;
          // 세계가 아직이면(not_ready) 빈 목록으로 보이지 않고 다음 묻기를 기다린다
          if (answer.status === "ready")
            setState({
              units: sortMapUnits(answer.units),
              failed: false,
              elsewhere: answer.elsewhere,
              view: answer.view,
              mapKey,
              at: answer.generatedAt,
            });
        },
        () => {
          if (!controller.signal.aborted) setState((previous) => ({ ...previous, failed: true }));
        },
      );
    };
    pull();
    const timer = setInterval(pull, MAP_UNITS_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort(new DOMException("map units poll stopped", "AbortError"));
    };
  }, [mapKey]);
  return state;
}

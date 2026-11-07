// 2차맵의 내 유닛 목록(tRPC world.mapUnits)을 MAP_UNITS_POLL_MS마다 다시 묻는 훅 — docs/adr/2026-11-07-unit-control.md.
// 받지 못하면 앞 목록을 그대로 두고 failed만 켠다(다음 묻기에 다시). 화면을 닫으면 멈춘다.
import type { MapUnit } from "@terra/shared/mapUnits";
import { useEffect, useState } from "react";
import { MAP_UNITS_POLL_MS, loadMapUnits } from "./mapUnits.ts";

export interface MapUnitsState {
  /** 아직 한 번도 받지 못했으면 null */
  readonly units: readonly MapUnit[] | null;
  /** 마지막 묻기가 실패했다 */
  readonly failed: boolean;
}

const INITIAL: MapUnitsState = { units: null, failed: false };

export function useMapUnits(mapKey: number): MapUnitsState {
  const [state, setState] = useState<MapUnitsState>(INITIAL);
  useEffect(() => {
    const controller = new AbortController();
    const pull = (): void => {
      loadMapUnits(mapKey, controller.signal).then(
        (answer) => {
          if (controller.signal.aborted) return;
          // 세계가 아직이면(not_ready) 빈 목록으로 보이지 않고 다음 묻기를 기다린다
          if (answer.status === "ready") setState({ units: answer.units, failed: false });
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

// 2차맵 화면의 플레이어 카메라 묶기(기획 정리 630) — 1초마다 내 유닛의 지금 자리(엔진)·내 건물·탐사 칸으로 원 목록을 만들고(cameraArea.ts), 바뀌면
// 엔진 setViewArea에 넘긴다. 운영자 모드는 범위 없음. 탐사 칸 비트는 자료 받기(mapFeed)가 엔진에 넣는 것을 옆에서 듣는다(tap) — mapFeed.ts는
// 고치지 않는다. docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)".
import type { SecondMapEngine } from "@terra/engine";
import type { MapUnit, MapViewArea } from "@terra/shared/mapUnits";
import { type RefObject, useEffect, useRef } from "react";
import { areaKey, cameraArea } from "./cameraArea.ts";
import type { FeedSink } from "./feedTypes.ts";

/** 범위를 다시 보는 간격(ms). 유닛이 움직이면 원도 따라간다 */
const AREA_POLL_MS = 1_000;

export function useCameraArea(
  engineRef: RefObject<SecondMapEngine | null>,
  operator: boolean,
  units: readonly MapUnit[] | null,
  view: MapViewArea | null,
  /**
   * 범위를 그대로 둔다(옆 2차맵으로 넘은 직후 — 새 2차맵의 내 유닛 목록을 받기 전). 엔진이 넘을 때 범위를 새 틀로 옮겨 두므로 그동안 한계가
   * 풀리지 않는다(풀리면 가장 멀리 한계가 바뀌어 확대 단계 표시가 깜빡였다, "바뀜 (2026-11-11)")
   */
  hold = false,
): RefObject<(sink: FeedSink) => FeedSink> {
  const exploredRef = useRef<Uint8Array | null>(null);
  // 자료 받기가 엔진에 넣는 탐사 칸을 옆에서 듣는 받는 곳(엔진 효과가 ref로 읽는다 — 늘 같은 함수)
  const tapRef = useRef(
    (sink: FeedSink): FeedSink => ({
      setTerrain: (terrain) => sink.setTerrain(terrain),
      setUnits: (list) => sink.setUnits(list),
      setUnitPath: (id, path) => sink.setUnitPath(id, path),
      setBuildings: (list) => sink.setBuildings(list),
      setExplored: (bits) => {
        exploredRef.current = bits;
        sink.setExplored(bits);
      },
      select: (id) => sink.select(id),
      selected: () => sink.selected(),
    }),
  );
  const latest = useRef({ operator, units, view, hold });
  useEffect(() => {
    latest.current = { operator, units, view, hold };
  }, [operator, units, view, hold]);
  useEffect(() => {
    let lastKey: string | null = null;
    let lastEngine: SecondMapEngine | null = null;
    const update = (): void => {
      const engine = engineRef.current;
      if (!engine) return;
      // 엔진을 새로 만들었으면(카메라 대상이 바뀜) 같은 범위라도 다시 넘긴다
      if (engine !== lastEngine) {
        lastEngine = engine;
        lastKey = null;
      }
      const now = latest.current;
      if (now.hold) return;
      const area = cameraArea({
        operator: now.operator,
        view: now.view,
        units: (now.units ?? []).flatMap((unit) => {
          const state = engine.unitState(unit.unitId);
          return state ? [{ x: state.x, y: state.y }] : [{ x: unit.cellX + 0.5, y: unit.cellY + 0.5 }];
        }),
        explored: exploredRef.current,
      });
      const key = areaKey(area);
      if (key === lastKey) return;
      lastKey = key;
      engine.setViewArea(area);
    };
    update();
    const timer = setInterval(update, AREA_POLL_MS);
    return () => clearInterval(timer);
  }, [engineRef]);
  return tapRef;
}

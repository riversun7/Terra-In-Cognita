// 도시 화면에서 건물 보기 — 사용자 지적 2026-11-12 "도시(… 건물 리스트를 보여주고 빠르게 조회 및 조작할 수있는 큰화면)".
// 줄을 누르면 그 건물 판이 열린다. 운영자 모드(카메라가 묶이지 않는다)면 카메라도 그 건물로 가고(따라가기를 잠시 멈춘다), 판이 닫히거나 다른 판으로
// 바뀌면 기준 유닛 따라가기로 돌아간다. 플레이어 카메라는 늘 내 유닛을 따라가고 그 둘레로 묶인다(docs/adr/2026-11-08-seamless-second-map.md WP-1,
// 기획 정리 630) — 묶인 채 따라가기를 멈추고 옮기면 헤드리스 화면에서 화면 가운데 땅이 비어(캔버스가 투명) 보였다(2026-11-12, 원인 미확인 — 질문 1237).
// 그래서 플레이어는 판만 연다.
import type { SecondMapEngine } from "@terra/engine";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { GatherState } from "./gather/gatherState.ts";
import { buildingCentre } from "./nearby/nearbyData.ts";

/** 건물이 화면 짧은 변에 차지할 몫의 역수(건물 한 변 × 이 값 = 보이는 폭) — 가장 가까운 확대에서는 카메라가 건물 벽 안에 들었다 */
const SPAN_PER_SIZE = 3;
/** 보이는 폭 하한(m) */
const MIN_SPAN_M = 40;

export function useBuildingLook(
  engineRef: RefObject<SecondMapEngine | null>,
  gather: GatherState,
  /** 기준 유닛 따라가기를 다시 켠다(UnitFollow.tsx useAnchorFollow) */
  refollow: () => void,
  /** 배치 칸 한 변(m, 지형 전 0) — 부를 때 읽는다 */
  cellM: () => number,
  /** 카메라를 옮겨도 되나(운영자 모드 — 부를 때 읽는다) */
  free: () => boolean,
): (buildingId: number) => void {
  // 카메라를 옮겨 둔 건물(없으면 null — 따라가는 중)
  const lookingRef = useRef<number | null>(null);
  useEffect(
    () =>
      gather.subscribe(() => {
        const id = lookingRef.current;
        if (id === null) return;
        const sheet = gather.sheet;
        if (sheet?.kind === "building" && sheet.id === id) return;
        lookingRef.current = null;
        refollow();
      }),
    [gather, refollow],
  );
  return useCallback(
    (buildingId: number) => {
      const engine = engineRef.current;
      const building = gather.buildings.find((entry) => entry.id === buildingId);
      if (engine && building && free()) {
        const centre = buildingCentre(building);
        const size = Math.max(building.width, building.depth) * cellM();
        lookingRef.current = buildingId;
        engine.follow(null);
        engine.setView({
          x: centre.x,
          y: centre.y,
          ...(size > 0 ? { spanM: Math.max(MIN_SPAN_M, size * SPAN_PER_SIZE) } : {}),
        });
      }
      gather.open({ kind: "building", id: buildingId });
    },
    [engineRef, gather, cellM, free],
  );
}

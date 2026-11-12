// 도시 화면에서 건물 보기 — 사용자 지적 2026-11-12 "도시(… 건물 리스트를 보여주고 빠르게 조회 및 조작할 수있는 큰화면)".
// 줄을 누르면 카메라가 그 건물로 가고(따라가기를 잠시 멈춘다) 그 건물 판이 열린다. 판이 닫히거나 다른 판으로 바뀌면 기준 유닛 따라가기로 돌아간다
// (플레이어 카메라는 늘 내 유닛을 따라간다 — docs/adr/2026-11-08-seamless-second-map.md WP-1. 건물 판이 열린 동안만 예외).
// 플레이어 카메라 묶기(useCameraArea, 기획 정리 630)는 그대로 걸린다: 묶인 범위 밖 건물이면 카메라는 범위 끝에서 멈추고 판은 열린다.
import type { SecondMapEngine } from "@terra/engine";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { GatherState } from "./gather/gatherState.ts";
import { buildingCentre } from "./nearby/nearbyData.ts";

export function useBuildingLook(
  engineRef: RefObject<SecondMapEngine | null>,
  gather: GatherState,
  /** 기준 유닛 따라가기를 다시 켠다(UnitFollow.tsx useAnchorFollow) */
  refollow: () => void,
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
      if (engine && building) {
        const centre = buildingCentre(building);
        lookingRef.current = buildingId;
        engine.follow(null);
        engine.setView({ x: centre.x, y: centre.y });
      }
      gather.open({ kind: "building", id: buildingId });
    },
    [engineRef, gather],
  );
}

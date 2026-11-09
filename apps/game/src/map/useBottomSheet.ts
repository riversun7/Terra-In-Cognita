// 2차맵 아래 판 자리 하나(사용자 지적 2026-11-09 문제4 "하나의 건물 클릭시 여러개가 다 뜬다", docs/adr/2026-11-08-seamless-second-map.md "바뀜 3"):
// 누른 건물·오브젝트 판 > 내 유닛 목록 > 근처 판 가운데 하나만 보인다(bottomSheetOf). 건물 판이 열리거나 근처 목록을 펼치면 내 유닛 목록을 닫는다.
// 근처 판의 고른 탭(지도 표시)은 다른 판이 그 자리를 쓰는 동안에도 남는다 — [근처]로 다시 연다.
import { useEffect, useState, useSyncExternalStore } from "react";
import { type BottomSheet, bottomSheetOf } from "./anchorUnit.ts";
import type { GatherState } from "./gather/gatherState.ts";
import type { NearbyState } from "./nearby/nearbyState.ts";

export interface BottomSheetControl {
  readonly sheet: BottomSheet;
  /** [내 유닛 N]: 내 유닛 목록을 연다(건물 판을 닫고 근처 목록을 접는다) */
  readonly openUnits: () => void;
  readonly closeUnits: () => void;
  /** [근처]: 근처 판을 다시 보인다(건물 판·내 유닛 목록을 닫는다). 탭이 없으면 유닛 탭 */
  readonly openNearby: () => void;
}

export function useBottomSheet(gather: GatherState, nearby: NearbyState): BottomSheetControl {
  const [unitsOpen, setUnitsOpen] = useState(false);
  const gatherOpen = useSyncExternalStore(
    (listener) => gather.subscribe(listener),
    () => gather.sheet !== null,
  );
  // 구독 알림에서만 바꾼다(효과 안에서 바로 바꾸지 않는다)
  useEffect(() => {
    const offGather = gather.subscribe(() => {
      if (gather.sheet !== null) setUnitsOpen(false);
    });
    const offNearby = nearby.subscribe(() => {
      if (nearby.expanded) setUnitsOpen(false);
    });
    return () => {
      offGather();
      offNearby();
    };
  }, [gather, nearby]);
  return {
    sheet: bottomSheetOf({ gatherOpen, unitsOpen }),
    openUnits: () => {
      nearby.setExpanded(false);
      gather.open(null);
      setUnitsOpen(true);
    },
    closeUnits: () => setUnitsOpen(false),
    openNearby: () => {
      gather.open(null);
      setUnitsOpen(false);
      if (nearby.tab === null) nearby.setTab("units");
      else nearby.setExpanded(true);
    },
  };
}

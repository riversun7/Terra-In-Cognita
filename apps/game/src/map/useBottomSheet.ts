// 2차맵 아래 판 자리 하나(사용자 지적 2026-11-09 문제4 "하나의 건물 클릭시 여러개가 다 뜬다", docs/adr/2026-11-08-seamless-second-map.md "바뀜 3"):
// 누른 건물·오브젝트 판 > 남의 유닛 정보 판 > 내 유닛 목록 > 근처 판 가운데 하나만 보인다(bottomSheetOf). 건물 판이 열리거나 근처 목록을 펼치면
// 내 유닛 목록·정보 판을 닫는다. 근처 판의 고른 탭(지도 표시)은 다른 판이 그 자리를 쓰는 동안에도 남는다 — [근처]로 다시 연다.
// 남의 유닛 작은 창(peek, docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"·"바뀜 (2026-11-10)"): 지도·근처 판에서 남의 유닛을 누르면 연다
// (운영자 모드도). 명령 유닛은 그대로다. 다른 곳을 누르면 닫힌다 — 땅이면 같은 누르기가 명령 유닛을 그곳으로 보낸다.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type BottomSheet, bottomSheetOf } from "./anchorUnit.ts";
import type { GatherState } from "./gather/gatherState.ts";
import type { NearbyState } from "./nearby/nearbyState.ts";

/** 눌러도 작은 창을 닫지 않는 곳: 작은 창 안(그 안에서 연 대화상자 포함)과 지도(엔진이 누르기를 가려 알린다) */
const PEEK_KEEP_SELECTOR = ".map-peek, .map-view";

/** 정보 판으로 보는 남의 유닛(누른 때의 움직임) */
export interface PeekUnit {
  readonly unitId: number;
  readonly moving: boolean;
}

export interface BottomSheetControl {
  readonly sheet: BottomSheet;
  /** 정보 판으로 보는 남의 유닛(닫혀 있으면 null) */
  readonly peek: PeekUnit | null;
  /** [내 유닛 N]: 내 유닛 목록을 연다(건물 판·정보 판을 닫고 근처 목록을 접는다) */
  readonly openUnits: () => void;
  readonly closeUnits: () => void;
  /** [근처]: 근처 판을 다시 보인다(건물 판·정보 판·내 유닛 목록을 닫는다). 탭이 없으면 유닛 탭 */
  readonly openNearby: () => void;
  /** 남의 유닛 정보 판을 연다(건물 판·내 유닛 목록을 닫고 근처 목록을 접는다) */
  readonly openPeek: (unit: PeekUnit) => void;
  readonly closePeek: () => void;
}

export function useBottomSheet(gather: GatherState, nearby: NearbyState): BottomSheetControl {
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [peek, setPeek] = useState<PeekUnit | null>(null);
  const gatherOpen = useSyncExternalStore(
    (listener) => gather.subscribe(listener),
    () => gather.sheet !== null,
  );
  // 구독 알림에서만 바꾼다(효과 안에서 바로 바꾸지 않는다)
  useEffect(() => {
    const offGather = gather.subscribe(() => {
      if (gather.sheet === null) return;
      setUnitsOpen(false);
      setPeek(null);
    });
    const offNearby = nearby.subscribe(() => {
      if (!nearby.expanded) return;
      setUnitsOpen(false);
      setPeek(null);
    });
    return () => {
      offGather();
      offNearby();
    };
  }, [gather, nearby]);
  // 작은 창은 밖을 누르면 닫힌다(사용자 지적 2026-11-10 "다른곳 클릭시 닫기"): 지도 위 누르기는 엔진이 알린다(땅·이웃 땅·빈 곳 → closePeek,
  // 다른 유닛 → 그 유닛 창으로 바꿈 — 끌기·두 손가락은 닫지 않는다). 그 밖(위·아래 판, 단추)은 여기서 닫는다. 누른 단추의 일은 그대로 한다
  // (click을 먼저 보고 닫기만 한다 — pointerdown에 닫으면 판이 다시 놓여 누른 단추가 비켜난다). Esc도 닫는다(열린 대화상자가 없을 때)
  const peekOpen = peek !== null;
  useEffect(() => {
    if (!peekOpen) return () => undefined;
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(PEEK_KEEP_SELECTOR)) return;
      setPeek(null);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && document.querySelector("dialog[open]") === null) setPeek(null);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [peekOpen]);
  // 여닫는 함수는 늘 같다(엔진 콜백이 첫 함수를 붙들어도 된다)
  const actions = useMemo(
    () => ({
      openUnits: () => {
        nearby.setExpanded(false);
        gather.open(null);
        setPeek(null);
        setUnitsOpen(true);
      },
      closeUnits: () => setUnitsOpen(false),
      openNearby: () => {
        gather.open(null);
        setUnitsOpen(false);
        setPeek(null);
        if (nearby.tab === null) nearby.setTab("units");
        else nearby.setExpanded(true);
      },
      openPeek: (unit: PeekUnit) => {
        nearby.setExpanded(false);
        gather.open(null);
        setUnitsOpen(false);
        setPeek(unit);
      },
      closePeek: () => setPeek(null),
    }),
    [gather, nearby],
  );
  return {
    sheet: bottomSheetOf({ gatherOpen, peekOpen: peek !== null, unitsOpen }),
    peek,
    ...actions,
  };
}

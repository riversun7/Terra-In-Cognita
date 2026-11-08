// 2차맵 기준 유닛 따라가기 — docs/adr/2026-11-08-seamless-second-map.md WP-1(자유 시점 없애기). 그 전: docs/adr/2026-11-08-map-input.md 2절.
// - 엔진 카메라가 기준 유닛(anchorUnit.ts chooseAnchor)을 늘 따라간다(engine.follow — 목표점이 그 유닛의 지금 자리로 미끄러진다).
//   한 손가락 끌기는 따라가기를 끊지 않고 카메라를 돌린다(엔진 조작). 그래서 [따라가기] 단추는 없다.
// - 엔진이 setView로 따라가기를 끊으면(onFollowBreak, 아직 받지 못한 유닛 자리로 한 번 옮길 때 등) 곧바로 다시 기준 유닛을 따라간다.
// - 기준 유닛이 없으면(운영자 자유 시점) 따라가지 않는다.
import type { SecondMapEngine } from "@terra/engine";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { reducedMotionList } from "./planetSky.ts";

/** 동작 줄이기면 미끄러지지 않고 바로 붙는다 */
const instant = (): boolean => reducedMotionList()?.matches === true;

/**
 * anchor = 기준 유닛(없으면 null). refollow는 엔진 옵션 onFollowBreak에 넘기고 엔진을 새로 만든 뒤에도 부른다(늘 같은 함수).
 * anchorRef는 엔진·자료 콜백이 읽는다(그리는 중에는 읽지 않는다)
 */
export function useAnchorFollow(
  engineRef: RefObject<SecondMapEngine | null>,
  anchor: number | null,
): { readonly refollow: () => void; readonly anchorRef: RefObject<number | null> } {
  const anchorRef = useRef(anchor);
  useEffect(() => {
    anchorRef.current = anchor;
    engineRef.current?.follow(anchor, { instant: instant() });
  }, [engineRef, anchor]);
  const refollow = useCallback(() => {
    const id = anchorRef.current;
    if (id !== null) engineRef.current?.follow(id, { instant: instant() });
  }, [engineRef]);
  return { refollow, anchorRef };
}

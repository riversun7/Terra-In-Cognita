// 운영자 모드 기억 — 기획 답 631 다(켜고 끄는 단추 + 이 기기에서 마지막 상태를 기억), docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)".
// 기기마다 localStorage에 둔다(보는 사람의 편의 값 — 서버 권한은 따로 본다: 운영자 권한이 없으면 켜진 기억이 있어도 꺼진 채 연다).
// 사생활 창·막힌 저장소에서는 읽기·쓰기가 실패할 수 있다: 그때는 꺼진 채 열고 기억하지 않는다.
import { type RefObject, useRef, useState } from "react";

const STORAGE_KEY = "terra.map.operatorMode";

/** 마지막으로 켠 채였나(읽지 못하면 false) */
export function readOperatorMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** 지금 상태를 기억한다(쓰지 못하면 조용히 넘긴다) */
export function writeOperatorMode(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(STORAGE_KEY, "on");
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // 저장소가 막혀 있다: 다음에 열 때 꺼진 채 연다
  }
}

/**
 * 2차맵 화면의 운영자 모드 상태: allowed(dev·admin)면 기억한 상태로 열고, 바꿀 때 기억하고 onChange(다시 구독 — 전체 보기)를 부른다.
 * ref는 엔진·자료 받기 콜백이 읽는다(그리는 중에는 읽지 않는다)
 */
export function useOperatorMode(
  allowed: boolean,
  onChange: () => void,
): { readonly operator: boolean; readonly operatorRef: RefObject<boolean>; readonly toggle: () => void } {
  const [operator, setOperator] = useState(() => allowed && readOperatorMode());
  const operatorRef = useRef(operator);
  const toggle = (): void => {
    const next = !operatorRef.current;
    operatorRef.current = next;
    setOperator(next);
    writeOperatorMode(next);
    onChange();
  };
  return { operator, operatorRef, toggle };
}

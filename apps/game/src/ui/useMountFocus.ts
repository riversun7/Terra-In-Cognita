// 화면이 바뀌었을 때 초점을 옮긴다 — 읽기 프로그램이 새 화면의 제목(또는 칸)을 읽게 한다.
// 앱을 처음 켤 때는 옮기지 않는다(휴대폰에서 자판이 갑자기 뜨지 않게). enabled는 처음 값만 본다.
// 화면 틀(shell/routeViews.tsx) 안의 화면은 틀이 MountFocusContext로 "앱 안에서 옮겨 연 화면인지"를 준다: 주소로 바로 열거나
// 새로고침해서 그린 화면은 false라 enabled가 true여도 옮기지 않는다(ADR 2026-10-29-app-shell 1절). 틀 밖(로그인 화면들)은
// 기본값 true라 부르는 쪽의 enabled 그대로다.
import { type RefObject, createContext, useContext, useEffect, useRef } from "react";

/** 이 화면을 앱 안에서 옮겨 열었는지(화면 틀이 준다). 기본값 true = 부르는 쪽이 정한다 */
export const MountFocusContext = createContext(true);

export function useMountFocus<T extends HTMLElement>(enabled: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  const openedInApp = useContext(MountFocusContext);
  const pending = useRef(enabled && openedInApp);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const element = ref.current;
    element?.focus();
    // 칸이면 넣은 글을 골라 둔다(다시 입력할 때 바로 고쳐 쓰게)
    if (element instanceof HTMLInputElement) element.select();
  }, []);
  return ref;
}

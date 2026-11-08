// 미디어 쿼리 하나를 듣는 훅(계산식 조각판: 끌기는 마우스 같은 가는 포인터에서만, 뜻 함께 보기 처음 값은 넓은 화면).
// matchMedia가 없거나 던지면 false(모바일 우선: 누르기만, 뜻 숨김).
import { useCallback, useSyncExternalStore } from "react";

function mediaOf(query: string): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
  } catch {
    return null;
  }
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = mediaOf(query);
      media?.addEventListener("change", notify);
      return () => media?.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => mediaOf(query)?.matches ?? false);
}

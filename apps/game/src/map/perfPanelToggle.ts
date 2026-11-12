// 지도 성능 판(fps·p95·메모리…) 켜고 끄기 — 사용자 지적 2026-11-12 "Fast ms 같은 장보창도 토글로해라". 1·2차맵이 같은 값을 쓴다.
// 처음은 꺼짐. 운영 메뉴(OperatorMenu.tsx)의 [성능 표시]로 켜고, 이 기기에서 기억한다(localStorage — 보는 사람의 편의 값).
// 사생활 창·막힌 저장소에서는 읽기·쓰기가 실패할 수 있다: 그때는 꺼진 채 열고 기억하지 않는다(화면은 그대로 바뀐다).
// 성능 보고(telemetry)는 판 보이기와 상관없이 누구나 보낸다(판은 운영진에게만 — MapPerfPanel·PlanetPerfPanel).
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "terra.map.perfPanel";

/** 기억한 값(읽지 못하면 꺼짐) */
export function readPerfPanel(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** 지금 값을 기억한다(쓰지 못하면 조용히 넘긴다) */
export function writePerfPanel(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(STORAGE_KEY, "on");
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // 저장소가 막혀 있다: 다음에 열 때 꺼진 채 연다
  }
}

// 화면이 둘(1·2차맵)이라 값 하나를 함께 본다. 처음 읽기는 쓸 때까지 미룬다(모듈을 불러올 때 저장소를 건드리지 않는다)
let current: boolean | null = null;
const listeners = new Set<() => void>();

const snapshot = (): boolean => {
  if (current === null) current = readPerfPanel();
  return current;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 켜거나 끈다(기억하고 보는 화면에 알린다) */
export function setPerfPanel(on: boolean): void {
  current = on;
  writePerfPanel(on);
  for (const listener of listeners) listener();
}

/** 성능 판을 켰나(처음 꺼짐) */
export function usePerfPanel(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** 시험용: 기억한 값을 다시 읽게 한다 */
export function resetPerfPanelForTest(): void {
  current = null;
}

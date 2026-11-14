// 건축 모드 상태(React 밖 저장소) — 사용자 요청 2026-11-14 "도시 버튼을 통해 2차맵에 건축모드로 진입한다"
// (docs/adr/2026-11-14-second-map-build.md). 2차맵 화면 하나에 하나(SecondaryMapScreen이 만든다). 땅 누르기(useMapEngine onGroundTap)는
// 건축 모드가 켜져 있으면 다른 일(채집 판·이동 명령) 대신 미리보기 자리를 옮긴다.
import type { Rotation } from "./buildModel.ts";
import { nextRotation } from "./buildModel.ts";

export interface BuildModeSnapshot {
  readonly active: boolean;
  /** 고른 시설(팩 ID), 없으면 목록 단계 */
  readonly facility: string | null;
  /** 누른 칸(배치 칸, 소수 그대로 — 왼쪽 위 칸은 크기·회전으로 buildModel.anchorForTap) */
  readonly tap: { readonly x: number; readonly y: number } | null;
  readonly rotation: Rotation;
}

export interface BuildMode {
  readonly snapshot: () => BuildModeSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  open(): void;
  close(): void;
  choose(facility: string | null): void;
  /** 땅을 눌렀다. 건축 모드에서 시설을 골랐으면 자리를 옮기고 true */
  tap(cell: { readonly x: number; readonly y: number }): boolean;
  rotate(): void;
}

const CLOSED: BuildModeSnapshot = { active: false, facility: null, tap: null, rotation: 0 };

export function createBuildMode(): BuildMode {
  let state: BuildModeSnapshot = CLOSED;
  const listeners = new Set<() => void>();
  const set = (next: BuildModeSnapshot): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: () => set({ ...CLOSED, active: true }),
    close: () => set(CLOSED),
    choose: (facility) => set({ ...state, facility, tap: facility === state.facility ? state.tap : null }),
    tap(cell) {
      if (!state.active) return false;
      // 목록 단계에서 땅을 누르면 아무 일도 하지 않는다(채집 판·이동 명령도 열지 않는다)
      if (state.facility !== null) set({ ...state, tap: { x: cell.x, y: cell.y } });
      return true;
    },
    rotate: () => set({ ...state, rotation: nextRotation(state.rotation) }),
  };
}

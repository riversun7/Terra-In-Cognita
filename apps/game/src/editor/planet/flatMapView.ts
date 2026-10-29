// 편집기 평면 미니맵의 크기·보임 상태(DOM 없음) — FlatMap.tsx가 크기 관찰·창 크기마다 잰 값을 넘긴다.
// - 숨겨져 CSS 폭이 0이 되면(접힌 판) 바로 visible = false로 바꾼다. 부품은 그동안 칠하지 않고, 다시 보이면 그때 결과로 한 번 칠한다.
//   그림 버퍼 크기는 그대로 둔다(같은 크기로 다시 보이면 기억한 표를 그대로 쓴다).
// - 처음 잰 값과 숨겼다가 보일 때는 바로 정한다(한 번뿐인 일).
// - 보이는 중에 그림 버퍼 폭이 바뀌면 크기가 멈춘 뒤(FLAT_MAP_RESIZE_SETTLE_MS) 정한다. 창을 끌거나 판 폭이 움직이는 동안
//   프레임마다 픽셀 → 칸 표를 다시 만들지 않으려는 것이다(휴대폰 흉내 CPU 4배에서 표 하나 60~160ms). 그동안 부품은 옛 그림 버퍼를
//   그대로 쓰고(CSS가 늘려 보인다), 누른 곳도 옛 버퍼 기준으로 바꾼다(보이는 그림과 같다).
import { flatMapBackingSize } from "./flatMapRender.ts";

/** 크기가 바뀐 뒤 새 크기로 정하기까지 기다리는 시간(ms) */
export const FLAT_MAP_RESIZE_SETTLE_MS = 150;

/** 미니맵 상태: 그림 버퍼 폭(점, 높이 = 폭 ÷ 2)과 보이는지(CSS 폭 > 0) */
export interface FlatMapView {
  readonly backingWidth: number;
  readonly visible: boolean;
}

/** 잰 뒤 할 일: 바로 바꾼다(now) · 크기가 멈춘 뒤 바꾼다(settle) · 그대로 둔다(keep — 기다리던 바꿈도 버린다) */
export type FlatMapViewChange =
  | { readonly when: "now" | "settle"; readonly view: FlatMapView }
  | { readonly when: "keep" };

/** 잰 CSS 폭(px)·픽셀 비율(상한을 건 값) → 다음 상태 */
export function nextFlatMapView(
  current: FlatMapView | null,
  cssWidth: number,
  pixelRatio: number,
): FlatMapViewChange {
  if (!(cssWidth > 0)) {
    return current?.visible === true
      ? { when: "now", view: { backingWidth: current.backingWidth, visible: false } }
      : { when: "keep" };
  }
  const backingWidth = flatMapBackingSize(cssWidth, pixelRatio).width;
  if (current === null || !current.visible) return { when: "now", view: { backingWidth, visible: true } };
  return backingWidth === current.backingWidth
    ? { when: "keep" }
    : { when: "settle", view: { backingWidth, visible: true } };
}

/** 잰 값을 받아 상태를 정하는 것(기다리는 바꿈은 하나뿐) */
export interface FlatMapViewTracker {
  /** 잰 CSS 폭(px)·픽셀 비율(상한을 건 값). 새 상태는 commit으로 알린다 */
  measure(cssWidth: number, pixelRatio: number): void;
  /** 기다리던 바꿈을 버린다(부품을 닫을 때) */
  dispose(): void;
}

export function createFlatMapViewTracker(
  commit: (view: FlatMapView) => void,
  settleMs: number = FLAT_MAP_RESIZE_SETTLE_MS,
): FlatMapViewTracker {
  // 마지막으로 알린 상태(부품 상태와 같다)
  let applied: FlatMapView | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const apply = (view: FlatMapView): void => {
    applied = view;
    commit(view);
  };
  const cancel = (): void => {
    clearTimeout(pending);
    pending = undefined;
  };
  return {
    measure(cssWidth, pixelRatio) {
      cancel();
      const change = nextFlatMapView(applied, cssWidth, pixelRatio);
      if (change.when === "keep") return;
      const { view } = change;
      if (change.when === "now") {
        apply(view);
        return;
      }
      pending = setTimeout(() => {
        pending = undefined;
        apply(view);
      }, settleMs);
    },
    dispose: cancel,
  };
}

// 끌어 옮기기 — 편집 시트의 카드 줄을 손잡이로 끌어 옮긴다. 같은 일을 단추(↑·↓·맨 위로)로도 하는 보조 동작이다
// (WCAG 2.2 2.5.7, ADR 2026-10-29-app-shell 10절). 새 의존성 없이 Pointer Events로 직접 만든다.
// - 손잡이만 끌린다(touch-action: none, 44px). 줄의 나머지는 시트 스크롤 그대로다.
// - setPointerCapture로 손가락이 손잡이 밖으로 나가도 계속 받는다. 움직임은 requestAnimationFrame으로 묶어 한 프레임에 한 번 그린다.
// - 끄는 동안의 상태는 ref에 둔다(실시간 갱신으로 다시 그려도 끌기가 끊기지 않게). 줄은 transform으로만 움직이고, 놓으면
//   저장(onDrop)한 뒤 새 순서가 그려진 직후(layout effect) transform을 지운다(옛 순서가 한 프레임 번쩍이지 않게).
// - pointercancel(전화 등)·화면에서 내림이면 되돌린다(저장하지 않는다). Esc는 시트의 cancel 알림에서 cancelDrag()로 되돌린다
//   (Chromium은 keydown을 막아도 <dialog>의 닫기 요청을 그대로 처리했다, Verified: Playwright Chromium 1243). 시트 가장자리에 가까우면 시트를 넘긴다.
import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** 줄 표시: data-reorder-id="<카드 ID>" */
const ROW_SELECTOR = "[data-reorder-id]";
/** 시트 위·아래 가장자리에서 이 거리 안이면 넘긴다(CSS px) */
const EDGE_PX = 48;
/** 한 프레임에 넘기는 거리(CSS px) */
const SCROLL_STEP_PX = 12;

interface DragState {
  readonly id: string;
  readonly pointerId: number;
  readonly rows: readonly HTMLElement[];
  /** 끌기 시작 때 줄 가운데(시트 내용 좌표) */
  readonly centers: readonly number[];
  readonly from: number;
  /** 다른 줄이 비켜 줄 거리 = 끄는 줄 높이 + 줄 사이 */
  readonly shift: number;
  /** 끌기 시작 때 손가락(시트 내용 좌표) */
  readonly startY: number;
  target: number;
  clientY: number;
  frame: number;
}

export interface ReorderOptions {
  readonly listRef: RefObject<HTMLElement | null>;
  /** 넘어가는 시트 몸(가장자리 자동 넘김, 내용 좌표) */
  readonly scrollerRef: RefObject<HTMLElement | null>;
  /** 놓았을 때: 그 카드를 보이는 목록의 to 자리(0부터)로 */
  readonly onDrop: (id: string, to: number) => void;
}

export interface HandleProps {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerMove(event: PointerEvent<HTMLElement>): void;
  onPointerUp(event: PointerEvent<HTMLElement>): void;
  onPointerCancel(event: PointerEvent<HTMLElement>): void;
  onLostPointerCapture(event: PointerEvent<HTMLElement>): void;
}

function contentY(scroller: HTMLElement, clientY: number): number {
  return clientY - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

function clearTransforms(rows: readonly HTMLElement[]): void {
  for (const row of rows) row.style.transform = "";
}

/** 끄는 줄의 가운데가 다른 줄의 가운데를 넘으면 그 자리로 */
function targetIndex(centers: readonly number[], from: number, center: number): number {
  for (let index = 0; index < from; index++) {
    if (center < (centers[index] ?? 0)) return index;
  }
  for (let index = centers.length - 1; index > from; index--) {
    if (center > (centers[index] ?? 0)) return index;
  }
  return from;
}

export function useReorder({ listRef, scrollerRef, onDrop }: ReorderOptions) {
  const drag = useRef<DragState | null>(null);
  /** 놓은 뒤 새 순서가 그려지면 transform을 지울 줄 */
  const pendingClear = useRef<readonly HTMLElement[] | null>(null);
  const onDropRef = useRef(onDrop);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useLayoutEffect(() => {
    onDropRef.current = onDrop;
  });

  // 새 순서가 그려진 직후(그리기 전) 지운다
  useLayoutEffect(() => {
    if (pendingClear.current === null) return;
    clearTransforms(pendingClear.current);
    pendingClear.current = null;
  });

  const paint = useCallback(
    function paintFrame(): void {
      const state = drag.current;
      const scroller = scrollerRef.current;
      if (state === null || scroller === null) return;
      state.frame = 0;
      const box = scroller.getBoundingClientRect();
      let scrolled = false;
      if (state.clientY < box.top + EDGE_PX && scroller.scrollTop > 0) {
        scroller.scrollTop -= SCROLL_STEP_PX;
        scrolled = true;
      } else if (
        state.clientY > box.bottom - EDGE_PX &&
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight
      ) {
        scroller.scrollTop += SCROLL_STEP_PX;
        scrolled = true;
      }
      const dy = contentY(scroller, state.clientY) - state.startY;
      const target = targetIndex(state.centers, state.from, (state.centers[state.from] ?? 0) + dy);
      state.target = target;
      state.rows.forEach((row, index) => {
        let offset = 0;
        if (index === state.from) offset = dy;
        else if (state.from < target && index > state.from && index <= target) offset = -state.shift;
        else if (target < state.from && index >= target && index < state.from) offset = state.shift;
        row.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
      });
      // 가장자리에 머무는 동안은 손가락이 멈춰 있어도 계속 넘긴다
      if (scrolled) state.frame = requestAnimationFrame(paintFrame);
    },
    [scrollerRef],
  );

  /** 끌기를 끝낸다. commit이면 자리가 바뀌었을 때 저장한다 */
  const finish = useCallback((commit: boolean): void => {
    const state = drag.current;
    if (state === null) return;
    drag.current = null;
    if (state.frame !== 0) cancelAnimationFrame(state.frame);
    if (commit && state.target !== state.from) {
      pendingClear.current = state.rows;
      onDropRef.current(state.id, state.target);
    } else {
      clearTransforms(state.rows);
    }
    setDraggingId(null);
  }, []);

  // 화면에서 내려가면 되돌린다
  useEffect(() => () => finish(false), [finish]);

  /** 끄는 중이면 되돌리고 true(시트의 Esc·닫기 요청은 시트를 닫지 않고 끌기만 되돌린다) */
  const cancelDrag = useCallback((): boolean => {
    if (drag.current === null) return false;
    finish(false);
    return true;
  }, [finish]);

  const handleProps = (id: string): HandleProps => ({
    onPointerDown(event) {
      if (drag.current !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      const list = listRef.current;
      const scroller = scrollerRef.current;
      if (list === null || scroller === null) return;
      const rows = [...list.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
      const from = rows.findIndex((row) => row.dataset.reorderId === id);
      const fromRect = rows[from]?.getBoundingClientRect();
      if (fromRect === undefined) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const top = scroller.getBoundingClientRect().top - scroller.scrollTop;
      const rects = rows.map((row) => row.getBoundingClientRect());
      const first = rects[0];
      const second = rects[1];
      const gap = first !== undefined && second !== undefined ? Math.max(0, second.top - first.bottom) : 0;
      drag.current = {
        id,
        pointerId: event.pointerId,
        rows,
        centers: rects.map((rect) => rect.top - top + rect.height / 2),
        from,
        shift: fromRect.height + gap,
        startY: contentY(scroller, event.clientY),
        target: from,
        clientY: event.clientY,
        frame: 0,
      };
      setDraggingId(id);
    },
    onPointerMove(event) {
      const state = drag.current;
      if (state === null || event.pointerId !== state.pointerId) return;
      state.clientY = event.clientY;
      if (state.frame === 0) state.frame = requestAnimationFrame(paint);
    },
    onPointerUp(event) {
      if (drag.current?.pointerId !== event.pointerId) return;
      // 마지막 위치로 한 번 더 계산하고 놓는다
      if (drag.current.frame !== 0) cancelAnimationFrame(drag.current.frame);
      drag.current.clientY = event.clientY;
      paint();
      finish(true);
    },
    onPointerCancel(event) {
      if (drag.current?.pointerId === event.pointerId) finish(false);
    },
    onLostPointerCapture(event) {
      // 놓기(pointerup) 전에 붙잡기를 잃었다(브라우저가 끊음): 되돌린다
      if (drag.current?.pointerId === event.pointerId) finish(false);
    },
  });

  return { draggingId, handleProps, cancelDrag };
}

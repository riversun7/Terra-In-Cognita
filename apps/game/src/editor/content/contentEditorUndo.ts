// 마지막 고침 되돌리기(편집기 공용, 기기 안에서만) — docs/adr/2026-11-10-editor-input-controls.md.
// 담은 변경(화면이 든 값 하나)을 바꾸기 전에 record(지금 값, 칸 열쇠)를 부르면 그 값을 쌓고, Ctrl/⌘+Z가 마지막 것을 꺼내 되돌린다.
// 같은 칸 열쇠를 1초 안에 잇달아 고치면 한 칸으로 묶는다(막대를 끄는 동안·글자를 치는 동안이 되돌리기 한 번).
// 글 칸(이름·메모)의 Ctrl+Z는 브라우저에 남긴다: 수 칸(data-num)과 칸 밖에서만 가로챈다. 적용한 뒤에는 clear()로 비운다.
// 아이템 편집기는 같은 뜻의 자기 훅(useItemStage: 되돌리기·다시하기 단추)을 쓴다.
import { useEffect, useRef, useState } from "react";

/** 되돌리기 칸 수 */
const UNDO_LIMIT = 50;
/** 같은 칸을 잇달아 고치면 한 칸으로 묶는 시간(ms) */
const COALESCE_MS = 1000;
/** 지금 시각(ms, 되돌리기 칸 묶기에만. 누를 때 부른다) */
const clockMs = (): number => Date.now();

export interface UndoStack<T> {
  readonly canUndo: boolean;
  /** 바꾸기 전의 값을 쌓는다. editKey가 같은 고침이 1초 안에 이어지면 쌓지 않는다 */
  readonly record: (previous: T, editKey?: string) => void;
  /** 마지막으로 쌓은 값을 꺼낸다(없으면 null) */
  readonly pop: () => T | null;
  readonly clear: () => void;
}

export function useUndoStack<T>(): UndoStack<T> {
  const past = useRef<T[]>([]);
  const last = useRef<{ key: string; at: number } | null>(null);
  const [count, setCount] = useState(0);
  return {
    canUndo: count > 0,
    record: (previous, editKey) => {
      const now = clockMs();
      const before = last.current;
      const coalesce =
        editKey !== undefined && before !== null && before.key === editKey && now - before.at < COALESCE_MS;
      last.current = editKey === undefined ? null : { key: editKey, at: now };
      if (coalesce) return;
      past.current = [...past.current, previous].slice(-UNDO_LIMIT);
      setCount(past.current.length);
    },
    pop: () => {
      const previous = past.current.at(-1);
      if (previous === undefined) return null;
      past.current = past.current.slice(0, -1);
      last.current = null;
      setCount(past.current.length);
      return previous;
    },
    clear: () => {
      past.current = [];
      last.current = null;
      setCount(0);
    },
  };
}

/** 글을 치는 칸인가(수 칸 data-num은 뺀다: 수 칸의 Ctrl+Z는 편집기가 받는다) */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.dataset.num !== undefined) return false;
  return !["checkbox", "radio", "button", "range", "submit", "reset"].includes(target.type);
}

/** Ctrl/⌘+Z(Shift 없이) = undo(). 듣는 함수는 한 번만 달고 마지막으로 그린 동작을 부른다. 창(dialog)이 열려 있으면 받지 않는다 */
export function useUndoShortcut(undo: () => void): void {
  const latest = useRef(undo);
  useEffect(() => {
    latest.current = undo;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "z" || !(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey || event.altKey || isTextEntry(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

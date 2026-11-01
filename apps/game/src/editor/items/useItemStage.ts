// 담은 변경 상태(설계안 3.10) — 지금 담은 변경, 되돌리기·다시하기 칸(기기 안에서만, 50칸), 같은 칸을 1초 안에 잇달아 고치면 한 칸으로
// 묶기. 비동기 흐름(다시 얹기·다시 담기)이 기다린 뒤에도 최신 담은 변경에서 고치도록 ref를 같이 든다(그릴 때는 state만 읽는다).
import { useEffect, useRef, useState } from "react";
import { EMPTY_STAGE, type Stage } from "./itemModel.ts";

/** 되돌리기 칸 수(기기 안) */
const UNDO_LIMIT = 50;
/** 같은 칸을 잇달아 고치면 한 칸으로 묶는 시간(ms) */
const COALESCE_MS = 1000;
/** 지금 시각(ms, 되돌리기 칸 묶기에만. 누를 때 부른다) */
const clockMs = (): number => Date.now();

export interface ItemStageState {
  readonly stage: Stage;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** 지금 담은 변경(누를 때·기다린 뒤 읽는다) */
  readonly current: () => Stage;
  /** 담은 변경을 바꾼다. editKey가 같은 칸을 1초 안에 잇달아 고치면 되돌리기 한 칸으로 묶는다 */
  readonly push: (next: Stage, editKey?: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** 적용한 뒤: 비우고 되돌리기 칸도 지운다 */
  readonly reset: () => void;
}

export function useItemStage(): ItemStageState {
  const [stage, setStage] = useState<Stage>(EMPTY_STAGE);
  const [past, setPast] = useState<readonly Stage[]>([]);
  const [future, setFuture] = useState<readonly Stage[]>([]);
  const ref = useRef<Stage>(EMPTY_STAGE);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    ref.current = stage;
  }, [stage]);

  const restore = (next: Stage): void => {
    ref.current = next;
    lastEdit.current = null;
    setStage(next);
  };

  return {
    stage,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    current: () => ref.current,
    push: (next, editKey) => {
      const from = ref.current;
      const now = clockMs();
      const last = lastEdit.current;
      const coalesce =
        editKey !== undefined && last !== null && last.key === editKey && now - last.at < COALESCE_MS;
      lastEdit.current = editKey === undefined ? null : { key: editKey, at: now };
      if (!coalesce) {
        setPast((before) => [...before, from].slice(-UNDO_LIMIT));
        setFuture([]);
      }
      ref.current = next;
      setStage(next);
    },
    undo: () => {
      const previous = past.at(-1);
      if (!previous) return;
      const from = ref.current;
      setFuture((after) => [from, ...after]);
      setPast(past.slice(0, -1));
      restore(previous);
    },
    redo: () => {
      const next = future[0];
      if (!next) return;
      const from = ref.current;
      setPast((before) => [...before, from]);
      setFuture(future.slice(1));
      restore(next);
    },
    reset: () => {
      setPast([]);
      setFuture([]);
      restore(EMPTY_STAGE);
    },
  };
}

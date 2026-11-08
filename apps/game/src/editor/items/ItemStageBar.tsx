// 아이템 편집기 담은 변경 막대(설계안 3.10, 2026-11-08 화면 개편: 공용 PendingBar) — 화면 아래에 붙는다(설정 칸 패널과 같은 자리):
// 담은 항목 수(펼치면 항목마다 이름·ID·무엇과 [열기]·[×]), 검사 상태(입력이 1초 멈추면 서버 items.check, [검사]로 바로), 되돌리기·다시하기
// (기기 안에서만), 메모(200자), [모두 취소](묻고 비운다), [적용](items.save 한 묶음, 항목마다 baseHash, Ctrl/⌘+S).
import { ITEM_EDIT_CATEGORIES, type ItemEditorListResponse } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry, type PendingStatus } from "../content/contentEditorPending.tsx";
import { type Stage, stageKeys } from "./itemModel.ts";
import { splitKey } from "./itemRebase.ts";

export type CheckState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "done"; readonly errors: number; readonly advice: number }
  | { readonly status: "failed" };

/** 검사 상태 → 막대 글·색·data-check */
function statusOf(count: number, check: CheckState, conflicts: number): PendingStatus | null {
  if (count === 0) return null;
  if (conflicts > 0)
    return { text: m.dev_items_conflict_pending({ count: conflicts }), tone: "blocked", data: "conflict" };
  if (check.status === "checking" || check.status === "idle")
    return { text: m.dev_items_checking(), tone: "busy", data: check.status };
  if (check.status === "failed") return { text: m.dev_items_check_failed(), tone: "failed", data: "failed" };
  return check.errors > 0
    ? { text: m.dev_items_check_blocked({ count: check.errors }), tone: "blocked", data: "blocked" }
    : { text: m.dev_items_check_ok({ advice: check.advice }), tone: "ok", data: "ok" };
}

/** 담은 키 하나의 이름(아이템·분류 자료·효과는 담은 값 → 지금 목록 차례로 찾는다) */
function nameOf(list: ItemEditorListResponse, stage: Stage, key: string, locale: "ko" | "en"): string {
  const { category, id } = splitKey(key);
  const named = (value: { readonly name: { readonly ko: string; readonly en: string } } | null | undefined) =>
    value?.name[locale];
  switch (category) {
    case "items":
      return named(stage.items.get(id)?.entry) ?? named(list.items.find((row) => row.id === id)) ?? id;
    case "effects":
      return named(stage.effects.get(id)?.entry) ?? named(list.effects.find((row) => row.id === id)) ?? id;
    case "item_subcategories":
      return named(list.subcategories.find((row) => row.entry.id === id)?.entry) ?? id;
    case "item_tags":
      return named(list.tags.find((row) => row.entry.id === id)?.entry) ?? id;
    case "weapon_types":
      return named(list.weaponTypes.find((row) => row.entry.id === id)?.entry) ?? id;
    default:
      return m.dev_items_sleeping_title();
  }
}

export function ItemPendingBar({
  list,
  stage,
  locale,
  check,
  conflicts,
  note,
  onNote,
  busy,
  canApply,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCheck,
  onApply,
  onClear,
  onPick,
  onUnstageKey,
}: {
  list: ItemEditorListResponse;
  stage: Stage;
  locale: "ko" | "en";
  check: CheckState;
  /** 칸을 고르지 않은 충돌 항목 수(남아 있으면 [적용]을 막는다) */
  conflicts: number;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  canApply: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCheck: () => void;
  onApply: () => void;
  onClear: () => void;
  onPick: (key: string) => void;
  onUnstageKey: (key: string) => void;
}) {
  const keys = stageKeys(stage);
  // 막대는 늘 둔다(비어 있어도 되돌리기·다시하기, 시험이 data-count="0"을 본다)
  const entries: PendingEntry[] = keys.map((key) => {
    const { category, id } = splitKey(key);
    const known = ITEM_EDIT_CATEGORIES.find((name) => name === category);
    const staged = known ? stage[known].get(id) : undefined;
    const kind =
      staged?.op === "discard_sleeping"
        ? "discard"
        : staged?.op === "revert"
          ? "revert"
          : staged && staged.base === null
            ? "create"
            : "put";
    return {
      key,
      id: key,
      name: kind === "discard" ? m.dev_items_sleeping_title() : nameOf(list, stage, key, locale),
      kind,
      fields: staged?.entry && staged.base ? leafDiff(staged.base, staged.entry).length : null,
      onOpen: kind === "discard" ? undefined : () => onPick(key),
      onRemove: () => onUnstageKey(key),
    };
  });
  return (
    <PendingBar
      label={m.dev_items_stage_label()}
      entries={entries}
      status={statusOf(keys.length, check, conflicts)}
      note={note}
      onNote={onNote}
      busy={busy}
      canApply={canApply}
      onApply={onApply}
      onDiscard={onClear}
      onCheck={onCheck}
      classes={{
        bar: "ie-stagebar",
        note: "ie-note",
        apply: "ie-apply",
        discard: "ie-clear",
        check: "ie-check-button",
      }}
      tools={
        <>
          <button type="button" aria-disabled={!canUndo} onClick={canUndo ? onUndo : undefined}>
            {m.dev_items_undo()}
          </button>
          <button type="button" aria-disabled={!canRedo} onClick={canRedo ? onRedo : undefined}>
            {m.dev_items_redo()}
          </button>
        </>
      }
    />
  );
}

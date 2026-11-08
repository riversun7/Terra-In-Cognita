// 아이템 편집기 판 — 잠든 줄 판(켤 때 적용하지 않은 덮어쓰기: 까닭과 [버리기 담기]), 코드 참조 확인. 머리 요약·내보내기 판·탭 줄은
// 공용(editor/content/contentEditorLayout, 2026-11-08 화면 개편).
import type { ContentSleepingRow } from "@terra/shared/contentEdit";
import { m } from "../../paraglide/messages.js";
import type { ItemEditorListResponse } from "@terra/shared/itemEditor";
import { ConfirmLine, EditorSummary } from "../content/contentEditorLayout.tsx";
import { sleepText } from "./itemMessages.ts";

/** 머리: 팩 판·덮어쓰기 판·아이템 수·바뀐 항목 수·잠든 줄 수와 [내보내기]·[최근 바꿈] */
export function ItemHead({
  list,
  changed,
  sleeping,
  historyOpen,
  onExport,
  onHistory,
}: {
  list: ItemEditorListResponse;
  changed: number;
  sleeping: number;
  historyOpen: boolean;
  onExport: () => void;
  onHistory: () => void;
}) {
  return (
    <EditorSummary
      label={m.dev_items_summary_label()}
      className="ie-summary"
      chips={[
        { key: "pack", text: m.dev_items_pack({ version: list.contentVersion }) },
        {
          key: "revision",
          text: m.dev_items_revision({ revision: list.revision }),
          className: "ie-revision",
        },
        { key: "count", text: m.dev_items_count({ count: list.items.length }) },
        {
          key: "changed",
          text: m.dev_items_changed({ count: changed }),
          className: "ie-changed",
          count: changed,
          warn: changed > 0,
        },
        ...(sleeping > 0
          ? [{ key: "sleeping", text: m.dev_items_sleeping({ count: sleeping }), warn: true }]
          : []),
      ]}
      tools={
        <>
          <button type="button" onClick={onExport}>
            {m.dev_items_export()}
          </button>
          <button type="button" aria-expanded={historyOpen} onClick={onHistory}>
            {m.dev_items_history()}
          </button>
        </>
      }
    />
  );
}

export function SleepingPanel({
  rows,
  onDiscard,
}: {
  rows: readonly ContentSleepingRow[];
  onDiscard: (category: string, id: string) => void;
}) {
  return (
    <section className="ce-panel ie-sleeping" aria-labelledby="ie-sleeping-title">
      <h2 id="ie-sleeping-title" className="ce-panel-title">
        {m.dev_items_sleeping_title()}
      </h2>
      <ul className="ie-plain">
        {rows.map((line) => (
          <li key={`${line.category}/${line.id}`} className="ie-sleeping-row">
            <span>
              {line.category}/{line.id} · {sleepText(line.reason)} · {line.contentVersion}
            </span>
            <button type="button" onClick={() => onDiscard(line.category, line.id)}>
              {m.dev_items_sleeping_discard()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 코드가 ID로 쓰는 아이템을 끄거나 칸·무기 공격 칸을 바꿀 때 [적용] 전에 묻는다(설계안 3.6) */
export function RiskyConfirm({
  ids,
  onYes,
  onNo,
}: {
  ids: readonly string[];
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <ConfirmLine
      className="ie-confirm"
      yesClass="ie-confirm-yes"
      text={m.dev_items_confirm_code_ref({ ids: ids.join(", ") })}
      onYes={onYes}
      onNo={onNo}
    />
  );
}

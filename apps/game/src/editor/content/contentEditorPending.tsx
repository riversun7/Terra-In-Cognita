// 콘텐츠 편집기 담은 변경 막대(아이템·스킬·건물 편집기 공용, 화면 아래에 붙음) — docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-08
// 화면 개편)". 설정 칸 패널의 담은 변경 막대(TuningPendingBar)와 같은 모양:
// - [N개 담음 ▸] 펼치면 항목마다 이름·ID·무엇(바꾼 칸 수·팩 값으로·새로 만듦·버리기)과 [열기]·[×](그 항목 담기 취소).
// - 검사 상태(서버 검사가 있는 편집기만, 문제가 있으면 [적용]을 막는다) · 화면이 주는 도구(되돌리기·다시하기) · 메모(감사 기록, 200자) ·
//   [검사] · [모두 취소](묻고 버린다, 아직 보내지 않은 것만) · [적용](한 묶음, Ctrl/⌘+S).
// - 시험이 고르는 이름은 화면이 준다(classes: 막대·메모·적용·모두 취소). data-count·data-check는 막대에 단다.
// - "적용 대상: 모든 행성 공통"(scope/ScopeBar.tsx ScopeTarget): 이 막대를 쓰는 편집기는 모두 팩 덮어쓰기라 세계의 모든 행성에 같다
//   (docs/adr/2026-11-11-planet-scope.md).
import { type ReactNode, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { ScopeTarget } from "../../scope/ScopeBar.tsx";

export type PendingKind = "put" | "revert" | "create" | "discard";

export interface PendingEntry {
  readonly key: string;
  readonly name: string;
  readonly id: string;
  readonly kind: PendingKind;
  /** 바꾼 칸 수(put일 때, 모르면 null) */
  readonly fields?: number | null | undefined;
  readonly onOpen?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
}

/** 검사 상태(서버 검사가 없는 편집기는 null) */
export interface PendingStatus {
  readonly text: string;
  readonly tone: "ok" | "blocked" | "busy" | "failed";
  /** 막대의 data-check 값(시험) */
  readonly data: string;
}

export interface PendingClasses {
  readonly bar: string;
  readonly note: string;
  readonly apply: string;
  readonly discard: string;
  readonly check?: string | undefined;
}

const KIND_TEXT: Readonly<Record<PendingKind, () => string>> = {
  put: m.dev_content_pending_put,
  revert: m.dev_content_pending_revert,
  create: m.dev_content_pending_create,
  discard: m.dev_content_pending_discard,
};

export function PendingBar({
  label,
  entries,
  status,
  note,
  onNote,
  busy,
  canApply,
  onApply,
  onDiscard,
  onCheck,
  tools,
  classes,
}: {
  /** 막대 이름(읽기 프로그램) */
  label: string;
  entries: readonly PendingEntry[];
  status?: PendingStatus | null | undefined;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  canApply: boolean;
  onApply: () => void;
  onDiscard: () => void;
  /** 바로 검사(서버 검사가 있는 편집기만) */
  onCheck?: (() => void) | undefined;
  /** 되돌리기·다시하기 등 */
  tools?: ReactNode;
  classes: PendingClasses;
}) {
  const noteId = useId();
  const [asking, setAsking] = useState(false);
  const count = entries.length;
  const countText = m.dev_content_pending_count({ count });
  return (
    <div
      className={`ce-pending ${classes.bar}`}
      role="region"
      aria-label={label}
      data-count={count}
      data-check={status?.data}
    >
      <div className="ce-pending-top">
        {count > 0 ? (
          <details className="ce-pending-details">
            <summary className="ce-pending-count" title={m.dev_content_pending_list()}>
              {countText}
            </summary>
            <ul className="ce-pending-list">
              {entries.map((entry) => (
                <li key={entry.key} className="ce-pending-item" data-key={entry.key} data-kind={entry.kind}>
                  <span className="ce-pending-what">
                    <span className="ce-pending-name">{entry.name}</span>{" "}
                    <code className="ce-entry-id" translate="no">
                      {entry.id}
                    </code>
                  </span>
                  <span className="ce-pending-side">
                    <span className="ce-pending-kind">
                      {entry.kind === "put" && typeof entry.fields === "number" && entry.fields > 0
                        ? m.dev_content_pending_fields({ count: entry.fields })
                        : KIND_TEXT[entry.kind]()}
                    </span>
                    <span className="ce-pending-buttons">
                      {entry.onOpen ? (
                        <button
                          type="button"
                          className="ce-link-button ce-pending-open"
                          onClick={entry.onOpen}
                        >
                          {m.dev_content_pending_open()}
                        </button>
                      ) : null}
                      {entry.onRemove ? (
                        <button
                          type="button"
                          className="ce-icon-button ce-pending-remove"
                          aria-label={m.dev_content_pending_remove({ name: entry.name })}
                          onClick={entry.onRemove}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      ) : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <strong className="ce-pending-count ce-pending-empty">{countText}</strong>
        )}
        <ScopeTarget />
        {status ? (
          <span className="ce-pending-status" role="status" data-tone={status.tone}>
            {status.text}
          </span>
        ) : null}
        {tools ? <span className="ce-pending-tools">{tools}</span> : null}
      </div>
      {count > 0 ? (
        <div className="ce-pending-actions">
          <label className="visually-hidden" htmlFor={noteId}>
            {m.dev_content_pending_note()}
          </label>
          <input
            id={noteId}
            className={`input ce-note-input ${classes.note}`}
            maxLength={200}
            placeholder={m.dev_content_pending_note()}
            value={note}
            onChange={(event) => onNote(event.target.value)}
          />
          <span className="ce-pending-buttons">
            {onCheck ? (
              <button
                type="button"
                className={`ce-pending-check ${classes.check ?? ""}`}
                aria-disabled={busy}
                onClick={busy ? undefined : onCheck}
              >
                {m.dev_content_check()}
              </button>
            ) : null}
            {asking ? (
              <span className="ce-confirm-inline" role="group" aria-label={m.dev_content_discard_confirm()}>
                <span>{m.dev_content_discard_confirm()}</span>
                <button
                  type="button"
                  className="button-primary ce-confirm-yes"
                  onClick={() => {
                    setAsking(false);
                    onDiscard();
                  }}
                >
                  {m.dev_content_confirm_yes()}
                </button>
                <button type="button" onClick={() => setAsking(false)}>
                  {m.dev_content_confirm_no()}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={`ce-discard ${classes.discard}`}
                onClick={() => setAsking(true)}
              >
                {m.dev_content_discard_all()}
              </button>
            )}
            <button
              type="button"
              className={`button-primary ce-apply ${classes.apply}`}
              aria-disabled={!canApply}
              aria-keyshortcuts="Control+S Meta+S"
              onClick={canApply ? onApply : undefined}
            >
              {m.dev_content_apply()}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

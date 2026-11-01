// 최근 바꿈 판(스킬 편집기·아이템 편집기) — 감사 기록 요약 줄(시각·사람·무엇·메모·바꾼 항목). 항목 통째는 싣지 않는다(설계안 3.10).
// onRestage가 있으면 줄마다 [다시 담기](그 판의 항목을 받아 담는다, 아이템 편집기). 제목·빈 글·클래스 이름은 화면이 정한다.
import type { ContentHistoryRow } from "@terra/shared/contentEdit";
import { m } from "../../paraglide/messages.js";

const ACTION_TEXT: Readonly<Record<ContentHistoryRow["action"], () => string>> = {
  apply: m.dev_content_history_apply,
  pack_won: m.dev_content_history_pack_won,
  dropped: m.dev_content_history_dropped,
  slept: m.dev_content_history_slept,
};

export function historyActionText(action: ContentHistoryRow["action"]): string {
  return ACTION_TEXT[action]();
}

export function ContentHistory({
  rows,
  locale,
  title,
  className,
  headingId,
  onRestage,
}: {
  rows: readonly ContentHistoryRow[];
  locale: "ko" | "en";
  title: string;
  /** 판 모양 클래스(화면마다) */
  className: string;
  headingId: string;
  /** 그 줄의 바꾼 항목 하나를 다시 담기(없으면 단추를 그리지 않는다) */
  onRestage?: ((row: ContentHistoryRow, change: ContentHistoryRow["changes"][number]) => void) | undefined;
}) {
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId} className="ce-history-title">
        {title}
      </h2>
      {rows.length === 0 ? <p className="field-hint">{m.dev_content_history_empty()}</p> : null}
      <ul className="ce-history-list">
        {rows.map((row) => (
          <li key={`${row.auditId ?? row.at}-${row.action}`}>
            <p>
              {m.dev_content_history_line({
                when: new Date(row.at).toLocaleString(locale),
                who: row.actor ?? m.dev_content_history_system(),
                what: historyActionText(row.action),
              })}
              {row.note ? ` · ${row.note}` : ""}
            </p>
            <p className="ce-history-changes">
              {row.changes.map((change) => `${change.category}/${change.id} (${change.what})`).join(", ")}
            </p>
            {onRestage && row.auditId !== null ? (
              <div className="ce-history-actions">
                {row.changes.map((change) => (
                  <button
                    key={`${change.category}/${change.id}`}
                    type="button"
                    className="button-small ce-restage"
                    onClick={() => onRestage(row, change)}
                  >
                    {m.dev_content_history_restage({ id: change.id })}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// 건물 편집기 판 — 잠든 시설 줄(켤 때 적용하지 않고 DB에 둔 것)과 검사 상태 글. 담은 변경 막대·내보내기 판은 공용
// (editor/content/contentEditorPending·contentEditorLayout, 2026-11-08 화면 개편).
import type { ContentSleepingRow } from "@terra/shared/contentEdit";
import { m } from "../../paraglide/messages.js";
import type { PendingStatus } from "../content/contentEditorPending.tsx";

export type CheckState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "done"; readonly errors: number; readonly advice: number }
  | { readonly status: "failed" };

/** 검사 상태 → 막대 글·색·data-check(오류가 있으면 [적용]을 막는다) */
export function checkStatus(check: CheckState): PendingStatus {
  if (check.status === "checking" || check.status === "idle")
    return { text: m.dev_buildings_checking(), tone: "busy", data: check.status };
  if (check.status === "failed")
    return { text: m.dev_buildings_check_failed(), tone: "failed", data: "failed" };
  return check.errors > 0
    ? { text: m.dev_buildings_check_blocked({ count: check.errors }), tone: "blocked", data: "blocked" }
    : { text: m.dev_buildings_check_ok({ advice: check.advice }), tone: "ok", data: "ok" };
}

/** 잠든 시설 줄 — [버리기 담기]를 누르면 담은 변경에 든다 */
export function BuildingSleeping({
  rows,
  discard,
  onToggle,
}: {
  rows: readonly ContentSleepingRow[];
  discard: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <section className="ce-panel" aria-labelledby="be-sleeping-title">
      <h2 id="be-sleeping-title" className="ce-panel-title">
        {m.dev_buildings_sleeping_title()}
      </h2>
      <ul className="be-plain-list">
        {rows.map((row) => (
          <li key={row.id} className="ce-inline-actions">
            <span>
              {m.dev_buildings_sleeping_line({ id: row.id, reason: row.reason, version: row.contentVersion })}
            </span>
            <button
              type="button"
              aria-pressed={discard.has(row.id)}
              onClick={() => onToggle(row.id, !discard.has(row.id))}
            >
              {m.dev_buildings_discard()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

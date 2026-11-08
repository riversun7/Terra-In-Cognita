// 운영자 콘솔 · 감사 기록 탭 — 최신부터, 사람이 읽는 말로(auditText.ts). 분류 고르기(여러 개)·한 사람·대상 아이디·동작 앞부분으로
// 거른다(사용자 요청 2026-11-08 "사람 운영자가 보기 쉽게, 필터로 특정 항목을 고를 수 있게"). 줄마다 [원본]으로 JSON을 펼쳐 본다.
// [더 보기]는 마지막 ID 아래를 더 부른다.
import { AUDIT_CATEGORY_IDS, type AuditCategory, type OpsAuditRow } from "@terra/shared/ops";
import { type FormEvent, useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import {
  actionLabel,
  actorText,
  auditCategoryOf,
  auditSummary,
  categoryLabel,
  targetText,
} from "./auditText.ts";
import { LoadState, errorText, useOpsLoad } from "./opsUi.tsx";

const PAGE = 50;
const dayFormat = new Intl.DateTimeFormat(getLocale(), { month: "2-digit", day: "2-digit" });
const clockFormat = new Intl.DateTimeFormat(getLocale(), {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function AuditRow({ row }: { row: OpsAuditRow }) {
  const [open, setOpen] = useState(false);
  const time = Date.parse(row.at);
  const category = auditCategoryOf(row.action);
  return (
    <>
      <tr>
        <td className="ops-audit-time">
          <span>{dayFormat.format(time)}</span> <span className="dev-muted">{clockFormat.format(time)}</span>
        </td>
        <td>{category ? <span className="dev-badge">{categoryLabel(category)}</span> : null}</td>
        <td>
          <span className="ops-audit-what">{actionLabel(row.action)}</span>
        </td>
        <td className="ops-audit-who" translate="no">
          {actorText(row)}
        </td>
        <td className="ops-audit-who" translate="no">
          {targetText(row)}
        </td>
        <td className="ops-audit-summary">{auditSummary(row) || m.ops_none()}</td>
        <td>
          <button type="button" className="button-text" aria-expanded={open} onClick={() => setOpen(!open)}>
            {m.audit_detail()}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="ops-audit-raw">
          <td colSpan={7}>
            <pre className="dev-code">
              {JSON.stringify(
                {
                  action: row.action,
                  target: row.targetId,
                  before: row.before,
                  after: row.after,
                  meta: row.meta,
                  ip: row.ip,
                },
                null,
                2,
              )}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function AuditTable({ rows }: { rows: readonly OpsAuditRow[] }) {
  if (rows.length === 0) return <p className="dev-muted">{m.ops_empty()}</p>;
  return (
    <div className="dev-table-wrap">
      <table className="dev-table ops-audit">
        <thead>
          <tr>
            <th scope="col">{m.ops_col_time()}</th>
            <th scope="col">{m.audit_col_category()}</th>
            <th scope="col">{m.audit_col_what()}</th>
            <th scope="col">{m.ops_col_actor()}</th>
            <th scope="col">{m.ops_col_target()}</th>
            <th scope="col">{m.ops_col_detail()}</th>
            <th scope="col">
              <span className="visually-hidden">{m.audit_detail()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AuditQuery {
  categories: AuditCategory[];
  actorSearch: string;
  targetSearch: string;
  action: string;
}

const EMPTY_QUERY: AuditQuery = { categories: [], actorSearch: "", targetSearch: "", action: "" };

export function AuditTab() {
  const actorId = useId();
  const targetId = useId();
  const actionId = useId();
  const [draft, setDraft] = useState<AuditQuery>(EMPTY_QUERY);
  const [query, setQuery] = useState<AuditQuery>(EMPTY_QUERY);
  const [more, setMore] = useState<OpsAuditRow[]>([]);
  const [moreError, setMoreError] = useState<string | null>(null);
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.audit.query({ ...query, limit: PAGE }, { signal }), [query]),
  );
  const rows = [...(loaded.data ?? []), ...more];

  const apply = (next: AuditQuery): void => {
    setMore([]);
    setMoreError(null);
    setDraft(next);
    setQuery(next);
  };
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    apply({
      ...draft,
      actorSearch: draft.actorSearch.trim(),
      targetSearch: draft.targetSearch.trim(),
      action: draft.action.trim(),
    });
  }
  /** 분류는 누르면 바로 거른다(여러 개 고를 수 있다, 하나도 안 고르면 전체) */
  const toggleCategory = (category: AuditCategory): void => {
    const has = query.categories.includes(category);
    const categories = has
      ? query.categories.filter((value) => value !== category)
      : AUDIT_CATEGORY_IDS.filter((value) => value === category || query.categories.includes(value));
    apply({ ...draft, categories });
  };
  async function loadMore(): Promise<void> {
    const last = rows.at(-1);
    if (!last) return;
    try {
      const next = await api.ops.audit.query({ ...query, limit: PAGE, beforeId: last.id });
      setMore((previous) => [...previous, ...next]);
      setMoreError(null);
    } catch (error) {
      setMoreError(errorText(error));
    }
  }

  return (
    <div className="ops-stack">
      <fieldset className="ops-chips">
        <legend>{m.audit_filter_category()}</legend>
        <button
          type="button"
          className="ops-chip"
          aria-pressed={query.categories.length === 0}
          onClick={() => apply({ ...draft, categories: [] })}
        >
          {m.audit_filter_all()}
        </button>
        {AUDIT_CATEGORY_IDS.map((category) => (
          <button
            key={category}
            type="button"
            className="ops-chip"
            aria-pressed={query.categories.includes(category)}
            onClick={() => toggleCategory(category)}
          >
            {categoryLabel(category)}
          </button>
        ))}
      </fieldset>
      <form className="ops-toolbar" onSubmit={submit}>
        <label className="ops-inline" htmlFor={actorId}>
          {m.audit_filter_actor()}
        </label>
        <input
          id={actorId}
          className="input ops-mid"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          value={draft.actorSearch}
          onChange={(event) => setDraft({ ...draft, actorSearch: event.target.value })}
        />
        <label className="ops-inline" htmlFor={targetId}>
          {m.audit_filter_target()}
        </label>
        <input
          id={targetId}
          className="input ops-mid"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          value={draft.targetSearch}
          onChange={(event) => setDraft({ ...draft, targetSearch: event.target.value })}
        />
        <label className="ops-inline" htmlFor={actionId}>
          {m.audit_filter_action()}
        </label>
        <input
          id={actionId}
          className="input ops-mid"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          value={draft.action}
          onChange={(event) => setDraft({ ...draft, action: event.target.value })}
        />
        <button type="submit" className="button-small button-primary">
          {m.audit_filter_apply()}
        </button>
        <button type="button" className="button-small" onClick={() => apply(EMPTY_QUERY)}>
          {m.audit_filter_reset()}
        </button>
        <button
          type="button"
          className="button-small"
          onClick={() => {
            setMore([]);
            loaded.reload();
          }}
        >
          {m.ops_refresh()}
        </button>
      </form>
      <p className="dev-muted">{m.audit_view_off_note()}</p>
      <LoadState loaded={loaded} />
      <AuditTable rows={rows} />
      {moreError ? (
        <p className="message message-error" role="alert">
          {moreError}
        </p>
      ) : null}
      {rows.length > 0 && rows.length % PAGE === 0 ? (
        <button type="button" className="button-small" onClick={() => void loadMore()}>
          {m.ops_audit_more()}
        </button>
      ) : null}
    </div>
  );
}

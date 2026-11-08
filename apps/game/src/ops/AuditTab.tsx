// 운영자 콘솔 · 감사 기록 탭 — audit_log를 최신부터(동작 앞부분으로 거르기, [더 보기]는 마지막 ID 아래). 운영자 동작은 ops.*다.
import { type FormEvent, useCallback, useId, useState } from "react";
import type { OpsAuditRow } from "@terra/shared/ops";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { LoadState, errorText, formatTime, useOpsLoad } from "./opsUi.tsx";

const PAGE = 50;

/** before·after·meta를 한 줄 JSON으로(길면 잘라 보이고 전체는 title) */
function compact(row: OpsAuditRow): string {
  const parts: string[] = [];
  if (row.before !== null && row.before !== undefined) parts.push(`before=${JSON.stringify(row.before)}`);
  if (row.after !== null && row.after !== undefined) parts.push(`after=${JSON.stringify(row.after)}`);
  if (row.meta !== null && row.meta !== undefined) parts.push(`meta=${JSON.stringify(row.meta)}`);
  return parts.join(" ");
}

export function AuditTable({ rows }: { rows: readonly OpsAuditRow[] }) {
  if (rows.length === 0) return <p className="dev-muted">{m.ops_empty()}</p>;
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col">{m.ops_col_time()}</th>
            <th scope="col">{m.ops_col_actor()}</th>
            <th scope="col">{m.ops_col_action()}</th>
            <th scope="col">{m.ops_col_target()}</th>
            <th scope="col">{m.ops_col_detail()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = compact(row);
            return (
              <tr key={row.id}>
                <td className="dev-muted">{formatTime(row.at)}</td>
                <td className="dev-code" translate="no">
                  {row.actorLoginId ?? row.actorKind}
                </td>
                <td className="dev-code">{row.action}</td>
                <td className="dev-code ops-ellipsis" title={row.targetId ?? ""}>
                  {row.targetId ?? m.ops_none()}
                </td>
                <td className="dev-code ops-ellipsis" title={detail}>
                  {detail || m.ops_none()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditTab() {
  const actionId = useId();
  const [input, setInput] = useState("");
  const [action, setAction] = useState("");
  const [more, setMore] = useState<OpsAuditRow[]>([]);
  const [moreError, setMoreError] = useState<string | null>(null);
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.audit.query({ action, limit: PAGE }, { signal }), [action]),
  );
  const rows = [...(loaded.data ?? []), ...more];
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMore([]);
    setAction(input.trim());
  }
  async function loadMore(): Promise<void> {
    const last = rows.at(-1);
    if (!last) return;
    try {
      const next = await api.ops.audit.query({ action, limit: PAGE, beforeId: last.id });
      setMore((previous) => [...previous, ...next]);
      setMoreError(null);
    } catch (error) {
      setMoreError(errorText(error));
    }
  }
  return (
    <div className="ops-stack">
      <form className="ops-toolbar" onSubmit={submit}>
        <label htmlFor={actionId}>{m.ops_audit_action()}</label>
        <input
          id={actionId}
          className="input"
          maxLength={64}
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="button-small">
          {m.ops_search()}
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

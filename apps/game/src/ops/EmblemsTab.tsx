// 운영자 콘솔 · 마크 관리 탭(docs/adr/2026-11-11-faction-identity.md 5절) — 플레이어가 올린 세력 마크를 최근 올린 차례로 본다.
// 줄마다 올린 그림·자동 생성 마크·세력·주인·올린 때·크기·상태. [마크 내리기](사유는 주인에게 보인다, 그 계정의 올리기도 막을 수 있다),
// [올리기 막기]·[올리기 다시 허용]. 권한 emblem_moderate(운영자부터). 맨 위 스위치 "플레이어 마크 올리기 허용"은 관리자·개발자(faction_edit)만 바꾼다.
import type { OpsEmblemRow } from "@terra/shared/factionIdentity";
import { useCallback, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, errorText, formatInt, formatTime, resultText, useOpsLoad } from "./opsUi.tsx";

const kb = (bytes: number): string => m.ops_emblems_bytes({ kb: Math.max(1, Math.round(bytes / 1000)) });

function stateText(row: OpsEmblemRow): string {
  const parts: string[] = [];
  if (row.uploaded) parts.push(m.ops_emblems_state_ok());
  if (row.notice) parts.push(m.ops_emblems_state_removed());
  if (row.uploadBlocked) parts.push(m.ops_emblems_state_blocked());
  return parts.join(" · ");
}

function Takedown({
  row,
  onDone,
  onCancel,
}: {
  row: OpsEmblemRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [block, setBlock] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      const result = await api.ops.emblems.takedown.mutate({
        userId: row.userId,
        reason,
        blockUploads: block,
      });
      if (result.ok) onDone();
      else setMessage(resultText(result.code));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="ops-inline-edit ops-emblem-takedown"
      role="group"
      aria-label={m.ops_emblems_takedown_of({ name: row.name })}
    >
      <input
        className="input ops-mid"
        aria-label={m.ops_emblems_reason()}
        placeholder={m.ops_emblems_reason()}
        maxLength={200}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <label className="ops-inline">
        <input type="checkbox" checked={block} onChange={(event) => setBlock(event.target.checked)} />
        <span>{m.ops_emblems_block_too()}</span>
      </label>
      <button
        type="button"
        className="button-small button-primary ops-emblem-confirm"
        aria-disabled={pending}
        onClick={() => void run()}
      >
        {m.ops_emblems_confirm()}
      </button>
      <button type="button" className="button-small" onClick={onCancel}>
        {m.cancel()}
      </button>
      {message ? (
        <span className="ops-msg ops-msg-error" role="alert">
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function EmblemsTab({ open, canSwitch }: { open: OpenDetail; canSwitch: boolean }) {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.emblems.list.query(undefined, { signal }), []),
  );
  const [acting, setActing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const rows = loaded.data?.rows ?? [];
  const allowed = loaded.data?.uploadAllowed ?? true;

  async function act(run: () => Promise<{ ok: boolean; code?: string }>, done?: string): Promise<void> {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await run();
      if (result.ok) {
        if (done !== undefined) setMessage({ tone: "ok", text: done });
        loaded.reload();
      } else setMessage({ tone: "error", text: resultText(result.code ?? "failed") });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ops-stack ops-emblems">
      <div className="ops-toolbar">
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
        <label className="ops-inline ops-emblem-switch" data-on={allowed ? "" : undefined}>
          <input
            type="checkbox"
            checked={allowed}
            disabled={!canSwitch || loaded.data === null || pending}
            onChange={(event) => {
              const next = event.target.checked;
              void act(() => api.ops.emblems.setUploadAllowed.mutate({ allowed: next }));
            }}
          />
          <span>{m.ops_emblems_switch()}</span>
          <strong>{allowed ? m.ops_emblems_switch_on() : m.ops_emblems_switch_off()}</strong>
        </label>
        <span className="dev-muted">
          {m.ops_emblems_switch_sub()} {canSwitch ? "" : m.ops_emblems_switch_need()}
        </span>
      </div>
      <LoadState loaded={loaded} />
      {loaded.data ? (
        <p className="dev-muted ops-emblem-summary">
          {m.ops_emblems_summary({
            total: formatInt(loaded.data.total),
            uploaded: formatInt(rows.filter((row) => row.uploaded).length),
          })}
        </p>
      ) : null}
      {message ? (
        <p
          className={message.tone === "ok" ? "ops-msg" : "ops-msg ops-msg-error"}
          role={message.tone === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
      <div className="dev-table-wrap">
        <table className="dev-table ops-emblem-table">
          <thead>
            <tr>
              <th scope="col">{m.ops_emblems_col_emblem()}</th>
              <th scope="col">{m.ops_emblems_col_faction()}</th>
              <th scope="col">{m.ops_emblems_col_owner()}</th>
              <th scope="col">{m.ops_emblems_col_uploaded()}</th>
              <th scope="col" className="dev-num">
                {m.ops_emblems_col_size()}
              </th>
              <th scope="col">{m.ops_emblems_col_state()}</th>
              <th scope="col">{m.ops_emblems_col_actions()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} data-user={row.userId} data-uploaded={row.uploaded ? "" : undefined}>
                <td>
                  <span className="ops-emblem-pair">
                    {row.uploaded ? (
                      <NationEmblem
                        spec={row.emblem}
                        color={row.color}
                        uploaded={row.uploaded.hash}
                        size={64}
                        label={m.ops_emblems_uploaded()}
                        className="ops-emblem-up"
                      />
                    ) : null}
                    <NationEmblem
                      spec={row.emblem}
                      color={row.color}
                      size={row.uploaded ? 32 : 64}
                      label={m.ops_emblems_made()}
                      className="ops-emblem-made"
                    />
                  </span>
                </td>
                <th scope="row">
                  <span translate="no">{row.name}</span>{" "}
                  <span className="dev-muted" translate="no">
                    [{row.shortName}]
                  </span>
                </th>
                <td>
                  <button
                    type="button"
                    className="button-text"
                    onClick={() => open({ kind: "user", id: row.userId })}
                  >
                    <span translate="no">{row.cyborgName ?? row.loginId}</span>
                  </button>
                  {row.cyborgName ? (
                    <span className="dev-muted" translate="no">
                      {" "}
                      {row.loginId}
                    </span>
                  ) : null}
                </td>
                <td>
                  {row.uploaded
                    ? formatTime(row.uploaded.at)
                    : row.notice
                      ? formatTime(row.notice.at)
                      : m.ops_none()}
                </td>
                <td className="dev-num">{row.uploaded ? kb(row.uploaded.bytes) : m.ops_none()}</td>
                <td>
                  {stateText(row)}
                  {row.notice?.reason ? <span className="dev-muted"> · {row.notice.reason}</span> : null}
                </td>
                <td>
                  {acting === row.userId ? (
                    <Takedown
                      row={row}
                      onCancel={() => setActing(null)}
                      onDone={() => {
                        setActing(null);
                        setMessage({ tone: "ok", text: m.ops_emblems_done() });
                        loaded.reload();
                      }}
                    />
                  ) : (
                    <span className="ops-inline-edit">
                      {row.uploaded ? (
                        <button
                          type="button"
                          className="button-small ops-emblem-takedown-open"
                          aria-label={m.ops_emblems_takedown_of({ name: row.name })}
                          onClick={() => setActing(row.userId)}
                        >
                          {m.ops_emblems_takedown()}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button-small ops-emblem-block"
                        aria-disabled={pending}
                        onClick={() =>
                          void act(() =>
                            api.ops.emblems.setBlocked.mutate({
                              userId: row.userId,
                              blocked: !row.uploadBlocked,
                            }),
                          )
                        }
                      >
                        {row.uploadBlocked ? m.ops_emblems_unblock() : m.ops_emblems_block()}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loaded.data && rows.length === 0 ? <p className="dev-muted">{m.ops_emblems_none()}</p> : null}
    </div>
  );
}

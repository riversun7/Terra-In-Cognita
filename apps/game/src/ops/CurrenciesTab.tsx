// 운영자 콘솔 · 화폐 탭(docs/adr/2026-11-09-faction-profiles.md) — 화폐마다 기호·3글자 약어(세계 안에서 하나)·이름·찍는 나라·쓰는 세력 수·
// 보유 합. 관리자·개발자(faction_edit)는 줄에서 바로 고친다(약어가 겹치면 서버가 거절한다).
import type { OpsCurrencyRow } from "@terra/shared/ops";
import {
  isCurrencySymbol,
  isCurrencyTicker,
  isProfileName,
  CURRENCY_NAME_MAX,
} from "@terra/shared/factionProfile";
import { useCallback, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, errorText, formatBig, formatInt, resultText, useOpsLoad } from "./opsUi.tsx";

function CurrencyEdit({ row, onDone }: { row: OpsCurrencyRow; onDone: () => void }) {
  const [name, setName] = useState(row.name);
  const [symbol, setSymbol] = useState(row.symbol);
  const [ticker, setTicker] = useState(row.ticker);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const valid =
    isProfileName(name, CURRENCY_NAME_MAX) && isCurrencySymbol(symbol) && isCurrencyTicker(ticker);
  async function save(): Promise<void> {
    if (pending) return;
    if (!valid) {
      setMessage(m.ops_res_invalid());
      return;
    }
    setPending(true);
    try {
      const result = await api.ops.currencies.update.mutate({
        asset: row.asset,
        name,
        symbol,
        ticker,
        reason,
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
    <div className="ops-inline-edit">
      <input
        className="input ops-narrow"
        aria-label={m.ops_cur_symbol()}
        maxLength={3}
        value={symbol}
        onChange={(event) => setSymbol(event.target.value)}
      />
      <input
        className="input ops-narrow"
        aria-label={m.ops_cur_ticker()}
        maxLength={3}
        value={ticker}
        onChange={(event) => setTicker(event.target.value.toUpperCase())}
      />
      <input
        className="input ops-mid"
        aria-label={m.ops_col_name()}
        maxLength={CURRENCY_NAME_MAX}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className="input ops-mid"
        aria-label={m.ops_reason()}
        placeholder={m.ops_reason()}
        maxLength={200}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="button"
        className="button-small button-primary"
        aria-disabled={pending || !valid}
        onClick={() => void save()}
      >
        {m.ops_save()}
      </button>
      {message ? (
        <span className="ops-msg ops-msg-error" role="alert">
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function CurrenciesTab({ open, canEdit }: { open: OpenDetail; canEdit: boolean }) {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.currencies.list.query(undefined, { signal }), []),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const rows = loaded.data ?? [];
  return (
    <div className="ops-stack">
      <div className="ops-toolbar">
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
        <span className="dev-muted">{m.ops_cur_note()}</span>
      </div>
      <LoadState loaded={loaded} />
      <div className="dev-table-wrap">
        <table className="dev-table ops-nowrap">
          <thead>
            <tr>
              <th scope="col">{m.ops_cur_symbol()}</th>
              <th scope="col">{m.ops_cur_ticker()}</th>
              <th scope="col">{m.ops_col_name()}</th>
              <th scope="col">{m.ops_col_asset()}</th>
              <th scope="col">{m.ops_cur_issuer()}</th>
              <th scope="col" className="dev-num">
                {m.ops_cur_users()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_held()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_holders()}
              </th>
              {canEdit ? (
                <th scope="col">
                  <span className="visually-hidden">{m.ops_cur_edit()}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.asset}>
                {editing === row.asset ? (
                  <td colSpan={canEdit ? 9 : 8}>
                    <CurrencyEdit
                      row={row}
                      onDone={() => {
                        setEditing(null);
                        loaded.reload();
                      }}
                    />
                  </td>
                ) : (
                  <>
                    <td translate="no">
                      <b>{row.symbol}</b>
                    </td>
                    <td className="dev-code" translate="no">
                      {row.ticker}
                    </td>
                    <td>
                      {row.name}
                      {row.source === "admin" ? <span className="dev-badge">{m.ops_src_admin()}</span> : null}
                    </td>
                    <td className="dev-code">{row.asset}</td>
                    <td>
                      {row.issuer ? (
                        <button
                          type="button"
                          className="button-text"
                          onClick={() =>
                            row.issuer ? open({ kind: "faction", id: row.issuer.id }) : undefined
                          }
                        >
                          {row.issuer.name}
                        </button>
                      ) : (
                        m.ops_none()
                      )}
                    </td>
                    <td className="dev-num">{formatInt(row.factions)}</td>
                    <td className="dev-num">{formatBig(row.held)}</td>
                    <td className="dev-num">{formatInt(row.holders)}</td>
                    {canEdit ? (
                      <td>
                        <button type="button" className="button-small" onClick={() => setEditing(row.asset)}>
                          {m.ops_cur_edit()}
                        </button>
                      </td>
                    ) : null}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

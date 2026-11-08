// 운영자 콘솔 · 경제 탭 — 자산 총량(주체 보유·시스템 계정·보유자 수), 고른 자산의 상위 보유 주체, 최근 큰 거래, 운영자 지급·회수 거래.
// 기획 D-7025(관리자 경제 감시, 강하게)·D-7021(운영자 개입은 관리자 화면에서만 본다). 이상 거래 자동 표시 기준은 기획 답을 기다린다.
import { type FormEvent, useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { LoadState, formatBig, formatInt, formatTime, useOpsLoad } from "./opsUi.tsx";

export function EconomyTab() {
  const assetId = useId();
  const [input, setInput] = useState("");
  const [asset, setAsset] = useState("");
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.economy.summary.query({ asset }, { signal }), [asset]),
  );
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAsset(input.trim());
  }
  const data = loaded.data;
  return (
    <div className="ops-stack">
      <form className="ops-toolbar" onSubmit={submit}>
        <label htmlFor={assetId}>{m.ops_econ_asset()}</label>
        <input
          id={assetId}
          className="input"
          maxLength={96}
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="button-small">
          {m.ops_search()}
        </button>
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
      </form>
      <LoadState loaded={loaded} />
      {data ? (
        <>
          <section>
            <h2 className="ops-h">{m.ops_econ_totals()}</h2>
            <div className="dev-table-wrap ops-scroll">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.ops_col_asset()}</th>
                    <th scope="col" className="dev-num">
                      {m.ops_col_held()}
                    </th>
                    <th scope="col" className="dev-num">
                      {m.ops_col_system()}
                    </th>
                    <th scope="col" className="dev-num">
                      {m.ops_col_holders()}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.map((row) => (
                    <tr key={row.asset}>
                      <td>
                        <button
                          type="button"
                          className="button-text dev-code"
                          onClick={() => {
                            setInput(row.asset);
                            setAsset(row.asset);
                          }}
                        >
                          {row.asset}
                        </button>
                      </td>
                      <td className="dev-num">{formatBig(row.held)}</td>
                      <td className="dev-num">{formatBig(row.system)}</td>
                      <td className="dev-num">{formatInt(row.holders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="ops-h">{m.ops_econ_top()}</h2>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col">{m.ops_col_owner()}</th>
                    <th scope="col" className="dev-num">
                      {m.ops_col_balance()}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.top.map((row) => (
                    <tr key={row.ownerId}>
                      <td translate="no">
                        <span className="dev-badge">
                          {row.ownerKind === "user" ? m.ops_owner_user() : m.ops_owner_faction()}
                        </span>{" "}
                        {row.label} <span className="dev-muted">({row.ownerId})</span>
                      </td>
                      <td className="dev-num">{formatBig(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="ops-h">{m.ops_econ_large()}</h2>
            <div className="dev-table-wrap ops-scroll">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th scope="col" className="dev-num">
                      {m.ops_col_tx()}
                    </th>
                    <th scope="col">{m.ops_col_kind()}</th>
                    <th scope="col">{m.ops_col_time()}</th>
                    <th scope="col">{m.ops_col_asset()}</th>
                    <th scope="col">{m.ops_col_owner()}</th>
                    <th scope="col" className="dev-num">
                      {m.ops_col_amount()}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.largeEntries.map((row) => (
                    <tr key={`${row.txId}|${row.ownerId ?? ""}|${row.asset}|${row.amount}`}>
                      <td className="dev-num">{row.txId}</td>
                      <td className="dev-code">{row.kind}</td>
                      <td className="dev-muted">{formatTime(row.atMs)}</td>
                      <td className="dev-code">{row.asset}</td>
                      <td translate="no">{row.label}</td>
                      <td className="dev-num">{formatBig(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="ops-h">{m.ops_econ_operator()}</h2>
            {data.operatorTx.length === 0 ? (
              <p className="dev-muted">{m.ops_empty()}</p>
            ) : (
              <ul className="ops-list">
                {data.operatorTx.map((tx) => (
                  <li key={tx.txId}>
                    <span className="dev-code">
                      #{tx.txId} {tx.kind}
                    </span>{" "}
                    <span className="dev-muted">{formatTime(tx.atMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

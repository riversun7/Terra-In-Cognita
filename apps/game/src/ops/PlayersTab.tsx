// 운영자 콘솔 · 유저 탭 — 아이디·사이보그 이름 검색, 상태(접속·정지·운영진)·정렬, 줄마다 소속·레벨·유닛 수·화폐. 줄을 누르면 상세.
import { type FormEvent, useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, Pager, formatBig, formatInt, formatTime, useOpsLoad } from "./opsUi.tsx";

const PAGE = 50;
type Status = "all" | "online" | "banned" | "staff";
type Sort = "login" | "created" | "level";

export function PlayersTab({ open }: { open: OpenDetail }) {
  const searchId = useId();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<{ search: string; status: Status; sort: Sort; offset: number }>({
    search: "",
    status: "all",
    sort: "login",
    offset: 0,
  });
  const loaded = useOpsLoad(
    useCallback(
      (signal: AbortSignal) => api.ops.players.list.query({ ...query, limit: PAGE }, { signal }),
      [query],
    ),
  );
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setQuery((previous) => ({ ...previous, search: input.trim(), offset: 0 }));
  }
  const rows = loaded.data?.rows ?? [];
  return (
    <div className="ops-stack">
      <form role="search" className="ops-toolbar" onSubmit={submit}>
        <label htmlFor={searchId} className="visually-hidden">
          {m.ops_col_id()}
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="button-small">
          {m.ops_search()}
        </button>
        <label className="ops-inline">
          {m.ops_filter_status()}
          <select
            value={query.status}
            onChange={(event) => {
              const status = event.target.value;
              if (status === "all" || status === "online" || status === "banned" || status === "staff")
                setQuery((previous) => ({ ...previous, status, offset: 0 }));
            }}
          >
            <option value="all">{m.ops_filter_all()}</option>
            <option value="online">{m.ops_filter_online()}</option>
            <option value="banned">{m.ops_filter_banned()}</option>
            <option value="staff">{m.ops_filter_staff()}</option>
          </select>
        </label>
        <label className="ops-inline">
          {m.ops_filter_sort()}
          <select
            value={query.sort}
            onChange={(event) => {
              const sort = event.target.value;
              if (sort === "login" || sort === "created" || sort === "level")
                setQuery((previous) => ({ ...previous, sort, offset: 0 }));
            }}
          >
            <option value="login">{m.ops_sort_login()}</option>
            <option value="created">{m.ops_sort_created()}</option>
            <option value="level">{m.ops_sort_level()}</option>
          </select>
        </label>
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
      </form>
      <LoadState loaded={loaded} />
      <div className="dev-table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th scope="col">{m.ops_col_id()}</th>
              <th scope="col">{m.ops_col_status()}</th>
              <th scope="col">{m.ops_col_cyborg()}</th>
              <th scope="col" className="dev-num">
                {m.ops_col_level()}
              </th>
              <th scope="col">{m.ops_col_faction()}</th>
              <th scope="col" className="dev-num">
                {m.ops_col_units()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_credit()}
              </th>
              <th scope="col">{m.ops_col_roles()}</th>
              <th scope="col">{m.ops_col_created()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    type="button"
                    className="button-text dev-code"
                    translate="no"
                    onClick={() => open({ kind: "user", id: row.id })}
                  >
                    {row.loginId}
                  </button>
                </td>
                <td>
                  {row.banned ? (
                    <span className="dev-badge ops-bad">{m.ops_status_banned()}</span>
                  ) : row.online ? (
                    <span className="dev-badge ops-good">{m.ops_status_online()}</span>
                  ) : (
                    <span className="dev-muted">{m.ops_status_offline()}</span>
                  )}
                </td>
                <td translate="no">{row.cyborgName ?? m.ops_none()}</td>
                <td className="dev-num">{formatInt(row.level)}</td>
                <td>
                  {row.factionId === null ? (
                    m.ops_none()
                  ) : (
                    <button
                      type="button"
                      className="button-text"
                      onClick={() =>
                        row.factionId === null ? undefined : open({ kind: "faction", id: row.factionId })
                      }
                    >
                      {row.factionName}
                    </button>
                  )}
                </td>
                <td className="dev-num">{formatInt(row.units)}</td>
                <td className="dev-num">{formatBig(row.credit)}</td>
                <td className="dev-code">{row.roles.join(",")}</td>
                <td className="dev-muted">{formatTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        offset={query.offset}
        shown={rows.length}
        total={loaded.data?.total ?? 0}
        size={PAGE}
        onGo={(offset) => setQuery((previous) => ({ ...previous, offset }))}
      />
    </div>
  );
}

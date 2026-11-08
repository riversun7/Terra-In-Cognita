// 운영자 콘솔 · NPC 세력 탭·도시 탭 — 세력(종류·사라짐 포함 여부)과 도시(이름 검색). 줄을 누르면 세력 상세.
import { type FormEvent, useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, formatBig, formatInt, useOpsLoad } from "./opsUi.tsx";

type FactionKind = "all" | "npc" | "player";

export function FactionsTab({ open }: { open: OpenDetail }) {
  const [kind, setKind] = useState<FactionKind>("npc");
  const [includeDissolved, setIncludeDissolved] = useState(false);
  const loaded = useOpsLoad(
    useCallback(
      (signal: AbortSignal) => api.ops.npcs.factions.query({ kind, includeDissolved }, { signal }),
      [kind, includeDissolved],
    ),
  );
  const rows = loaded.data ?? [];
  return (
    <div className="ops-stack">
      <div className="ops-toolbar">
        <label className="ops-inline">
          {m.ops_filter_kind()}
          <select
            value={kind}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all" || value === "npc" || value === "player") setKind(value);
            }}
          >
            <option value="npc">{m.ops_kind_npc()}</option>
            <option value="player">{m.ops_kind_player()}</option>
            <option value="all">{m.ops_filter_all()}</option>
          </select>
        </label>
        <label className="ops-inline">
          <input
            type="checkbox"
            checked={includeDissolved}
            onChange={(event) => setIncludeDissolved(event.target.checked)}
          />
          {m.ops_include_dissolved()}
        </label>
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
        <span className="dev-muted">
          {m.ops_range({ from: rows.length === 0 ? 0 : 1, to: rows.length, total: rows.length })}
        </span>
      </div>
      <LoadState loaded={loaded} />
      <div className="dev-table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th scope="col" className="dev-num">
                {m.ops_col_num()}
              </th>
              <th scope="col">{m.ops_col_name()}</th>
              <th scope="col">{m.ops_col_kind()}</th>
              <th scope="col">{m.ops_col_regime()}</th>
              <th scope="col" className="dev-num">
                {m.ops_col_tech()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_cities()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_humans()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_units()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_members()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_wars()}
              </th>
              <th scope="col" className="dev-num">
                {m.ops_col_credit()}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.dissolved ? "ops-dim" : undefined}>
                <td className="dev-num">{row.id}</td>
                <td>
                  <button
                    type="button"
                    className="button-text"
                    onClick={() => open({ kind: "faction", id: row.id })}
                  >
                    {row.name}
                  </button>
                  {row.fixed ? <span className="dev-badge">{m.ops_f_fixed()}</span> : null}
                </td>
                <td>{row.kind === "npc" ? m.ops_kind_npc() : m.ops_kind_player()}</td>
                <td className="dev-code">{row.regime}</td>
                <td className="dev-num">{row.techLevel}</td>
                <td className="dev-num">{formatInt(row.cities)}</td>
                <td className="dev-num">{formatInt(row.humans)}</td>
                <td className="dev-num">{formatInt(row.units)}</td>
                <td className="dev-num">{formatInt(row.members)}</td>
                <td className="dev-num">{formatInt(row.wars)}</td>
                <td className="dev-num">{formatBig(row.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CitiesTab({ open }: { open: OpenDetail }) {
  const searchId = useId();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.npcs.cities.query({ search }, { signal }), [search]),
  );
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(input.trim());
  }
  const rows = loaded.data ?? [];
  return (
    <div className="ops-stack">
      <form role="search" className="ops-toolbar" onSubmit={submit}>
        <label htmlFor={searchId} className="visually-hidden">
          {m.ops_col_name()}
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          maxLength={40}
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
      <CityTable rows={rows} open={open} />
    </div>
  );
}

export function CityTable({
  rows,
  open,
}: {
  rows: Awaited<ReturnType<typeof api.ops.npcs.cities.query>>;
  open: OpenDetail;
}) {
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col" className="dev-num">
              {m.ops_col_num()}
            </th>
            <th scope="col">{m.ops_col_name()}</th>
            <th scope="col">{m.ops_col_owner()}</th>
            <th scope="col">{m.ops_col_where()}</th>
            <th scope="col" className="dev-num">
              {m.ops_col_humans()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_housing()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_development()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_admin_level()}
            </th>
            <th scope="col" className="dev-num">
              {m.ops_col_necessities()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="dev-num">{row.id}</td>
              <td translate="no">{row.name ?? m.ops_none()}</td>
              <td>
                <button
                  type="button"
                  className="button-text"
                  onClick={() => open({ kind: "faction", id: row.factionId })}
                >
                  {row.factionName}
                </button>
              </td>
              <td className="dev-code">
                {m.ops_where({ planet: row.planetId, map: row.mapKey, x: row.cellX, y: row.cellY })}
              </td>
              <td className="dev-num">{formatInt(row.humans)}</td>
              <td className="dev-num">{formatInt(row.housing)}</td>
              <td className="dev-num">{row.development}</td>
              <td className="dev-num">{row.adminLevel}</td>
              <td className="dev-num">{formatInt(row.necessitiesPm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

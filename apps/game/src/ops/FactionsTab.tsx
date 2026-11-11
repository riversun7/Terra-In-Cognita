// 운영자 콘솔 · 세력 관리 탭(docs/adr/2026-11-09-faction-profiles.md) — 모든 세력의 정체성(색·약어·이름)·체제·기술·도시·인구·만족도·유닛·
// 전쟁·봉신·화폐(기호·3글자 약어)·국고를 한 표로 본다. 요약 띠(살아 있는 수·체제별·종류별·전쟁 쌍), 거르기(종류·체제·글자·사라진 세력),
// 머리 칸을 눌러 정렬, CSV 내보내기. 줄을 누르면 세력 상세(정체성 고치기는 상세 판에서 — faction_edit).
import type { OpsFactionRow } from "@terra/shared/ops";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, formatBig, formatInt, useOpsLoad } from "./opsUi.tsx";

type FactionKind = "all" | "npc" | "player";
const REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
type Regime = (typeof REGIMES)[number];

const REGIME_LABELS: { readonly [R in Regime]: () => string } = {
  dictatorship: m.faction_regime_dictatorship,
  democracy: m.faction_regime_democracy,
  capitalism: m.faction_regime_capitalism,
};

const isRegime = (value: string): value is Regime => (REGIMES as readonly string[]).includes(value);

export function regimeLabel(regime: string): string {
  return isRegime(regime) ? REGIME_LABELS[regime]() : regime;
}

/** 색 표지 + 약어(색은 정체성 값 그대로 — 글자가 아니라 표지라 대비 검사 밖) */
export function FactionMark({ color, shortName }: { color: string | null; shortName: string | null }) {
  return (
    <span className="ops-fmark">
      <span className="ops-swatch" style={{ backgroundColor: color ?? "transparent" }} aria-hidden="true" />
      <span className="dev-code" translate="no">
        {shortName ?? m.ops_none()}
      </span>
    </span>
  );
}

type SortKey =
  | "id"
  | "name"
  | "regime"
  | "tech"
  | "cities"
  | "humans"
  | "satisfaction"
  | "units"
  | "members"
  | "wars"
  | "treasury";

const sortValue = (row: OpsFactionRow, key: SortKey): number | string => {
  switch (key) {
    case "id":
      return row.id;
    case "name":
      return row.name;
    case "regime":
      return row.regime;
    case "tech":
      return row.techLevel;
    case "cities":
      return row.cities;
    case "humans":
      return row.humans;
    case "satisfaction":
      return row.satisfactionMilli ?? -1;
    case "units":
      return row.units;
    case "members":
      return row.members;
    case "wars":
      return row.wars;
    case "treasury":
      return Number(row.treasury);
    default:
      return row.id;
  }
};

/** 만족도 밀리점(0~100000) → % */
export const satisfactionText = (milli: number | null): string =>
  milli === null ? m.ops_none() : `${(milli / 1000).toFixed(1)}%`;

const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** 보이는 줄을 CSV로 내려받는다(기기 안에서 만든다) */
function downloadCsv(rows: readonly OpsFactionRow[]): void {
  const head = [
    "id",
    "short",
    "name",
    "color",
    "kind",
    "regime",
    "tech",
    "cities",
    "humans",
    "housing",
    "satisfaction_pm",
    "units",
    "members",
    "wars",
    "truces",
    "vassals",
    "currency",
    "treasury",
    "fixed",
    "dissolved",
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.shortName,
      row.name,
      row.color,
      row.kind,
      row.regime,
      row.techLevel,
      row.cities,
      row.humans,
      row.housing,
      row.satisfactionMilli,
      row.units,
      row.members,
      row.wars,
      row.truces,
      row.vassals,
      row.currency?.ticker ?? null,
      row.treasury,
      String(row.fixed),
      String(row.dissolved),
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "factions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function FactionsTab({ open, planetId }: { open: OpenDetail; planetId?: string | undefined }) {
  const [kind, setKind] = useState<FactionKind>("all");
  const [regime, setRegime] = useState<Regime | "all">("all");
  const [search, setSearch] = useState("");
  const [includeDissolved, setIncludeDissolved] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "id", desc: false });
  const loaded = useOpsLoad(
    useCallback(
      (signal: AbortSignal) => api.ops.npcs.factions.query({ kind, includeDissolved, planetId }, { signal }),
      [kind, includeDissolved, planetId],
    ),
  );
  const data = loaded.data;
  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = all.filter(
      (row) =>
        (regime === "all" || row.regime === regime) &&
        (needle === "" ||
          [row.name, row.shortName ?? "", row.code ?? "", row.currency?.ticker ?? "", String(row.id)].some(
            (text) => text.toLowerCase().includes(needle),
          )),
    );
    const sign = sort.desc ? -1 : 1;
    return filtered.toSorted((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const order =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return order === 0 ? a.id - b.id : sign * order;
    });
  }, [all, regime, search, sort]);

  const alive = all.filter((row) => !row.dissolved);
  const regimeCount = (value: Regime): number => alive.filter((row) => row.regime === value).length;
  const warPairs = Math.round(alive.reduce((sum, row) => sum + row.wars, 0) / 2);

  const header = (key: SortKey, label: string, numeric = false): ReactNode => (
    <th
      scope="col"
      className={numeric ? "dev-num" : undefined}
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="button-text ops-sort"
        onClick={() =>
          setSort((previous) => ({ key, desc: previous.key === key ? !previous.desc : numeric }))
        }
      >
        {label}
        {sort.key === key ? (sort.desc ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  return (
    <div className="ops-stack">
      <ul className="ops-summary" aria-label={m.ops_fac_summary()}>
        <li>
          <b>{formatInt(alive.length)}</b> {m.ops_fac_alive()}
        </li>
        <li>
          <b>{formatInt(alive.filter((row) => row.kind === "npc").length)}</b> {m.ops_kind_npc()}
        </li>
        <li>
          <b>{formatInt(alive.filter((row) => row.kind === "player").length)}</b> {m.ops_kind_player()}
        </li>
        {REGIMES.map((value) => (
          <li key={value}>
            <b>{formatInt(regimeCount(value))}</b> {REGIME_LABELS[value]()}
          </li>
        ))}
        <li>
          <b>{formatInt(warPairs)}</b> {m.ops_ov_wars()}
        </li>
      </ul>
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
            <option value="all">{m.ops_filter_all()}</option>
            <option value="npc">{m.ops_kind_npc()}</option>
            <option value="player">{m.ops_kind_player()}</option>
          </select>
        </label>
        <label className="ops-inline">
          {m.ops_col_regime()}
          <select
            value={regime}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all" || isRegime(value)) setRegime(value);
            }}
          >
            <option value="all">{m.ops_filter_all()}</option>
            {REGIMES.map((value) => (
              <option key={value} value={value}>
                {REGIME_LABELS[value]()}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input ops-mid"
          type="search"
          aria-label={m.ops_fac_search()}
          placeholder={m.ops_fac_search()}
          maxLength={40}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
        <button
          type="button"
          className="button-small"
          aria-disabled={rows.length === 0}
          onClick={() => (rows.length > 0 ? downloadCsv(rows) : undefined)}
        >
          {m.ops_fac_csv()}
        </button>
        <span className="dev-muted">
          {m.ops_range({ from: rows.length === 0 ? 0 : 1, to: rows.length, total: all.length })}
        </span>
      </div>
      <LoadState loaded={loaded} />
      <div className="dev-table-wrap">
        <table className="dev-table ops-nowrap">
          <thead>
            <tr>
              {header("id", m.ops_col_num(), true)}
              <th scope="col">{m.ops_fac_mark()}</th>
              {header("name", m.ops_col_name())}
              <th scope="col">{m.ops_col_kind()}</th>
              {header("regime", m.ops_col_regime())}
              {header("tech", m.ops_col_tech(), true)}
              {header("cities", m.ops_col_cities(), true)}
              {header("humans", m.ops_fac_people(), true)}
              {header("satisfaction", m.ops_fac_satisfaction(), true)}
              {header("units", m.ops_col_units(), true)}
              {header("members", m.ops_col_members(), true)}
              {header("wars", m.ops_fac_diplomacy(), true)}
              <th scope="col">{m.ops_fac_currency()}</th>
              {header("treasury", m.ops_fac_treasury(), true)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.dissolved ? "ops-dim" : undefined}>
                <td className="dev-num">{row.id}</td>
                <td>
                  <FactionMark color={row.color} shortName={row.shortName} />
                </td>
                <td>
                  <button
                    type="button"
                    className="button-text"
                    onClick={() => open({ kind: "faction", id: row.id })}
                  >
                    {row.name}
                  </button>
                  {row.fixed ? <span className="dev-badge">{m.ops_f_fixed()}</span> : null}
                  {row.dissolved ? <span className="dev-badge ops-bad">{m.ops_fac_dissolved()}</span> : null}
                </td>
                <td>{row.kind === "npc" ? m.ops_kind_npc() : m.ops_kind_player()}</td>
                <td>{regimeLabel(row.regime)}</td>
                <td className="dev-num">{row.techLevel}</td>
                <td className="dev-num">{formatInt(row.cities)}</td>
                <td className="dev-num">
                  {m.ops_f_of({ a: formatInt(row.humans), b: formatInt(row.housing) })}
                </td>
                <td className="dev-num">{satisfactionText(row.satisfactionMilli)}</td>
                <td className="dev-num">{formatInt(row.units)}</td>
                <td className="dev-num">{formatInt(row.members)}</td>
                <td className="dev-num">
                  {m.ops_fac_diplomacy_value({ wars: row.wars, truces: row.truces, vassals: row.vassals })}
                </td>
                <td>
                  {row.currency ? (
                    <span translate="no">
                      <b>{row.currency.symbol}</b> <span className="dev-code">{row.currency.ticker}</span>
                    </span>
                  ) : (
                    m.ops_none()
                  )}
                </td>
                <td className="dev-num">
                  {row.currency ? `${row.currency.symbol} ` : ""}
                  {formatBig(row.treasury)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

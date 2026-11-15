// 채집 오브젝트 편집기(/dev/gather-objects) — 기획 D-552(사용자 "오브젝트마다 3d 모델 및 티어범위, 해당오브젝트 출현 2차맵 지형등을 관리하는
// 에디터페이지 만들어라"), docs/adr/2026-11-15-gather-object-tiers.md 7절. dev·admin, 틀 안, 촘촘(개발 화면 층 ADR 2026-11-02-dev-ui).
// - 목록: 채집 오브젝트 전부(자리 종류로 거르기·이름 찾기) — 이름·자리·대표 아이템(원자재 종류)·티어 범위·양.
// - 판(고른 오브젝트): 3D 모델(소품 그림)·대표 아이템·양·티어 범위·나오는 2차맵 지형(바이옴·지표·천분율)·유효 스탯 하나의 나오는 아이템 확률.
// - [차이 내보내기]: 바뀐 항목만 `terra-tuning-diff`(분류 gather_objects) → `pnpm tuning:apply <파일>`. 바로 적용은 없다(서버를 다시 켜면 든다 —
//   지형 오브젝트 편집기와 같다).
// 자료는 행성 편집기 정의 조회(planetEditor.definitions — gather_objects·biomes 원본 항목 + gatherRefs: 원자재 아이템·중분류·확률표).
// 조각 이름 GatherObjectsScreen-*([Gg]atherObjects, 미리 캐시 밖).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { GatherObjectPanel } from "./GatherObjectPanel.tsx";
import {
  type GatherRefs,
  type GatherSource,
  type JsonEntry,
  type LocalName,
  buildDiff,
  changedEntries,
  objectRows,
} from "./gatherObjectsModel.ts";
import { SOURCE_TEXT, download, nameText } from "./gatherObjectsText.ts";
import "./gatherObjects.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly entries: readonly JsonEntry[];
      readonly biomes: readonly { readonly id: string; readonly name: LocalName }[];
      readonly refs: GatherRefs;
      readonly contentVersion: string;
    };

const EMPTY_REFS: GatherRefs = { items: [], subcategories: [], bands: [] };

function biomesOf(list: readonly JsonEntry[]): { id: string; name: LocalName }[] {
  const out: { id: string; name: LocalName }[] = [];
  for (const entry of list) {
    if (typeof entry.id !== "string") continue;
    const name = entry.name;
    const ko = typeof name === "object" && name !== null && "ko" in name ? String(name.ko) : entry.id;
    const en = typeof name === "object" && name !== null && "en" in name ? String(name.en) : entry.id;
    out.push({ id: entry.id, name: { ko, en } });
  }
  return out;
}

const FILTERS: readonly (GatherSource | "all")[] = [
  "all",
  "prop",
  "rock",
  "plot",
  "outcrop",
  "site",
  "school",
];

export default function GatherObjectsScreen() {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const locale = getLocale() === "en" ? "en" : "ko";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [edited, setEdited] = useState<readonly JsonEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<GatherSource | "all">("all");
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let live = true;
    api.planetEditor.definitions.query().then(
      (definitions) => {
        if (!live) return;
        const entries = definitions.gatherObjects;
        setLoad({
          status: "ready",
          entries,
          biomes: biomesOf(definitions.biomes),
          refs: definitions.gatherRefs ?? EMPTY_REFS,
          contentVersion: definitions.contentVersion,
        });
        setEdited(entries);
        setSelected((current) => current ?? (typeof entries[0]?.id === "string" ? entries[0].id : null));
      },
      () => {
        if (live) setLoad({ status: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const ready = load.status === "ready" ? load : null;
  const rows = useMemo(() => (ready && edited ? objectRows(edited, ready.refs) : []), [ready, edited]);
  const changes = ready && edited ? changedEntries(ready.entries, edited) : [];
  const changedIds = new Set(changes.map((change) => change.id));
  const itemName = (id: string): string => {
    const found = ready?.refs.items.find((item) => item.id === id);
    return found ? nameText(found.name, locale) : id;
  };
  const subName = (id: string): string => {
    const found = ready?.refs.subcategories.find((sub) => sub.id === id);
    return found ? nameText(found.name, locale) : id;
  };
  const needle = query.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (filter === "all" || row.source === filter) &&
      (needle === "" ||
        row.id.includes(needle) ||
        nameText(row.name, locale).toLowerCase().includes(needle) ||
        itemName(row.item).toLowerCase().includes(needle)),
  );
  const entry = edited?.find((candidate) => candidate.id === selected) ?? null;

  const update = (next: readonly JsonEntry[]) => {
    setEdited(next);
    setExported(false);
  };

  return (
    <section
      className="screen screen-wide go-screen"
      aria-labelledby="gather-objects-title"
      data-density="compact"
      data-status={load.status}
      data-rows={shown.length}
      data-changes={changes.length}
      data-selected={selected ?? ""}
    >
      <div className="screen-header">
        <h1 id="gather-objects-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_gather_objects()}
        </h1>
        <BackButton />
      </div>
      <p className="lead go-lead">{m.dev_gather_objects_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_gather_objects_loading()}</p> : null}
      {load.status === "failed" ? (
        <p role="alert" className="field-error">
          {m.dev_gather_objects_failed()}
        </p>
      ) : null}
      {ready && edited ? (
        <>
          <div className="go-filters">
            <label className="go-field">
              <span>{m.dev_gather_objects_filter()}</span>
              <select
                value={filter}
                onChange={(event) => {
                  const value = FILTERS.find((option) => option === event.currentTarget.value);
                  if (value) setFilter(value);
                }}
              >
                {FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? m.dev_gather_objects_filter_all() : SOURCE_TEXT[option]()}
                  </option>
                ))}
              </select>
            </label>
            <label className="go-field go-search">
              <span>{m.dev_gather_objects_search()}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </label>
          </div>
          <div className="go-layout">
            <div className="dev-table-wrap go-list">
              <table className="dev-table go-table">
                <caption className="visually-hidden">{m.dev_gather_objects_table()}</caption>
                <thead>
                  <tr>
                    <th scope="col">{m.dev_gather_objects_col_name()}</th>
                    <th scope="col">{m.dev_gather_objects_col_source()}</th>
                    <th scope="col">{m.dev_gather_objects_col_item()}</th>
                    <th scope="col">{m.dev_gather_objects_col_tiers()}</th>
                    <th scope="col" className="dev-num">
                      {m.dev_gather_objects_col_lots()}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr
                      key={row.id}
                      data-row={row.id}
                      data-source={row.source}
                      aria-selected={row.id === selected}
                      data-changed={changedIds.has(row.id) ? "" : undefined}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="go-pick"
                          aria-pressed={row.id === selected}
                          onClick={() => setSelected(row.id)}
                        >
                          <span className="go-name">{nameText(row.name, locale)}</span>
                          <code className="go-id">{row.id}</code>
                        </button>
                      </th>
                      <td>
                        <span className="dev-badge">{SOURCE_TEXT[row.source]()}</span>
                      </td>
                      <td>
                        <span className="go-item">
                          {row.table ? m.dev_gather_objects_table_item() : itemName(row.item)}
                        </span>
                        {row.subcategory ? (
                          <span className="dev-muted go-sub">{subName(row.subcategory)}</span>
                        ) : null}
                      </td>
                      <td data-tiers={row.range ? `${row.range.min}-${row.range.max}` : ""}>
                        {row.range ? (
                          <span className="go-range">{`T${row.range.min}~T${row.range.max}`}</span>
                        ) : (
                          <span className="dev-muted">—</span>
                        )}
                      </td>
                      <td className="dev-num">{row.lots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length === 0 ? <p className="dev-muted">{m.dev_gather_objects_empty()}</p> : null}
            </div>
            {entry ? (
              <GatherObjectPanel
                entry={entry}
                entries={edited}
                refs={ready.refs}
                biomes={ready.biomes}
                locale={locale}
                onChange={update}
              />
            ) : null}
          </div>
          <div className="go-pending" role="status">
            <span>{m.dev_gather_objects_changes({ count: changes.length })}</span>
            <button
              type="button"
              className="button-small"
              disabled={changes.length === 0}
              onClick={() => update(ready.entries)}
            >
              {m.dev_gather_objects_revert()}
            </button>
            <button
              type="button"
              className="button-small button-primary"
              disabled={changes.length === 0}
              onClick={() => {
                void buildDiff(ready.entries, edited, ready.contentVersion, new Date().toISOString()).then(
                  (diff) => {
                    download("gather-objects-diff.json", `${JSON.stringify(diff, null, 2)}\n`);
                    setExported(true);
                  },
                );
              }}
            >
              {m.dev_gather_objects_export()}
            </button>
          </div>
          {exported ? <p className="field-hint">{m.dev_gather_objects_exported()}</p> : null}
        </>
      ) : null}
    </section>
  );
}

// 지형 오브젝트 편집기(/dev/terrain-objects) — 기획 D-536("각각의 지형에는 최소 5가지 이상의 2차맵 오브젝트를 만들어야한다"), D-398(콘텐츠
// 종류·양은 개발자 페이지에서). dev·admin, 틀 안, 촘촘(개발 화면 층 ADR 2026-11-02-dev-ui).
// - 위: 지형(바이옴 14개) 칩 — 지형마다 이 화면에서 고치는 오브젝트 종류 수(5 아래면 경고 표지).
// - 표: 고른 지형의 오브젝트(장식·판정 소품·물 위 소품·지형별 채집 자리·움직이는 어군)와 양(비중‰·묶음‰·어군 수). 양을 고치거나 뺀다.
// - 느림 배율 칸(기획 D-540 질문 1223 나): 마른 칸 흩기 소품의 느림 배율(‰, 1001 ~ 5000, 비우면 없음 — 모든 지형에 같이 든다).
// - [더하기]: 아직 그 지형에 없는 소품·채집 오브젝트를 그 지형에 더한다.
// - [차이 내보내기]: 바뀐 항목만 `terra-tuning-diff` 파일로 받는다 → `pnpm tuning:apply <파일>`이 팩에 넣는다. 바로 적용(덮어쓰기 층)은
//   없다: 소품 규칙은 2차맵 지형 캐시 열쇠라 서버를 다시 켤 때 든다(docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-12)").
// 자료는 행성 편집기 정의 조회(planetEditor.definitions — map_props·gather_objects·biomes 원본 항목, 감사 기록을 남기는 조회)에서 받는다.
// 조각 이름 TerrainObjectsScreen-*([Tt]errainObjects, 미리 캐시 밖).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import {
  type JsonEntry,
  type TerrainEntries,
  type TerrainRow,
  type TerrainRowKind,
  SLOW_RANGE,
  addableRows,
  amountRange,
  buildDiff,
  changedEntries,
  kindCounts,
  setAmount,
  setSlow,
  terrainRows,
} from "./terrainObjectsModel.ts";
import "./terrainObjects.css";

interface Biome {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
}

type Load =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly entries: TerrainEntries;
      readonly biomes: readonly Biome[];
      readonly contentVersion: string;
    };

/** 5종 아래면 경고(기획 D-536) */
const MIN_KINDS = 5;

const KIND_TEXT: Readonly<Record<TerrainRowKind, () => string>> = {
  decor: m.dev_terrain_objects_kind_decor,
  slow: m.dev_terrain_objects_kind_slow,
  cover: m.dev_terrain_objects_kind_cover,
  water: m.dev_terrain_objects_kind_water,
  site: m.dev_terrain_objects_kind_site,
  school: m.dev_terrain_objects_kind_school,
};

const UNIT_TEXT: Readonly<Record<TerrainRowKind, () => string>> = {
  decor: m.dev_terrain_objects_unit_weight,
  slow: m.dev_terrain_objects_unit_weight,
  cover: m.dev_terrain_objects_unit_weight,
  water: m.dev_terrain_objects_unit_weight,
  site: m.dev_terrain_objects_unit_chance,
  school: m.dev_terrain_objects_unit_count,
};

function biomesOf(list: readonly JsonEntry[]): Biome[] {
  const out: Biome[] = [];
  for (const entry of list) {
    const name = entry.name;
    if (typeof entry.id !== "string") continue;
    const ko = typeof name === "object" && name !== null && "ko" in name ? String(name.ko) : entry.id;
    const en = typeof name === "object" && name !== null && "en" in name ? String(name.en) : entry.id;
    out.push({ id: entry.id, name: { ko, en } });
  }
  return out;
}

/** 파일 내려받기(브라우저) */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TerrainObjectsScreen() {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const locale = getLocale() === "en" ? "en" : "ko";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [edited, setEdited] = useState<TerrainEntries | null>(null);
  const [biome, setBiome] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let live = true;
    api.planetEditor.definitions.query().then(
      (definitions) => {
        if (!live) return;
        const entries = { mapProps: definitions.mapProps, gatherObjects: definitions.gatherObjects };
        const biomes = biomesOf(definitions.biomes);
        setLoad({ status: "ready", entries, biomes, contentVersion: definitions.contentVersion });
        setEdited(entries);
        setBiome((current) => current ?? biomes[0]?.id ?? null);
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
  const counts = useMemo(
    () =>
      ready && edited
        ? kindCounts(
            edited,
            ready.biomes.map((entry) => entry.id),
          )
        : new Map<string, number>(),
    [ready, edited],
  );
  const rows: TerrainRow[] = ready && edited && biome ? terrainRows(edited, biome) : [];
  const candidates: TerrainRow[] = ready && edited && biome ? addableRows(edited, biome) : [];
  const changes = ready && edited ? changedEntries(ready.entries, edited) : [];
  const nameText = (name: { readonly ko: string; readonly en: string }) => name[locale];

  const update = (row: TerrainRow, amount: number | null) => {
    if (!edited || !biome) return;
    setEdited(setAmount(edited, row.category, row.id, biome, amount));
    setExported(false);
  };

  const updateSlow = (row: TerrainRow, slowPm: number | null) => {
    if (!edited) return;
    setEdited(setSlow(edited, row.id, slowPm));
    setExported(false);
  };

  return (
    <section
      className="screen screen-wide to-screen"
      aria-labelledby="terrain-objects-title"
      data-density="compact"
      data-status={load.status}
      data-biome={biome ?? ""}
      data-rows={rows.length}
      data-changes={changes.length}
    >
      <div className="screen-header">
        <h1 id="terrain-objects-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_terrain_objects()}
        </h1>
        <BackButton />
      </div>
      <p className="lead to-lead">{m.dev_terrain_objects_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_terrain_objects_loading()}</p> : null}
      {load.status === "failed" ? (
        <p role="alert" className="field-error">
          {m.dev_terrain_objects_failed()}
        </p>
      ) : null}
      {ready && edited ? (
        <>
          <div className="to-biomes" role="group" aria-label={m.dev_terrain_objects_biomes()}>
            {ready.biomes.map((entry) => {
              const count = counts.get(entry.id) ?? 0;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="to-biome"
                  data-biome={entry.id}
                  data-low={count < MIN_KINDS ? "" : undefined}
                  aria-pressed={entry.id === biome}
                  onClick={() => {
                    setBiome(entry.id);
                    setAdding("");
                  }}
                >
                  <span className="to-biome-name">{nameText(entry.name)}</span>
                  <span className="dev-badge" data-tone={count < MIN_KINDS ? "warn" : "ok"}>
                    {m.dev_terrain_objects_kinds({ count })}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="dev-muted to-note">{m.dev_terrain_objects_common_note()}</p>
          <div className="dev-table-wrap">
            <table className="dev-table to-table">
              <caption className="visually-hidden">{m.dev_terrain_objects_table()}</caption>
              <thead>
                <tr>
                  <th scope="col">{m.dev_terrain_objects_col_name()}</th>
                  <th scope="col">{m.dev_terrain_objects_col_kind()}</th>
                  <th scope="col">{m.dev_terrain_objects_col_amount()}</th>
                  <th scope="col">{m.dev_terrain_objects_col_slow()}</th>
                  <th scope="col">
                    <span className="visually-hidden">{m.dev_terrain_objects_col_actions()}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const range = amountRange(row.kind);
                  const label = nameText(row.name);
                  return (
                    <tr key={`${row.category}/${row.id}`} data-row={row.id} data-kind={row.kind}>
                      <th scope="row">
                        <span className="to-name">{label}</span>
                        <code className="to-id">{row.id}</code>
                      </th>
                      <td>
                        <span className="dev-badge" data-kind={row.kind}>
                          {KIND_TEXT[row.kind]()}
                        </span>
                      </td>
                      <td>
                        <label className="to-amount">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={range.min}
                            max={range.max}
                            value={row.amount}
                            aria-label={m.dev_terrain_objects_amount_label({ name: label })}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value);
                              if (Number.isFinite(value) && value > 0) update(row, value);
                            }}
                          />
                          <span className="dev-muted">{UNIT_TEXT[row.kind]()}</span>
                        </label>
                      </td>
                      <td>
                        {row.slowEditable ? (
                          <label className="to-amount">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={SLOW_RANGE.min}
                              max={SLOW_RANGE.max}
                              step={50}
                              value={row.slowPm ?? ""}
                              placeholder={m.dev_terrain_objects_slow_none()}
                              aria-label={m.dev_terrain_objects_slow_label({ name: label })}
                              onChange={(event) => {
                                const text = event.currentTarget.value;
                                const value = Number(text);
                                if (text === "") updateSlow(row, null);
                                else if (Number.isFinite(value)) updateSlow(row, value);
                              }}
                            />
                            <span className="dev-muted">{m.dev_terrain_objects_unit_slow()}</span>
                          </label>
                        ) : (
                          <span className="dev-muted">{m.dev_terrain_objects_slow_na()}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button-small"
                          aria-label={m.dev_terrain_objects_remove_label({ name: label })}
                          onClick={() => update(row, null)}
                        >
                          {m.dev_terrain_objects_remove()}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="to-add">
            <label className="to-add-pick">
              <span>{m.dev_terrain_objects_add_label()}</span>
              <select value={adding} onChange={(event) => setAdding(event.currentTarget.value)}>
                <option value="">{m.dev_terrain_objects_add_none()}</option>
                {candidates.map((row) => (
                  <option key={`${row.category}/${row.id}`} value={`${row.category}/${row.id}`}>
                    {`${nameText(row.name)} · ${KIND_TEXT[row.kind]()}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button-small"
              disabled={adding === ""}
              onClick={() => {
                const row = candidates.find((entry) => `${entry.category}/${entry.id}` === adding);
                if (!row) return;
                // 처음 양: 어군 2마리, 그 밖 천분율 20 [임시]
                update(row, row.kind === "school" ? 2 : 20);
                setAdding("");
              }}
            >
              {m.dev_terrain_objects_add()}
            </button>
          </div>
          <div className="to-pending" role="status">
            <span>{m.dev_terrain_objects_changes({ count: changes.length })}</span>
            <button
              type="button"
              className="button-small"
              disabled={changes.length === 0}
              onClick={() => {
                setEdited(ready.entries);
                setExported(false);
              }}
            >
              {m.dev_terrain_objects_revert()}
            </button>
            <button
              type="button"
              className="button-small button-primary"
              disabled={changes.length === 0}
              onClick={() => {
                void buildDiff(ready.entries, edited, ready.contentVersion, new Date().toISOString()).then(
                  (diff) => {
                    download("terrain-objects-diff.json", `${JSON.stringify(diff, null, 2)}\n`);
                    setExported(true);
                  },
                );
              }}
            >
              {m.dev_terrain_objects_export()}
            </button>
          </div>
          {exported ? <p className="field-hint">{m.dev_terrain_objects_exported()}</p> : null}
        </>
      ) : null}
    </section>
  );
}

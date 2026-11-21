// 지형 오브젝트 편집 패널(통합 2차맵·지형 오브젝트 화면의 오른쪽 탭) — PC 기준 촘촘 구성.
// - 위: 바이옴 14개 칩(5종 미만 경고) + 2차맵 연동 토글·[다른 칸]·[현재 맵 지형으로]
// - 가운데 위: 선택 오브젝트 대화형 3D 로우폴리 모델 카드(PropModelInspector)
// - 표: 모든 행에 실제 3D 로우폴리 렌더 썸네일(단일 오프스크린 PropThumbnailRenderer) + 비율 슬라이더·숫자 입력 + 느림 + 티어 + 현재 맵 개수·[찾기] + 빼기
// - 아래: 오브젝트 추가 + 바뀐 항목 수·되돌리기·차이 내보내기(terrain-objects-diff.json → pnpm tuning:apply)
import { PropThumbnailRenderer, defaultGroundForArt } from "@terra/engine/propPreview";
import { mapPropArtCode } from "@terra/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  SLOW_RANGE,
  TIER_RANGE,
  type TerrainEntries,
  type TerrainRow,
  type TerrainRowKind,
  addableRows,
  amountRange,
  buildDiff,
  changedEntries,
  kindCounts,
  setAmount,
  setSlow,
  setTierRange,
  terrainRows,
} from "../terrainObjects/terrainObjectsModel.ts";
import { PropModelInspector } from "./PropModelInspector.tsx";
import type { ArtPlacementSummary, CellSpot } from "./labGatherPreview.ts";

export interface BiomeOption {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly color: string;
}

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

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export interface TerrainObjectsPanelProps {
  readonly original: TerrainEntries;
  readonly edited: TerrainEntries;
  readonly biomes: readonly BiomeOption[];
  readonly contentVersion: string;
  readonly locale: "ko" | "en";
  readonly biome: string;
  /** 지금 왼쪽 2차맵의 바이옴 ID(없으면 null) */
  readonly mapBiomeId: string | null;
  readonly syncMapWithBiome: boolean;
  readonly mapBusy: boolean;
  /** 현재 열린 2차맵의 소품 그림별 배치 개수·좌표 */
  readonly artSummary: ReadonlyMap<number, ArtPlacementSummary>;
  /** 현재 열린 2차맵의 채집 자리·어군 항목별 배치 좌표 */
  readonly gatherSpotsById: ReadonlyMap<string, readonly CellSpot[]>;
  readonly onSelectBiome: (biomeId: string) => void;
  readonly onToggleSync: (sync: boolean) => void;
  readonly onNextCell: () => void;
  readonly onEdited: (next: TerrainEntries) => void;
  readonly onLocate: (rowKey: string, spots: readonly CellSpot[]) => void;
}

export function TerrainObjectsPanel(props: TerrainObjectsPanelProps) {
  const {
    original,
    edited,
    biomes,
    contentVersion,
    locale,
    biome,
    mapBiomeId,
    syncMapWithBiome,
    mapBusy,
    artSummary,
    gatherSpotsById,
    onSelectBiome,
    onToggleSync,
    onNextCell,
    onEdited,
    onLocate,
  } = props;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [exported, setExported] = useState(false);
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(() => new Map());
  const thumbRendererRef = useRef<PropThumbnailRenderer | null>(null);

  const counts = useMemo(
    () =>
      kindCounts(
        edited,
        biomes.map((entry) => entry.id),
      ),
    [edited, biomes],
  );
  const rows = useMemo(() => terrainRows(edited, biome), [edited, biome]);
  const candidates = useMemo(() => addableRows(edited, biome), [edited, biome]);
  const changes = useMemo(() => changedEntries(original, edited), [original, edited]);

  const activeRow = rows.find((row) => `${row.category}/${row.id}` === selectedKey) ?? rows[0] ?? null;
  const activeKey = activeRow ? `${activeRow.category}/${activeRow.id}` : null;

  // 단일 오프스크린 WebGL 썸네일 렌더러(마운트 시 한 번만 생성)
  useEffect(() => {
    try {
      thumbRendererRef.current = new PropThumbnailRenderer(112);
    } catch {
      thumbRendererRef.current = null;
    }
    return () => {
      thumbRendererRef.current?.dispose();
      thumbRendererRef.current = null;
    };
  }, []);

  // 현재 바이옴 행들의 3D 로우폴리 썸네일 생성·캐시
  useEffect(() => {
    const renderer = thumbRendererRef.current;
    if (!renderer) return;
    const isSnow = biome === "ice_sheet" || biome === "tundra";
    let added = false;
    const updates = new Map<string, string>();
    for (const row of rows) {
      if (!row.art) continue;
      const ground = defaultGroundForArt(row.art, biome);
      const cacheKey = `${row.art}:${ground}`;
      const url = renderer.render(row.art, ground, isSnow);
      if (url) {
        updates.set(cacheKey, url);
        added = true;
      }
    }
    if (!added) return;
    queueMicrotask(() => {
      setThumbs((prev) => {
        let dirty = false;
        for (const [k, v] of updates) {
          if (prev.get(k) !== v) {
            dirty = true;
            break;
          }
        }
        if (!dirty) return prev;
        const next = new Map(prev);
        for (const [k, v] of updates) next.set(k, v);
        return next;
      });
    });
  }, [rows, biome]);

  const nameText = (name: { readonly ko: string; readonly en: string }) => name[locale];
  const mapBiomeName = useMemo(() => {
    if (!mapBiomeId) return null;
    const found = biomes.find((entry) => entry.id === mapBiomeId);
    return found ? found.name[locale] : mapBiomeId;
  }, [biomes, mapBiomeId, locale]);

  const rowPlacement = (row: TerrainRow): { count: number; spots: readonly CellSpot[] } => {
    if (row.category === "gather_objects") {
      const spots = gatherSpotsById.get(row.id) ?? [];
      return { count: spots.length, spots };
    }
    const code = mapPropArtCode(row.art);
    const info = code > 0 ? artSummary.get(code) : undefined;
    return { count: info?.count ?? 0, spots: info?.samples ?? [] };
  };

  const updateAmount = (row: TerrainRow, amount: number | null) => {
    onEdited(setAmount(edited, row.category, row.id, biome, amount));
    setExported(false);
  };

  const updateSlow = (row: TerrainRow, slowPm: number | null) => {
    onEdited(setSlow(edited, row.id, slowPm));
    setExported(false);
  };

  const updateTier = (row: TerrainRow, edge: "min" | "max", value: number) => {
    onEdited(setTierRange(edited, row.id, edge, value));
    setExported(false);
  };

  const activePlacement = activeRow ? rowPlacement(activeRow) : { count: 0, spots: [] };

  return (
    <div
      className="to-screen"
      data-status="ready"
      data-biome={biome}
      data-rows={rows.length}
      data-changes={changes.length}
    >
      {/* 1. 지형(바이옴 14개) 칩 + 2차맵 연동 바 */}
      <div className="to-biomes-bar">
        <div className="to-biomes" role="group" aria-label={m.dev_terrain_objects_biomes()}>
          {biomes.map((entry) => {
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
                  onSelectBiome(entry.id);
                  setAdding("");
                }}
              >
                <span className="to-biome-dot" aria-hidden="true" style={{ backgroundColor: entry.color }} />
                <span className="to-biome-name">{nameText(entry.name)}</span>
                <span className="dev-badge" data-tone={count < MIN_KINDS ? "warn" : "ok"}>
                  {m.dev_terrain_objects_kinds({ count })}
                </span>
              </button>
            );
          })}
        </div>
        <div className="to-sync-row">
          <label className="to-sync-check">
            <input
              type="checkbox"
              checked={syncMapWithBiome}
              onChange={(event) => onToggleSync(event.currentTarget.checked)}
            />
            <span>{m.dev_terrain_lab_sync_map()}</span>
          </label>
          <button type="button" className="button-small" disabled={mapBusy} onClick={onNextCell}>
            {m.dev_terrain_lab_next_cell()}
          </button>
          {mapBiomeId && mapBiomeId !== biome && mapBiomeName ? (
            <button type="button" className="button-small" onClick={() => onSelectBiome(mapBiomeId)}>
              {m.dev_terrain_lab_sync_current_biome({ biome: mapBiomeName })}
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. 선택 오브젝트 3D 로우폴리 미리 보기 카드 */}
      <PropModelInspector
        row={activeRow}
        biomeId={biome}
        locale={locale}
        mapCount={activePlacement.count}
        onLocate={() => {
          if (activeKey && activePlacement.spots.length > 0) {
            onLocate(activeKey, activePlacement.spots);
          }
        }}
      />

      {/* 3. 오브젝트 목록·비율 편집 표 */}
      <div className="dev-table-wrap to-table-wrap">
        <table className="dev-table to-table">
          <caption className="visually-hidden">{m.dev_terrain_objects_table()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_terrain_objects_col_name()}</th>
              <th scope="col">{m.dev_terrain_objects_col_kind()}</th>
              <th scope="col">{m.dev_terrain_objects_col_amount()}</th>
              <th scope="col">{m.dev_terrain_objects_col_slow()}</th>
              <th scope="col">{m.dev_terrain_objects_col_tiers()}</th>
              <th scope="col">{m.dev_terrain_lab_col_map_count()}</th>
              <th scope="col">
                <span className="visually-hidden">{m.dev_terrain_objects_col_actions()}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = `${row.category}/${row.id}`;
              const range = amountRange(row.kind);
              const label = nameText(row.name);
              const ground = defaultGroundForArt(row.art, biome);
              const thumbUrl = thumbs.get(`${row.art}:${ground}`);
              const placement = rowPlacement(row);
              const isSelected = rowKey === activeKey;

              return (
                <tr
                  key={rowKey}
                  data-row={row.id}
                  data-kind={row.kind}
                  data-selected={isSelected ? "true" : undefined}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="to-row-pick"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedKey(rowKey)}
                    >
                      <span className="to-thumb-box" aria-hidden="true">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="to-thumb" />
                        ) : (
                          <span className="to-thumb-empty">3D</span>
                        )}
                      </span>
                      <span className="to-row-meta">
                        <span className="to-name">{label}</span>
                        <code className="to-id">{row.id}</code>
                      </span>
                    </button>
                  </th>
                  <td>
                    <span className="dev-badge" data-kind={row.kind}>
                      {KIND_TEXT[row.kind]()}
                    </span>
                  </td>
                  <td>
                    <div className="to-amount-edit">
                      <input
                        type="range"
                        className="to-slider"
                        min={range.min}
                        max={range.max}
                        step={row.kind === "school" ? 1 : 5}
                        value={row.amount}
                        aria-label={m.dev_terrain_lab_amount_slider({ name: label })}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (Number.isFinite(value) && value > 0) {
                            setSelectedKey(rowKey);
                            updateAmount(row, value);
                          }
                        }}
                      />
                      <label className="to-amount">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={range.min}
                          max={range.max}
                          value={row.amount}
                          aria-label={m.dev_terrain_objects_amount_label({ name: label })}
                          onFocus={() => setSelectedKey(rowKey)}
                          onChange={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (Number.isFinite(value) && value > 0) updateAmount(row, value);
                          }}
                        />
                        <span className="dev-muted">{UNIT_TEXT[row.kind]()}</span>
                      </label>
                    </div>
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
                          onFocus={() => setSelectedKey(rowKey)}
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
                    {row.tierRange ? (
                      <span
                        className="to-amount to-tiers"
                        data-tiers={`${row.tierRange.min}-${row.tierRange.max}`}
                      >
                        {(["min", "max"] as const).map((edge) => (
                          <label key={edge} className="to-tier">
                            <span className="dev-muted">T</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={TIER_RANGE.min}
                              max={TIER_RANGE.max}
                              value={row.tierRange?.[edge] ?? 0}
                              aria-label={
                                edge === "min"
                                  ? m.dev_terrain_objects_tier_min_label({ name: label })
                                  : m.dev_terrain_objects_tier_max_label({ name: label })
                              }
                              onFocus={() => setSelectedKey(rowKey)}
                              onChange={(event) => {
                                const value = Number(event.currentTarget.value);
                                if (event.currentTarget.value !== "" && Number.isFinite(value))
                                  updateTier(row, edge, value);
                              }}
                            />
                          </label>
                        ))}
                      </span>
                    ) : (
                      <span className="dev-muted">{m.dev_terrain_objects_slow_na()}</span>
                    )}
                  </td>
                  <td className="to-count-cell">
                    {placement.count > 0 ? (
                      <button
                        type="button"
                        className="button-small to-count-btn"
                        aria-label={m.dev_terrain_lab_locate_aria({ name: label })}
                        onClick={() => {
                          setSelectedKey(rowKey);
                          onLocate(rowKey, placement.spots);
                        }}
                      >
                        {row.kind === "school"
                          ? m.dev_terrain_lab_locate_schools({ count: placement.count })
                          : m.dev_terrain_lab_locate_short({ count: placement.count })}
                      </button>
                    ) : (
                      <span className="dev-muted">{m.dev_terrain_lab_locate_zero()}</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button-small"
                      aria-label={m.dev_terrain_objects_remove_label({ name: label })}
                      onClick={() => updateAmount(row, null)}
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

      {/* 4. 하단 고정: 추가·변경 되돌리기·차이 내보내기 */}
      <footer className="to-footer">
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
              updateAmount(row, row.kind === "school" ? 2 : 20);
              setSelectedKey(`${row.category}/${row.id}`);
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
              onEdited(original);
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
              void buildDiff(original, edited, contentVersion, new Date().toISOString()).then((diff) => {
                download("terrain-objects-diff.json", `${JSON.stringify(diff, null, 2)}\n`);
                setExported(true);
              });
            }}
          >
            {m.dev_terrain_objects_export()}
          </button>
        </div>
        {exported ? <p className="field-hint to-export-hint">{m.dev_terrain_objects_exported()}</p> : null}
      </footer>
    </div>
  );
}

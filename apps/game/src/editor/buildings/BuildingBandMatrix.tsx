// 구간 × 재료 표(건물 편집기 건설 재료 판) — docs/adr/2026-11-10-editor-input-controls.md. 줄 = 레벨 구간, 열 = 재료, 칸 = 수량(묶음).
// 여러 칸을 골라(Shift·Ctrl+누름, 머리 = 열 전체) 한꺼번에 바꾸거나(값으로·더하기·곱하기·선형·등비 채우기) 모서리를 끌어 아래로 채운다.
// 머리의 곡선은 레벨마다 실제로 드는 수량(round(수량 × Lv² × 분류 배율))이다. [레벨마다 나누기] = 레벨 하나에 구간 하나(레벨 표는 그대로).
// 재료를 더하거나 빼기·시작 레벨은 아래 구간 판(BandEditor)에서 한다. 칸은 공용 NumberField라 담음·팩과 다름 표지가 붙는다.
import {
  type BuildingEditorItem,
  FACILITY_BUILD_LIMITS,
  type FacilityJson,
} from "@terra/shared/buildingEditor";
import { m } from "../../paraglide/messages.js";
import { NumberField } from "../content/contentEditorFields.tsx";
import { GridBulkBar, Sparkline, useGridSelection } from "../content/contentEditorGrid.tsx";
import { pickedByColumn } from "../content/contentEditorNumeric.ts";
import {
  type LevelRow,
  bandMatrix,
  bandRange,
  bulkEditBandMatrix,
  maxLevelOf,
  setMaterial,
  splitBandsPerLevel,
} from "./buildingModel.ts";

export function BuildingBandMatrix({
  entry,
  items,
  rows,
  locale,
  onEdit,
}: {
  entry: FacilityJson;
  items: readonly BuildingEditorItem[];
  /** 레벨 표(곡선: 레벨마다 실제 수량) */
  rows: readonly LevelRow[];
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const grid = useGridSelection();
  const build = entry.build;
  if (!build) return null;
  const matrix = bandMatrix(entry);
  const nameOf = (id: string): string => items.find((item) => item.id === id)?.name[locale] ?? id;
  const bandTitle = (index: number): string => {
    const range = bandRange(entry, index);
    return range === null || range.from === range.to
      ? m.dev_buildings_band_title_one({ from: build.levels[index]?.from ?? 1 })
      : m.dev_buildings_band_title({ from: range.from, to: range.to });
  };
  const picked = pickedByColumn(grid.picked);
  const pickedCells = [...picked].flatMap(([col, bands]) =>
    bands.filter((band) => matrix.cells[band]?.[col] != null).map((band) => `${band}:${col}`),
  );
  const canFill = [...picked].some(
    ([col, bands]) => bands.filter((band) => matrix.cells[band]?.[col] != null).length >= 2,
  );
  const canSplit = build.levels.length < maxLevelOf(entry);
  return (
    <div className="be-matrix">
      <div className="ce-inline-actions">
        <h4 className="be-subheading">{m.dev_buildings_matrix_title()}</h4>
        {canSplit ? (
          <button
            type="button"
            className="button-small be-split-levels"
            onClick={() => {
              grid.clear();
              onEdit(splitBandsPerLevel(entry));
            }}
          >
            {m.dev_buildings_split_levels()}
          </button>
        ) : null}
      </div>
      <GridBulkBar
        count={pickedCells.length}
        limits={FACILITY_BUILD_LIMITS.qty}
        canFill={canFill}
        onApply={(op) => onEdit(bulkEditBandMatrix(entry, pickedCells, op))}
        onClear={grid.clear}
      />
      <div className="dev-table-wrap">
        <table className="dev-table be-matrix-table">
          <caption className="visually-hidden">{m.dev_buildings_matrix_title()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_buildings_col_levels()}</th>
              {matrix.items.map((item, col) => (
                <th key={item} scope="col" data-item={item}>
                  <button
                    type="button"
                    className="ce-col-pick"
                    aria-label={m.dev_grid_select_column({ name: nameOf(item) })}
                    onClick={() => grid.pickColumn(col, build.levels.length)}
                  >
                    {nameOf(item)}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="be-matrix-curves">
              <th scope="row">{m.dev_buildings_curve_row()}</th>
              {matrix.items.map((item, col) => (
                <td key={item}>
                  <Sparkline
                    name={nameOf(item)}
                    tone={(col % 9) + 1}
                    values={rows.map((row) => row.materials.find((stack) => stack.item === item)?.qty ?? 0)}
                  />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.cells.map((cells, band) => (
              // oxlint-disable-next-line react/no-array-index-key -- 구간 차례가 곧 열쇠다
              <tr key={band} data-band={band}>
                <th scope="row">{bandTitle(band)}</th>
                {cells.map((cell, col) => {
                  const item = matrix.items[col] ?? "";
                  return (
                    <td key={item} className="be-matrix-cell" data-item={item} {...grid.cellProps(band, col)}>
                      {cell ? (
                        <>
                          <NumberField
                            label={m.dev_buildings_matrix_qty({ band: bandTitle(band), item: nameOf(item) })}
                            hideLabel
                            path={`build.levels[${band}].materials[${cell.line}].qty`}
                            value={cell.qty}
                            min={FACILITY_BUILD_LIMITS.qty.min}
                            max={FACILITY_BUILD_LIMITS.qty.max}
                            onChange={(qty) => {
                              if (qty !== undefined)
                                onEdit(setMaterial(entry, band, cell.line, { item, qty }));
                            }}
                          />
                          {grid.fillHandle(band, col, (from, to) => {
                            const bands = Array.from(
                              { length: Math.abs(to - from) + 1 },
                              (_, step) => Math.min(from, to) + step,
                            );
                            onEdit(
                              bulkEditBandMatrix(
                                entry,
                                bands.map((at) => `${at}:${col}`),
                                { kind: "set", value: cell.qty },
                              ),
                            );
                          })}
                        </>
                      ) : (
                        <span className="dev-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ce-input-keys">{m.dev_buildings_matrix_hint()}</p>
    </div>
  );
}

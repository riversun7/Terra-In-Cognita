// 건설 재료 판 — 분류 배율, 레벨 구간(시작 레벨 + 재료 줄: 아이템·수량), 레벨 표(레벨마다 재료·시간·자리·채집 보너스. 화폐 유지비 없음 — D-171·49 N50).
// D-508: 처음 레벨(Lv1)은 1차 원자재, 그 위 대부분은 가공품. 식은 @terra/shared/facilityBuild(옛 building_seed.js, 49 M14) 하나다.
// 옛 관리자 건물 편집기의 "건설 비용"(자원 코드 + 수량 줄)·"건설 시간"·"유지 비용" 칸을 레벨 구간 + 레벨 표로 옮겼다.
import {
  type BuildLevelJson,
  type BuildingEditorItem,
  type BuildingEditorListResponse,
  FACILITY_BUILD_LIMITS,
  type FacilityJson,
} from "@terra/shared/buildingEditor";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import {
  addBand,
  addMaterial,
  bandRange,
  formatDuration,
  levelRows,
  maxLevelOf,
  newBuild,
  removeBand,
  removeMaterial,
  setBand,
  setMaterial,
} from "./buildingModel.ts";

/** 재료로 고를 수 있는 아이템 대분류(장비·소모품·문서는 건설 재료로 쓰지 않는다) */
const MATERIAL_CATEGORIES = new Set(["raw", "processed", "part", "construction", "gem"]);

function optionsFor(
  items: readonly BuildingEditorItem[],
  locale: "ko" | "en",
  current: string,
): { value: string; label: string }[] {
  return items
    .filter((item) => MATERIAL_CATEGORIES.has(item.category) || item.id === current)
    .map((item) => {
      const name = item.name[locale];
      return {
        value: item.id,
        label: item.enabled
          ? m.dev_buildings_item_option({ name, id: item.id })
          : m.dev_buildings_item_option_off({ name, id: item.id }),
      };
    });
}

function BandEditor({
  entry,
  index,
  band,
  items,
  locale,
  onEdit,
}: {
  entry: FacilityJson;
  index: number;
  band: BuildLevelJson;
  items: readonly BuildingEditorItem[];
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const headingId = useId();
  const range = bandRange(entry, index);
  const pickable = items.filter((item) => MATERIAL_CATEGORIES.has(item.category));
  const nameOf = (id: string): string => items.find((item) => item.id === id)?.name[locale] ?? id;
  const title =
    range === null || range.from === range.to
      ? m.dev_buildings_band_title_one({ from: band.from })
      : m.dev_buildings_band_title({ from: range.from, to: range.to });
  return (
    <section className="be-band" aria-labelledby={headingId} data-band={index}>
      <div className="be-band-head">
        <h4 id={headingId} className="be-subheading">
          {title}
        </h4>
        {index > 0 ? (
          <NumberField
            label={m.dev_buildings_field_from()}
            className="be-from"
            value={band.from}
            min={1}
            max={maxLevelOf(entry)}
            onChange={(value) => {
              if (value !== undefined) onEdit(setBand(entry, index, { ...band, from: value }));
            }}
          />
        ) : null}
        {index > 0 ? (
          <button
            type="button"
            className="button-small be-remove-band"
            onClick={() => onEdit(removeBand(entry, index))}
          >
            {m.dev_buildings_remove_band()}
          </button>
        ) : null}
      </div>
      <ul className="be-materials">
        {band.materials.map((stack, line) => (
          <li key={`${stack.item}-${line}`} className="be-material" data-item={stack.item}>
            <SelectField
              label={m.dev_buildings_field_item()}
              hideLabel={line > 0}
              className="be-material-item"
              value={stack.item}
              options={optionsFor(items, locale, stack.item)}
              onChange={(item) => onEdit(setMaterial(entry, index, line, { ...stack, item }))}
            />
            <NumberField
              label={m.dev_buildings_field_qty()}
              hideLabel={line > 0}
              className="be-material-qty"
              value={stack.qty}
              min={FACILITY_BUILD_LIMITS.qty.min}
              max={FACILITY_BUILD_LIMITS.qty.max}
              onChange={(qty) => {
                if (qty !== undefined) onEdit(setMaterial(entry, index, line, { ...stack, qty }));
              }}
            />
            {band.materials.length > 1 ? (
              <RemoveButton
                name={nameOf(stack.item)}
                onClick={() => onEdit(removeMaterial(entry, index, line))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {band.materials.length < FACILITY_BUILD_LIMITS.materials ? (
        <button
          type="button"
          className="button-small be-add-material"
          onClick={() => onEdit(addMaterial(entry, index, pickable))}
        >
          {m.dev_buildings_add_material()}
        </button>
      ) : null}
    </section>
  );
}

export function BuildingLevels({
  list,
  entry,
  locale,
  onEdit,
}: {
  list: BuildingEditorListResponse;
  entry: FacilityJson;
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const build = entry.build;
  const pickable = list.items.filter((item) => MATERIAL_CATEGORIES.has(item.category));
  const nameOf = new Map(list.items.map((item) => [item.id, item.name[locale]]));
  const rows = levelRows(entry, list.items, list.rules, list.gatherLevelBonus);
  const canAddBand =
    build !== undefined &&
    build.levels.length < FACILITY_BUILD_LIMITS.levels &&
    (build.levels.at(-1)?.from ?? 0) < maxLevelOf(entry);
  return (
    <>
      <section className="be-panel be-section" aria-labelledby="be-build-title">
        <h3 id="be-build-title" className="be-heading">
          {m.dev_buildings_section_build()}
        </h3>
        <p className="field-hint">{m.dev_buildings_build_hint()}</p>
        {build ? (
          <>
            <NumberField
              label={m.dev_buildings_field_mul()}
              className="be-mul"
              value={build.mulPm}
              min={FACILITY_BUILD_LIMITS.mulPm.min}
              max={FACILITY_BUILD_LIMITS.mulPm.max}
              onChange={(mulPm) => {
                if (mulPm !== undefined) onEdit({ ...entry, build: { ...build, mulPm } });
              }}
            />
            <div className="be-bands">
              {build.levels.map((band, index) => (
                <BandEditor
                  key={`band-${index}`}
                  entry={entry}
                  index={index}
                  band={band}
                  items={list.items}
                  locale={locale}
                  onEdit={onEdit}
                />
              ))}
            </div>
            {canAddBand ? (
              <button
                type="button"
                className="button-small be-add-band"
                onClick={() => onEdit(addBand(entry))}
              >
                {m.dev_buildings_add_band()}
              </button>
            ) : null}
          </>
        ) : (
          <div className="be-actions">
            <p className="field-hint">{m.dev_buildings_no_build()}</p>
            <button type="button" className="button-small" onClick={() => onEdit(newBuild(entry, pickable))}>
              {m.dev_buildings_new_build()}
            </button>
          </div>
        )}
      </section>
      <section className="be-panel be-section" aria-labelledby="be-levels-title">
        <h3 id="be-levels-title" className="be-heading">
          {m.dev_buildings_levels_title()}
        </h3>
        <p className="field-hint">{m.dev_buildings_levels_hint({ msPerKg: list.rules.msPerKg })}</p>
        <div className="dev-table-wrap">
          <table className="dev-table be-level-table">
            <thead>
              <tr>
                <th scope="col" className="dev-num">
                  {m.dev_buildings_col_level()}
                </th>
                <th scope="col">{m.dev_buildings_col_materials()}</th>
                <th scope="col" className="dev-num">
                  {m.dev_buildings_col_time()}
                </th>
                <th scope="col" className="dev-num">
                  {m.dev_buildings_col_slots_total()}
                </th>
                {entry.gather ? (
                  <th scope="col" className="dev-num">
                    {m.dev_buildings_col_bonus()}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.level} data-level={row.level} data-band-from={row.from ?? undefined}>
                  <th scope="row" className="dev-num">
                    {row.level}
                  </th>
                  <td className="be-level-materials">
                    {row.materials.length === 0 ? (
                      <span className="dev-muted">—</span>
                    ) : (
                      <ul className="be-plain-list">
                        {row.materials.map((stack) => (
                          <li key={stack.item}>
                            {m.dev_buildings_material_qty({
                              name: nameOf.get(stack.item) ?? stack.item,
                              qty: stack.qty,
                            })}
                            {row.disabled.includes(stack.item) ? (
                              <>
                                {" "}
                                <span className="dev-badge be-badge-off">
                                  {m.dev_buildings_material_off()}
                                </span>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.unknownWeight.length > 0 ? (
                      <p className="field-hint">
                        {m.dev_buildings_unknown_weight({ items: row.unknownWeight.join(", ") })}
                      </p>
                    ) : null}
                  </td>
                  <td className="dev-num">{row.materials.length === 0 ? "—" : formatDuration(row.timeMs)}</td>
                  <td className="dev-num">{row.slots}</td>
                  {row.gatherBonus === null ? null : <td className="dev-num">+{row.gatherBonus}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

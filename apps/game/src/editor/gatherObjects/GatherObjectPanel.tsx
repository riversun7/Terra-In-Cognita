// 채집 오브젝트 편집기의 오브젝트 판(기획 D-552 — docs/adr/2026-11-15-gather-object-tiers.md 7절): 3D 모델·대표 아이템(원자재 종류)·양·
// 티어 범위·나오는 2차맵 지형과 유효 스탯 하나의 나오는 아이템 확률. 값은 모두 팩 항목(JSON)을 고치고 화면(GatherObjectsScreen)이 차이로 내보낸다.
// 바뀜 (기획 D-562 1561·1565): 같은 티어 아이템마다 비중 칸, 밭·물터의 물 종류(민물·바다) 칸.
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  CHANCE_RANGE,
  COUNT_RANGE,
  type GatherRefs,
  type JsonEntry,
  LOTS_RANGE,
  type LocalName,
  MODEL_ARTS,
  SURFACES,
  TIER_MAX,
  TIER_MIN,
  WATERS,
  WEIGHT_RANGE,
  biomesOf,
  chancePreview,
  effectiveRange,
  itemGroups,
  modelsOf,
  setBiome,
  setChance,
  setItem,
  setItemWeight,
  setLots,
  setTierRange,
  sourceOf,
  surfacesOf,
  toggleModel,
  toggleSurface,
  toggleWater,
  watersOf,
  weightTiers,
} from "./gatherObjectsModel.ts";
import { SOURCE_TEXT, SURFACE_TEXT, WATER_TEXT, nameText, percentText } from "./gatherObjectsText.ts";

/** 미리 보기 유효 스탯 범위(채집 확률표 마지막 구간 260을 넘는 값까지) */
const STAT_RANGE = { min: 0, max: 300 } as const;
const TIERS = Array.from({ length: TIER_MAX - TIER_MIN + 1 }, (_, index) => TIER_MIN + index);

interface Props {
  readonly entry: JsonEntry;
  readonly entries: readonly JsonEntry[];
  readonly refs: GatherRefs;
  readonly biomes: readonly { readonly id: string; readonly name: LocalName }[];
  readonly locale: "ko" | "en";
  readonly onChange: (next: readonly JsonEntry[]) => void;
}

/** 숫자 입력 값(비었거나 숫자가 아니면 undefined) */
function numberOf(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function GatherObjectPanel({ entry, entries, refs, biomes, locale, onChange }: Props) {
  const [stat, setStat] = useState(20);
  const [addBiome, setAddBiome] = useState("");
  const [addModel, setAddModel] = useState("");
  const id = typeof entry.id === "string" ? entry.id : "";
  const source = sourceOf(entry);
  const tableRows: readonly unknown[] = Array.isArray(entry.table) ? entry.table : [];
  const table = Array.isArray(entry.table);
  const item = typeof entry.item === "string" ? entry.item : "";
  const range = effectiveRange(entry, refs);
  const rangeSet = typeof entry.tierRange === "object" && entry.tierRange !== null;
  const lots = typeof entry.lots === "number" ? entry.lots : 1;
  const models = modelsOf(entry);
  const biomeRows = biomesOf(entry);
  const surfaces = surfacesOf(entry);
  const waters = watersOf(entry);
  const tierWeights = weightTiers(entry, refs);
  const chancePm = typeof entry.chancePm === "number" ? entry.chancePm : null;
  const preview = chancePreview(entry, refs, stat);
  const itemRef = refs.items.find((candidate) => candidate.id === item);
  const subName = refs.subcategories.find((sub) => sub.id === itemRef?.subcategory)?.name;
  const nameOf = (name: unknown): string =>
    typeof name === "object" && name !== null && locale in name ? String(Reflect.get(name, locale)) : id;
  const itemName = (itemId: string): string => {
    const found = refs.items.find((candidate) => candidate.id === itemId);
    return found ? nameText(found.name, locale) : itemId;
  };
  const biomeName = (biomeId: string): string => {
    const found = biomes.find((biome) => biome.id === biomeId);
    return found ? nameText(found.name, locale) : biomeId;
  };
  const label = nameOf(entry.name);
  const addableBiomes = biomes.filter((biome) => !biomeRows.some((row) => row.biome === biome.id));
  const multiModel = source === "prop";

  return (
    <section className="go-panel" aria-labelledby="go-panel-title" data-object={id} data-source={source}>
      <header className="go-panel-head">
        <h2 id="go-panel-title" className="go-panel-title">
          {label}
        </h2>
        <code className="go-id">{id}</code>
        <span className="dev-badge">{SOURCE_TEXT[source]()}</span>
      </header>

      <div className="go-block" data-part="model">
        <h3 className="go-block-title">{m.dev_gather_objects_model()}</h3>
        {source === "rock" ? (
          <p className="dev-muted">{m.dev_gather_objects_model_rock()}</p>
        ) : multiModel ? (
          <>
            <ul className="go-chips" aria-label={m.dev_gather_objects_model()}>
              {models.map((art) => (
                <li key={art}>
                  <code>{art}</code>
                  <button
                    type="button"
                    className="button-small"
                    disabled={models.length <= 1}
                    aria-label={m.dev_gather_objects_model_remove({ art })}
                    onClick={() => onChange(toggleModel(entries, id, art))}
                  >
                    {m.dev_gather_objects_remove()}
                  </button>
                </li>
              ))}
            </ul>
            <div className="go-row">
              <label className="go-field">
                <span>{m.dev_gather_objects_model_add()}</span>
                <select value={addModel} onChange={(event) => setAddModel(event.currentTarget.value)}>
                  <option value="">{m.dev_gather_objects_pick()}</option>
                  {MODEL_ARTS.filter((art) => !models.includes(art)).map((art) => (
                    <option key={art} value={art}>
                      {art}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button-small"
                disabled={addModel === ""}
                onClick={() => {
                  onChange(toggleModel(entries, id, addModel));
                  setAddModel("");
                }}
              >
                {m.dev_gather_objects_add()}
              </button>
            </div>
            <p className="field-hint">{m.dev_gather_objects_model_prop_hint()}</p>
          </>
        ) : (
          <label className="go-field">
            <span>{m.dev_gather_objects_model_pick()}</span>
            <select
              value={models[0] ?? ""}
              onChange={(event) => onChange(toggleModel(entries, id, event.currentTarget.value))}
            >
              {MODEL_ARTS.map((art) => (
                <option key={art} value={art}>
                  {art}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="go-block" data-part="item">
        <h3 className="go-block-title">{m.dev_gather_objects_item()}</h3>
        {table ? (
          <>
            <p className="field-hint">{m.dev_gather_objects_table_hint()}</p>
            <ul className="go-list-plain">
              {tableRows.map((row, index) => {
                const rowItem = typeof row === "object" && row !== null ? Reflect.get(row, "item") : "";
                const weight = typeof row === "object" && row !== null ? Reflect.get(row, "weightPm") : 0;
                return (
                  <li key={`${String(rowItem)}-${index}`}>
                    {`${itemName(String(rowItem))} · ${String(weight)}‰`}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <label className="go-field">
              <span>{m.dev_gather_objects_item_pick()}</span>
              <select
                value={item}
                onChange={(event) => onChange(setItem(entries, id, event.currentTarget.value, refs))}
              >
                {itemGroups(refs).map((group) => (
                  <optgroup key={group.subcategory} label={nameText(group.name, locale)}>
                    {group.items.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {`T${candidate.tier} ${nameText(candidate.name, locale)}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <p className="dev-muted" data-part="kind">
              {m.dev_gather_objects_kind({
                kind: subName ? nameText(subName, locale) : "—",
                tier: itemRef?.tier ?? 0,
              })}
            </p>
          </>
        )}
      </div>

      <div className="go-block go-grid2">
        <label className="go-field" data-part="lots">
          <span>{m.dev_gather_objects_lots()}</span>
          <input
            type="number"
            inputMode="numeric"
            min={LOTS_RANGE.min}
            max={LOTS_RANGE.max}
            value={lots}
            onChange={(event) => {
              const value = numberOf(event.currentTarget.value);
              if (value !== undefined) onChange(setLots(entries, id, value));
            }}
          />
        </label>
        {chancePm !== null ? (
          <label className="go-field" data-part="chance">
            <span>{m.dev_gather_objects_chance()}</span>
            <input
              type="number"
              inputMode="numeric"
              min={CHANCE_RANGE.min}
              max={CHANCE_RANGE.max}
              value={chancePm}
              onChange={(event) => {
                const value = numberOf(event.currentTarget.value);
                if (value !== undefined) onChange(setChance(entries, id, value));
              }}
            />
          </label>
        ) : null}
      </div>

      <div className="go-block" data-part="tiers" data-tiers={range ? `${range.min}-${range.max}` : ""}>
        <h3 className="go-block-title">{m.dev_gather_objects_tiers()}</h3>
        {range ? (
          <>
            <div className="go-row">
              {(["min", "max"] as const).map((edge) => (
                <label key={edge} className="go-field">
                  <span>
                    {edge === "min" ? m.dev_gather_objects_tier_min() : m.dev_gather_objects_tier_max()}
                  </span>
                  <select
                    value={range[edge]}
                    data-edge={edge}
                    onChange={(event) =>
                      onChange(setTierRange(entries, refs, id, edge, Number(event.currentTarget.value)))
                    }
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {`T${tier}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="field-hint">
              {rangeSet ? m.dev_gather_objects_tiers_hint() : m.dev_gather_objects_tiers_default()}
            </p>
          </>
        ) : (
          <p className="dev-muted">{m.dev_gather_objects_tiers_table()}</p>
        )}
      </div>

      {range && tierWeights.length > 0 ? (
        <div className="go-block" data-part="weights">
          <h3 className="go-block-title">{m.dev_gather_objects_weights()}</h3>
          <ul className="go-weights">
            {tierWeights.map((row) => (
              <li key={row.tier} data-tier={row.tier} data-weighted={row.weighted ? "true" : "false"}>
                <span className="go-weight-tier">
                  {`T${row.tier}`}
                  <span className="dev-muted">
                    {row.weighted
                      ? m.dev_gather_objects_weights_set()
                      : m.dev_gather_objects_weights_default()}
                  </span>
                </span>
                <span className="go-weight-items">
                  {row.items.map((candidate) => (
                    <label key={candidate.id} className="go-weight" data-item={candidate.id}>
                      <span>{itemName(candidate.id)}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={WEIGHT_RANGE.min}
                        max={WEIGHT_RANGE.max}
                        placeholder="—"
                        value={candidate.weight ?? ""}
                        aria-label={m.dev_gather_objects_weight_of({ item: itemName(candidate.id) })}
                        onChange={(event) =>
                          onChange(
                            setItemWeight(
                              entries,
                              id,
                              candidate.id,
                              numberOf(event.currentTarget.value) ?? null,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="field-hint">{m.dev_gather_objects_weights_hint()}</p>
        </div>
      ) : null}

      <div className="go-block" data-part="terrain">
        <h3 className="go-block-title">{m.dev_gather_objects_terrain()}</h3>
        {source === "prop" ? <p className="dev-muted">{m.dev_gather_objects_terrain_prop()}</p> : null}
        {source === "rock" ? <p className="dev-muted">{m.dev_gather_objects_terrain_rock()}</p> : null}
        {source === "site" || source === "school" ? (
          <>
            <ul className="go-biomes">
              {biomeRows.map((row) => (
                <li key={row.biome} data-biome={row.biome}>
                  <span className="go-biome-name">{biomeName(row.biome)}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={source === "school" ? COUNT_RANGE.min : CHANCE_RANGE.min}
                    max={source === "school" ? COUNT_RANGE.max : CHANCE_RANGE.max}
                    value={row.amount}
                    aria-label={m.dev_gather_objects_biome_amount({ biome: biomeName(row.biome) })}
                    onChange={(event) => {
                      const value = numberOf(event.currentTarget.value);
                      if (value !== undefined) onChange(setBiome(entries, id, row.biome, value));
                    }}
                  />
                  <span className="dev-muted">
                    {source === "school"
                      ? m.dev_gather_objects_unit_count()
                      : m.dev_gather_objects_unit_chance()}
                  </span>
                  <button
                    type="button"
                    className="button-small"
                    disabled={biomeRows.length <= 1}
                    aria-label={m.dev_gather_objects_biome_remove({ biome: biomeName(row.biome) })}
                    onClick={() => onChange(setBiome(entries, id, row.biome, null))}
                  >
                    {m.dev_gather_objects_remove()}
                  </button>
                </li>
              ))}
            </ul>
            <div className="go-row">
              <label className="go-field">
                <span>{m.dev_gather_objects_biome_add()}</span>
                <select value={addBiome} onChange={(event) => setAddBiome(event.currentTarget.value)}>
                  <option value="">{m.dev_gather_objects_pick()}</option>
                  {addableBiomes.map((biome) => (
                    <option key={biome.id} value={biome.id}>
                      {nameText(biome.name, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button-small"
                disabled={addBiome === ""}
                onClick={() => {
                  // 처음 양: 어군 2떼, 그 밖 묶음 천분율 20 [임시](지형 오브젝트 편집기와 같다)
                  onChange(setBiome(entries, id, addBiome, source === "school" ? 2 : 20));
                  setAddBiome("");
                }}
              >
                {m.dev_gather_objects_add()}
              </button>
            </div>
          </>
        ) : null}
        {source === "plot" ? (
          <>
            <div
              className="go-surfaces"
              role="group"
              aria-label={m.dev_gather_objects_waters()}
              data-part="waters"
            >
              {WATERS.map((water) => (
                <button
                  key={water}
                  type="button"
                  className="go-surface"
                  data-water={water}
                  aria-pressed={waters.includes(water)}
                  onClick={() => onChange(toggleWater(entries, id, water))}
                >
                  {WATER_TEXT[water]()}
                </button>
              ))}
            </div>
            <p className="field-hint">{m.dev_gather_objects_waters_hint()}</p>
          </>
        ) : null}
        {source === "plot" || source === "outcrop" || source === "site" ? (
          <div className="go-surfaces" role="group" aria-label={m.dev_gather_objects_surfaces()}>
            {SURFACES.map((surface) => (
              <button
                key={surface}
                type="button"
                className="go-surface"
                data-surface={surface}
                aria-pressed={surfaces.includes(surface)}
                onClick={() => onChange(toggleSurface(entries, id, surface))}
              >
                {SURFACE_TEXT[surface]()}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="go-block" data-part="preview">
        <h3 className="go-block-title">{m.dev_gather_objects_preview()}</h3>
        <label className="go-field go-stat">
          <span>{m.dev_gather_objects_stat({ stat })}</span>
          <input
            type="range"
            min={STAT_RANGE.min}
            max={STAT_RANGE.max}
            step={5}
            value={stat}
            onChange={(event) => setStat(Number(event.currentTarget.value))}
          />
        </label>
        <ul className="go-chances" aria-label={m.dev_gather_objects_preview()}>
          {preview.map((row) => (
            <li key={row.item} data-item={row.item} data-tier={row.tier}>
              <span className="go-chance-name">{`T${row.tier} ${itemName(row.item)}`}</span>
              <span className="go-bar" aria-hidden="true">
                <span className="go-bar-fill" style={{ inlineSize: `${Math.round(row.ppm / 10_000)}%` }} />
              </span>
              <span className="dev-num">{percentText(row.ppm)}</span>
            </li>
          ))}
        </ul>
        <p className="field-hint">{m.dev_gather_objects_preview_hint()}</p>
      </div>
    </section>
  );
}

// 2차맵 시험 화면의 판(조작·칸 정보) — 그리기만 한다(상태는 SecondMapLabScreen.tsx). 휴대폰은 지도 아래, 넓은 화면은 옆.
// 판은 섹션 다섯: 자리(행성·빨리 가기·면 i j·키), 시각(낮밤·지역 시각), 고저(높이 과장), 보기(이웃·격자·모델 거리·상한), 칸 정보.
import type { MapPreset, PlanetCellValues } from "@terra/planet/secondMap";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { formatLocalTime } from "../../map/secondMapSky.ts";
import { EXAGGERATION_STEPS, type LabPointInfo } from "./labTerrain.ts";
import {
  LAB_PRESETS,
  PRESET_TEXT,
  artText,
  coverText,
  formatNumber,
  localName,
  surfaceText,
} from "./labMessages.ts";
import type { LabMap, LabPlanet } from "./labSource.ts";
import type { BiomeOption } from "./TerrainObjectsPanel.tsx";

/** 게임 높이 → 실제 높이 배율(@terra/planet generator VERTICAL_SCALE) */
const VERTICAL_SCALE = 12;

export interface LabSettings {
  readonly sky: boolean;
  /** 지역 시각(시, 0~24) */
  readonly hour: number;
  /** EXAGGERATION_STEPS의 값 */
  readonly exaggeration: number;
  readonly neighbours: boolean;
  readonly grid: boolean;
  /** 모델을 세우는 화면 짧은 변(m) */
  readonly propSpanM: number;
  readonly propCap: number;
}

export interface LabPanelProps {
  readonly planets: readonly LabPlanet[];
  readonly biomes: readonly unknown[];
  readonly biomeOptions: readonly BiomeOption[];
  readonly locale: "ko" | "en";
  readonly planetId: string;
  readonly map: LabMap | null;
  readonly settings: LabSettings;
  /** 이 2차맵에 쓸 수 있는 가장 큰 높이 과장 */
  readonly maxExaggeration: number;
  readonly point: LabPointInfo | null;
  readonly inputs: { readonly face: string; readonly i: string; readonly j: string; readonly key: string };
  readonly busy: boolean;
  readonly viewStats: { readonly neighbours: number; readonly props: number } | null;
  readonly onPlanet: (planetId: string) => void;
  readonly onPreset: (preset: MapPreset | "test") => void;
  readonly onBiome: (biomeId: string) => void;
  readonly onInputs: (inputs: LabPanelProps["inputs"]) => void;
  readonly onOpenCell: () => void;
  readonly onOpenKey: () => void;
  readonly onSettings: (next: Partial<LabSettings>) => void;
}

/** 모델 거리(m)·상한 고르기 단계(상한 0 = 모델 끔, 땅 색만) */
export const PROP_SPAN_STEPS = [100, 200, 300, 420, 600, 900, 1200, 1800, 2500] as const;
export const PROP_CAP_STEPS = [0, 500, 1000, 2500, 5000, 10_000, 20_000] as const;

function nearestIndex(steps: readonly number[], value: number): number {
  let best = 0;
  for (let k = 1; k < steps.length; k++) {
    if (Math.abs((steps[k] ?? 0) - value) < Math.abs((steps[best] ?? 0) - value)) best = k;
  }
  return best;
}

function planetName(planet: LabPlanet): string {
  const name: unknown =
    typeof planet.entry === "object" && planet.entry !== null ? Reflect.get(planet.entry, "name") : null;
  return localName(name, planet.id);
}

function biomeName(biomes: readonly unknown[], id: string | null): string {
  if (id === null) return "–";
  const entry = biomes.find(
    (item) => typeof item === "object" && item !== null && Reflect.get(item, "id") === id,
  );
  return localName(entry ? Reflect.get(entry, "name") : null, id);
}

function waterText(cell: PlanetCellValues): string {
  const parts: string[] = [];
  if (cell.water & 1) parts.push(m.planet_editor_water_ocean({ depth: "–" }));
  if (cell.water & 2) parts.push(m.planet_editor_water_lake());
  if (cell.water & 4) parts.push(m.planet_editor_water_river({ order: String(cell.riverOrder) }));
  if (cell.water & 8) parts.push(m.planet_editor_water_coast());
  return parts.length > 0 ? parts.join(" · ") : m.planet_editor_water_none();
}

function Facts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="sml-facts">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PointFacts({ point }: { point: LabPointInfo }) {
  return (
    <Facts
      rows={[
        [
          m.second_map_lab_cell_point(),
          m.second_map_lab_cell_point_value({
            x: String(point.x),
            y: String(point.y),
            tx: String(point.terrainX),
            ty: String(point.terrainY),
          }),
        ],
        [
          m.second_map_lab_cell_height(),
          m.second_map_lab_cell_height_value({
            game: formatNumber(point.heightM, 1),
            real: formatNumber(point.heightM * VERTICAL_SCALE),
          }),
        ],
        [
          m.second_map_lab_cell_slope(),
          m.second_map_lab_cell_slope_value({
            pct: formatNumber(point.slopePct, 1),
            relief: formatNumber(point.reliefM, 2),
          }),
        ],
        [m.second_map_lab_cell_surface(), surfaceText(point.surface)],
        [
          m.second_map_lab_cell_water(),
          point.waterDepthM > 0
            ? m.second_map_lab_cell_water_depth({ depth: formatNumber(point.waterDepthM, 2) })
            : m.planet_editor_water_none(),
        ],
        [m.second_map_lab_cell_cover(), coverText(point.cover)],
        [m.second_map_lab_cell_props(), artText(point.art)],
      ]}
    />
  );
}

function CellFacts({ cell, biomes }: { cell: PlanetCellValues; biomes: readonly unknown[] }) {
  return (
    <Facts
      rows={[
        [m.planet_editor_cell_biome(), biomeName(biomes, cell.biomeId)],
        [
          m.planet_editor_cell_elevation(),
          m.planet_editor_cell_elevation_value({
            game: formatNumber(cell.elevationM),
            real: formatNumber(cell.elevationM * VERTICAL_SCALE),
          }),
        ],
        [m.planet_editor_cell_water(), waterText(cell)],
        [
          m.planet_editor_cell_temperature(),
          m.planet_editor_value_celsius({ value: formatNumber(cell.temperatureC) }),
        ],
        [
          m.planet_editor_cell_precipitation(),
          m.planet_editor_cell_precipitation_value({ value: formatNumber(cell.precipitationMm) }),
        ],
        [
          m.planet_editor_cell_humidity(),
          m.planet_editor_cell_of_255({ value: formatNumber(cell.humidity) }),
        ],
        [m.planet_editor_cell_forest(), m.planet_editor_cell_of_255({ value: formatNumber(cell.forest) })],
      ]}
    />
  );
}

export function LabPanel(props: LabPanelProps) {
  const { planets, planetId, map, settings, maxExaggeration, point, inputs, busy, viewStats } = props;
  const id = useId();
  const pack = planets.filter((planet) => planet.kind === "pack");
  const templates = planets.filter((planet) => planet.kind === "template");
  const factorIndex = nearestIndex(EXAGGERATION_STEPS, settings.exaggeration);
  const maxIndex = nearestIndex(EXAGGERATION_STEPS, maxExaggeration);
  const spanIndex = nearestIndex(PROP_SPAN_STEPS, settings.propSpanM);
  const capIndex = nearestIndex(PROP_CAP_STEPS, settings.propCap);
  return (
    <div className="sml-sections" data-density="compact">
      <section className="sml-section" aria-labelledby={`${id}-place`}>
        <h2 id={`${id}-place`} className="section-title">
          {m.second_map_lab_section_place()}
        </h2>
        <label className="field">
          <span className="field-label">{m.second_map_lab_planet()}</span>
          <select
            className="sml-planet"
            value={planetId}
            disabled={busy}
            onChange={(event) => props.onPlanet(event.currentTarget.value)}
          >
            <optgroup label={m.second_map_lab_planets_pack()}>
              {pack.map((planet) => (
                <option key={planet.id} value={planet.id}>
                  {planetName(planet)}
                </option>
              ))}
            </optgroup>
            {templates.length > 0 ? (
              <optgroup label={m.second_map_lab_planets_template()}>
                {templates.map((planet) => (
                  <option key={planet.id} value={planet.id}>
                    {planetName(planet)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <div className="field">
          <span className="field-label">{m.second_map_lab_presets()}</span>
          <div className="sml-presets">
            {(["test", ...LAB_PRESETS] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className="button-small sml-preset"
                data-preset={preset}
                disabled={busy}
                onClick={() => props.onPreset(preset)}
              >
                {PRESET_TEXT[preset]()}
              </button>
            ))}
          </div>
        </div>
        {props.biomeOptions.length > 0 ? (
          <div className="field">
            <span className="field-label">{m.dev_terrain_lab_biomes_jump()}</span>
            <div className="sml-presets">
              {props.biomeOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="button-small sml-biome-jump"
                  data-biome={item.id}
                  aria-pressed={map?.cell.biomeId === item.id}
                  disabled={busy}
                  onClick={() => props.onBiome(item.id)}
                >
                  <span className="to-biome-dot" aria-hidden="true" style={{ backgroundColor: item.color }} />
                  {item.name[props.locale]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="sml-cell-inputs">
          {(
            [
              ["face", m.second_map_lab_face()],
              ["i", m.second_map_lab_cell_i()],
              ["j", m.second_map_lab_cell_j()],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="field sml-number">
              <span className="field-label">{label}</span>
              <input
                className="input"
                inputMode="numeric"
                data-input={name}
                value={inputs[name]}
                onChange={(event) => props.onInputs({ ...inputs, [name]: event.currentTarget.value })}
              />
            </label>
          ))}
          <button
            type="button"
            className="button-small sml-open-cell"
            disabled={busy}
            onClick={props.onOpenCell}
          >
            {m.second_map_lab_open_cell()}
          </button>
        </div>
        <div className="sml-key-input">
          <label className="field">
            <span className="field-label">{m.second_map_lab_map_key()}</span>
            <input
              className="input"
              inputMode="numeric"
              data-input="key"
              value={inputs.key}
              onChange={(event) => props.onInputs({ ...inputs, key: event.currentTarget.value })}
            />
          </label>
          <button
            type="button"
            className="button-small sml-open-key"
            disabled={busy}
            onClick={props.onOpenKey}
          >
            {m.second_map_lab_open_key()}
          </button>
        </div>
        {map ? (
          <p className="field-hint sml-current" translate="no">
            {m.second_map_lab_current({
              source:
                map.source === "server" ? m.second_map_lab_source_server() : m.second_map_lab_source_device(),
              key: String(map.mapKey),
              face: String(map.cell.face),
              i: String(map.cell.i),
              j: String(map.cell.j),
              level: String(map.faceLevel),
            })}
            {" · "}
            {m.second_map_lab_load_time({ ms: formatNumber(map.loadMs) })}
          </p>
        ) : null}
      </section>

      <section className="sml-section" aria-labelledby={`${id}-time`}>
        <h2 id={`${id}-time`} className="section-title">
          {m.second_map_lab_section_time()}
        </h2>
        <label className="sml-check">
          <input
            type="checkbox"
            className="sml-sky"
            checked={settings.sky}
            onChange={(event) => props.onSettings({ sky: event.currentTarget.checked })}
          />
          <span>{m.second_map_lab_sky()}</span>
        </label>
        <label className="field">
          <span className="field-label">
            {m.second_map_lab_hour({ time: formatLocalTime(settings.hour) })}
          </span>
          <input
            type="range"
            className="sml-range sml-hour"
            min={0}
            max={24}
            step={0.25}
            value={settings.hour}
            disabled={!settings.sky}
            onChange={(event) => props.onSettings({ hour: Number(event.currentTarget.value) })}
          />
        </label>
        {settings.sky ? null : <p className="field-hint">{m.second_map_lab_sky_off_hint()}</p>}
      </section>

      <section className="sml-section" aria-labelledby={`${id}-relief`}>
        <h2 id={`${id}-relief`} className="section-title">
          {m.second_map_lab_section_relief()}
        </h2>
        <label className="field">
          <span className="field-label">
            {m.second_map_lab_exaggeration({ factor: formatNumber(settings.exaggeration, 1) })}
          </span>
          <input
            type="range"
            className="sml-range sml-exaggeration"
            min={0}
            max={EXAGGERATION_STEPS.length - 1}
            step={1}
            value={factorIndex}
            onChange={(event) => {
              const index = Math.min(maxIndex, Number(event.currentTarget.value));
              props.onSettings({ exaggeration: EXAGGERATION_STEPS[index] ?? 1 });
            }}
          />
        </label>
        <p className="field-hint">{m.second_map_lab_exaggeration_hint()}</p>
        {maxExaggeration < (EXAGGERATION_STEPS.at(-1) ?? 1) ? (
          <p className="field-hint">
            {m.second_map_lab_exaggeration_cap({ max: formatNumber(maxExaggeration, 1) })}
          </p>
        ) : null}
      </section>

      <section className="sml-section" aria-labelledby={`${id}-view`}>
        <h2 id={`${id}-view`} className="section-title">
          {m.second_map_lab_section_view()}
        </h2>
        <label className="sml-check">
          <input
            type="checkbox"
            className="sml-neighbours"
            checked={settings.neighbours}
            onChange={(event) => props.onSettings({ neighbours: event.currentTarget.checked })}
          />
          <span>{m.second_map_lab_neighbours()}</span>
        </label>
        <label className="sml-check">
          <input
            type="checkbox"
            className="sml-grid"
            checked={settings.grid}
            onChange={(event) => props.onSettings({ grid: event.currentTarget.checked })}
          />
          <span>{m.second_map_lab_grid()}</span>
        </label>
        <label className="field">
          <span className="field-label">
            {m.second_map_lab_prop_span({ m: formatNumber(settings.propSpanM) })}
          </span>
          <input
            type="range"
            className="sml-range sml-prop-span"
            min={0}
            max={PROP_SPAN_STEPS.length - 1}
            step={1}
            value={spanIndex}
            onChange={(event) =>
              props.onSettings({ propSpanM: PROP_SPAN_STEPS[Number(event.currentTarget.value)] ?? 420 })
            }
          />
        </label>
        <label className="field">
          <span className="field-label">
            {m.second_map_lab_prop_cap({ count: formatNumber(settings.propCap) })}
          </span>
          <input
            type="range"
            className="sml-range sml-prop-cap"
            min={0}
            max={PROP_CAP_STEPS.length - 1}
            step={1}
            value={capIndex}
            onChange={(event) =>
              props.onSettings({ propCap: PROP_CAP_STEPS[Number(event.currentTarget.value)] ?? 2500 })
            }
          />
        </label>
        {viewStats ? (
          <p className="field-hint sml-view-stats">
            {m.second_map_lab_view_stats({
              neighbours: String(viewStats.neighbours),
              props: formatNumber(viewStats.props),
            })}
          </p>
        ) : null}
      </section>

      <section className="sml-section" aria-labelledby={`${id}-cell`}>
        <h2 id={`${id}-cell`} className="section-title">
          {m.second_map_lab_section_cell()}
        </h2>
        {point ? <PointFacts point={point} /> : <p className="field-hint">{m.second_map_lab_cell_hint()}</p>}
        {map ? (
          <>
            <h3 className="sml-subtitle">{m.second_map_lab_planet_cell({ level: String(map.faceLevel) })}</h3>
            <CellFacts cell={map.cell} biomes={props.biomes} />
          </>
        ) : null}
      </section>
    </div>
  );
}

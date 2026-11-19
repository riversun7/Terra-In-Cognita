// 1차맵 레이어 고르기·범례 — 지형·기후·고도·자원 분포·영토(사용자 요청 2026-11-12·2026-11-14·2026-11-19).
// 접는 단추 하나(PlanetLayerToggle — 레이어 아이콘 + 지금 레이어 이름)가 늘 보이고, 누르면 그 위에 4X 전략 지도식
// 레이어 카드 5개와 고도·기후·자원·영토 범례(PlanetLayerPicker)가 열린다.
// - 지형: 해안선·하천·기복과 영토·전선 안내.
// - 기후: 기온 색 띠(-30°C ~ +38°C, 10°C 등온선)와 건조/습윤 안내(CLIMATE_TEMP_RAMP, 셰이더와 같은 색).
// - 고도: 땅 높이 색 띠(등고선 포함)·바다 수심 띠·호수 칸.
// - 자원: 원자재 여섯 칩 + 접근성 select(#planet-material) + 몫 띠 + 산지 높은 티어 광석.
// - 영토: 수도·시작 도시·도시·전쟁 전선·불가침 기호 뜻 + 국가 문양·색 칩(누르면 그 나라 수도로 이동).
// 세계 색은 화면 테마와 상관없다(D-070): 범례 띠의 색은 자료 색이라 style로 넣고, 판·글자는 토큰만 쓴다.
import {
  CLIMATE_TEMP_RAMP,
  ELEVATION_LAKE_COLOR,
  ELEVATION_LAND_RAMP,
  ELEVATION_SEA_RAMP,
  ELEVATION_SEA_SCALE,
  PLANET_LAYERS,
  type PlanetLayer,
  RESOURCE_COLORS,
  RESOURCE_HIGH_COLOR,
  RESOURCE_MATERIALS,
  cssColor,
  rampGradient,
  resourceRamp,
} from "@terra/engine/planet";
import type { CatchmentMaterial } from "@terra/shared/catchment";
import type { NationEmblemView } from "@terra/shared/nationEditor";
import { useEffect } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { MapIcon, type MapIconName } from "./mapIcons.tsx";
import type { nationStyle } from "./nationColor.ts";

/** 자원 분포 지도 받기 상태 */
export type ResourceLoad = "idle" | "loading" | "ready" | "failed";

/** 영토 범례의 국가 한 줄 */
export interface LegendNation {
  readonly id: number;
  readonly name: string;
  /** 국가 색 차례(cityOverlay.css data-nation 0 ~ 5 — 고유 색이 없을 때) */
  readonly color: number;
  /** 국가 고유 색 변수(nationColor.ts nationStyle). 없으면 undefined */
  readonly style?: ReturnType<typeof nationStyle>;
  /** 국가 고유 색(#rrggbb). 문양 표시용 */
  readonly hex?: string | null | undefined;
  /** 국가 마크 */
  readonly emblem?: NationEmblemView | null | undefined;
  /** 아는 도시 수 */
  readonly cityCount?: number | undefined;
  /** 현재 전쟁 중 여부 */
  readonly atWar?: boolean | undefined;
  /** 비슷한 색 이웃 무늬를 받는 국가(영토 칠과 같은 빗금, territoryView.ts) */
  readonly patterned?: boolean | undefined;
}

interface PlanetLayerPickerProps {
  readonly layer: PlanetLayer;
  readonly onLayer: (layer: PlanetLayer) => void;
  readonly material: CatchmentMaterial;
  readonly onMaterial: (material: CatchmentMaterial) => void;
  readonly resourceLoad: ResourceLoad;
  readonly onRetryResource: () => void;
  /** 엔진의 가장 높은 땅(게임 m). 모르면 null */
  readonly maxElevationM: number | null;
  /** 아는 국가(영토 범례). null = 도시 자료 전 */
  readonly nations: readonly LegendNation[] | null;
  /** 범례에서 국가를 눌렀을 때(그 나라 수도로 카메라 이동 + 강조) */
  readonly onFocusNation?: ((factionId: number) => void) | undefined;
  /** 지금 강조해서 보는 국가 ID */
  readonly focusedFactionId?: number | null | undefined;
  /** 내 본캐·유닛 위치 강조 레이아웃 켜짐 여부 */
  readonly unitSpotlight?: boolean | undefined;
  readonly onToggleUnitSpotlight?: (() => void) | undefined;
}

const LAYER_NAMES: Readonly<Record<PlanetLayer, () => string>> = {
  terrain: () => m.planet_layer_terrain(),
  climate: () => m.planet_layer_climate(),
  elevation: () => m.planet_layer_elevation(),
  resource: () => m.planet_layer_resource(),
  territory: () => m.planet_layer_territory(),
};

const LAYER_ICONS: Readonly<Record<PlanetLayer, MapIconName>> = {
  terrain: "terrain",
  climate: "climate",
  elevation: "elevation",
  resource: "resource",
  territory: "territory",
};

export const MATERIAL_NAMES: Readonly<Record<CatchmentMaterial, () => string>> = {
  ore: () => m.planet_material_ore(),
  wood: () => m.planet_material_wood(),
  herb: () => m.planet_material_herb(),
  crop: () => m.planet_material_crop(),
  livestock: () => m.planet_material_livestock(),
  fish: () => m.planet_material_fish(),
};

/** 범례 눈금 m 값(10 m 단위로 반올림) */
const roundMeters = (value: number): number => Math.round(value / 10) * 10;

function TerrainLegend() {
  return (
    <div className="planet-legend-block" data-legend="terrain">
      <p className="planet-legend-note">{m.planet_terrain_note()}</p>
      <ul className="planet-legend-keys">
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="capital" aria-hidden="true">
            ★
          </span>
          {m.planet_territory_capital()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="city" aria-hidden="true" />
          {m.planet_territory_city()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="war" aria-hidden="true">
            <MapIcon name="swords" className="planet-legend-mark-icon" />
          </span>
          {m.planet_territory_war()}
        </li>
      </ul>
    </div>
  );
}

function ClimateLegend() {
  return (
    <div className="planet-legend-block" data-legend="climate">
      <div className="planet-legend-card">
        <p className="planet-legend-caption">{m.planet_climate_temp_title()}</p>
        <span className="planet-legend-bar" style={{ background: rampGradient(CLIMATE_TEMP_RAMP) }} />
        <p className="planet-legend-ticks">
          <span>{m.planet_climate_cold()}</span>
          <span>{m.planet_climate_mild()}</span>
          <span>{m.planet_climate_hot()}</span>
        </p>
      </div>
      <p className="planet-legend-note">{m.planet_climate_moisture()}</p>
    </div>
  );
}

function ElevationLegend({ maxM }: { maxM: number }) {
  const sea = roundMeters(maxM * ELEVATION_SEA_SCALE);
  return (
    <div className="planet-legend-block" data-legend="elevation">
      <div className="planet-legend-card">
        <div className="planet-legend-head">
          <p className="planet-legend-caption">{m.planet_elevation_land()}</p>
          <span className="planet-legend-tag">{m.planet_elevation_contours()}</span>
        </div>
        <span className="planet-legend-bar" style={{ background: rampGradient(ELEVATION_LAND_RAMP) }} />
        <p className="planet-legend-ticks">
          <span>{m.planet_meters({ value: 0 })}</span>
          <span>{m.planet_meters({ value: roundMeters(maxM / 2) })}</span>
          <span>{m.planet_meters({ value: roundMeters(maxM) })}</span>
        </p>
      </div>
      <p className="planet-legend-keys">
        <span className="planet-legend-key">
          <span
            className="planet-legend-swatch planet-legend-swatch-wide"
            style={{ background: rampGradient(ELEVATION_SEA_RAMP) }}
          />
          {m.planet_elevation_sea({ depth: sea })}
        </span>
        <span className="planet-legend-key">
          <span className="planet-legend-swatch" style={{ background: cssColor(ELEVATION_LAKE_COLOR) }} />
          {m.planet_elevation_lake()}
        </span>
      </p>
    </div>
  );
}

function ResourceLegend(
  props: Pick<PlanetLayerPickerProps, "material" | "resourceLoad" | "onRetryResource">,
) {
  const { material, resourceLoad, onRetryResource } = props;
  return (
    <div className="planet-legend-block" data-legend="resource">
      <div className="planet-legend-card">
        <p className="planet-legend-caption">
          {m.planet_resource_share({ material: MATERIAL_NAMES[material]() })}
        </p>
        <span className="planet-legend-bar" style={{ background: rampGradient(resourceRamp(material)) }} />
        <p className="planet-legend-ticks">
          <span>{m.planet_resource_none()}</span>
          <span>{m.planet_permille({ value: 500 })}</span>
          <span>{m.planet_permille({ value: 1000 })}</span>
        </p>
      </div>
      {material === "ore" ? (
        <p className="planet-legend-key">
          <span className="planet-legend-swatch" style={{ background: cssColor(RESOURCE_HIGH_COLOR) }} />
          {m.planet_resource_high()}
        </p>
      ) : null}
      {resourceLoad === "loading" ? (
        <p className="planet-legend-note" role="status">
          {m.planet_resource_loading()}
        </p>
      ) : null}
      {resourceLoad === "failed" ? (
        <p className="planet-legend-failed" role="alert">
          {m.planet_resource_failed()}{" "}
          <button type="button" className="button-small" onClick={onRetryResource}>
            {m.retry()}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function TerritoryLegend({
  nations,
  onFocusNation,
  focusedFactionId,
}: {
  readonly nations: readonly LegendNation[] | null;
  readonly onFocusNation?: ((factionId: number) => void) | undefined;
  readonly focusedFactionId?: number | null | undefined;
}) {
  return (
    <div className="planet-legend-block" data-legend="territory">
      <ul className="planet-legend-keys">
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="capital" aria-hidden="true">
            ★
          </span>
          {m.planet_territory_capital()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="start" aria-hidden="true" />
          {m.world_city_start()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="city" aria-hidden="true" />
          {m.planet_territory_city()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="war" aria-hidden="true">
            <MapIcon name="swords" className="planet-legend-mark-icon" />
          </span>
          {m.planet_territory_war()}
        </li>
        <li className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="truce" aria-hidden="true" />
          {m.planet_territory_truce()}
        </li>
      </ul>
      {nations && nations.length > 0 ? (
        <ul className="planet-legend-nations" aria-label={m.planet_legend_label()}>
          {nations.map((nation) => (
            <li
              key={nation.id}
              className="planet-legend-key planet-legend-nation-item"
              data-nation={nation.color}
              data-pattern={nation.patterned ? "hatch" : undefined}
              data-war={nation.atWar ? "true" : undefined}
              data-focused={focusedFactionId === nation.id ? "true" : undefined}
              style={nation.style}
            >
              {onFocusNation ? (
                <button
                  type="button"
                  className="planet-legend-nation-btn"
                  aria-pressed={focusedFactionId === nation.id}
                  onClick={() => onFocusNation(nation.id)}
                >
                  <span className="planet-legend-swatch planet-legend-nation" aria-hidden="true" />
                  {nation.emblem || nation.hex ? (
                    <NationEmblem
                      spec={nation.emblem?.spec}
                      color={nation.emblem?.color ?? nation.hex ?? "#64748b"}
                      uploaded={nation.emblem?.uploaded}
                      size={16}
                    />
                  ) : null}
                  <span className="planet-legend-nation-name">{nation.name}</span>
                  {nation.cityCount !== undefined ? (
                    <span className="planet-legend-nation-count">{nation.cityCount}</span>
                  ) : null}
                  {nation.atWar ? <MapIcon name="swords" className="planet-legend-war-icon" /> : null}
                </button>
              ) : (
                <>
                  <span className="planet-legend-swatch planet-legend-nation" aria-hidden="true" />
                  {nation.name}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="planet-legend-note">{m.planet_territory_none()}</p>
      )}
      <p className="planet-legend-note">{m.planet_territory_known()}</p>
    </div>
  );
}

/** 늘 보이는 레이어 접는 단추(지금 레이어 아이콘 + 이름 + 펼침 표시). 누르면 PlanetLayerPicker를 여닫는다 */
export function PlanetLayerToggle({
  layer,
  open,
  controls,
  onToggle,
}: {
  readonly layer: PlanetLayer;
  readonly open: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  const name = LAYER_NAMES[layer]();
  return (
    <button
      type="button"
      className="button-small planet-layer-toggle"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={m.planet_layer_toggle({ layer: name })}
      data-layer-current={layer}
      onClick={onToggle}
    >
      <MapIcon name={LAYER_ICONS[layer]} />
      <span className="planet-layer-toggle-name">{name}</span>
      <span className="planet-layer-toggle-caret" aria-hidden="true" />
    </button>
  );
}

/** 열린 레이어 고르기·원자재·범례 판. 닫혀 있으면 아무것도 그리지 않는다. Esc로 닫힌다 */
export function PlanetLayerPicker(
  props: PlanetLayerPickerProps & {
    readonly id: string;
    readonly open: boolean;
    readonly onClose: () => void;
  },
) {
  const { open, onClose, layer, onLayer, material, onMaterial, maxElevationM, nations } = props;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <section id={props.id} className="map-panel planet-layer-sheet" aria-label={m.planet_layer()}>
      <div className="planet-segment planet-layer-grid" role="group" aria-label={m.planet_layer()}>
        {PLANET_LAYERS.map((option) => (
          <button
            key={option}
            type="button"
            className="button-small planet-layer-card"
            data-layer-option={option}
            aria-pressed={layer === option}
            onClick={() => onLayer(option)}
          >
            <MapIcon name={LAYER_ICONS[option]} className="planet-layer-card-icon" />
            <span>{LAYER_NAMES[option]()}</span>
          </button>
        ))}
      </div>
      {props.onToggleUnitSpotlight ? (
        <div className="planet-layer-spotlight">
          <div className="planet-layer-spotlight-text">
            <span className="planet-layer-spotlight-title">{m.planet_units_spotlight()}</span>
            <span className="planet-layer-spotlight-note">{m.planet_units_spotlight_hint()}</span>
          </div>
          <button
            type="button"
            className="button-small planet-units-spotlight-btn"
            aria-pressed={props.unitSpotlight === true}
            onClick={props.onToggleUnitSpotlight}
          >
            <MapIcon name="squad" className="planet-units-btn-icon" />
            <span>{m.planet_units_spotlight()}</span>
          </button>
        </div>
      ) : null}
      {layer === "resource" ? (
        <div className="planet-resource-picker">
          <div className="planet-row planet-material">
            <label htmlFor="planet-material">{m.planet_resource_material()}</label>
            <select
              id="planet-material"
              value={material}
              onChange={(event) => {
                const chosen = RESOURCE_MATERIALS.find((item) => item === event.currentTarget.value);
                if (chosen) onMaterial(chosen);
              }}
            >
              {RESOURCE_MATERIALS.map((item) => (
                <option key={item} value={item}>
                  {MATERIAL_NAMES[item]()}
                </option>
              ))}
            </select>
          </div>
          <div className="planet-material-chips" role="group" aria-label={m.planet_resource_material()}>
            {RESOURCE_MATERIALS.map((item) => (
              <button
                key={item}
                type="button"
                className="button-small planet-material-chip"
                aria-pressed={material === item}
                onClick={() => onMaterial(item)}
              >
                <span
                  className="planet-material-dot"
                  style={{ background: cssColor(RESOURCE_COLORS[item]) }}
                  aria-hidden="true"
                />
                <span>{MATERIAL_NAMES[item]()}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {layer === "terrain" ? <TerrainLegend /> : null}
      {layer === "climate" ? <ClimateLegend /> : null}
      {layer === "elevation" && maxElevationM !== null ? <ElevationLegend maxM={maxElevationM} /> : null}
      {layer === "resource" ? (
        <ResourceLegend
          material={material}
          resourceLoad={props.resourceLoad}
          onRetryResource={props.onRetryResource}
        />
      ) : null}
      {layer === "territory" ? (
        <TerritoryLegend
          nations={nations}
          onFocusNation={props.onFocusNation}
          focusedFactionId={props.focusedFactionId}
        />
      ) : null}
    </section>
  );
}

// 1차맵 레이어 고르기·범례 — 지형·기후·고도·자원 분포·영토(사용자 요청 2026-11-12, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)").
// 바뀜 2026-11-14(사용자 요청 "레이어 메뉴가 너무 크다", ADR 같은 곳 "바뀜 (2026-11-14)"): 접는 단추 하나(PlanetLayerToggle — 아이콘 +
// 지금 레이어 이름)만 늘 보이고, 누르면 그 위에 고르기·원자재·범례 판(PlanetLayerPicker)이 열린다. 다시 누르기·Esc·지도 누르기로 닫힌다
// (여닫기 상태는 화면 몫 — 땅을 누르면 화면이 닫는다). 레이어를 골라도 판은 열린 채다(범례를 보고 원자재를 고를 수 있게).
// - 고도: 땅 높이 색 띠(0 ~ 가장 높은 땅 m)·바다 수심 띠·호수 칸. 색은 엔진 값(layerColors.ts)을 그대로 쓴다(셰이더와 같은 색).
// - 자원: 원자재 고르기(여섯) + 몫 띠(없음 ~ 1000‰). 광석이면 산지(높은 티어) 칸. 받는 중·실패 안내.
// - 영토: 아는 국가 색 칩(국가 색 = --nation, cityOverlay.css)·수도·시작 도시·도시 표시 뜻.
// 세계 색은 화면 테마와 상관없다(D-070): 범례 띠의 색은 자료 색이라 style로 넣고, 판·글자는 토큰만 쓴다.
import {
  ELEVATION_LAKE_COLOR,
  ELEVATION_LAND_RAMP,
  ELEVATION_SEA_RAMP,
  ELEVATION_SEA_SCALE,
  PLANET_LAYERS,
  type PlanetLayer,
  RESOURCE_HIGH_COLOR,
  RESOURCE_MATERIALS,
  cssColor,
  rampGradient,
  resourceRamp,
} from "@terra/engine/planet";
import type { CatchmentMaterial } from "@terra/shared/catchment";
import { useEffect } from "react";
import { m } from "../paraglide/messages.js";
import { MapIcon } from "./mapIcons.tsx";
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
}

const LAYER_NAMES: Readonly<Record<PlanetLayer, () => string>> = {
  terrain: () => m.planet_layer_terrain(),
  climate: () => m.planet_layer_climate(),
  elevation: () => m.planet_layer_elevation(),
  resource: () => m.planet_layer_resource(),
  territory: () => m.planet_layer_territory(),
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

function ElevationLegend({ maxM }: { maxM: number }) {
  const sea = roundMeters(maxM * ELEVATION_SEA_SCALE);
  return (
    <div className="planet-legend-block" data-legend="elevation">
      <p className="planet-legend-caption">{m.planet_elevation_land()}</p>
      <span className="planet-legend-bar" style={{ background: rampGradient(ELEVATION_LAND_RAMP) }} />
      <p className="planet-legend-ticks">
        <span>{m.planet_meters({ value: 0 })}</span>
        <span>{m.planet_meters({ value: roundMeters(maxM / 2) })}</span>
        <span>{m.planet_meters({ value: roundMeters(maxM) })}</span>
      </p>
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
  const { material, resourceLoad } = props;
  return (
    <div className="planet-legend-block" data-legend="resource">
      <p className="planet-legend-caption">
        {m.planet_resource_share({ material: MATERIAL_NAMES[material]() })}
      </p>
      <span className="planet-legend-bar" style={{ background: rampGradient(resourceRamp(material)) }} />
      <p className="planet-legend-ticks">
        <span>{m.planet_resource_none()}</span>
        <span>{m.planet_permille({ value: 500 })}</span>
        <span>{m.planet_permille({ value: 1000 })}</span>
      </p>
      {material === "ore" ? (
        <p className="planet-legend-keys">
          <span className="planet-legend-key">
            <span className="planet-legend-swatch" style={{ background: cssColor(RESOURCE_HIGH_COLOR) }} />
            {m.planet_resource_high()}
          </span>
        </p>
      ) : null}
      {resourceLoad === "loading" ? (
        <p className="planet-legend-note" role="status">
          {m.planet_resource_loading()}
        </p>
      ) : null}
      {resourceLoad === "failed" ? (
        <p className="planet-legend-note planet-legend-failed" role="alert">
          {m.planet_resource_failed()}{" "}
          <button type="button" className="button-small" onClick={props.onRetryResource}>
            {m.retry()}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function TerritoryLegend({ nations }: { nations: readonly LegendNation[] | null }) {
  return (
    <div className="planet-legend-block" data-legend="territory">
      {nations && nations.length > 0 ? (
        <ul className="planet-legend-nations">
          {nations.map((nation) => (
            <li key={nation.id} className="planet-legend-key" data-nation={nation.color} style={nation.style}>
              <span className="planet-legend-swatch planet-legend-nation" />
              {nation.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="planet-legend-note">{m.planet_territory_none()}</p>
      )}
      <p className="planet-legend-keys">
        <span className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="capital" aria-hidden="true">
            ★
          </span>
          {m.planet_territory_capital()}
        </span>
        <span className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="start" aria-hidden="true" />
          {m.world_city_start()}
        </span>
        <span className="planet-legend-key">
          <span className="planet-legend-mark" data-mark="city" aria-hidden="true" />
          {m.planet_territory_city()}
        </span>
      </p>
      <p className="planet-legend-note">{m.planet_territory_known()}</p>
    </div>
  );
}

/** 접는 단추: 아이콘 + 지금 레이어 이름. 펼침 상태는 aria-expanded */
export function PlanetLayerToggle({
  layer,
  open,
  controls,
  onToggle,
}: {
  readonly layer: PlanetLayer;
  readonly open: boolean;
  /** 여는 판의 id */
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
      <MapIcon name="layers" />
      <span className="planet-layer-toggle-name">{name}</span>
      <span className="planet-layer-toggle-caret" aria-hidden="true" />
    </button>
  );
}

/** 열린 레이어 판(닫혀 있으면 그리지 않는다): 레이어 다섯·원자재·범례. Esc면 닫는다 */
export function PlanetLayerPicker(
  props: PlanetLayerPickerProps & {
    readonly id: string;
    readonly open: boolean;
    readonly onClose: () => void;
  },
) {
  const { layer, onLayer, open, onClose } = props;
  useEffect(() => {
    if (!open) return () => undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && document.querySelector("dialog[open]") === null) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <section id={props.id} className="map-panel planet-layer-sheet" aria-label={m.planet_layer()}>
      <div className="planet-segment" role="group" aria-label={m.planet_layer()}>
        {PLANET_LAYERS.map((option) => (
          <button
            key={option}
            type="button"
            className="button-small"
            data-layer-option={option}
            aria-pressed={layer === option}
            onClick={() => onLayer(option)}
          >
            {LAYER_NAMES[option]()}
          </button>
        ))}
      </div>
      {layer === "resource" ? (
        <div className="planet-row planet-material">
          <label htmlFor="planet-material">{m.planet_resource_material()}</label>
          <select
            id="planet-material"
            value={props.material}
            onChange={(event) => {
              const next = RESOURCE_MATERIALS.find((material) => material === event.currentTarget.value);
              if (next) props.onMaterial(next);
            }}
          >
            {RESOURCE_MATERIALS.map((material) => (
              <option key={material} value={material}>
                {MATERIAL_NAMES[material]()}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {layer === "elevation" && props.maxElevationM !== null ? (
        <ElevationLegend maxM={props.maxElevationM} />
      ) : null}
      {layer === "resource" ? <ResourceLegend {...props} /> : null}
      {layer === "territory" ? <TerritoryLegend nations={props.nations} /> : null}
    </section>
  );
}

// 1차맵 내 본캐릭 사이보그·보유 유닛 위치 판 — 본캐 사이보그와 행성 전역의 내 모든 유닛(휴먼·사이보그 유닛·수호신·배·이동 중)을
// 한눈에 보고, [위치]로 1차맵 카메라를 곧바로 옮기거나 [2차맵]으로 해당 지역에 바로 들어간다.
// "내 부대 위치 강조" 스위치를 켜면 지도 위 본캐·유닛 핀과 이동 경로를 맨 위에 또렷하게 띄운다.
import type {
  WorldMapCity,
  WorldMapFaction,
  WorldMyUnit,
  WorldMyUnitKind,
  WorldPosition,
  WorldTravel,
} from "@terra/shared/worldMap";
import { useEffect, useMemo } from "react";
import { m } from "../paraglide/messages.js";
import { MapIcon, type MapIconName } from "./mapIcons.tsx";
import { durationText, travelTarget } from "./travelData.ts";
import { cityLabel } from "./worldMapData.ts";
import "./planetUnits.css";

const unitKindLabel = (kind: WorldMyUnitKind): string => {
  switch (kind) {
    case "cyborg":
      return m.planet_units_kind_cyborg();
    case "human":
      return m.planet_units_kind_human();
    case "cyborg_unit":
      return m.planet_units_kind_cyborg_unit();
    case "guardian":
      return m.planet_units_kind_guardian();
    case "boat":
      return m.planet_units_kind_boat();
    default:
      return m.planet_units_kind_other();
  }
};

const unitKindIcon = (kind: WorldMyUnitKind): MapIconName => {
  if (kind === "cyborg" || kind === "cyborg_unit") return "cyborg";
  if (kind === "boat") return "transport";
  if (kind === "guardian") return "military";
  return "unit";
};

/** 늘 보이는 내 부대 열기 단추 — 총 유닛 수와 이동 중 여부를 보인다 */
export function PlanetUnitsToggle({
  count,
  movingCount,
  open,
  spotlight,
  controls,
  onToggle,
}: {
  readonly count: number;
  readonly movingCount: number;
  readonly open: boolean;
  readonly spotlight: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="button-small planet-units-toggle"
      aria-expanded={open}
      aria-controls={controls}
      data-spotlight={spotlight ? "true" : undefined}
      data-moving={movingCount > 0 ? "true" : undefined}
      onClick={onToggle}
    >
      <MapIcon name="squad" />
      <span>{m.planet_units_button({ count })}</span>
    </button>
  );
}

interface PlanetUnitsPanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly spotlight: boolean;
  readonly onToggleSpotlight: () => void;
  readonly me: WorldPosition | null;
  readonly units: readonly WorldMyUnit[];
  readonly travels: readonly WorldTravel[];
  /** 서버 응답 시각(남은 이동 시간 계산용, 클럭 오차 없이 순수 계산) */
  readonly nowMs: number;
  readonly cities: readonly WorldMapCity[];
  readonly factions: readonly WorldMapFaction[];
  readonly focusedUnitId: number | null;
  readonly onFocusUnit: (unit: {
    readonly unitId: number;
    readonly latDeg: number;
    readonly lonDeg: number;
  }) => void;
  readonly onEnterUnit: (unit: {
    readonly mapKey: number;
    readonly cellX: number;
    readonly cellY: number;
  }) => void;
}

export function PlanetUnitsPanel({
  id,
  open,
  onClose,
  spotlight,
  onToggleSpotlight,
  me,
  units,
  travels,
  nowMs,
  cities,
  factions,
  focusedUnitId,
  onFocusUnit,
  onEnterUnit,
}: PlanetUnitsPanelProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cityByMap = useMemo(() => {
    const map = new Map<number, WorldMapCity>();
    for (const city of cities) {
      if (!map.has(city.mapKey) || city.capital) map.set(city.mapKey, city);
    }
    return map;
  }, [cities]);

  const travelByUnit = useMemo(
    () => new Map(travels.filter((entry) => entry.state === "going").map((entry) => [entry.unitId, entry])),
    [travels],
  );

  if (!open) return null;

  const cyborgUnit =
    units.find((entry) => entry.kind === "cyborg") ??
    (me
      ? ({
          unitId: me.unitId,
          kind: "cyborg",
          name: me.name ?? null,
          mapKey: me.mapKey,
          cellX: me.cellX,
          cellY: me.cellY,
          latDeg: me.latDeg,
          lonDeg: me.lonDeg,
          loaded: !me.hidden,
          moving: travelByUnit.has(me.unitId),
          working: false,
          aboardId: null,
        } satisfies WorldMyUnit)
      : null);

  const others = units.filter((entry) => entry.kind !== "cyborg");
  const movingCount = units.filter((entry) => entry.moving).length;
  const boatCount = others.filter((entry) => entry.kind === "boat").length;

  const placeText = (mapKey: number): string => {
    const city = cityByMap.get(mapKey);
    return city ? cityLabel(factions, city) : m.planet_units_wild();
  };

  const statusText = (
    unit: WorldMyUnit,
  ): { readonly label: string; readonly tone: "moving" | "work" | "idle" } => {
    const going = travelByUnit.get(unit.unitId);
    if (going) {
      const targetKey = travelTarget(going);
      const dest = targetKey === null ? "" : ` → ${placeText(targetKey)}`;
      const remain = nowMs > 0 ? Math.max(0, going.arriveAt - nowMs) : 0;
      const eta = remain > 0 ? ` · ${durationText(remain)}` : "";
      return {
        label: `${going.kind === "scout" ? m.planet_units_scouting() : m.planet_units_moving()}${dest}${eta}`,
        tone: "moving",
      };
    }
    if (unit.aboardId != null) return { label: m.planet_units_aboard(), tone: "idle" };
    if (unit.working) return { label: m.planet_units_working(), tone: "work" };
    return { label: m.planet_units_standing(), tone: "idle" };
  };

  return (
    <section id={id} className="map-panel planet-units-sheet" aria-label={m.planet_units_panel_title()}>
      <div className="planet-units-head">
        <h2 className="planet-units-title">
          <MapIcon name="squad" className="planet-units-title-icon" />
          <span>{m.planet_units_panel_title()}</span>
        </h2>
        <div className="planet-units-head-actions">
          <button
            type="button"
            className="button-small planet-units-spotlight-btn"
            aria-pressed={spotlight}
            onClick={onToggleSpotlight}
          >
            <MapIcon name="pin" className="planet-units-btn-icon" />
            <span>{m.planet_units_spotlight()}</span>
          </button>
          <button type="button" className="button-small" onClick={onClose}>
            {m.world_city_close()}
          </button>
        </div>
      </div>

      {cyborgUnit ? (
        <div className="planet-units-section">
          <h3 className="planet-units-subtitle">{m.planet_units_section_cyborg()}</h3>
          <div
            className="planet-units-hero"
            data-focused={focusedUnitId === cyborgUnit.unitId ? "true" : undefined}
          >
            <span className="planet-units-hero-avatar" aria-hidden="true">
              <MapIcon name="cyborg" />
            </span>
            <div className="planet-units-info">
              <p className="planet-units-name-row">
                <span className="planet-units-me-tag">{m.planet_units_me_badge()}</span>
                <span className="planet-units-name">{cyborgUnit.name || m.world_my_cyborg()}</span>
              </p>
              <p className="planet-units-meta">
                <span>{placeText(cyborgUnit.mapKey)}</span>
                <span className="planet-units-state" data-tone={statusText(cyborgUnit).tone}>
                  {statusText(cyborgUnit).label}
                </span>
              </p>
            </div>
            <div className="planet-units-row-actions">
              <button
                type="button"
                className="button-small planet-units-action"
                onClick={() => onFocusUnit(cyborgUnit)}
              >
                {m.planet_units_locate()}
              </button>
              {cyborgUnit.loaded ? (
                <button
                  type="button"
                  className="button-small button-primary planet-units-action"
                  onClick={() => onEnterUnit(cyborgUnit)}
                >
                  {m.planet_units_enter()}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="planet-units-section">
        <div className="planet-units-subhead">
          <h3 className="planet-units-subtitle">{m.planet_units_section_units({ count: others.length })}</h3>
          <div className="planet-units-pills">
            {movingCount > 0 ? (
              <span className="planet-units-pill" data-tone="moving">
                {m.planet_units_summary_moving({ count: movingCount })}
              </span>
            ) : null}
            {boatCount > 0 ? (
              <span className="planet-units-pill">{m.planet_units_summary_boats({ count: boatCount })}</span>
            ) : null}
          </div>
        </div>
        {others.length > 0 ? (
          <ul className="planet-units-list">
            {others.map((unit) => {
              const status = statusText(unit);
              const focused = focusedUnitId === unit.unitId;
              return (
                <li
                  key={unit.unitId}
                  className="planet-units-row"
                  data-kind={unit.kind}
                  data-focused={focused ? "true" : undefined}
                >
                  <span className="planet-units-icon-box" aria-hidden="true">
                    <MapIcon name={unitKindIcon(unit.kind)} />
                  </span>
                  <div className="planet-units-info">
                    <p className="planet-units-name-row">
                      <span className="planet-units-name">
                        {unit.name ?? `${unitKindLabel(unit.kind)} #${unit.unitId}`}
                      </span>
                    </p>
                    <p className="planet-units-meta">
                      <span>{placeText(unit.mapKey)}</span>
                      <span className="planet-units-state" data-tone={status.tone}>
                        {status.label}
                      </span>
                    </p>
                  </div>
                  <div className="planet-units-row-actions">
                    <button
                      type="button"
                      className="button-small planet-units-action"
                      onClick={() => onFocusUnit(unit)}
                    >
                      {m.planet_units_locate()}
                    </button>
                    {unit.loaded ? (
                      <button
                        type="button"
                        className="button-small planet-units-action"
                        onClick={() => onEnterUnit(unit)}
                      >
                        {m.planet_units_enter()}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="planet-legend-note">{m.planet_units_empty()}</p>
        )}
      </div>
    </section>
  );
}

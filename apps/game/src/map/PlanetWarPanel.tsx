// 1차맵 천하 정세·세력 판도 판 — 삼국지·4X 전략 지도처럼 진행 중인 전쟁 전선과 세력 순위를 한눈에 보고
// [전선 보기]나 국가를 눌러 곧바로 3D 지구본 카메라를 전선·수도로 옮기며 그 나라를 강조한다.
import type { WorldMapCity, WorldMapFaction, WorldMapRegime, WorldMapRelation } from "@terra/shared/worldMap";
import { useEffect, useMemo } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { MapIcon } from "./mapIcons.tsx";
import { nationHex, nationStyle } from "./nationColor.ts";
import { buildDiplomacyArcs, warSetsOf } from "./warOverlay.ts";
import { factionColor, factionName } from "./worldMapData.ts";
import "./planetWar.css";

const regimeText = (regime: WorldMapRegime | undefined): string | null => {
  if (regime === "democracy") return m.planet_wars_regime_democracy();
  if (regime === "capitalism") return m.planet_wars_regime_capitalism();
  if (regime === "dictatorship") return m.planet_wars_regime_dictatorship();
  return null;
};

/** 늘 보이는 세력·전황 열기 단추 — 전쟁이 있으면 진홍 강조와 전쟁 건수를 보인다 */
export function PlanetWarToggle({
  warCount,
  open,
  controls,
  onToggle,
}: {
  readonly warCount: number;
  readonly open: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="button-small planet-war-toggle"
      aria-expanded={open}
      aria-controls={controls}
      data-has-wars={warCount > 0 ? "true" : undefined}
      onClick={onToggle}
    >
      <MapIcon name={warCount > 0 ? "swords" : "crown"} />
      <span>{warCount > 0 ? m.planet_wars_button_active({ count: warCount }) : m.planet_wars_button()}</span>
    </button>
  );
}

interface PlanetWarPanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly factions: readonly WorldMapFaction[];
  readonly cities: readonly WorldMapCity[];
  readonly relations: readonly WorldMapRelation[] | undefined;
  readonly myFactionId: number | null;
  readonly focusedFactionId: number | null;
  readonly onFocusNation: (factionId: number) => void;
  readonly onClearFocus: () => void;
  readonly onFocusFront: (latDeg: number, lonDeg: number, factionId: number) => void;
}

export function PlanetWarPanel({
  id,
  open,
  onClose,
  factions,
  cities,
  relations,
  myFactionId,
  focusedFactionId,
  onFocusNation,
  onClearFocus,
  onFocusFront,
}: PlanetWarPanelProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const warInfo = useMemo(() => warSetsOf(relations), [relations]);
  const warArcs = useMemo(
    () => buildDiplomacyArcs(cities, factions, relations).filter((arc) => arc.kind === "war"),
    [cities, factions, relations],
  );
  const standings = useMemo(() => {
    const cityCounts = new Map<number, number>();
    const popSums = new Map<number, number>();
    for (const city of cities) {
      cityCounts.set(city.factionId, (cityCounts.get(city.factionId) ?? 0) + 1);
      popSums.set(city.factionId, (popSums.get(city.factionId) ?? 0) + (city.population ?? 0));
    }
    return factions
      .filter((faction) => (cityCounts.get(faction.id) ?? 0) > 0)
      .map((faction) => ({
        faction,
        cities: faction.cityCount ?? cityCounts.get(faction.id) ?? 0,
        population: faction.population ?? popSums.get(faction.id) ?? 0,
        atWar: warInfo.warringFactions.has(faction.id),
      }))
      .toSorted((a, b) => b.cities - a.cities || b.population - a.population || a.faction.id - b.faction.id);
  }, [cities, factions, warInfo]);

  if (!open) return null;

  const factionById = new Map(factions.map((entry) => [entry.id, entry]));

  return (
    <section id={id} className="map-panel planet-war-sheet" aria-label={m.planet_wars_panel_title()}>
      <div className="planet-war-head">
        <h2 className="planet-war-title">
          <MapIcon name="crown" className="planet-war-title-icon" />
          <span>{m.planet_wars_panel_title()}</span>
        </h2>
        <div className="planet-war-head-actions">
          {focusedFactionId !== null ? (
            <button type="button" className="button-small" onClick={onClearFocus}>
              {m.planet_wars_focus_clear()}
            </button>
          ) : null}
          <button type="button" className="button-small" onClick={onClose}>
            {m.world_city_close()}
          </button>
        </div>
      </div>

      <div className="planet-war-section">
        <h3 className="planet-war-subtitle">
          <MapIcon name="swords" className="planet-war-sub-icon" />
          <span>{m.planet_wars_section_active({ count: warInfo.wars.length })}</span>
        </h3>
        {warArcs.length > 0 ? (
          <ul className="planet-war-list">
            {warArcs.map((arc) => {
              const fa = factionById.get(arc.factionA);
              const fb = factionById.get(arc.factionB);
              const hexA = nationHex(factions, arc.factionA);
              const hexB = nationHex(factions, arc.factionB);
              return (
                <li key={arc.key} className="planet-war-item">
                  <div className="planet-war-pair">
                    <span
                      className="planet-war-side"
                      data-nation={factionColor(factions, arc.factionA)}
                      style={nationStyle(factions, arc.factionA)}
                    >
                      {fa?.emblem || hexA ? (
                        <NationEmblem
                          spec={fa?.emblem?.spec}
                          color={fa?.emblem?.color ?? hexA ?? "#64748b"}
                          uploaded={fa?.emblem?.uploaded}
                          size={18}
                        />
                      ) : null}
                      <span className="planet-war-side-name">{factionName(factions, arc.factionA)}</span>
                    </span>
                    <MapIcon name="swords" className="planet-war-vs" />
                    <span
                      className="planet-war-side"
                      data-nation={factionColor(factions, arc.factionB)}
                      style={nationStyle(factions, arc.factionB)}
                    >
                      {fb?.emblem || hexB ? (
                        <NationEmblem
                          spec={fb?.emblem?.spec}
                          color={fb?.emblem?.color ?? hexB ?? "#64748b"}
                          uploaded={fb?.emblem?.uploaded}
                          size={18}
                        />
                      ) : null}
                      <span className="planet-war-side-name">{factionName(factions, arc.factionB)}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-small planet-war-jump"
                    onClick={() => onFocusFront(arc.mid[0], arc.mid[1], arc.factionA)}
                  >
                    {m.planet_wars_view_front()}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="planet-legend-note">{m.planet_wars_none()}</p>
        )}
      </div>

      {warInfo.truces.length > 0 ? (
        <div className="planet-war-section">
          <h3 className="planet-war-subtitle">
            <span>{m.planet_wars_section_truces({ count: warInfo.truces.length })}</span>
          </h3>
          <ul className="planet-truce-list">
            {warInfo.truces.map((truce) => (
              <li
                key={`truce:${String(truce.factionA)}:${String(truce.factionB)}`}
                className="planet-truce-item"
              >
                <span>{factionName(factions, truce.factionA)}</span>
                <span aria-hidden="true">↔</span>
                <span>{factionName(factions, truce.factionB)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="planet-war-section">
        <h3 className="planet-war-subtitle">
          <span>{m.planet_wars_section_standings({ count: standings.length })}</span>
        </h3>
        <ol className="planet-standings-list">
          {standings.map((entry, index) => {
            const hex = nationHex(factions, entry.faction.id);
            const regime = regimeText(entry.faction.regime);
            const focused = focusedFactionId === entry.faction.id;
            const mine = myFactionId === entry.faction.id;
            return (
              <li
                key={entry.faction.id}
                className="planet-standing-row"
                data-nation={factionColor(factions, entry.faction.id)}
                data-focused={focused ? "true" : undefined}
                style={nationStyle(factions, entry.faction.id)}
              >
                <button
                  type="button"
                  className="planet-standing-btn"
                  aria-pressed={focused}
                  onClick={() => onFocusNation(entry.faction.id)}
                >
                  <span className="planet-standing-rank">{index + 1}</span>
                  {entry.faction.emblem || hex ? (
                    <NationEmblem
                      spec={entry.faction.emblem?.spec}
                      color={entry.faction.emblem?.color ?? hex ?? "#64748b"}
                      uploaded={entry.faction.emblem?.uploaded}
                      size={22}
                    />
                  ) : (
                    <span className="planet-legend-swatch planet-legend-nation" aria-hidden="true" />
                  )}
                  <span className="planet-standing-main">
                    <span className="planet-standing-name">
                      {factionName(factions, entry.faction.id)}
                      {mine ? ` · ${m.world_city_mine()}` : ""}
                    </span>
                    <span className="planet-standing-meta">
                      {m.planet_territory_nation_cities({ count: entry.cities })}
                      {entry.population > 0 ? ` · ${m.planet_wars_pop({ count: entry.population })}` : ""}
                      {regime ? ` · ${regime}` : ""}
                    </span>
                  </span>
                  {entry.atWar ? (
                    <span className="planet-standing-war">
                      <MapIcon name="swords" className="planet-legend-war-icon" />
                      <span>{m.planet_wars_at_war()}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

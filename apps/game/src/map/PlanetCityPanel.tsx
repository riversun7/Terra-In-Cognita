// 1차맵 도시 판 — 누른 도시의 이름·국가·시작 도시·둘레 땅(자원·기후)과 [들어가기](docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름").
// 들어가기는 띄운 2차맵이고 내가 볼 수 있을 때만(서버 시야 규칙, world.cities viewable). 아니면 까닭을 한 줄로 알린다.
// 볼 수 없는 맵(띄운 맵)은 시야 규칙을 그대로 두고 [정찰 보내기]로 1차맵 명령 흐름을 연다(WP7, 기획 정리 D-518 513).
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { LandFacts } from "./LandFacts.tsx";
import { cityLabel, enterStateOf, factionColor, factionName } from "./worldMapData.ts";

interface PlanetCityPanelProps {
  readonly city: WorldMapCity;
  readonly factions: readonly WorldMapFaction[];
  readonly mine: boolean;
  /** 들어가기(그 도시 시청 자리를 2차맵 카메라로 넘긴다) */
  readonly onEnter: (city: WorldMapCity) => void;
  /** 볼 수 없는 맵의 [정찰 보내기] → 1차맵 명령 판 */
  readonly onScout: (city: WorldMapCity) => void;
  readonly onClose: () => void;
}

export function PlanetCityPanel({ city, factions, mine, onEnter, onScout, onClose }: PlanetCityPanelProps) {
  const titleId = useId();
  const enter = enterStateOf(city);
  return (
    <section
      className="map-panel planet-city"
      aria-labelledby={titleId}
      data-city={city.id}
      data-enter={enter}
      data-nation={factionColor(factions, city.factionId)}
    >
      <div className="planet-city-head">
        <span className="planet-city-dot" aria-hidden="true" />
        <h2 id={titleId} className="planet-city-name">
          {cityLabel(factions, city)}
        </h2>
        {city.start ? <span className="planet-city-badge">{m.world_city_start()}</span> : null}
      </div>
      <p className="planet-city-nation">
        {m.world_city_nation({ nation: factionName(factions, city.factionId) })}
        {mine ? ` · ${m.world_city_mine()}` : ""}
      </p>
      <LandFacts land={city.land} />
      <div className="planet-city-actions">
        {enter === "enter" ? (
          <button
            type="button"
            className="button-small button-primary planet-city-enter"
            onClick={() => onEnter(city)}
          >
            {m.world_city_enter()}
          </button>
        ) : (
          <p className="planet-city-note">
            {enter === "not_loaded" ? m.world_city_not_loaded() : m.world_city_not_visible()}
          </p>
        )}
        {enter === "not_visible" ? (
          <button
            type="button"
            className="button-small button-primary planet-city-scout"
            onClick={() => onScout(city)}
          >
            {m.world_city_scout()}
          </button>
        ) : null}
        <button type="button" className="button-small" onClick={onClose}>
          {m.world_city_close()}
        </button>
      </div>
    </section>
  );
}

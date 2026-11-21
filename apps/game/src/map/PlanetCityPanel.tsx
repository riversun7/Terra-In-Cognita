// 1차맵 도시 판 — 누른 도시의 이름·국가 문양·수도/시작/등급·인구·발전도·교전 현황·둘레 땅(자원·기후)과 [들어가기]
// (docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름").
// 들어가기는 띄운 2차맵이고 내가 볼 수 있을 때만(서버 시야 규칙, world.cities viewable). 아니면 까닭을 한 줄로 알린다.
// 볼 수 없는 맵(띄운 맵)은 시야 규칙을 그대로 두고 [정찰 보내기]로 1차맵 명령 흐름을 연다(WP7, 기획 정리 D-518 513).
// 볼 수 있는 맵이어도 내 사이보그가 다른 2차맵에 있으면 [내 사이보그 보내기]로 같은 명령 흐름을 연다(WP14).
import type { WorldMapCity, WorldMapFaction, WorldMapRelation } from "@terra/shared/worldMap";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { LandFacts } from "./LandFacts.tsx";
import { MapIcon } from "./mapIcons.tsx";
import { nationHex, nationStyle } from "./nationColor.ts";
import { cityLabel, enterStateOf, factionColor, factionName } from "./worldMapData.ts";

interface PlanetCityPanelProps {
  readonly city: WorldMapCity;
  readonly factions: readonly WorldMapFaction[];
  readonly relations?: readonly WorldMapRelation[] | undefined;
  readonly mine: boolean;
  /** 들어가기(그 도시 시청 자리를 2차맵 카메라로 넘긴다) */
  readonly onEnter: (city: WorldMapCity) => void;
  /** 볼 수 없는 맵의 [정찰 보내기]·볼 수 있는 맵의 [내 사이보그 보내기] → 1차맵 명령 판 */
  readonly onScout: (city: WorldMapCity) => void;
  /** 내 사이보그가 있고 이 도시의 2차맵에 있지 않다([내 사이보그 보내기]를 보인다, WP14) */
  readonly canSend?: boolean;
  readonly onClose: () => void;
}

export function PlanetCityPanel({
  city,
  factions,
  relations,
  mine,
  onEnter,
  onScout,
  canSend = false,
  onClose,
}: PlanetCityPanelProps) {
  const titleId = useId();
  const enter = enterStateOf(city);
  const owner = factions.find((entry) => entry.id === city.factionId);
  const hex = nationHex(factions, city.factionId);
  const enemies = (relations ?? [])
    .filter(
      (rel) => rel.state === "war" && (rel.factionA === city.factionId || rel.factionB === city.factionId),
    )
    .map((rel) => factionName(factions, rel.factionA === city.factionId ? rel.factionB : rel.factionA));
  const stats = [
    ...(city.grade !== null ? [m.planet_city_grade({ grade: city.grade })] : []),
    ...(city.population !== undefined ? [m.planet_city_population({ count: city.population })] : []),
    ...(city.development !== undefined ? [m.planet_city_dev({ value: city.development })] : []),
  ];

  return (
    <section
      className="map-panel planet-city"
      aria-labelledby={titleId}
      data-city={city.id}
      data-enter={enter}
      data-nation={factionColor(factions, city.factionId)}
      style={nationStyle(factions, city.factionId)}
    >
      <div className="planet-city-head">
        {owner?.emblem || hex ? (
          <NationEmblem
            spec={owner?.emblem?.spec}
            color={owner?.emblem?.color ?? hex ?? "#64748b"}
            uploaded={owner?.emblem?.uploaded}
            size={28}
          />
        ) : (
          <span className="planet-city-dot" aria-hidden="true" />
        )}
        <h2 id={titleId} className="planet-city-name">
          {cityLabel(factions, city)}
        </h2>
        {city.capital ? (
          <span className="planet-city-badge planet-city-badge-capital">
            ★ {m.planet_territory_capital()}
          </span>
        ) : null}
        {city.start ? <span className="planet-city-badge">{m.world_city_start()}</span> : null}
      </div>
      <p className="planet-city-nation">
        {m.world_city_nation({ nation: factionName(factions, city.factionId) })}
        {mine ? ` · ${m.world_city_mine()}` : ""}
        {stats.length > 0 ? ` · ${stats.join(" · ")}` : ""}
      </p>
      {city.occupation && !city.occupation.recent ? (
        <p className="planet-city-war-alert">
          <MapIcon name="swords" className="planet-legend-war-icon" />
          <span>{m.planet_city_under_siege()}</span>
        </p>
      ) : null}
      {enemies.length > 0 ? (
        <p className="planet-city-war-alert">
          <MapIcon name="swords" className="planet-legend-war-icon" />
          <span>{m.planet_city_at_war_with({ nations: enemies.join(", ") })}</span>
        </p>
      ) : null}
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
        {enter === "enter" && canSend ? (
          <button type="button" className="button-small planet-city-send" onClick={() => onScout(city)}>
            {m.world_city_send()}
          </button>
        ) : null}
        <button type="button" className="button-small" onClick={onClose}>
          {m.world_city_close()}
        </button>
      </div>
    </section>
  );
}

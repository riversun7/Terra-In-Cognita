// 홈 [지도] 전술 런처 카드 — 2차맵(현장 작전)과 1차맵(행성 전략)을 컴팩트 전술 액션 행으로 바로 연다.
import type { RouteTarget } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { Icon } from "../../ui/icons.tsx";
import { HomeLink } from "../shellParts.tsx";
import { ExternalArrowIcon } from "./icons.tsx";

const LOCAL_MAP: RouteTarget = { route: "map" };
const WORLD_MAP: RouteTarget = { route: "map_planet" };

export function MapsCardBody() {
  return (
    <div className="dash-map-stack">
      <HomeLink to={LOCAL_MAP} className="dash-map-row" data-tone="primary">
        <span className="dash-map-badge" aria-hidden="true">
          <Icon name="map" />
        </span>
        <span className="dash-map-copy">
          <span className="dash-map-title">{m.home_maps_local()}</span>
          <span className="dash-map-desc">{m.home_maps_local_desc()}</span>
        </span>
        <span className="dash-map-arrow" aria-hidden="true">
          <ExternalArrowIcon />
        </span>
      </HomeLink>
      <HomeLink to={WORLD_MAP} className="dash-map-row" data-tone="secondary">
        <span className="dash-map-badge" aria-hidden="true">
          <Icon name="globe" />
        </span>
        <span className="dash-map-copy">
          <span className="dash-map-title">{m.home_maps_world()}</span>
          <span className="dash-map-desc">{m.home_maps_world_desc()}</span>
        </span>
        <span className="dash-map-arrow" aria-hidden="true">
          <ExternalArrowIcon />
        </span>
      </HomeLink>
    </div>
  );
}

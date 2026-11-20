// 홈 [지도] 전술 런처 카드 — 중복 문구 없이 2차맵(현장)과 1차맵(행성 전략 지도)을 깔끔한 2열 전술 타일로 바로 연다.
import type { RouteTarget } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { Icon } from "../../ui/icons.tsx";
import { HomeLink } from "../shellParts.tsx";
import { ExternalArrowIcon } from "./icons.tsx";

const LOCAL_MAP: RouteTarget = { route: "map" };
const WORLD_MAP: RouteTarget = { route: "map_planet" };

export function MapsCardBody() {
  return (
    <div className="dash-map-grid">
      <HomeLink to={LOCAL_MAP} className="dash-map-tile" data-tone="primary">
        <div className="dash-map-tile-head">
          <span className="dash-map-tile-icon" aria-hidden="true">
            <Icon name="map" />
          </span>
          <span className="dash-map-tile-title">{m.home_maps_local()}</span>
          <span className="dash-map-tile-arrow" aria-hidden="true">
            <ExternalArrowIcon />
          </span>
        </div>
        <span className="dash-map-tile-desc">{m.home_maps_local_desc()}</span>
      </HomeLink>
      <HomeLink to={WORLD_MAP} className="dash-map-tile" data-tone="secondary">
        <div className="dash-map-tile-head">
          <span className="dash-map-tile-icon" aria-hidden="true">
            <Icon name="globe" />
          </span>
          <span className="dash-map-tile-title">{m.home_maps_world()}</span>
          <span className="dash-map-tile-arrow" aria-hidden="true">
            <ExternalArrowIcon />
          </span>
        </div>
        <span className="dash-map-tile-desc">{m.home_maps_world_desc()}</span>
      </HomeLink>
    </div>
  );
}

// [임시] 지도 카드 — 2차맵·1차맵을 여는 단추만(ADR 2026-10-29-app-shell 6절). 1차맵 단추는 6-3에서 지도 안 전환이
// 생기면 지운다(3절 "지도 안 단추"). 주소로 연다: 지도는 쌓는다(push, 2절).
import type { RouteTarget } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { HomeLink } from "../shellParts.tsx";

const LOCAL_MAP: RouteTarget = { route: "map" };
const WORLD_MAP: RouteTarget = { route: "map_planet" };

export function MapsCardBody() {
  return (
    <div className="home-maps">
      <HomeLink to={LOCAL_MAP} className="home-link-button home-link-primary">
        {m.home_maps_local()}
      </HomeLink>
      <HomeLink to={WORLD_MAP} className="home-link-button">
        {m.home_maps_world()}
      </HomeLink>
    </div>
  );
}

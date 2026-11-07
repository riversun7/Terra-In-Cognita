// 지도 안 단추 — 지도는 틀을 숨기므로 틀이 지도 위에 [1차맵/2차맵] 전환을 그린다(ADR 2026-10-29-app-shell 3절 "지도 안 단추",
// D-6018 "구석에 전환 버튼"). [뒤로]는 지도 화면의 자기 단추다(onClose = 화면 안 뒤로).
// 전환은 바꾸기(replace)다: 뒤로 = 지도를 떠남(2절). 주소의 ?key=(지금 보는 2차맵)를 그대로 넘긴다: 2차맵 → 1차맵은 그 2차맵 자리를 가운데로,
// 1차맵 → 2차맵은 같은 2차맵(없으면 내 사이보그가 있는 맵, docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름").
// [임시] 두 지도가 한 화면·한 캔버스(줄이기로 이어짐)가 되면 이 단추는 그 화면 안으로 간다.
import type { RouteId, RouteTarget } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { AppLink } from "./AppLink.tsx";
import { useRoute } from "./routerStore.ts";

/** 전환 대상: 지금 지도의 반대쪽, ?key=를 그대로 */
export function mapSwitchTarget(route: "map" | "map_planet", key: string | undefined): RouteTarget {
  const next = route === "map" ? "map_planet" : "map";
  return key === undefined ? { route: next } : { route: next, search: { key } };
}

export function MapSwitch({ route }: { route: RouteId }) {
  const { match } = useRoute();
  if (route !== "map" && route !== "map_planet") return null;
  const toPlanet = route === "map";
  const key = match?.id === route ? match.search.key : undefined;
  return (
    <nav className="map-switch" aria-label={m.shell_map_switch()}>
      <AppLink to={mapSwitchTarget(route, key)} replace className="map-switch-button">
        <Icon name={toPlanet ? "globe" : "map"} />
        <span>{toPlanet ? m.shell_map_to_planet() : m.shell_map_to_local()}</span>
      </AppLink>
    </nav>
  );
}

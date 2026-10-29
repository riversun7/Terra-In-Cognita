// 지도 안 단추 — 지도는 틀을 숨기므로 틀이 지도 위에 [1차맵/2차맵] 전환을 그린다(ADR 2026-10-29-app-shell 3절 "지도 안 단추",
// D-6018 "구석에 전환 버튼"). [뒤로]는 지도 화면의 자기 단추다(onClose = 화면 안 뒤로). [내 사이보그로]는 사이보그가 생기면 더한다.
// 전환은 바꾸기(replace)다: 뒤로 = 지도를 떠남(2절). 지도 화면 파일(map/*)은 고치지 않는다.
// [임시] 지금 두 지도는 시험 화면이다. 6-3에서 한 화면·한 캔버스(줄이기로 이어짐)가 되면 이 단추는 그 화면 안으로 간다.
import type { RouteId } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { AppLink } from "./AppLink.tsx";

export function MapSwitch({ route }: { route: RouteId }) {
  if (route !== "map" && route !== "map_planet") return null;
  const toPlanet = route === "map";
  return (
    <nav className="map-switch" aria-label={m.shell_map_switch()}>
      <AppLink to={{ route: toPlanet ? "map_planet" : "map" }} replace className="map-switch-button">
        <Icon name={toPlanet ? "globe" : "map"} />
        <span>{toPlanet ? m.shell_map_to_planet() : m.shell_map_to_local()}</span>
      </AppLink>
    </nav>
  );
}

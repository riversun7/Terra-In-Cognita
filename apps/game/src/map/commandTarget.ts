// 1차맵 명령 판의 대상(도시 또는 1차맵에서 고른 지역)과 보낼 유닛 고르기 — 순수 도우미(시험 대상, commandTarget.test.ts).
// 사용자 요청 2026-11-09 "옆2차맵으로 이동 없애라 그냥 걸어가는거지. 대신 1차맵에서 해당지역으로 이동 같은 기능 추가"
// (docs/adr/2026-11-07-play-flow.md "바뀜 (2026-11-09)"): 2차맵 사이 이동은 2차맵에서 걸어가거나, 1차맵에서 아무 지역이나 골라
// [이곳으로 이동] → 1차맵 명령 판(PlanetCommandPanel) → [확정](travel_start)이다.
// - 도시 대상: 도시 판 [정찰 보내기](볼 수 없는 맵은 정찰이 먼저, 볼 수 있으면 이동이 먼저 — WP7·WP14).
// - 지역 대상: 누른 자리(위도·경도)의 2차맵과 그 안 배치 칸. 명령은 이동이 먼저. 그 2차맵에 도시가 있으면 도시 이름을 쓴다.
// - 보낼 수 없는 지역은 버튼을 감춘다: 누른 칸 없음, 바다, 내 사이보그가 이미 있는 2차맵(그 안은 2차맵에서 걸어간다), 보낼 유닛 없음.
//   그 밖(띄우지 않은 맵·길 없음 등)은 서버 확인 단계가 판의 까닭 줄로 알린다(world.travelPlan).
import type { TravelKind } from "@terra/protocol";
import type { MapUnit } from "@terra/shared/mapUnits";
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { m } from "../paraglide/messages.js";
import { cityLabel } from "./worldMapData.ts";

/** 1차맵 명령 판의 대상 */
export interface CommandTarget {
  /** 목적 2차맵 키(1차맵 칸 셀 키) */
  readonly mapKey: number;
  /** 목적 배치 칸(0 ~ 255) — 서버는 설 수 없으면 가장 가까운 설 수 있는 칸으로 보낸다 */
  readonly x: number;
  readonly y: number;
  /** 도시면 도시 ID, 고른 지역이면 null(그 2차맵에 도시가 있으면 그 도시) */
  readonly cityId: number | null;
  /** 국가 색(판 점) — 도시가 없으면 null */
  readonly factionId: number | null;
  /** "대상: …"에 쓰는 이름 */
  readonly label: string;
  /** 처음 고른 명령 */
  readonly order: TravelKind;
}

/** 도시 판 [정찰 보내기]의 대상: 시청 칸. 볼 수 있는 2차맵이면 이동이 먼저(WP14), 볼 수 없으면 정찰이 먼저(513) */
export function cityTarget(city: WorldMapCity, factions: readonly WorldMapFaction[]): CommandTarget {
  return {
    mapKey: city.mapKey,
    x: city.cellX,
    y: city.cellY,
    cityId: city.id,
    factionId: city.factionId,
    label: cityLabel(factions, city),
    order: city.viewable ? "move" : "scout",
  };
}

/** 1차맵에서 고른 자리(엔진 placementAtLatLon 결과) */
export interface PickedPlace {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** [이곳으로 이동]을 띄울지: 보낼 수 있으면 대상 자리, 아니면 감추는 까닭 */
export type AreaCheck =
  | { readonly kind: "ok"; readonly place: PickedPlace }
  /** 누른 칸 없음(행성 밖·아직 받지 않은 타일)·행성 값 전 */
  | { readonly kind: "none" }
  /** 바다 칸(걸어서 갈 수 없다) */
  | { readonly kind: "sea" }
  /** 내 사이보그가 이미 그 2차맵에 있다(2차맵에서 걸어간다) */
  | { readonly kind: "same_map" }
  /** 보낼 유닛(내 사이보그)이 없다 */
  | { readonly kind: "no_unit" };

/**
 * 고른 지역에 [이곳으로 이동]을 띄울지. place = 누른 자리의 2차맵·배치 칸(없으면 null), sea = 누른 칸이 바다,
 * myMapKey = 내 사이보그가 지금 있는 2차맵(없으면 null — 보낼 유닛 없음)
 */
export function areaCheck(place: PickedPlace | null, sea: boolean, myMapKey: number | null): AreaCheck {
  if (place === null) return { kind: "none" };
  if (sea) return { kind: "sea" };
  if (myMapKey === null) return { kind: "no_unit" };
  if (place.mapKey === myMapKey) return { kind: "same_map" };
  return { kind: "ok", place };
}

/** 감추는 까닭 한 줄(누른 칸 안내 아래). 까닭을 말할 것이 없으면 null */
export function areaCheckText(check: AreaCheck): string | null {
  if (check.kind === "sea") return m.world_area_sea();
  if (check.kind === "same_map") return m.world_area_same_map();
  return null;
}

/**
 * 고른 지역의 대상: 그 2차맵에 도시가 있으면 그 도시 이름·국가 색, 없으면 "고른 지역 · <땅 이름>". 명령은 이동이 먼저
 * (사용자 요청 "해당지역으로 이동"). ground = 누른 칸의 땅 이름(바이옴, 모르면 null)
 */
export function areaTarget(
  place: PickedPlace,
  cities: readonly WorldMapCity[],
  factions: readonly WorldMapFaction[],
  ground: string | null,
): CommandTarget {
  const city = cities.find((entry) => entry.mapKey === place.mapKey) ?? null;
  return {
    mapKey: place.mapKey,
    x: place.x,
    y: place.y,
    cityId: city?.id ?? null,
    factionId: city?.factionId ?? null,
    label: city
      ? cityLabel(factions, city)
      : ground
        ? m.world_command_area({ ground })
        : m.world_command_area_plain(),
    order: "move",
  };
}

/**
 * 1차맵 명령으로 보낼 수 있는 내 유닛(내 사이보그가 있는 2차맵의 world.mapUnits 목록에서): 지금 명령할 수 없는 유닛(수호신·포로·중태)은 뺀다.
 * 서버 이동 서비스도 같은 유닛만 받는다(내 소유, 수호신·봇 아님 — src/travel/service.ts ownUnit). 차례는 받은 그대로(사이보그 본체 먼저)
 */
export function sendableUnits(units: readonly MapUnit[]): MapUnit[] {
  return units.filter((unit) => unit.hold === null && unit.kind !== "guardian" && unit.kind !== "npc_leader");
}

/** 명령 판의 판 열쇠: 대상이 바뀌면 판을 새로 만든다(명령·확인 단계·고른 유닛을 처음부터) */
export function commandKey(target: Pick<CommandTarget, "mapKey" | "x" | "y">): string {
  return `${String(target.mapKey)}:${String(target.x)},${String(target.y)}`;
}

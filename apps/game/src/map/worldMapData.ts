// 지도 흐름 자료(tRPC world.cities·world.myPosition)와 순수 도우미 — docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름".
// 1차맵 화면·2차맵 화면·첫 접속 도시 단계가 같이 쓴다. 엔진을 가져오지 않는다(첫 접속 조각에 three.js가 들지 않게).
// 국가 색은 개발 영토 화면과 같은 방식(--color-stat-* 여섯 색을 국가 차례대로 돌려 쓴다)이고, 화면 CSS가 data-color 번호로 고른다.
import type {
  WorldCitiesResponse,
  WorldMapCity,
  WorldMapFaction,
  WorldPositionResponse,
} from "@terra/shared/worldMap";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";

const REQUEST_TIMEOUT_MS = 10_000;
/** 국가 색 수(지도 CSS의 data-color 0 ~ 5 = --color-stat-* 여섯) */
export const FACTION_COLORS = 6;
/** 셀 키 상한(@terra/planet MAX_CELL_KEY = 6 × 2^49 − 10 아래, 안전 정수) */
const MAX_MAP_KEY = 6 * 2 ** 49;

/** 주소 ?key= 값 → 2차맵 키. 10진 숫자가 아니거나(0으로 시작 등) 범위 밖이면 null(주소는 고치지 않는다) */
export function parseMapKey(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value)) return null;
  const key = Number(value);
  return Number.isSafeInteger(key) && key < MAX_MAP_KEY ? key : null;
}

/** 국가 색 번호(응답의 국가 차례대로 0 ~ 5 돌려 쓰기). 모르는 국가면 0 */
export function factionColor(factions: readonly WorldMapFaction[], factionId: number): number {
  const index = factions.findIndex((faction) => faction.id === factionId);
  return (index < 0 ? 0 : index) % FACTION_COLORS;
}

/** 국가 이름(지금 언어). 이름이 없으면 코드, 코드도 없으면 "#ID" */
export function factionName(factions: readonly WorldMapFaction[], factionId: number): string {
  const faction = factions.find((entry) => entry.id === factionId);
  if (faction?.name) return getLocale() === "en" ? faction.name.en : faction.name.ko;
  return faction?.code ?? `#${factionId}`;
}

/** 도시 이름: 서버가 준 이름(번역하지 않는다 D-476, NPC 도시는 팩 — 기획 답 510 다), 없으면 "<국가> 도시 N" */
export function cityLabel(
  factions: readonly WorldMapFaction[],
  city: Pick<WorldMapCity, "factionId" | "number" | "name">,
): string {
  if (city.name) return city.name;
  return m.world_city_name({ nation: factionName(factions, city.factionId), number: city.number });
}

/** 들어가기 상태: 들어감·띄우지 않은 맵·볼 수 없음 */
export type EnterState = "enter" | "not_loaded" | "not_visible";

export function enterStateOf(city: Pick<WorldMapCity, "loaded" | "viewable">): EnterState {
  if (!city.loaded) return "not_loaded";
  return city.viewable ? "enter" : "not_visible";
}

/** 2차맵 키의 도시 중 들어갈 수 있는 것(1차맵 가까이 보기 → 그 2차맵 들어가기) */
export function enterableAt(cities: readonly WorldMapCity[], mapKey: number): WorldMapCity | null {
  return cities.find((city) => city.mapKey === mapKey && city.loaded && city.viewable) ?? null;
}

export function loadWorldCities(signal?: AbortSignal): Promise<WorldCitiesResponse> {
  return api.world.cities.query(undefined, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export function loadMyPosition(signal?: AbortSignal): Promise<WorldPositionResponse> {
  return api.world.myPosition.query(undefined, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

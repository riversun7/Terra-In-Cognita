// 1차맵 영토 보기 한 벌 — 영토 모양(territoryShapes.ts)과 비슷한 색 이웃 무늬(기획 D-546 1435). 도시 자료·국가 색이 바뀔 때만 셈한다.
// 1435 사용자 원문: "영토색의 패턴을 부여하면 시각적으로 조금 구분될수도 둘다 빨간계열이면 빗금같은 패턴시 서로 대비되는색이나 두번째 색을 섞어서".
// 가깝다(비슷한 색) = 맞닿은 두 국가(받침 선이 있는 쌍)의 국가 고유 색 OKLab 거리가 PATTERN_CLOSE_DISTANCE 미만. 그 쌍의 큰 국가 ID 쪽 영토 칠에
// 빗금(국가 색 바탕 + 그 색 위 글자 색 --nation-ink 줄 — 검정·흰색 가운데 대비가 큰 것)을 더한다. 색이 없는(옛 서버·프리셋 없는) 국가는 보지
// 않는다(여섯 색 돌려 쓰기는 서로 다르다). 그리기(CityOverlay)와 범례(PlanetLayerPicker)가 같은 판정을 쓴다.
import type { WorldCitiesResponse, WorldMapFaction } from "@terra/shared/worldMap";
import { colorDistance, nationHex } from "./nationColor.ts";
import { type TerritoryShapes, buildTerritoryShapes, territoryInputOf } from "./territoryShapes.ts";

/**
 * [임시] 비슷한 색 문턱(OKLab 거리). 팩 국가 프리셋 16색(core@95, 서로 가장 가까운 쌍 0.086)에서 120쌍 가운데 14쌍이 이보다 가깝다 — 같은 계열
 * (빨강·주황 등) 이웃만 무늬를 받는다. 눈으로 겨우 갈리는 차이는 약 0.02, 뚜렷이 다른 색은 0.15 위(맞춘 값, 작업 기록 2026-11-15)
 */
export const PATTERN_CLOSE_DISTANCE = 0.12;

export interface TerritoryView {
  readonly shapes: TerritoryShapes;
  /** 빗금 무늬를 받는 국가 */
  readonly patterned: ReadonlySet<number>;
}

/** 맞닿은 쌍 가운데 색이 가까운 쌍의 큰 ID 국가 */
export function patternedNations(
  neighbours: readonly (readonly [number, number])[],
  factions: readonly WorldMapFaction[],
): Set<number> {
  const patterned = new Set<number>();
  for (const [a, b] of neighbours) {
    const ca = nationHex(factions, a);
    const cb = nationHex(factions, b);
    if (ca === null || cb === null) continue;
    if (colorDistance(ca, cb) < PATTERN_CLOSE_DISTANCE) patterned.add(Math.max(a, b));
  }
  return patterned;
}

export const EMPTY_TERRITORY_VIEW: TerritoryView = {
  shapes: { areas: [], dividers: [], neighbours: [], labels: [] },
  patterned: new Set(),
};

/** world.cities 응답 → 영토 보기(준비 전이면 빈 것) */
export function territoryViewOf(
  world: Pick<
    WorldCitiesResponse,
    "status" | "cities" | "factions" | "milliPerRadian" | "beacons" | "territoryDisplay"
  > | null,
): TerritoryView {
  if (world?.status !== "ready") return EMPTY_TERRITORY_VIEW;
  const input = territoryInputOf(world);
  const shapes = buildTerritoryShapes(input.sites, input.corridor);
  return { shapes, patterned: patternedNations(shapes.neighbours, world.factions) };
}

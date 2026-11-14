// 1차맵 영토 레이어에서 누른 곳의 국가 — 화면 표시용(판정 아님). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"·"바뀜 (2026-11-14)".
// 서버가 준 자료(world.cities: 아는 도시·배후지 반경)만 쓴다(안개 규칙 그대로 — 모르는 국가는 나오지 않는다).
// 그려진 영토와 같은 규칙(territoryShapes.ts territoryOwner): 원이 덮는 도시 가운데 가장 가까운 도시의 국가. 원 밖이면 영토 밖.
// 서버 칸 소속(@terra/shared/territory claimAt — 영향권 D-104·비콘 껍질)과는 다른 보기 규칙이다(질문 1433).
import type { WorldMapCity } from "@terra/shared/worldMap";
import { territoryOwner, territorySitesOf } from "./territoryShapes.ts";

export interface TerritoryHit {
  readonly factionId: number;
  /** 그 땅의 주인 도시 */
  readonly cityId: number;
}

/** 그 점의 국가(영토 밖이면 null). milliPerRadian = 반경 환산(0이면 영토가 없다) */
export function territoryAt(
  latDeg: number,
  lonDeg: number,
  cities: readonly WorldMapCity[],
  milliPerRadian: number,
): TerritoryHit | null {
  const owner = territoryOwner(latDeg, lonDeg, territorySitesOf(cities, milliPerRadian));
  return owner ? { factionId: owner.factionId, cityId: owner.id } : null;
}

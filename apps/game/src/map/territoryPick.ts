// 1차맵 영토 레이어에서 누른 곳의 국가 — 화면 표시용(판정 아님). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"·"바뀜 (2026-11-14)".
// 서버가 준 자료(world.cities: 아는 도시·배후지 반경·아는 영토 비콘·표시 설정 칸)만 쓴다(안개 규칙 그대로 — 모르는 국가는 나오지 않는다).
// 그려진 영토와 같은 규칙(territoryShapes.ts territoryOwner): 국가 영토(도시·비콘 원 + 그 사이 띠)가 덮는 국가 가운데 가장 가까운 도시·비콘의
// 국가. 서버 칸 소속(@terra/shared/territory claimAt — 영향권 D-104·비콘 껍질)과는 다른 보기 규칙이다(질문 1433, 기획 D-544 미결).
import type { WorldCitiesResponse } from "@terra/shared/worldMap";
import { type TerritoryInput, territoryInputOf, territoryOwner } from "./territoryShapes.ts";

export interface TerritoryHit {
  readonly factionId: number;
  /** 그 땅의 주인 도시(주인이 비콘이면 null) */
  readonly cityId: number | null;
  /** 주인이 영토 비콘이면 그 비콘 ID */
  readonly beaconId: number | null;
}

/** 그 점의 국가(영토 밖이면 null). input = territoryInputOf(world.cities 응답) */
export function territoryAt(latDeg: number, lonDeg: number, input: TerritoryInput): TerritoryHit | null {
  const owner = territoryOwner(latDeg, lonDeg, input.sites, input.corridor);
  if (!owner) return null;
  return owner.kind === "city"
    ? { factionId: owner.factionId, cityId: owner.id, beaconId: null }
    : { factionId: owner.factionId, cityId: null, beaconId: owner.id };
}

/** world.cities 응답으로 바로(누를 때 한 번) */
export function territoryAtWorld(
  latDeg: number,
  lonDeg: number,
  world: Pick<WorldCitiesResponse, "cities" | "milliPerRadian" | "beacons" | "territoryDisplay">,
): TerritoryHit | null {
  return territoryAt(latDeg, lonDeg, territoryInputOf(world));
}

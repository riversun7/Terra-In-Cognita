// 1차맵 영토 레이어에서 누른 곳의 국가 — 화면 표시용(판정은 서버). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"·"바뀜 (2026-11-14)".
// 서버가 준 자료(world.cities: 아는 도시·배후지 반경·아는 영토 비콘·표시 설정 칸)만 쓴다(안개 규칙 그대로 — 모르는 국가는 나오지 않는다).
// 그려진 영토와 같은 규칙(territoryShapes.ts territoryOwner): 국가 영토(도시 원 + 도시 사이 띠 + 비콘까지 넓힌 외곽선)가 덮는 국가 가운데 영향력 비율이 가장 작은 도시·비콘의
// 국가(영향력 비율 — 거리 ÷ 원 반지름, D-546 1432). 서버 칸 소속·비콘 놓기·지방(@terra/shared/territory claimAt)과 같은 함수다(D-568 "판정도
// 지도대로"). 다만 화면은 아는 도시·비콘만 넣으므로(안개) 모르는 이웃이 있는 곳은 서버 판정과 다를 수 있다.
import type { WorldCitiesResponse } from "@terra/shared/worldMap";
import { type TerritoryInput, territoryInputOf, territoryOwner } from "./territoryShapes.ts";

export interface TerritoryHit {
  readonly factionId: number;
  /** 그 땅의 주인 도시(주인이 비콘이면 그 기준 도시 — 도시 소유 비콘은 그 도시를 넓힌다, D-546 1434) */
  readonly cityId: number | null;
}

/** 그 점의 국가(영토 밖이면 null). input = territoryInputOf(world.cities 응답) */
export function territoryAt(latDeg: number, lonDeg: number, input: TerritoryInput): TerritoryHit | null {
  const owner = territoryOwner(latDeg, lonDeg, input.sites, input.corridor);
  if (!owner) return null;
  return {
    factionId: owner.factionId,
    cityId: owner.kind === "city" ? owner.id : (owner.anchorCityId ?? null),
  };
}

/** world.cities 응답으로 바로(누를 때 한 번) */
export function territoryAtWorld(
  latDeg: number,
  lonDeg: number,
  world: Pick<WorldCitiesResponse, "cities" | "milliPerRadian" | "beacons" | "territoryDisplay">,
): TerritoryHit | null {
  return territoryAt(latDeg, lonDeg, territoryInputOf(world));
}

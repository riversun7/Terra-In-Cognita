// 이 세계의 플레이 행성 목록 — docs/adr/2026-11-11-planet-scope.md.
// "세계 행성"을 묻는 곳은 흩어진 상수 대신 여기를 부른다. 지금은 하나(S2 시험 행성 = 세계 표 planet_id 기본값)다.
// 테라포밍한 태양계 행성이 열리면 이 목록에 더한다: 편집기·모니터링·운영 조회는 이미 planetId를 받으므로 그대로 그 행성을 고를 수 있다.
// 행성마다 2차맵·NPC 사회 런타임·지형 서비스를 띄우는 일(world.ts·app.ts)은 그때 한다 — 지금 그 몫은 대표 행성 하나만 돈다.
import type { PlanetScopeEntry, PlanetScopeResponse } from "@terra/shared/planetScope";
import { DEFAULT_WORLD_PLANET_ID } from "../db/planetColumns.ts";

export interface PlayablePlanet {
  /** 행성 ID(콘텐츠 ID, 세계 표 planet_id 값) */
  readonly id: string;
  /** 대표 행성: 입력에 planetId가 없을 때의 기본값(옛 기기 호환) */
  readonly primary: boolean;
}

const PLAYABLE: readonly PlayablePlanet[] = [{ id: DEFAULT_WORLD_PLANET_ID, primary: true }];

/** 이 세계의 플레이 행성(대표가 맨 앞) */
export function playablePlanets(): readonly PlayablePlanet[] {
  return PLAYABLE;
}

/** 대표 플레이 행성 ID */
export function primaryPlanetId(): string {
  return DEFAULT_WORLD_PLANET_ID;
}

export function isPlayablePlanet(planetId: string): boolean {
  return PLAYABLE.some((planet) => planet.id === planetId);
}

/** 입력 planetId(없으면 대표 행성) → 플레이 행성 ID. 플레이 행성이 아니면 undefined */
export function resolvePlayablePlanet(planetId: string | undefined): string | undefined {
  if (planetId === undefined) return primaryPlanetId();
  return isPlayablePlanet(planetId) ? planetId : undefined;
}

/** 범위 줄·행성 고르기에 보일 행성 하나의 재료(콘텐츠 팩 행성 원본에서) */
export interface ScopePlanetSource {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly faceLevel: number;
}

/**
 * 범위 목록(tRPC planetScope.list): 플레이 행성(대표가 맨 앞) + includeEditorOnly면 팩에 있지만 세계가 쓰지 않는 행성(편집 전용).
 * 팩에 이름이 없는 플레이 행성(시험 서버·행성 서비스 없음)은 ID를 이름으로 쓴다
 */
export function planetScopeList(
  sources: readonly ScopePlanetSource[],
  options: { readonly includeEditorOnly: boolean; readonly nowMs: number },
): PlanetScopeResponse {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const playable: PlanetScopeEntry[] = playablePlanets().map((planet) => {
    const source = byId.get(planet.id);
    return {
      id: planet.id,
      name: source ? { ko: source.name.ko, en: source.name.en } : { ko: planet.id, en: planet.id },
      status: "playable",
      primary: planet.primary,
      faceLevel: source?.faceLevel ?? null,
    };
  });
  const editorOnly: PlanetScopeEntry[] = options.includeEditorOnly
    ? sources
        .filter((source) => !isPlayablePlanet(source.id))
        .map((source) => ({
          id: source.id,
          name: { ko: source.name.ko, en: source.name.en },
          status: "editor",
          primary: false,
          faceLevel: source.faceLevel,
        }))
    : [];
  return {
    primaryPlanetId: primaryPlanetId(),
    planets: [...playable, ...editorOnly],
    generatedAt: options.nowMs,
  };
}

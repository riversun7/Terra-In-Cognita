// 행성 범위(편집기·모니터링이 "어느 행성에 반영되는가"를 보이는 틀) — docs/adr/2026-11-11-planet-scope.md.
// 사용자 요청(2026-11-11): "행성을 선택이 필요한 에디터에 행성 선택하는 기능이 없어 어디에만 반영되는지 확인 불가. 모니터링도 행성별로 가능해야함."
// 범위 층: 세계(서버 하나) → 항성계 → 행성 → 2차맵. 지금 플레이 행성은 하나이고, 테라포밍한 행성이 열리면 목록(서버 playablePlanets)에 는다.
// 서버(tRPC planetScope.list·ops.* 입력)와 기기(범위 줄·행성 고르기)가 같은 모양을 쓴다. 맨 위에서 부르는 코드를 두지 않는다("sideEffects": false).
import type { LocalizedName } from "./roster.ts";

/**
 * 행성 상태
 * - playable: 플레이 중(이 세계의 유닛·도시·2차맵이 놓인 행성)
 * - editor: 편집 전용(콘텐츠 팩에 있지만 세계가 쓰지 않는 행성 — 행성 편집기 시작점·2차맵 시험)
 * - library: 보관함(팀이 저장한 행성 초안, 세계에 반영되지 않음). 이 목록에는 오지 않고 행성 편집기가 자기 목록에 붙인다
 */
export const PLANET_SCOPE_STATUSES = ["playable", "editor", "library"] as const;
export type PlanetScopeStatus = (typeof PLANET_SCOPE_STATUSES)[number];

export interface PlanetScopeEntry {
  /** 행성 ID(콘텐츠 ID 모양) */
  readonly id: string;
  readonly name: LocalizedName;
  readonly status: PlanetScopeStatus;
  /** 대표 플레이 행성(입력에 planetId가 없을 때의 기본값) */
  readonly primary: boolean;
  /** 면 레벨(모르면 null) */
  readonly faceLevel: number | null;
}

export interface PlanetScopeResponse {
  /** 대표 플레이 행성 ID */
  readonly primaryPlanetId: string;
  /** 플레이 행성 먼저(대표가 맨 앞), 그다음 편집 전용 */
  readonly planets: readonly PlanetScopeEntry[];
  readonly generatedAt: number;
}

/** 행성 ID 모양(콘텐츠 ID, DB 검사 조건 world_*_planet_id_format과 같다) */
export const PLANET_ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** 모니터링의 "전체"(행성으로 거르지 않음). 행성 ID 모양이 아니라 겹치지 않는다 */
export const ALL_PLANETS = "*";

export function isPlanetId(value: unknown): value is string {
  return typeof value === "string" && PLANET_ID_PATTERN.test(value);
}

/** 주소 검색어 ?planet= 값 → 행성 ID. 없거나 모양이 틀리면 null */
export function parsePlanetParam(value: string | null | undefined): string | null {
  return isPlanetId(value) ? value : null;
}

/**
 * 고른 행성 정하기: 주소(?planet=) → 기억한 값 → 대표 플레이 행성 차례로, 고를 수 있는 목록(allowed)에 있는 첫 값.
 * 목록이 비면 null(아직 모름)
 */
export function resolvePlanetChoice(input: {
  readonly fromUrl: string | null;
  readonly remembered: string | null;
  readonly primary: string | null;
  readonly allowed: readonly string[];
}): string | null {
  const { allowed } = input;
  for (const candidate of [input.fromUrl, input.remembered, input.primary])
    if (candidate !== null && allowed.includes(candidate)) return candidate;
  return allowed[0] ?? null;
}

/** 감사 기록 meta에서 행성 ID(없거나 모양이 틀리면 null). meta는 jsonb라 모양을 믿지 않는다 */
export function auditPlanetId(meta: unknown): string | null {
  if (typeof meta !== "object" || meta === null) return null;
  const value: unknown = Reflect.get(meta, "planetId");
  return isPlanetId(value) ? value : null;
}

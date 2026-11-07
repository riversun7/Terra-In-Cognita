// 우주 그림 문구 — 태양계 천체 이름(별칭·실명, D-5067·D-366)과 천체 종류. 메시지 함수를 키로 고르는 표(oxlint: 네임스페이스를
// 계산해서 읽지 않는다). 1차맵 항성계 보기(map/PlanetSystemView.tsx)가 쓴다.
import { m } from "../paraglide/messages.js";
import type { HomeBodyId, HomeMoonId } from "./homeSystem.ts";
import type { SystemBodyKind } from "./StarSystemView.tsx";

/** 별칭(없으면 null — 지구는 실명만) */
const ALIAS: Record<HomeBodyId | HomeMoonId, (() => string) | null> = {
  mercury: m.space_alias_mercury,
  venus: m.space_alias_venus,
  earth: null,
  moon: m.space_alias_moon,
  mars: m.space_alias_mars,
  asteroid_belt: null,
  jupiter: m.space_alias_jupiter,
  saturn: m.space_alias_saturn,
  uranus: m.space_alias_uranus,
  neptune: m.space_alias_neptune,
};

const REAL: Record<HomeBodyId | HomeMoonId, () => string> = {
  mercury: m.space_real_mercury,
  venus: m.space_real_venus,
  earth: m.space_real_earth,
  moon: m.space_real_moon,
  mars: m.space_real_mars,
  asteroid_belt: m.space_real_asteroid_belt,
  jupiter: m.space_real_jupiter,
  saturn: m.space_real_saturn,
  uranus: m.space_real_uranus,
  neptune: m.space_real_neptune,
};

const KIND: Record<SystemBodyKind, () => string> = {
  planet: m.space_kind_planet,
  gas_giant: m.space_kind_gas_giant,
  asteroid_belt: m.space_kind_belt,
  structure: m.space_kind_structure,
  empty: m.space_kind_empty,
};

/** 그림 이름표: 이름 줄(별칭, 없으면 실명)과 아래 줄(별칭이 있으면 실명) */
export function bodyNameParts(id: HomeBodyId | HomeMoonId): { name: string; real: string | null } {
  const alias = ALIAS[id];
  return alias ? { name: alias(), real: REAL[id]() } : { name: REAL[id](), real: null };
}

/** 화면 이름 "별칭(실명)"(D-366). 별칭이 없으면 실명 */
export function bodyFullName(id: HomeBodyId | HomeMoonId): string {
  const { name, real } = bodyNameParts(id);
  return real ? m.space_body_full({ alias: name, real }) : name;
}

export function bodyKindName(kind: SystemBodyKind): string {
  return KIND[kind]();
}

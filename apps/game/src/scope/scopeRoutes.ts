// 개발·운영 화면마다 "어디에 반영되는가"(범위) 표 — docs/adr/2026-11-11-planet-scope.md 2절(코드를 읽어 확인한 분류).
// 범위 줄(ScopeBar.tsx)이 이 표로 고정 표지(모든 행성 공통 등)나 행성 고르기를 그린다.
// 새 개발 화면을 만들면 여기에 한 줄 더한다. 줄이 없는 /dev/… 화면은 "모든 행성 공통"으로 보인다(대부분의 편집기가 팩 덮어쓰기다).
import type { RouteId } from "@terra/shared";
import { m } from "../paraglide/messages.js";

/**
 * 범위 종류
 * - common: 규칙·수치(콘텐츠 팩 덮어쓰기·설정 칸) — 이 세계의 모든 행성에 같다
 * - planet: 행성 하나에 묶인 자료 — 행성을 고른다
 * - library: 행성 보관함(초안) — 세계 행성에 반영되지 않는다
 * - system: 항성계 초안 — 세계에 반영되지 않는다
 * - none: 행성과 상관없다(계정·기기·시범)
 */
export type ScopeKind = "common" | "planet" | "library" | "system" | "none";

/**
 * 행성을 고르는 화면의 묶음(고를 수 있는 행성과 기억이 다르다)
 * - edit: 플레이 행성만(세계 자료를 바꾸거나 본다)
 * - lab: 플레이 행성 + 편집 전용 행성(보기 전용 시험)
 * - monitor: "전체" + 플레이 행성(모니터링)
 */
export type PlanetGroup = "edit" | "lab" | "monitor";

export interface RouteScope {
  readonly kind: ScopeKind;
  /** kind가 planet일 때만 */
  readonly group?: PlanetGroup;
  /** 한 줄 풀이: 바꾼 것이 어디에 반영되는가 */
  readonly note: () => string;
}

const common = (note: () => string = m.scope_note_common): RouteScope => ({ kind: "common", note });
const planet = (group: PlanetGroup, note: () => string): RouteScope => ({ kind: "planet", group, note });

const ROUTE_SCOPES: { readonly [Id in RouteId]?: RouteScope } = {
  // (가) 모든 행성 공통: 콘텐츠 팩 덮어쓰기(content_overrides)·설정 칸(tuning_overrides)·계산식 — 표에 행성 칸이 없다
  dev_tuning: common(m.scope_note_tuning),
  dev_balance: common(m.scope_note_balance),
  dev_secondary_stats: common(m.scope_note_balance),
  dev_skills: common(),
  dev_items: common(),
  dev_effects: common(),
  dev_buildings: common(),
  dev_production: common(),
  dev_gather_tiers: common(),
  dev_creatures: common(),
  // 국가 프리셋은 팩 항목이다. [이 세계에 반영]은 세력 정체성·화폐 표시(세계에 하나)를 바꾼다 — 도시·유닛(행성 몫)은 건드리지 않는다
  dev_nations: common(m.scope_note_nations),
  // (나) 행성 하나: 세계 표의 planet_id로 묶인 자료
  dev_world_layout: planet("edit", m.scope_note_world_layout),
  dev_territory: planet("edit", m.scope_note_territory),
  dev_recruit: planet("edit", m.scope_note_recruit),
  dev_terrain_objects: common(),
  dev_second_map: planet("lab", m.scope_note_second_map),
  ops: planet("monitor", m.scope_note_ops),
  // 행성 보관함·항성계 초안: 세계에 반영되지 않는다
  dev_planet_editor: { kind: "library", note: m.scope_note_planet_editor },
  dev_star_system: { kind: "system", note: m.scope_note_star_system },
  // 행성과 상관없음
  dev_gpu_bench: { kind: "none", note: m.scope_note_device },
  dev_ops_grants: { kind: "none", note: m.scope_note_accounts },
  admin: { kind: "none", note: m.scope_note_accounts },
};

/** 그 화면의 범위. 범위 줄을 그리지 않는 화면(개발자 홈·게임 화면)은 null */
export function routeScope(id: RouteId): RouteScope | null {
  const found = ROUTE_SCOPES[id];
  if (found) return found;
  // 표에 없는 새 개발 도구: 팩 덮어쓰기 편집기로 본다
  return id.startsWith("dev_") ? common() : null;
}

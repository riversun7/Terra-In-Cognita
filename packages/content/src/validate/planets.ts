// 2단계 뒤 행성 검사 — 행성(planets)·행성 표본(planet_templates)의 바이옴 표가 생성기가 받는 표인지 (ADR 2026-10-29-s2-planet-lod "행성 정의")
// 생성기는 칸마다 바다(수심 등급별)·호수·육지 규칙 가운데서 바이옴을 고르므로, 참조한 바이옴 중에 세 종류가
// 하나씩은 있어야 한다(없으면 굽기가 RangeError로 실패한다). 참조가 풀려야 볼 수 있어 2단계(참조 무결성) 뒤에 돈다.
// 없는 바이옴을 가리키는 행성은 2단계가 이미 알리므로 건너뛴다.
import { BIOME_RULE_KINDS, type BiomeRuleKind } from "@terra/shared";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { ContentRef } from "../schema/common.ts";

const KIND_NAMES: Readonly<Record<BiomeRuleKind, string>> = { ocean: "바다", lake: "호수", land: "육지" };

/** 바이옴 항목의 규칙 종류(스키마를 통과한 항목이라 rule.kind가 있다) */
function ruleKindOf(entry: { id: string }): unknown {
  const rule: unknown = "rule" in entry ? entry.rule : undefined;
  return typeof rule === "object" && rule !== null && "kind" in rule ? rule.kind : undefined;
}

/** 행성 항목의 바이옴 참조(스키마가 ContentRef로 바꿔 둔다) */
function biomeRefsOf(entry: { id: string }): ContentRef[] {
  const list: unknown = "biomes" in entry ? entry.biomes : undefined;
  if (!Array.isArray(list)) return [];
  const items: readonly unknown[] = list;
  return items.filter((item) => item instanceof ContentRef);
}

/** 바이옴 표를 가진 분류: 행성과 행성 표본(편집기 시작점, 생성기가 같은 표를 받는다) */
const PLANET_CATEGORIES = ["planets", "planet_templates"] as const;

export function checkPlanetBiomeTables(pack: ContentPack): ContentIssue[] {
  const kindById = new Map<string, unknown>();
  for (const biome of pack.entries.get("biomes") ?? []) kindById.set(biome.id, ruleKindOf(biome));
  const issues: ContentIssue[] = [];
  for (const category of PLANET_CATEGORIES) issues.push(...checkCategory(pack, category, kindById));
  return issues;
}

function checkCategory(
  pack: ContentPack,
  category: (typeof PLANET_CATEGORIES)[number],
  kindById: ReadonlyMap<string, unknown>,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const planet of pack.entries.get(category) ?? []) {
    const refs = biomeRefsOf(planet);
    if (refs.some((ref) => !kindById.has(ref.id))) continue;
    const present = new Set(refs.map((ref) => kindById.get(ref.id)));
    const missing = BIOME_RULE_KINDS.filter((kind) => !present.has(kind));
    if (missing.length === 0) continue;
    const names = missing.map((kind) => KIND_NAMES[kind]).join("·");
    const quoted = missing.map((kind) => `"${kind}"`).join("·");
    issues.push({
      stage: "references",
      level: "error",
      file: `${category}.json`,
      id: planet.id,
      path: "biomes",
      message: `행성 바이옴 표에 ${names} 규칙이 없습니다. 생성기는 칸마다 바다·호수·육지 규칙 가운데서 바이옴을 고르므로 세 종류가 하나씩은 있어야 합니다. 규칙 종류(rule.kind)가 ${quoted}인 바이옴을 biomes에 넣으세요.`,
    });
  }
  return issues;
}

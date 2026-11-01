// 스킬 편집기 화면 모델 — 거르기, 새 스킬 틀, 복제 ID, 모양을 바꿀 때 맞춰 주는 칸, 보낼 항목 다듬기, 오류 코드.
// 계산이 없는 순수 함수만 둔다(시험: skillModel.test.ts). 칸마다의 규칙은 서버가 팩 스키마로 다시 본다(docs/adr/2026-11-01-skill-editor.md 5절).
// 숫자 읽기·복제 ID·같은 내용·오류 코드는 아이템 편집기와 같이 쓰는 contentEditorModel이다(docs/adr/2026-11-01-item-editor.md 3절).
import {
  SKILL_EDITOR_REASONS,
  type SkillEditorReason,
  type SkillEditorSkill,
  type SkillFormulaPartJson,
  type SkillJson,
  type SkillShapeId,
} from "@terra/shared/skillEditor";
import {
  CONTENT_ID_PATTERN,
  type ContentErrorInfo,
  contentErrorOf,
  freeCopyId,
  sameJson,
} from "../content/contentEditorModel.ts";

export { parseInt32 } from "../content/contentEditorModel.ts";

/** 콘텐츠 ID 규칙(AGENTS 4장, 서버 팩 검사와 같다) */
export const SKILL_ID_PATTERN = CONTENT_ID_PATTERN;

export const SKILL_FILTERS = ["all", "edited", "created", "disabled"] as const;
export type SkillFilter = (typeof SKILL_FILTERS)[number];

const lower = (text: string): string => text.toLocaleLowerCase();

/** 찾기(ID·이름 ko/en)와 거르기 */
export function filterSkills(
  skills: readonly SkillEditorSkill[],
  query: { readonly text: string; readonly filter: SkillFilter },
): SkillEditorSkill[] {
  const text = lower(query.text.trim());
  return skills.filter((skill) => {
    if (query.filter === "edited" && skill.origin !== "edited") return false;
    if (query.filter === "created" && skill.origin !== "created") return false;
    if (query.filter === "disabled" && skill.entry.enabled) return false;
    if (text === "") return true;
    const { id, name } = skill.entry;
    return lower(id).includes(text) || lower(name.ko).includes(text) || lower(name.en).includes(text);
  });
}

/** 새 스킬 틀: 물리 기반 적 하나 근접(팩 검사를 통과하는 가장 작은 모양) */
export function newSkillTemplate(id: string): SkillJson {
  return {
    id,
    name: { ko: id, en: id },
    shape: "single",
    trigger: "active",
    resource: "stamina",
    cost: 10,
    castMs: 0,
    cooldownMs: 5000,
    target: "enemy",
    range: 1,
    radius: 0,
    damage: "physical",
    base: "physical",
    formula: [{ part: "attack_mul", pm: 1500 }],
    conditions: [],
    effects: [],
    gradePm: [1000],
    enabled: true,
  };
}

/** 쓸 수 없는 ID(있는 스킬 + 한 번 쓰고 지운 ID)를 피한 복제 ID: <ID>_copy, <ID>_copy2 … (48자 안) */
export const freeSkillId = freeCopyId;

const DAMAGE_SHAPES: readonly SkillShapeId[] = ["single", "projectile", "area", "chain"];

/**
 * 모양을 바꾸면 판정 칸을 그 모양에 맞춘다(팩 검사 checkSkillShape와 같은 규칙): 적 대상·피해·반지름·연쇄·회복 부품.
 * 맞출 것이 없는 칸은 그대로 둔다
 */
export function withShape(draft: SkillJson, shape: SkillShapeId): SkillJson {
  const enemy = DAMAGE_SHAPES.includes(shape) || shape === "debuff";
  const damage = DAMAGE_SHAPES.includes(shape)
    ? draft.damage === "none"
      ? draft.base
      : draft.damage
    : "none";
  const target = enemy ? "enemy" : draft.target === "enemy" ? "self" : draft.target;
  let radius = draft.radius;
  if (shape === "single" || shape === "projectile" || shape === "chain") radius = 0;
  if (shape === "area" && radius < 1) radius = 1;
  const range = shape === "projectile" && draft.range < 2 ? 2 : draft.range;
  let formula: readonly SkillFormulaPartJson[] = draft.formula;
  if (shape === "heal" && !formula.some((part) => part.part === "heal"))
    formula = [...formula, { part: "heal", pm: 250 }];
  if (shape === "buff") formula = formula.filter((part) => part.part !== "heal");
  const next: SkillJson = { ...draft, shape, damage, target, radius, range, formula };
  if (shape === "chain") return { ...next, chain: draft.chain ?? { targets: 3, jump: 3, falloffPm: 700 } };
  const { chain: _chain, ...rest } = next;
  // 지속형은 buff 모양만(팩 검사)
  return shape === "buff" ? rest : { ...rest, trigger: "active" };
}

/** 보낼 항목: 빈 설명·거짓 맨손 스킬 칸은 뺀다(팩 항목과 같은 내용이면 서버가 덮어쓰기를 두지 않게) */
export function cleanSkill(draft: SkillJson): SkillJson {
  const { description, bareHand, weaponField, ...rest } = draft;
  const out: SkillJson = { ...rest };
  const hasDescription = description && (description.ko.trim() !== "" || description.en.trim() !== "");
  return {
    ...out,
    ...(hasDescription ? { description } : {}),
    ...(weaponField === undefined || bareHand === true ? {} : { weaponField }),
    ...(bareHand === true ? { bareHand: true } : {}),
    effects: draft.effects.map(({ durationMs, ...part }) =>
      durationMs === undefined ? part : { ...part, durationMs },
    ),
  };
}

/** 키 차례와 상관없는 같은 내용인가 */
export function sameSkill(a: SkillJson, b: SkillJson): boolean {
  return sameJson(cleanSkill(a), cleanSkill(b));
}

/** 서버 팩 검사 문제 줄(사람이 읽는 줄)·바뀐 항목 키를 단 화면 오류 */
export type SkillErrorInfo = ContentErrorInfo<SkillEditorReason>;
export type SkillErrorKey = SkillErrorInfo["key"];

/** tRPC 오류 → 화면 오류 키 */
export function skillErrorOf(error: unknown): SkillErrorInfo {
  return contentErrorOf(error, SKILL_EDITOR_REASONS);
}

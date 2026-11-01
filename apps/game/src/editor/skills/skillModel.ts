// 스킬 편집기 화면 모델 — 거르기, 새 스킬 틀, 복제 ID, 모양을 바꿀 때 맞춰 주는 칸, 보낼 항목 다듬기, 오류 코드.
// 계산이 없는 순수 함수만 둔다(시험: skillModel.test.ts). 칸마다의 규칙은 서버가 팩 스키마로 다시 본다(docs/adr/2026-11-01-skill-editor.md 5절).
import {
  SKILL_EDITOR_REASONS,
  type SkillEditorReason,
  type SkillEditorSkill,
  type SkillFormulaPartJson,
  type SkillJson,
  type SkillShapeId,
} from "@terra/shared/skillEditor";

/** 콘텐츠 ID 규칙(AGENTS 4장, 서버 팩 검사와 같다) */
export const SKILL_ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

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
export function freeSkillId(base: string, taken: ReadonlySet<string>): string {
  const stem = base.slice(0, 40);
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? `${stem}_copy` : `${stem}_copy${n}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}_x`;
}

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
  return stable(cleanSkill(a)) === stable(cleanSkill(b));
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).toSorted(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : item,
  );
}

export type SkillErrorKey =
  | SkillEditorReason
  | "revision_conflict"
  | "rate_limited"
  | "unauthorized"
  | "forbidden"
  | "unavailable"
  | "network"
  | "unknown";

export interface SkillErrorInfo {
  readonly key: SkillErrorKey;
  /** 서버 팩 검사 문제 줄(사람이 읽는 줄) */
  readonly details: readonly string[];
  readonly sessionEnded: boolean;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const isReason = (value: unknown): value is SkillEditorReason =>
  typeof value === "string" && (SKILL_EDITOR_REASONS as readonly string[]).includes(value);

/** tRPC 오류 → 화면 오류 키 */
export function skillErrorOf(error: unknown): SkillErrorInfo {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  const raw = field(data, "details");
  const details = Array.isArray(raw) ? raw.filter((line): line is string => typeof line === "string") : [];
  if (isReason(reason)) return { key: reason, details, sessionEnded: false };
  if (reason === "revision_conflict" || reason === "rate_limited")
    return { key: reason, details, sessionEnded: false };
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", details, sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", details, sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", details, sessionEnded: false };
    case undefined:
      return { key: "network", details, sessionEnded: false };
    default:
      return { key: "unknown", details, sessionEnded: false };
  }
}

/** 정수 입력: 범위 안 정수면 그 값, 아니면 null */
export function parseInt32(text: string, min: number, max: number): number | null {
  if (!/^-?\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

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

/** 목록 찾기·거르기(2026-11-08 화면 개편): 출처·모양·자원·담은 것만. "all" = 거르지 않음 */
export interface SkillQuery {
  readonly text: string;
  readonly filter: SkillFilter;
  readonly shape?: SkillShapeId | "all" | undefined;
  readonly resource?: SkillJson["resource"] | "all" | undefined;
  /** 담은 변경이 있는 스킬만(ID 모음) */
  readonly staged?: ReadonlySet<string> | null | undefined;
}

const lower = (text: string): string => text.toLocaleLowerCase();

/** 찾기(ID·이름 ko/en, 낱말 여럿이면 모두 맞는 것)와 거르기 */
export function filterSkills(skills: readonly SkillEditorSkill[], query: SkillQuery): SkillEditorSkill[] {
  const words = lower(query.text.trim())
    .split(/\s+/)
    .filter((word) => word !== "");
  return skills.filter((skill) => {
    if (query.filter === "edited" && skill.origin !== "edited") return false;
    if (query.filter === "created" && skill.origin !== "created") return false;
    if (query.filter === "disabled" && skill.entry.enabled) return false;
    if (query.shape && query.shape !== "all" && skill.entry.shape !== query.shape) return false;
    if (query.resource && query.resource !== "all" && skill.entry.resource !== query.resource) return false;
    if (query.staged && !query.staged.has(skill.entry.id)) return false;
    if (words.length === 0) return true;
    const { id, name } = skill.entry;
    const hay = lower(`${id} ${name.ko} ${name.en}`);
    return words.every((word) => hay.includes(word));
  });
}

/**
 * 저장 거절(invalid_entry)의 팩 검사 줄 → 스킬 ID → 칸 경로 → 문구. 줄 모양(@terra/content formatIssue):
 * "✗ [단계] 파일 › ID › 경로: 문구". 경로가 없는 줄은 "" 칸에 둔다. 모르는 모양의 줄은 건너뛴다
 */
export function issueLinesById(lines: readonly string[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const line of lines) {
    const match = /^[✗!] \[[^\]]*\] (.*?): (.*)$/.exec(line);
    if (!match) continue;
    const [, where = "", text = ""] = match;
    const parts = where.split(" › ");
    // 파일 › ID › 경로(경로·파일은 없을 수 있다)
    const file = parts[0]?.includes(".") === true;
    const id = parts[file ? 1 : 0];
    if (id === undefined || !SKILL_ID_PATTERN.test(id)) continue;
    const path = parts.slice(file ? 2 : 1).join(".");
    const fields = out.get(id) ?? new Map<string, string>();
    if (!fields.has(path)) fields.set(path, text);
    out.set(id, fields);
  }
  return out;
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

/** 공격 스킬: 적 대상·피해 있음(판정 @terra/sim skills.ts isAttackSkill과 같은 규칙 — 사거리 예산 기본 켬의 대상, D-573 2009) */
export function isAttackSkill(draft: Pick<SkillJson, "target" | "damage">): boolean {
  return draft.target === "enemy" && draft.damage !== "none";
}

/** 사거리 예산(range_interval)이 켜졌나: 곡선 칸이 없으면 공격 스킬은 켬(D-573), 있으면 목록에 있을 때만 */
export function rangeIntervalOn(draft: SkillJson): boolean {
  return draft.curves === undefined ? isAttackSkill(draft) : draft.curves.includes("range_interval");
}

/**
 * 사거리 예산 켜기·끄기(무기 칸과 같은 방식): 끄면 곡선 목록에서 빼고(칸이 없으면 curves: []), 켜면 목록에 더한다 — 다른 곡선이 없으면
 * 칸을 지워 기본(켬)으로 되돌린다(팩 자료와 같은 모양)
 */
export function withRangeInterval(draft: SkillJson, on: boolean): SkillJson {
  const { curves, ...rest } = draft;
  const others = (curves ?? []).filter((curve) => curve !== "range_interval");
  if (!on) return { ...rest, curves: others };
  return others.length === 0 ? rest : { ...rest, curves: [...others, "range_interval"] };
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

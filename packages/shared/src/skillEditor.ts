// 스킬 편집기·행동별 소모 화면(/dev/skills) 공용 자료 모양 — docs/adr/2026-11-01-skill-editor.md
// 서버(tRPC skills.*, apps/server/src/contentEdit/)와 화면(apps/game/src/editor/skills/)이 같이 쓴다.
// 스킬 항목은 콘텐츠 팩 skills.json 한 줄과 같은 JSON 모양이다(참조는 ID 문자열). 형식 검사는 서버가 팩 스키마로 한다
// (게임 앱은 @terra/content를 가져오지 않는다). 값의 범위 상수는 화면 입력 칸이 쓰고, 맞는지는 서버가 다시 본다.

import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentOverrideView,
  LocalizedName,
} from "./contentEdit.ts";

// 덮어쓰기 층의 공용 모양은 contentEdit.ts(아이템 편집기와 같이 쓴다). 옛 가져오기 길을 지킨다
export {
  CONTENT_DROP_REASONS,
  CONTENT_EDIT_CATEGORIES,
  type ContentDropReason,
  type ContentEditCategory,
  type ContentEditOrigin,
  type ContentOverrideView,
  type EntryDiffChange,
  type LocalizedName,
} from "./contentEdit.ts";

/** 스킬 편집기 묶음이 고칠 수 있는 분류(스킬, 행동별 소모의 무기 아이템·유닛 종류 타고난 무기) */
export const SKILL_EDITOR_CATEGORIES = ["skills", "items", "unit_kinds"] as const;
export type SkillEditorCategory = (typeof SKILL_EDITOR_CATEGORIES)[number];

/** 스킬 모양(@terra/content SKILL_SHAPES와 같다, 서버 시험이 맞춰 본다) */
export const SKILL_SHAPE_IDS = [
  "single",
  "projectile",
  "area",
  "chain",
  "heal",
  "buff",
  "debuff",
  "move",
] as const;
export type SkillShapeId = (typeof SKILL_SHAPE_IDS)[number];
export const SKILL_TRIGGERS = ["active", "passive"] as const;
export const SKILL_RESOURCES = ["stamina", "mp"] as const;
export const SKILL_TARGETS = ["enemy", "self", "ally"] as const;
export const SKILL_DAMAGES = ["physical", "elemental", "none"] as const;
export const SKILL_BASES = ["physical", "elemental"] as const;
/** 필요한 무기 칸(D-490). 화면의 "기반과 같음"은 칸을 적지 않는 것(undefined)이다 */
export const SKILL_WEAPON_FIELDS = ["physical", "elemental", "any"] as const;
export type SkillWeaponFieldId = (typeof SKILL_WEAPON_FIELDS)[number];

/** 공식 부품 종류(@terra/content formulaPart와 같다) */
export const SKILL_FORMULA_PARTS = [
  "attack_mul",
  "weapon_add",
  "element",
  "penetration",
  "flat",
  "heal",
  "shield",
] as const;
export type SkillFormulaPartKind = (typeof SKILL_FORMULA_PARTS)[number];
export const SKILL_CONDITION_PARTS = [
  "appropriate_met",
  "self_hp_below",
  "target_hp_below",
  "target_has",
] as const;
export type SkillConditionPartKind = (typeof SKILL_CONDITION_PARTS)[number];

export type SkillFormulaPartJson =
  | { readonly part: "attack_mul"; readonly pm: number }
  | { readonly part: "weapon_add"; readonly value: number }
  | { readonly part: "element"; readonly element: number; readonly pm: number }
  | { readonly part: "penetration"; readonly pm: number }
  | { readonly part: "flat"; readonly value: number }
  | { readonly part: "heal"; readonly pm: number }
  | { readonly part: "shield"; readonly pm: number };

export type SkillConditionJson =
  | { readonly part: "appropriate_met" }
  | { readonly part: "self_hp_below"; readonly pct: number }
  | { readonly part: "target_hp_below"; readonly pct: number }
  | { readonly part: "target_has"; readonly effect: string };

/** 특수 효과 하나(효과 사전 ID + 확률·지속·세기) */
export interface SkillEffectJson {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  /** 없으면 효과 사전의 기본 지속 */
  readonly durationMs?: number | undefined;
}

/** 팩 skills.json 한 줄(JSON 모양) */
export interface SkillJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly description?: LocalizedName | undefined;
  readonly shape: SkillShapeId;
  readonly trigger: (typeof SKILL_TRIGGERS)[number];
  readonly resource: (typeof SKILL_RESOURCES)[number];
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly target: (typeof SKILL_TARGETS)[number];
  readonly range: number;
  readonly radius: number;
  readonly chain?:
    | { readonly targets: number; readonly jump: number; readonly falloffPm: number }
    | undefined;
  readonly damage: (typeof SKILL_DAMAGES)[number];
  readonly base: (typeof SKILL_BASES)[number];
  readonly weaponField?: SkillWeaponFieldId | undefined;
  readonly bareHand?: boolean | undefined;
  readonly formula: readonly SkillFormulaPartJson[];
  readonly conditions: readonly SkillConditionJson[];
  readonly effects: readonly SkillEffectJson[];
  readonly gradePm: readonly number[];
  /**
   * 움직임 부품·곡선(docs/adr/2026-11-15-combat-moves.md 6절, 팩 선택 칸). 편집기 입력 칸은 사거리 예산 체크만 있고(나머지는 뒤 작업),
   * 항목을 통째로 저장하므로 칸을 잃지 않는다
   */
  readonly move?: SkillMoveJson | undefined;
  readonly displace?: SkillDisplaceJson | undefined;
  /** 곡선 칸이 없으면 공격 스킬은 사거리 예산 켬(D-573 2009), 빈 목록이면 끔 — 편집기 체크 "사거리 예산" */
  readonly curves?: readonly string[] | undefined;
  readonly shots?: number | undefined;
  readonly enabled: boolean;
}

/** 자기 몸 이동 부품(팩 move 칸) */
export type SkillMoveJson =
  | { readonly kind: "dash"; readonly cells: number; readonly hitRange?: number | undefined }
  | { readonly kind: "leap"; readonly cells: number }
  | { readonly kind: "blink"; readonly cells: number; readonly dir: "toward" | "away" }
  | { readonly kind: "backstep"; readonly cells: number }
  | { readonly kind: "stealth"; readonly durationMs: number }
  | { readonly kind: "detect"; readonly cells: number; readonly durationMs: number };

/** 맞은 대상 옮김 부품(팩 displace 칸). effect = 밀림 저항을 읽는 효과 사전 항목(없으면 move_knockback·move_pull·move_root) */
export type SkillDisplaceJson = (
  | { readonly kind: "knockback"; readonly cells: number }
  | { readonly kind: "pull"; readonly cells: number }
  | { readonly kind: "root"; readonly durationMs: number }
) & { readonly effect?: string | undefined };

/** 입력 칸 범위(팩 스키마와 같다. 서버가 다시 본다) */
export const SKILL_LIMITS = {
  cost: { min: 0, max: 100_000 },
  castMs: { min: 0, max: 60_000 },
  cooldownMs: { min: 0, max: 3_600_000 },
  range: { min: 0, max: 128 },
  radius: { min: 0, max: 128 },
  chainTargets: { min: 2, max: 16 },
  chainJump: { min: 1, max: 32 },
  falloffPm: { min: 0, max: 1000 },
  chancePm: { min: 0, max: 1000 },
  effectDurationMs: { min: 0, max: 3_600_000 },
  effectValue: { min: -1_000_000, max: 1_000_000 },
  gradePm: { min: 0, max: 100_000 },
  formula: 16,
  conditions: 8,
  effects: 8,
  grades: 10,
  nameMax: 200,
} as const;

/** 무기 한 번 공격의 소모(행동별 소모 화면) */
export const ACTION_COST_MAX = 100_000;

export interface SkillEditorSkill {
  /** 실효 항목(팩 + 덮어쓰기) */
  readonly entry: SkillJson;
  readonly origin: ContentEditOrigin;
  /** 팩 항목(편집기에서 만든 스킬은 null) */
  readonly pack: SkillJson | null;
  readonly override: ContentOverrideView | null;
  /** 이 스킬을 주는 장비(아이템 ID) */
  readonly grantedBy: readonly string[];
  /**
   * 실효 항목 해시(정규 JSON SHA-256). 저장 묶음의 baseHash로 되돌려 보내면 다른 항목만 바뀐 판 충돌을 받는다(같은 항목을 누가 먼저
   * 고쳤으면 entry_changed). 옛 서버면 없다
   */
  readonly hash?: string | undefined;
}

/** 효과 사전 한 줄(편집기의 특수 효과 고르기) */
export interface SkillEditorEffect {
  readonly id: string;
  readonly name: LocalizedName;
  readonly kind: "buff" | "debuff" | "dot" | "heal" | "status";
  readonly stat: string | null;
  readonly valueMode: "flat" | "permille";
  readonly durationMs: number;
  readonly status: string | null;
  readonly enabled: boolean;
}

/**
 * 행동별 소모 표 한 줄(D-491). kind:
 * - weapon: 무기 아이템의 기본 공격(무기 칸 staminaCost·mpCost, MP는 기본 공격 칸이 속성일 때만 든다)
 * - natural: 유닛 종류의 타고난 무기(맨손) 기본 공격
 * - skill: 스킬(자원·소모)
 * - fixed: 값이 없는 행동 — free(걷기·퇴각 이동, D-418), same_as_basic(건물 공격 = 기본 공격 값), unimplemented(미구현)
 */
export type ActionCostRow =
  | {
      readonly kind: "weapon" | "natural";
      readonly key: string;
      readonly id: string;
      readonly name: LocalizedName;
      readonly staminaCost: number;
      readonly mpCost: number;
      /** 기본 공격 칸(속성이면 MP도 든다) */
      readonly basic: "physical" | "elemental";
      readonly origin: ContentEditOrigin;
      readonly enabled: boolean;
    }
  | {
      readonly kind: "skill";
      readonly key: string;
      readonly id: string;
      readonly name: LocalizedName;
      readonly resource: "stamina" | "mp";
      readonly cost: number;
      readonly trigger: "active" | "passive";
      readonly origin: ContentEditOrigin;
      readonly enabled: boolean;
    }
  | {
      readonly kind: "fixed";
      readonly key: "walk" | "retreat" | "building_attack" | "evasive_move";
      readonly status: "free" | "same_as_basic" | "unimplemented";
    };

/**
 * 행동별 소모 화면의 스태미나 기준 한 레벨(D-511): 보통 유닛(1차 처음 모두 10, K 1, 성장률 = 설정 칸 N5)이 그 레벨에서 갖는 값.
 * 서버가 판정 함수로 셈한다(apps/server/src/contentEdit/staminaBasis.ts)
 */
export interface StaminaBasisLevel {
  readonly level: number;
  /** 1차(여섯 모두 같은 값) */
  readonly primary: number;
  /** 적정 STA 점수(밀리점, 계산식 stamina_appropriate) */
  readonly appropriateMilli: number;
  /** STA 점수(계산식 stamina_score) */
  readonly score: number;
  /** 최대 스태미나(2차 스탯 stamina) */
  readonly max: number;
  /** 실제 회복(분당, 계산식 real_stamina_regen) */
  readonly regenPerMinute: number;
}

/** 무기·타고난 무기 줄 하나의 보통 유닛 기본 공격(한 레벨) */
export interface StaminaBasisAttack {
  /** 한 번 소모(밀리점, 계산식 stamina_cost) */
  readonly costMilli: number;
  /** 공격 간격(ms, 계산식 attack_interval) */
  readonly intervalMs: number;
}

export interface StaminaBasisView {
  readonly levels: readonly StaminaBasisLevel[];
  /** 줄 키(ActionCostRow key, 무기·타고난 무기 줄만) → 레벨마다(levels와 같은 차례) */
  readonly attacks: Readonly<Record<string, readonly StaminaBasisAttack[]>>;
}

export interface SkillEditorListResponse {
  readonly contentVersion: string;
  /** 스킬·장비 덮어쓰기 판(skills.save의 expectedRevision) */
  readonly revision: number;
  readonly skills: readonly SkillEditorSkill[];
  readonly effects: readonly SkillEditorEffect[];
  readonly actions: readonly ActionCostRow[];
  /** 한 번 쓰고 지운 스킬 ID(팩 id-changes). 새 스킬 ID로 다시 쓰지 못한다 */
  readonly retiredSkillIds: readonly string[];
  /** 보통 유닛 스태미나 기준(D-511). 설정 칸 접근자가 없는 서버(시험)면 null. 옛 서버는 칸이 없다 */
  readonly stamina?: StaminaBasisView | null | undefined;
}

/**
 * 묶음의 바꿈 하나. baseHash(선택) = 그 항목을 고치기 시작할 때의 실효 항목 해시(새 항목이면 null). 묶음의 모든 바꿈에 baseHash가
 * 있으면 서버는 판이 달라도(다른 항목만 바뀜) 받고, 그 항목이 그새 바뀌었으면 entry_changed로 거절한다(아이템 편집기 설계안 3.10)
 */
export type SkillEditorChange =
  /** 스킬 항목 통째로(만들기·복제·고치기·끄기) */
  | { readonly op: "put_skill"; readonly entry: SkillJson; readonly baseHash?: string | null | undefined }
  /** 덮어쓰기를 지운다(팩 값으로. 편집기에서 만든 스킬은 지워진다) */
  | {
      readonly op: "revert";
      readonly category: SkillEditorCategory;
      readonly id: string;
      readonly baseHash?: string | null | undefined;
    }
  /** 무기·타고난 무기의 기본 공격 소모(행동별 소모 화면) */
  | {
      readonly op: "set_cost";
      readonly category: "items" | "unit_kinds";
      readonly id: string;
      readonly staminaCost: number;
      readonly mpCost: number;
    };

/** 한 묶음의 바꿈 수 상한 */
export const SKILL_EDITOR_CHANGES_MAX = 100;

/** 받지 않은 까닭(data.reason). entry_changed = baseHash를 보낸 항목을 그새 다른 사람이 바꿈(data.details = `<분류>/<ID>`) */
export const SKILL_EDITOR_REASONS = [
  "invalid_entry",
  "unknown_entry",
  "retired_id",
  "duplicate_entry",
  "invalid_note",
  "entry_changed",
] as const;
export type SkillEditorReason = (typeof SKILL_EDITOR_REASONS)[number];

/** 최근 바꿈 한 줄(감사 기록) */
export type SkillEditorHistoryRow = ContentHistoryRow;

export const SKILL_EDITOR_HISTORY_LIMIT = 30;

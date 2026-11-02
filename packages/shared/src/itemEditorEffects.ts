// 효과 사전 편집(아이템 편집기 [효과 사전] 탭, WP-6) 공용 모양 — 팩 effects.json 한 줄과 같은 JSON(D-425 효과 사전 + D-472 배타 묶음).
// docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02)". itemEditor.ts가 다시 내보낸다. 범위 상수는 서버 시험이 팩 스키마와 같은지 본다.
import type { LocalizedName } from "./contentEdit.ts";

export const EFFECT_KIND_IDS = ["buff", "debuff", "dot", "heal", "status"] as const;
export type EffectKindId = (typeof EFFECT_KIND_IDS)[number];

/** 버프·디버프가 바꾸는 전투 수치(판정 코드가 읽는 것, @terra/content EFFECT_COMBAT_STATS와 같다) */
export const EFFECT_COMBAT_STAT_IDS = [
  "attack",
  "defense_rate",
  "evade",
  "penetration",
  "crit_multiplier",
  "move_speed",
  "shield_regen",
] as const;
/** 1차 스탯 버프(요리 버프 D-472): 전투 판정은 아직 읽지 않는다(소비 실행 줄기) */
export const EFFECT_PRIMARY_STAT_IDS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export const EFFECT_STAT_IDS = [...EFFECT_COMBAT_STAT_IDS, ...EFFECT_PRIMARY_STAT_IDS] as const;
export type EffectStatId = (typeof EFFECT_STAT_IDS)[number];

export const EFFECT_STATUS_IDS = ["stun", "root", "silence"] as const;
export type EffectStatusId = (typeof EFFECT_STATUS_IDS)[number];

/** 효과 칸 범위(팩 스키마와 같다) */
export const EFFECT_LIMITS = {
  durationMs: { min: 0, max: 3_600_000 },
  tickMs: { min: 0, max: 3_600_000 },
  maxStacks: { min: 1, max: 100 },
  resistCap: { min: 0, max: 1000 },
  halfConstant: { min: 1, max: 10_000_000 },
  weight: { min: -100_000, max: 100_000 },
} as const;

/** 팩 effects.json 한 줄 */
export interface EffectJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly description?: LocalizedName | undefined;
  readonly kind: EffectKindId;
  /** 버프·디버프만 */
  readonly stat?: EffectStatId | undefined;
  readonly valueMode: "flat" | "permille";
  /** 기본 지속(ms, 0 = 전투 내내) */
  readonly durationMs: number;
  /** dot·heal 주기(ms, heal에서 0이면 한 번) */
  readonly tickMs: number;
  readonly stacking: "refresh" | "stack" | "ignore";
  readonly maxStacks: number;
  /** 상태이상만 */
  readonly status?: EffectStatusId | undefined;
  /** 상태이상 저항(D-429): 상한‰·반감 상수·1차 6개 가중치‰ */
  readonly resist?:
    | { readonly cap: number; readonly halfConstant: number; readonly weights: readonly number[] }
    | undefined;
  /** 유료 효과 상한 코드(D-7005) */
  readonly capCode?: string | undefined;
  /** 배타 묶음(D-472: 같은 묶음은 한 출처만, 센 것이 이김 — 실행은 소비 줄기, 비교 규칙 질문 293) */
  readonly exclusive?: string | undefined;
  readonly enabled: boolean;
}

/** 효과 하나를 쓰는 곳(D-425 도감: 그 효과를 쓰는 아이템·스킬) */
export interface EffectUsage {
  /** 사용 효과 줄에 이 효과가 있는 아이템 */
  readonly items: readonly string[];
  /** 효과 줄 또는 조건(대상이 이 효과를 가짐)에 이 효과가 있는 스킬 */
  readonly skills: readonly string[];
}

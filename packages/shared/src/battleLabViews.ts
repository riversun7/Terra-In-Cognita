// 전투 실험실 목록·미리 보기 응답 모양 — battleLab.ts가 다시 내보낸다(파일 크기를 나눔). 가져오는 쪽은 @terra/shared/battleLab.
import type { LabCustomWeapon, LabDropped, LabPrimaries, LabWeaponField } from "./battleLab.ts";
import type { LocalizedName, PrimaryStat } from "./roster.ts";

/** 무기 목록 한 줄(팩 무기 아이템) */
export interface LabWeaponView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly physical: LabWeaponField | null;
  readonly elemental: LabWeaponField | null;
  readonly basic: "physical" | "elemental";
  readonly range: number;
  readonly intervalMs: number;
}

export interface LabUnitKindView {
  readonly id: string;
  readonly name: LocalizedName;
  /** 장비 칸 종류(차례 = 칸 번호) */
  readonly slots: readonly string[];
  readonly skillSlots: { readonly base: number; readonly perRebirth: number; readonly max: number };
  /** 레벨·K 성장(안드로이드는 없음 D-416) */
  readonly growth: boolean;
  /** 타고난 무기(직접 값 편집의 출발값) */
  readonly natural: LabCustomWeapon;
}

export interface LabEquipmentView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly slot: string;
  readonly stats: readonly { readonly stat: string; readonly min: number; readonly max: number }[];
  readonly skills: readonly string[];
  readonly weapon: boolean;
}

export interface LabSkillView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly base: "physical" | "elemental";
  readonly damage: "physical" | "elemental" | "none";
  readonly target: "enemy" | "self" | "ally";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly range: number;
  readonly radius: number;
}

export interface LabStatRowView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly shape: "quantity" | "probability";
  /** 장비 직접 값으로 더할 수 있나(공격력 두 행은 못 함 D-438) */
  readonly gear: boolean;
}

/** 전투장 지형 */
export interface LabTerrainView {
  readonly id: string;
  /** flat = 빈 평지, test = S1 시험 2차맵, preset = 시험 자리 종류(river·coast·lake·mountain·forest) */
  readonly kind: "flat" | "test" | "preset";
  readonly preset: string | null;
}

export interface LabCatalogResponse {
  readonly contentVersion: string;
  /** 세계 설정 판(실효 값이 바뀌면 오른다) */
  readonly revision: number;
  readonly unitKinds: readonly LabUnitKindView[];
  readonly weapons: readonly LabWeaponView[];
  readonly equipment: readonly LabEquipmentView[];
  readonly skills: readonly LabSkillView[];
  readonly statRows: readonly LabStatRowView[];
  /** 성장 실효 값: 성장률(N5)·K 생성 범위(N6)·만렙(N7) */
  readonly growth: {
    readonly growthPm: number;
    readonly kMinPm: number;
    readonly kMaxPm: number;
    readonly maxLevel: number;
  };
  readonly terrains: readonly LabTerrainView[];
  /** 3D 관람을 쓸 수 있나(재생 기록기가 들어온 서버) */
  readonly replay: boolean;
}

/** 2차 스탯 풀이 한 줄(화면 차례 1차 키) */
export interface LabSecondaryView {
  readonly id: string;
  readonly shape: "quantity" | "probability";
  readonly value: number;
  readonly base: number;
  readonly terms: readonly {
    readonly stat: PrimaryStat;
    readonly value: number;
    readonly weightPm: number;
  }[];
  readonly weighted: number;
  /** 장비(직접 값 + 팩 장비) 더하기 */
  readonly extra: number;
  readonly score: number;
  readonly cap: number | null;
  readonly halfConstant: number | null;
}

/**
 * 공격 사양 하나(D-502): 실제 = 스탯 공격력 + 무기 공격력 × min(N10, 1차 ÷ 적정 1차). source = 든 무기 또는 타고난 무기(맨손·맨손 속성,
 * 무기 몫 0)
 */
export interface LabAttackView {
  readonly source: "weapon" | "natural";
  /** 스탯 공격력(2차 물리·속성 공격력 = (STR + VIT) ÷ 2·(INT + WIS) ÷ 2) */
  readonly statAttack: number;
  readonly weaponAttack: number;
  /** 무기 적정을 보는 1차(물리 STR·속성 INT)와 그 적정(밀리점, 0 = 없음 → 100%), 무기 공격력에 곱하는 비율(‰) */
  readonly primary: number;
  readonly appropriateMilli: number;
  readonly ratioPm: number;
  readonly realAttack: number;
}

/** 1차 스탯(DEX·AGI)·무기 적정(밀리점, 0 = 없음 → 100%, 맨손은 레벨 식)·비율(‰ = min(N10, 1차 ÷ 적정)) */
export interface LabAppropriateView {
  readonly stat: number;
  readonly appropriateMilli: number;
  readonly ratioPm: number;
}

/** 전투 사양 요약(판정에 들어가는 값) */
export interface LabCombatView {
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly basic: "physical" | "elemental";
  /** 기본 공격의 무기 공격력·실제 공격력(D-502 스탯 공격력 + 무기 몫) */
  readonly weaponAttack: number;
  readonly realAttack: number;
  /** 기본 공격(든 무기 또는 맨손)과 스킬 기반별 공격(D-465: 든 무기에 그 칸이 없으면 맨손·맨손 속성) */
  readonly attacks: {
    readonly basic: LabAttackView;
    readonly physical: LabAttackView;
    readonly elemental: LabAttackView;
  };
  /** 명중·크리(DEX)·공격 간격(AGI)의 1차 값, 기본 공격 무기의 적정 1차, 무기 값에 곱하는 비율(‰ = min(N10 상한, 1차 ÷ 적정)) */
  readonly appropriate: {
    readonly hit: LabAppropriateView;
    readonly crit: LabAppropriateView;
    readonly speed: LabAppropriateView;
  };
  readonly hitPm: number;
  readonly critPm: number;
  readonly critMulPm: number;
  readonly attackIntervalMs: number;
  readonly range: number;
  readonly staminaMax: number;
  /** 기본 공격 한 번의 스태미나(STA 점수 배율 N13, 밀리점) */
  readonly staminaPerAttackMilli: number;
  readonly staminaRegen: number;
  readonly mpMax: number;
  readonly mpRegen: number;
  readonly shieldRegen: number;
  readonly defenseRatePm: number;
  readonly elementalDefenseRatePm: number;
  readonly evadePm: number;
  readonly sight: number;
}

export interface LabPreviewResponse {
  readonly revision: number;
  /** 1차: 처음·레벨 성장 뒤·장비 보너스·합 */
  readonly primaries: Readonly<
    Record<
      PrimaryStat,
      { readonly initial: number; readonly grown: number; readonly bonus: number; readonly total: number }
    >
  >;
  readonly secondary: readonly LabSecondaryView[];
  readonly combat: LabCombatView;
  /** 쓰는 스킬(칸 수 안, 고유 먼저 + 장비 스킬)과 칸 수 */
  readonly skills: { readonly slots: number; readonly used: readonly string[] };
  readonly dropped: readonly LabDropped[];
  /** 레벨 표: 레벨마다 1차 합과 2차 스탯(행 ID 차례 = secondary 차례) */
  readonly levels: readonly {
    readonly level: number;
    readonly primaries: LabPrimaries;
    readonly secondary: readonly number[];
  }[];
}

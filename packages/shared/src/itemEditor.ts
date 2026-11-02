// 아이템 편집기(/dev/items) 공용 자료 모양 — docs/adr/2026-11-01-item-editor.md, 설계안 docs/research/2026-11-01-item-editor-design.md 3장.
// 서버(tRPC items.*, apps/server/src/itemEdit/)와 화면(apps/game/src/editor/items/)이 같이 쓴다. 항목은 콘텐츠 팩 items.json 한 줄과
// 같은 JSON 모양이다(참조는 ID 문자열). 형식 검사는 서버가 팩 스키마로 한다(게임 앱은 @terra/content를 가져오지 않는다). 범위 상수는
// 화면 입력 칸이 쓰고 서버가 다시 본다(서버 시험이 팩 스키마와 같은지 본다).
import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentIssueView,
  ContentOverrideView,
  ContentSleepingRow,
  LocalizedName,
} from "./contentEdit.ts";
import type { MarketKind } from "./economy.ts";
import type { ItemPatch } from "./itemEditorBulk.ts";
import type { EffectJson, EffectUsage } from "./itemEditorEffects.ts";
import type { ElementCode, EquipSlot } from "./roster.ts";

/** 아이템 대분류(@terra/content ITEM_CATEGORIES와 같다, 서버 시험이 맞춰 본다) */
export const ITEM_CATEGORY_IDS = [
  "raw",
  "processed",
  "part",
  "equipment",
  "consumable",
  "gem",
  "construction",
  "document",
  "precious",
] as const;
export type ItemCategoryId = (typeof ITEM_CATEGORY_IDS)[number];

/** 아이템 편집기 묶음이 고칠 수 있는 분류: 아이템 + 분류 자료 + 효과 사전(WP-6) */
export const ITEM_EDIT_CATEGORIES = [
  "items",
  "item_subcategories",
  "item_tags",
  "weapon_types",
  "effects",
] as const;
export type ItemEditCategory = (typeof ITEM_EDIT_CATEGORIES)[number];

export const STORAGE_KIND_IDS = ["food", "armory", "general", "tank"] as const;
export type StorageKindId = (typeof STORAGE_KIND_IDS)[number];
export const FOOD_FAMILY_IDS = ["crop", "livestock", "fishing"] as const;
export type FoodFamilyId = (typeof FOOD_FAMILY_IDS)[number];
export const WEAPON_TYPE_SLOT_IDS = ["weapon", "offhand"] as const;
export type WeaponTypeSlotId = (typeof WEAPON_TYPE_SLOT_IDS)[number];
/** 1차 스탯 코드(팩·판정 차례: STR·DEX·AGI·VIT·INT·WIS) */
export const ITEM_PRIMARY_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type ItemPrimaryCode = (typeof ITEM_PRIMARY_CODES)[number];
/** 1차 스탯을 올리는 칸(D-423, 팩 PRIMARY_STAT_SLOTS). 나머지 칸은 2차 수치 */
export const ITEM_PRIMARY_SLOTS: readonly EquipSlot[] = ["accessory", "organ", "part", "saddle"];
/** 장비가 올리지 않는 2차 행(D-438 1) */
export const ITEM_FORBIDDEN_ROWS: readonly string[] = ["physical_attack", "elemental_attack"];
/** 신선도를 둘 수 있는 대분류 */
export const ITEM_PERISH_CATEGORIES: readonly ItemCategoryId[] = ["raw", "processed", "consumable"];

/** 거래 방식(규칙은 @terra/shared/economy marketKindOf 하나) */
export { type MarketKind, marketKindOf } from "./economy.ts";

/** 대분류 기본 보관 창고(중분류에 storage가 없을 때): 장비 무기고, 식품 식량 창고, 나머지 일반(D-121, 기술 기본값) */
export function defaultStorageOf(category: string, food: boolean): StorageKindId {
  if (category === "equipment") return "armory";
  return food ? "food" : "general";
}

/**
 * 칸마다 지금 읽는 곳(설계안 3.4 "쓰는 곳 칩"): combat = 전투 자료, economy = 경제(시세·생산·거래 방식), screen = 화면·거르기,
 * none = 아직 읽는 곳이 없음(규칙 줄기가 붙으면 바꾼다). WP-5(2026-11-02)로 속성값·전투 직접 값·입을 수 있는 종류·1차 적정 스탯·양손이
 * 전투에 이어졌다. 내구도·크리쳐 보유·탄약 연결·신선도·사용 효과는 보유 물건(인스턴스)이 생겨야 읽힌다(소비·내구도·조우 줄기)
 */
export const ITEM_FIELD_USES: Readonly<Record<string, "combat" | "economy" | "screen" | "none">> = {
  tier: "economy",
  baseValue: "economy",
  tradable: "economy",
  bound: "economy",
  enabled: "economy",
  subcategory: "screen",
  tags: "screen",
  weight: "none",
  stackMax: "none",
  icon: "none",
  perish: "none",
  use: "none",
  "equip.slot": "combat",
  "equip.stats": "combat",
  "equip.weapon": "combat",
  "equip.skills": "combat",
  "equip.weaponType": "screen",
  "equip.elements": "combat",
  "equip.maxDurability": "none",
  "equip.combat": "combat",
  "equip.kinds": "combat",
  "equip.creature": "none",
  "equip.weapon.appropriate": "combat",
  "equip.weapon.twoHanded": "combat",
  "equip.weapon.ammo": "none",
};

/** 입력 칸 범위(팩 스키마와 같다. 서버가 다시 본다) + 편집기 상한(묶음·글 크기·만든 항목 수, 서버도 본다) */
export const ITEM_LIMITS = {
  tier: { min: 0, max: 9 },
  baseValue: { min: 1, max: Number.MAX_SAFE_INTEGER },
  weight: { min: 0, max: 100_000_000 },
  stackMax: { min: 1, max: 1_000_000 },
  shelfLifeMs: { min: 3_600_000, max: 31_536_000_000 },
  tags: 16,
  effectsMax: 8,
  order: { min: 0, max: 10_000 },
  statValue: { min: -10_000_000, max: 10_000_000 },
  stats: 16,
  skills: 4,
  kinds: 8,
  elementValue: { min: 1, max: 10 },
  maxDurability: { min: 1, max: 1_000_000 },
  resistPm: { min: -1000, max: 1000 },
  defenseFlat: { min: 0, max: 10_000_000 },
  penetrationPm: { min: 0, max: 1000 },
  creatureWeight: { min: 0, max: 1_000_000 },
  stealPm: { min: 0, max: 1000 },
  appropriatePrimary: { min: 0, max: 10_000_000 },
  weaponAttack: { min: 0, max: 1_000_000 },
  weaponAppropriate: { min: 0, max: 10_000_000 },
  speedAppropriate: { min: 1, max: 10_000_000 },
  pm: { min: 0, max: 1000 },
  intervalMs: { min: 100, max: 60_000 },
  range: { min: 1, max: 128 },
  cost: { min: 0, max: 100_000 },
  elementPm: { min: -100_000, max: 100_000 },
  effectValue: { min: -1_000_000, max: 1_000_000 },
  effectDurationMs: { min: 0, max: 3_600_000 },
  chancePm: { min: 0, max: 1000 },
  /** 사용 효과 적정 스탯(D-496 286, D-501) */
  useAppropriate: { min: 1, max: 10_000_000 },
  /** 사용 효과 ±오차(‰, D-501: 25~50%) */
  variancePm: { min: 250, max: 500 },
  /** 이름·설명 글 길이(화면 입력 상한) */
  nameMax: 200,
  /** 한 묶음의 바꿈 수 */
  changesMax: 300,
  /** 항목 하나의 JSON 바이트(UTF-8) */
  entryBytesMax: 4096,
  /** 세계에서 만든 항목 수(분류마다). 대량 콘텐츠는 팩 파일로 넣는다 */
  createdMax: 500,
} as const;

/** 무기 공격력 칸 */
export interface ItemWeaponFieldJson {
  readonly attack: number;
  readonly attackAppropriate: number;
}

/** 팩 equip.weapon(무기 칸만) */
export interface ItemWeaponJson {
  readonly physical?: ItemWeaponFieldJson | undefined;
  readonly elemental?: ItemWeaponFieldJson | undefined;
  readonly basic?: "physical" | "elemental" | undefined;
  readonly hitPm: number;
  readonly hitAppropriate: number;
  readonly critPm: number;
  readonly critAppropriate: number;
  readonly intervalMs: number;
  readonly speedAppropriate: number;
  readonly range: number;
  readonly arc: boolean;
  readonly staminaCost: number;
  readonly mpCost: number;
  readonly skillElementsPm?: readonly number[] | undefined;
  /** 1차 적정 스탯(D-496, 착용 제한 아님). 전투 연결은 WP-5 */
  readonly appropriate?: Readonly<Partial<Record<ItemPrimaryCode, number | undefined>>> | undefined;
  readonly twoHanded?: boolean | undefined;
  /** 탄약 연결: 보조 칸 무기 종류 ID */
  readonly ammo?: string | undefined;
}

export interface ItemStatRangeJson {
  /** 1차 스탯 코드 또는 가중치 표 행 ID */
  readonly stat: string;
  readonly min: number;
  readonly max: number;
}

/** 팩 equip */
export interface ItemEquipJson {
  readonly slot: EquipSlot;
  readonly stats: readonly ItemStatRangeJson[];
  readonly weapon?: ItemWeaponJson | undefined;
  readonly skills?: readonly string[] | undefined;
  readonly elements?: readonly { readonly element: ElementCode; readonly value: number }[] | undefined;
  readonly weaponType?: string | undefined;
  readonly maxDurability?: number | undefined;
  readonly combat?:
    | {
        readonly resistPm?: readonly number[] | undefined;
        readonly defenseFlat?: number | undefined;
        readonly penetrationPm?: number | undefined;
      }
    | undefined;
  readonly kinds?: readonly string[] | undefined;
  readonly creature?: { readonly weight: number; readonly stealPm: number } | undefined;
}

/** 사용 효과 한 줄(스킬 효과 줄과 같은 모양 + 효과량 적정 스탯·±오차, D-496 286·D-501) */
export interface ItemEffectJson {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  readonly durationMs?: number | undefined;
  /** 효과량 = 기준 값 × min(상한 N10, 쓰는 유닛의 그 1차 스탯 ÷ 적정 스탯)(없으면 기준 값 그대로) */
  readonly scale?: { readonly stat: ItemPrimaryCode; readonly appropriate: number } | undefined;
  /** ±오차‰(없으면 설정 칸 d496_use_variance) */
  readonly variancePm?: number | undefined;
}

/** 팩 items.json 한 줄(JSON 모양) */
export interface ItemJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly description?: LocalizedName | undefined;
  readonly category: ItemCategoryId;
  readonly subcategory?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly tier: number;
  readonly baseValue: number;
  readonly weight?: number | undefined;
  readonly stackMax?: number | undefined;
  readonly tradable?: boolean | undefined;
  readonly bound?: boolean | undefined;
  readonly icon?: string | undefined;
  readonly equip?: ItemEquipJson | undefined;
  readonly perish?: { readonly shelfLifeMs: number; readonly spoilsTo: string } | undefined;
  readonly use?: { readonly effects: readonly ItemEffectJson[] } | undefined;
  readonly enabled: boolean;
}

export interface SubcategoryJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly major: ItemCategoryId;
  readonly order?: number | undefined;
  readonly storage?: StorageKindId | undefined;
  readonly food?: boolean | undefined;
  readonly foodFamily?: FoodFamilyId | undefined;
  readonly enabled: boolean;
}

export interface ItemTagJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly enabled: boolean;
}

export interface WeaponTypeJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly slot: WeaponTypeSlotId;
  readonly order?: number | undefined;
  /** 탄약 종류(D-497: 이 보조 칸 종류의 장비는 내구도 = 남은 탄 수, 최대 내구도 = 담는 탄 수) */
  readonly ammo?: boolean | undefined;
  readonly enabled: boolean;
}

/** 분류 자료 한 줄(실효 항목 + 출처 + 해시) */
export interface TaxonomyRow<T> {
  readonly entry: T;
  readonly origin: ContentEditOrigin;
  readonly hash: string;
}

/** 목록 한 줄(요약. 항목 통째는 items.get) */
export interface ItemRow {
  readonly id: string;
  readonly name: LocalizedName;
  readonly category: ItemCategoryId;
  readonly subcategory: string | null;
  readonly tags: readonly string[];
  readonly tier: number;
  readonly baseValue: number;
  readonly weight: number | null;
  readonly enabled: boolean;
  readonly origin: ContentEditOrigin;
  /** 실효 항목 해시(저장 묶음의 baseHash) */
  readonly hash: string;
  readonly storage: StorageKindId;
  readonly market: MarketKind;
  /** 장비 칸(장비가 아니면 null) */
  readonly slot: EquipSlot | null;
  readonly weaponType: string | null;
  readonly kinds: readonly string[];
  /** 무기 공격력(물리·속성 칸, 없으면 null) */
  readonly attack: { readonly physical: number | null; readonly elemental: number | null } | null;
  readonly appropriate: Readonly<Partial<Record<ItemPrimaryCode, number | undefined>>> | null;
  /** 스탯 줄(요약에 앞 셋) */
  readonly stats: readonly ItemStatRangeJson[];
  /** 사용 효과 ID */
  readonly effects: readonly string[];
  readonly shelfLifeMs: number | null;
  /** 권고 수(저장을 막지 않는 문제) */
  readonly advice: number;
  /** 코드·시나리오가 이 ID를 쓰는가(끄기·칸 바꾸기에 확인 창) */
  readonly codeRef: boolean;
}

/** 코드가 ID로 쓰는 곳 하나(설계안 3.6) */
export interface ItemCodeRef {
  /** 쓰는 곳(소스 파일·시나리오) */
  readonly where: string;
  /** 쓰임 코드(화면 메시지 키) */
  readonly use:
    | "sim_combat"
    | "sim_wave"
    | "replay_demo"
    | "battle_lab"
    | "roster_preview"
    | "economy_preview";
}

export interface ItemEditorListResponse {
  readonly contentVersion: string;
  /** 덮어쓰기 판(스킬 편집기와 같은 판) */
  readonly revision: number;
  readonly items: readonly ItemRow[];
  readonly subcategories: readonly TaxonomyRow<SubcategoryJson>[];
  readonly tags: readonly TaxonomyRow<ItemTagJson>[];
  readonly weaponTypes: readonly TaxonomyRow<WeaponTypeJson>[];
  readonly unitKinds: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly slots: readonly EquipSlot[];
    readonly enabled: boolean;
  }[];
  readonly skills: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly base: "physical" | "elemental";
    readonly weaponField: "physical" | "elemental" | "any" | null;
    readonly bareHand: boolean;
    readonly enabled: boolean;
  }[];
  /** 효과 고르기 창 자료(실효 효과 사전, WP-6부터 덮어쓴 값) */
  readonly effects: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly kind: "buff" | "debuff" | "dot" | "heal" | "status";
    readonly stat: string | null;
    readonly valueMode: "flat" | "permille";
    readonly durationMs: number;
    readonly stacking: "refresh" | "stack" | "ignore";
    readonly status: string | null;
    readonly enabled: boolean;
    /** 배타 묶음(D-472). 옛 서버는 보내지 않는다 */
    readonly exclusive?: string | null | undefined;
  }[];
  readonly statRows: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly shape: "quantity" | "probability";
    readonly enabled: boolean;
  }[];
  /** 한 번 쓰고 지운 ID(팩 id-changes + 이 세계에서 지운 만든 항목). 새 ID로 다시 쓰지 못한다 */
  readonly retired: Readonly<Partial<Record<ItemEditCategory, readonly string[]>>>;
  /** 잠든 줄(켤 때 적용하지 않은 덮어쓰기) */
  readonly sleeping: readonly ContentSleepingRow[];
  /** 효과 사전 항목 통째(실효 + 출처 + 해시, [효과 사전] 탭 WP-6). 옛 서버는 보내지 않는다 */
  readonly effectRows?: readonly TaxonomyRow<EffectJson>[] | undefined;
  /** 효과마다 쓰는 아이템·스킬(D-425 도감) */
  readonly effectUsage?: Readonly<Record<string, EffectUsage>> | undefined;
}

/** 아이템을 쓰는 곳(읽기와 연결만, 설계안 3.6) */
export interface ItemUsage {
  /** 이 아이템을 만드는 레시피 */
  readonly madeBy: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly enabled: boolean;
  }[];
  /** 이 아이템을 재료로 쓰는 레시피 */
  readonly usedIn: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly enabled: boolean;
  }[];
  readonly necessities: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly enabled: boolean;
  }[];
  /** 신선도 0이면 이 아이템으로 바뀌는 아이템 */
  readonly spoilsFrom: readonly string[];
  /** 장비 스킬(스킬 편집기로 연결) */
  readonly skills: readonly string[];
  /** 입을 수 있는 유닛 종류(그 칸이 있고, kinds가 있으면 그 안) */
  readonly wearers: readonly string[];
  /** 전투 실험실 팀 프리셋 중 이 아이템을 쓰는 것(이름) */
  readonly presets: readonly string[];
  readonly codeRefs: readonly ItemCodeRef[];
}

export interface ItemEditorGetResponse {
  readonly revision: number;
  /** 실효 항목(없으면 null: 지워졌거나 모르는 ID) */
  readonly entry: ItemJson | null;
  readonly pack: ItemJson | null;
  readonly origin: ContentEditOrigin | null;
  readonly hash: string | null;
  readonly override: ContentOverrideView | null;
  readonly usage: ItemUsage;
  /** 권고(저장을 막지 않는다) */
  readonly advice: readonly ContentIssueView[];
}

/** 묶음의 바꿈 하나. baseHash = 고치기 시작할 때의 실효 항목 해시(새 항목이면 null) */
export type ItemEditorChange =
  | {
      readonly op: "put";
      readonly category: ItemEditCategory;
      readonly entry: Readonly<Record<string, unknown>>;
      readonly baseHash: string | null;
    }
  /** 덮어쓰기를 지운다(팩 값으로. 만든 항목은 지우고 ID를 은퇴시킨다) */
  | {
      readonly op: "revert";
      readonly category: ItemEditCategory;
      readonly id: string;
      readonly baseHash: string | null;
    }
  /** 잠든 줄을 버린다(DB에서 지운다) */
  | { readonly op: "discard_sleeping"; readonly category: ItemEditCategory; readonly id: string }
  /**
   * 여러 개 고치기(WP-7, 아이템만): 서버가 지금 실효 항목에 그 칸만 얹는다(applyItemPatch, 기준 가치 ‰는 BigInt). 항목 통째를 보내지
   * 않아 낡은 초안이 다른 칸을 덮지 않는다
   */
  | {
      readonly op: "patch";
      readonly category: "items";
      readonly ids: readonly string[];
      readonly patch: ItemPatch;
    };

/** 내보내기(대량 도구 JSON·CSV): 실효 아이템 통째(실효 차례) */
export interface ItemEditorExportResponse {
  readonly contentVersion: string;
  readonly revision: number;
  readonly entries: readonly ItemJson[];
}

/** 받지 않은 까닭(data.reason) */
export const ITEM_EDITOR_REASONS = [
  "invalid_entry",
  "unknown_entry",
  "retired_id",
  "duplicate_entry",
  "invalid_note",
  "entry_changed",
  "category_locked",
  "entry_too_large",
  "created_limit",
] as const;
export type ItemEditorReason = (typeof ITEM_EDITOR_REASONS)[number];

export interface ItemEditorCheckResponse {
  readonly ok: boolean;
  /** 저장을 막는 문제(팩 검사기·편집기 규칙). ok면 빈 목록 */
  readonly issues: readonly ContentIssueView[];
  /** 묶음의 아이템마다 권고(키 `<분류>/<ID>`) */
  readonly advice: Readonly<Record<string, readonly ContentIssueView[]>>;
  /** 끄면 함께 멈추는 레시피·생필품(묶음이 끄는 아이템마다) */
  readonly cascade: Readonly<
    Record<string, { readonly recipes: readonly string[]; readonly necessities: readonly string[] }>
  >;
}

// 미리 보기 자료 모양(기준 유닛·자리·응답)은 itemEditorPreview.ts(파일 크기)
export {
  APPROPRIATE_ROW_IDS,
  DEFAULT_PREVIEW_UNIT,
  PREVIEW_PMS,
  type AppropriateRowId,
  type AppropriateTerms,
  type BeforeAfter,
  type ItemEditorPreviewResponse,
  type ItemFormulaValue,
  type ItemPreviewIgnored,
  type ItemPreviewUnit,
  type UseAmount,
  type WeaponEfficiency,
} from "./itemEditorPreview.ts";
// 효과 사전 편집 모양(WP-6)은 itemEditorEffects.ts
export {
  EFFECT_COMBAT_STAT_IDS,
  EFFECT_KIND_IDS,
  EFFECT_LIMITS,
  EFFECT_PRIMARY_STAT_IDS,
  EFFECT_STATUS_IDS,
  EFFECT_STAT_IDS,
  type EffectJson,
  type EffectKindId,
  type EffectStatId,
  type EffectStatusId,
  type EffectUsage,
} from "./itemEditorEffects.ts";
// 대량 도구(WP-7: 여러 개 고치기·CSV·JSON)는 itemEditorBulk.ts
export {
  ITEM_BULK_LIMITS,
  ITEM_CSV_COLUMNS,
  applyItemPatch,
  importDiff,
  itemsToCsv,
  itemsToJson,
  parseItemsCsv,
  parseItemsJson,
  scaleBaseValue,
  type ItemCsvColumn,
  type ItemImportProblem,
  type ItemImportResult,
  type ItemPatch,
} from "./itemEditorBulk.ts";

export const ITEM_EDITOR_HISTORY_LIMIT = 40;

export type ItemEditorHistoryRow = ContentHistoryRow;

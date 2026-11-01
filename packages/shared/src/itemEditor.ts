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

/** 아이템 편집기 묶음이 고칠 수 있는 분류: 아이템 + 분류 자료 */
export const ITEM_EDIT_CATEGORIES = ["items", "item_subcategories", "item_tags", "weapon_types"] as const;
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
 * none = 아직 읽는 곳이 없음(규칙 줄기가 붙으면 바꾼다: 장비 전투 연결 WP-5, 크리쳐 칸 WP-C, 소모품 실행 WP-6, 보유 표)
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
  "equip.elements": "none",
  "equip.maxDurability": "none",
  "equip.combat": "none",
  "equip.kinds": "none",
  "equip.creature": "none",
  "equip.weapon.appropriate": "none",
  "equip.weapon.twoHanded": "none",
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

/** 사용 효과 한 줄(스킬 효과 줄과 같은 모양) */
export interface ItemEffectJson {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  readonly durationMs?: number | undefined;
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
  }[];
  readonly statRows: readonly {
    readonly id: string;
    readonly name: LocalizedName;
    readonly shape: "quantity" | "probability";
    readonly enabled: boolean;
  }[];
  /** 한 번 쓰고 지운 ID(팩 id-changes + 이 세계에서 지운 만든 항목). 새 ID로 다시 쓰지 못한다 */
  readonly retired: Readonly<Record<ItemEditCategory, readonly string[]>>;
  /** 잠든 줄(켤 때 적용하지 않은 덮어쓰기) */
  readonly sleeping: readonly ContentSleepingRow[];
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
  | { readonly op: "discard_sleeping"; readonly category: ItemEditCategory; readonly id: string };

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

/** 미리 보기 기준 유닛(화면이 바꾼다) */
export interface ItemPreviewUnit {
  readonly kind: string;
  readonly level: number;
  /** 1차 6개(ITEM_PRIMARY_CODES 차례 이름) */
  readonly primaries: Readonly<Record<ItemPrimaryCode, number>>;
}

/** 기본 미리 보기 유닛: 새 사이보그 평균(1차 모두 10, Lv 1, D-467 ①). 기본 무기·장비는 서버가 붙인다(전투 실험실 기본 유닛) */
export const DEFAULT_PREVIEW_UNIT: ItemPreviewUnit = {
  kind: "cyborg",
  level: 1,
  primaries: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
};

/** 미리 보기 자리(범위의 ‰): 최소·가운데·최대 */
export const PREVIEW_PMS = [0, 500, 1000] as const;

/** 전투 식 값 하나(그 세계의 실효 계산식으로 셈, 결과 단위) */
export interface ItemFormulaValue {
  readonly id: string;
  /** int 칸은 정수, fixed 칸은 1000배 정수 */
  readonly value: number;
  readonly result: "int" | "fixed";
  /** 그 세계에서 덮어쓴 식인가(아니면 팩 식) */
  readonly overridden: boolean;
}

export interface ItemEditorPreviewResponse {
  readonly ok: boolean;
  /** 초안이 팩 스키마에 걸리면 그 문제(미리 보기는 하지 않는다) */
  readonly issues: readonly ContentIssueView[];
  readonly equip: {
    readonly unit: ItemPreviewUnit;
    /** 초안을 끼운 칸 번호(그 종류에 칸이 없으면 null) */
    readonly slotIndex: number | null;
    /** kinds가 있고 이 종류가 없으면 거짓(거르기는 WP-5) */
    readonly wearable: boolean;
    /** 그 칸에서 빠진 기본 장비 ID */
    readonly replaced: string | null;
    readonly primaries: readonly {
      readonly stat: ItemPrimaryCode;
      readonly before: number;
      readonly after: readonly number[];
    }[];
    readonly rows: readonly {
      readonly id: string;
      readonly shape: "quantity" | "probability";
      readonly before: number;
      readonly after: readonly number[];
    }[];
    /** 장비 스킬마다 이 무기로 쓸 수 있나(D-490) */
    readonly skills: readonly { readonly id: string; readonly usable: boolean }[];
    /** 1차 스탯 합이 넘쳐 계산할 수 없음 등(코드) */
    readonly error: string | null;
  } | null;
  readonly weapon: {
    /** 공격력 칸마다 전투 식 값(가운데 자리 유닛 기준) */
    readonly fields: readonly {
      readonly kind: "physical" | "elemental";
      readonly values: readonly ItemFormulaValue[];
    }[];
    /** 1차 적정 스탯으로 셈한 2차 적정치(D-496, 전투 연결은 WP-5) */
    readonly derived: {
      readonly physicalAttack: number;
      readonly elementalAttack: number;
      readonly hit: number;
      readonly crit: number;
      readonly speed: number;
    } | null;
  } | null;
  readonly use: {
    readonly lines: readonly {
      readonly effect: string;
      readonly kind: "buff" | "debuff" | "dot" | "heal" | "status" | null;
      readonly stat: string | null;
      readonly valueMode: "flat" | "permille" | null;
      readonly value: number;
      readonly chancePm: number;
      /** 실효 지속(ms, 줄에 없으면 효과 사전 기본값. 0 = 전투 내내) */
      readonly durationMs: number | null;
      readonly stacking: "refresh" | "stack" | "ignore" | null;
    }[];
  } | null;
  readonly value: {
    readonly baseValue: number;
    /** 이 아이템을 만드는 레시피마다 원가(입력 기준 가치 합 ÷ 출력 수량, 최소 단위 정수 글자) */
    readonly recipes: readonly { readonly id: string; readonly cost: string; readonly outputQty: number }[];
  };
}

export const ITEM_EDITOR_HISTORY_LIMIT = 40;

export type ItemEditorHistoryRow = ContentHistoryRow;

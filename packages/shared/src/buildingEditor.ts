// 건물 편집기(/dev/buildings) 공용 자료 모양 — docs/adr/2026-11-02-building-editor.md, 기획 D-508·49 M14·D-5044.
// 서버(tRPC buildings.*, apps/server/src/buildingEdit/)와 화면(apps/game/src/editor/buildings/)이 같이 쓴다. 시설 항목은 콘텐츠 팩
// facilities.json 한 줄과 같은 JSON 모양이다(참조는 ID 글자). 형식 검사는 서버가 팩 스키마로 한다(게임 앱은 @terra/content를 가져오지
// 않는다). 값의 범위 상수는 화면 입력 칸이 쓰고, 맞는지는 서버가 다시 본다(서버 시험이 팩 스키마와 맞춰 본다).
import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentIssueView,
  ContentOverrideView,
  ContentSleepingRow,
  LocalizedName,
} from "./contentEdit.ts";
import type { FacilityBuildJson, FacilityBuildRules, FacilityRepairJson } from "./facilityBuild.ts";

export {
  FACILITY_BUILD_LIMITS,
  FACILITY_LEVEL_MAX,
  FACILITY_REPAIR_LIMITS,
  OLD_FACILITY_BUILD_RULES,
  buildCostAt,
  buildLevelAt,
  buildTimeAt,
  type BuildLevelJson,
  type BuildStackJson,
  type FacilityBuildJson,
  type FacilityBuildRules,
  type FacilityRepairJson,
} from "./facilityBuild.ts";

/** 건물 편집기 묶음이 고칠 수 있는 분류 */
export const BUILDING_EDIT_CATEGORIES = ["facilities", "gather_tiers"] as const;
export type BuildingEditCategory = (typeof BUILDING_EDIT_CATEGORIES)[number];

/** 1차 생산 티어 수(T0~T9 = 10, @terra/content GATHER_TIER_COUNT) 및 가중치 합(1000‰) */
export const GATHER_TIER_SLOTS = 10;
export const GATHER_BAND_WEIGHT_TOTAL = 1000;

/** 팩 gather_tiers.json 한 줄(JSON 모양, 49 N43, D-513) */
export interface GatherTierJson {
  readonly id: string;
  readonly from: number;
  readonly weightsPm: readonly number[];
}

export interface BuildingEditorGatherBand {
  readonly entry: GatherTierJson;
  readonly origin: ContentEditOrigin;
  readonly pack: GatherTierJson | null;
  readonly override: ContentOverrideView | null;
  readonly hash: string;
}

/** 생산 단계(@terra/content FACILITY_STAGES와 같다, D-114) + 영토(영토 비콘, D-485·49 N51) */
export const FACILITY_STAGE_IDS = ["gather", "process", "part", "finish", "territory"] as const;
export type FacilityStageId = (typeof FACILITY_STAGE_IDS)[number];

/** 채집 방식(@terra/content GATHER_MODES와 같다): roll = 확률표 추첨, select = 선택 + 효율 */
export const GATHER_MODE_IDS = ["roll", "select"] as const;
export type GatherModeId = (typeof GATHER_MODE_IDS)[number];

/** 1차 스탯 코드(@terra/content PRIMARY_STAT_CODES와 같다) */
export const FACILITY_STAT_IDS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type FacilityStatId = (typeof FACILITY_STAT_IDS)[number];

/** 채집 칸(팩 facilities.gather) */
export interface FacilityGatherJson {
  readonly primary: FacilityStatId;
  readonly secondary: FacilityStatId;
  /** 사다리 중분류(원자재 중분류) */
  readonly subcategory: string;
  readonly mode?: GatherModeId | undefined;
  readonly yieldBase?: number | undefined;
  readonly yieldPerStatPm?: number | undefined;
  readonly yieldCap?: number | undefined;
}

/** 팩 facilities.json 한 줄(JSON 모양). 켜기·끄기 칸은 없다(시설은 늘 켜짐, 사용자 답 2026-11-03) */
export interface FacilityJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stage: FacilityStageId;
  /** 최고 레벨(없으면 FACILITY_LEVEL_MAX) */
  readonly maxLevel?: number | undefined;
  /** 레벨당 일하는 자리(Lv × 이 값) */
  readonly slotsPerLevel: number;
  readonly pollution?: number | undefined;
  readonly gather?: FacilityGatherJson | undefined;
  readonly build?: FacilityBuildJson | undefined;
  /** 장비 수리 줄(D-512 323, 옛 공방 REPAIR_MAP). 없으면 수리하지 않는 시설 */
  readonly repair?: readonly FacilityRepairJson[] | undefined;
}

/** 입력 칸 범위(팩 스키마와 같다. 서버 시험이 맞춰 본다) */
export const FACILITY_LIMITS = {
  slotsPerLevel: { min: 0, max: 1000 },
  pollution: { min: 0, max: 10_000 },
  yieldBase: { min: 0, max: 1000 },
  yieldPerStatPm: { min: 0, max: 100_000 },
  yieldCap: { min: 1, max: 1000 },
  nameMax: 200,
} as const;

/** 이 시설의 레시피 한 줄(읽기만, 팩 recipes.json) */
export interface BuildingEditorRecipe {
  readonly id: string;
  readonly name: LocalizedName;
  readonly inputs: readonly { readonly item: string; readonly qty: number }[];
  readonly outputs: readonly { readonly item: string; readonly qty: number }[];
  readonly work: number;
  readonly enabled: boolean;
}

export interface BuildingEditorFacility {
  /** 실효 항목(팩 + 덮어쓰기) */
  readonly entry: FacilityJson;
  readonly origin: ContentEditOrigin;
  /** 팩 항목(편집기에서 만든 시설이면 null — 지금은 만들기가 없다) */
  readonly pack: FacilityJson | null;
  readonly override: ContentOverrideView | null;
  /** 실효 항목 해시(저장 묶음의 baseHash) */
  readonly hash: string;
  readonly recipes: readonly BuildingEditorRecipe[];
}

/** 재료 고르기 창의 아이템 한 줄(실효 아이템) */
export interface BuildingEditorItem {
  readonly id: string;
  readonly name: LocalizedName;
  readonly category: string;
  readonly tier: number;
  readonly subcategory: string | null;
  /** 기본 단위 하나의 무게(g). 없으면 null(건설 시간에서 0으로 셈) */
  readonly weight: number | null;
  /** 묶음 크기(기본 단위 개수, 없으면 1). 재료 수량은 묶음 단위다 */
  readonly lotSize: number;
  readonly enabled: boolean;
}

/** 수리 줄의 무기 종류 고르기(실효 무기 종류) */
export interface BuildingEditorWeaponType {
  readonly id: string;
  readonly name: LocalizedName;
  /** 들어가는 칸(무기·보조) */
  readonly slot: string;
}

/** 채집 사다리 중분류 고르기(실효 중분류) */
export interface BuildingEditorSubcategory {
  readonly id: string;
  readonly name: LocalizedName;
  readonly major: string;
  readonly enabled: boolean;
}

export interface BuildingEditorListResponse {
  readonly contentVersion: string;
  /** 팩 항목 덮어쓰기 판(buildings.save의 expectedRevision, 스킬·아이템 편집기와 같은 판) */
  readonly revision: number;
  readonly facilities: readonly BuildingEditorFacility[];
  /** 1차 생산 스탯 구간별 티어 확률 분포(49 N43, D-513) */
  readonly gatherBands: readonly BuildingEditorGatherBand[];
  readonly items: readonly BuildingEditorItem[];
  readonly subcategories: readonly BuildingEditorSubcategory[];
  /** 수리 줄 무기 종류(실효 무기 종류, D-512 323) */
  readonly weaponTypes: readonly BuildingEditorWeaponType[];
  /** 건설 시간 규칙(설정 칸 M14 실효 값) */
  readonly rules: FacilityBuildRules;
  /** 채집 시설 레벨당 유효 스탯 보너스(설정 칸 N43 실효 값) */
  readonly gatherLevelBonus: number;
  /** 잠든 시설·확률표 줄(켤 때 적용하지 않고 DB에 둔 것) */
  readonly sleeping: readonly ContentSleepingRow[];
}

/** 묶음의 바꿈 하나(baseHash = 고치기 시작할 때의 실효 항목 해시) */
export type BuildingEditorChange =
  /** 시설 항목 통째로(고치기·끄기). 팩에 없는 ID는 받지 않는다(unknown_entry, 만들기는 아직 없다) */
  | { readonly op: "put"; readonly entry: FacilityJson; readonly baseHash: string }
  /** 덮어쓰기를 지운다(팩 값으로) */
  | { readonly op: "revert"; readonly id: string; readonly baseHash: string }
  /** 1차 생산 티어 확률표 한 구간 통째로(49 N43, D-513) */
  | { readonly op: "put_gather_band"; readonly entry: GatherTierJson; readonly baseHash: string }
  /** 1차 생산 티어 확률표 덮어쓰기를 지운다(팩 값으로) */
  | { readonly op: "revert_gather_band"; readonly id: string; readonly baseHash: string }
  /** 잠든 줄 버리기 */
  | {
      readonly op: "discard_sleeping";
      readonly id: string;
      readonly category?: BuildingEditCategory | undefined;
    };

/** 한 묶음의 바꿈 수 상한 */
export const BUILDING_EDITOR_CHANGES_MAX = 50;

/** 받지 않은 까닭(data.reason). entry_changed = 그새 다른 사람이 그 시설을 바꿈(data.details = `facilities/<ID>`) */
export const BUILDING_EDITOR_REASONS = [
  "invalid_entry",
  "unknown_entry",
  "duplicate_entry",
  "invalid_note",
  "entry_changed",
  "entry_too_large",
] as const;
export type BuildingEditorReason = (typeof BUILDING_EDITOR_REASONS)[number];

/** 묶음 검사 결과(저장하지 않음): 오류가 있으면 ok false. 오류가 없으면 시설 쪽 권고(꺼진 재료 등)를 싣는다 */
export interface BuildingEditorCheckResponse {
  readonly ok: boolean;
  readonly issues: readonly ContentIssueView[];
}

/** 최근 바꿈 한 줄(감사 기록, 시설 줄이 든 것만) */
export type BuildingEditorHistoryRow = ContentHistoryRow;

export const BUILDING_EDITOR_HISTORY_LIMIT = 30;

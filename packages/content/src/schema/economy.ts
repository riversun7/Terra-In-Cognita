// 경제 분류 — 아이템·레시피·시설·생필품·국가 프리셋 (docs/adr/2026-10-31-economy-core.md 1절)
// 기획: 아이템 9대분류(D-5029)·티어 T0~T9와 시설 Lv1~5(D-5001)·생산 4단계(D-114)·유지비 = 생필품(D-150)·
// 세력 화폐(D-124·D-131)·켬/끔(D-398: 개발자 페이지에서 켜고 끈다. 시설은 켬·끔 없이 늘 켜짐 — 사용자 답 2026-11-03).
// 지금 팩은 형식 확인용 임시 데이터다(placeholder). 기획 출발값이 없는 칸(시작 시세·작업량·수량·세율)은 시험값이다.
import {
  FACILITY_BUILD_LIMITS,
  FACILITY_LEVEL_MAX,
  FACILITY_REPAIR_LIMITS,
} from "@terra/shared/facilityBuild";
import { FACILITY_RUNTIME_LIMITS } from "@terra/shared/facilityRuntime";
import { z } from "zod";
import { EQUIP_SLOT_KINDS, PRIMARY_STAT_CODES } from "./combat.ts";
import { contentId, localizedText, ref } from "./common.ts";

// 아이템 항목·대분류는 items.ts(공통 칸 + 대분류별 묶음, docs/adr/2026-11-01-item-editor.md). 옛 가져오기 길을 지킨다
export { ITEM_CATEGORIES, itemEntrySchema, type ItemEntry } from "./items.ts";

/**
 * 생산 단계(D-114) + 영토(영토 비콘처럼 생산하지 않는 시설, D-485·49 N51 — docs/adr/2026-11-03-territory-layer.md) + 창고(일하지 않고
 * 물건을 두는 시설, 옛 야적장·창고·중앙창고·대규모 창고, 49 N50·D-121·D-516 382 — docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)")
 * + 신앙(일하지 않고 기도·헌금·환생·신격화 집전을 받는 신앙 시설, 46 §7·D-311) + 생명공학(비활성 휴먼을 유전자로 바꾸는 생명과학 연구소,
 * D-517·D-469 — 둘 다 docs/adr/2026-11-07-temple-religion.md) + 행정(폐허에 짓는 정부 = 행정 건물, D-510 —
 * docs/adr/2026-11-07-ruins-restoration.md)
 */
export const FACILITY_STAGES = [
  "gather",
  "process",
  "part",
  "finish",
  "territory",
  "storage",
  "religion",
  "biotech",
  "government",
] as const;

/** 채집 방식: roll = 확률표 추첨, select = 선택 + 효율(옛 ITM-10) */
export const GATHER_MODES = ["roll", "select"] as const;

/** 켬·끔(D-398). 끈 항목은 세계에 새로 나오지 않는다(있는 것은 그대로) */
const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });

const stack = z.strictObject({ item: ref("items"), qty: z.int().positive().max(1_000_000) });
/** 건설 재료 한 줄(묶음 수량, 범위는 @terra/shared FACILITY_BUILD_LIMITS) */
const buildStack = z.strictObject({
  item: ref("items"),
  qty: z.int().min(FACILITY_BUILD_LIMITS.qty.min).max(FACILITY_BUILD_LIMITS.qty.max),
});

/**
 * 장비 수리 줄(기획 D-512 323, 옛 enhancement_routes.js REPAIR_MAP 878~883): 무기 종류(weaponTypes)가 맞거나 칸(slots)이 맞는 장비를 고친다
 * (위에서부터 첫 맞는 줄). 재료는 기본 양이고 수리 한 번 = max(1, ⌈기본 × 티어 × 잃은 ÷ 최대⌉)(@terra/sim items/repair.ts). 칸·무기
 * 종류가 하나도 없으면 아무것도 고치지 못해 막는다
 */
const repairRule = z
  .strictObject({
    slots: z.array(z.enum(EQUIP_SLOT_KINDS)).max(FACILITY_REPAIR_LIMITS.targets),
    weaponTypes: z.array(ref("weapon_types")).max(FACILITY_REPAIR_LIMITS.targets),
    materials: z
      .array(
        z.strictObject({
          item: ref("items"),
          qty: z.int().min(FACILITY_REPAIR_LIMITS.qty.min).max(FACILITY_REPAIR_LIMITS.qty.max),
        }),
      )
      .min(1)
      .max(FACILITY_REPAIR_LIMITS.materials),
  })
  .superRefine((rule, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const slots: unknown = rule.slots;
    const types: unknown = rule.weaponTypes;
    if (!Array.isArray(slots) || !Array.isArray(types)) return;
    if (slots.length === 0 && types.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["slots"],
        message: "수리 줄은 칸(slots)이나 무기 종류(weaponTypes)를 적어도 하나 적습니다.",
        params: { rule: "repair_targets_empty" },
      });
  });

/**
 * 시설. 켬·끔 칸(enabled)이 없다: 시설은 늘 켜져 있다(팩 core@32, 사용자 답 2026-11-03 "켜고 끄는건 말이 안된다. 다른 재료로 바꾸면
 * 되지" — 쓰고 싶지 않은 재료는 건물 재료를 바꾼다). 옛 덮어쓰기 줄의 enabled는 서버 contentEdit/legacy.ts가 빼고 읽는다
 */
export const facilityEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  stage: z.enum(FACILITY_STAGES),
  /** 최고 레벨(D-5001 시설 Lv1~5). 없으면 5. 건설 재료 구간·편집기 레벨 표가 본다 */
  maxLevel: z.int().min(1).max(FACILITY_LEVEL_MAX).optional(),
  /** [임시] 레벨당 일하는 자리 수(Lv × 이 값). 기획 수치 없음(E29 근처, 건물 데이터 D-5044). 영토 비콘처럼 일하지 않는 시설은 0 */
  slotsPerLevel: z.int().min(0).max(1000),
  /**
   * [임시] 오염 값: 레벨 1이 1시간 일할 때 그 1차맵 칸에 더하는 오염(D-460 200 "시설 레벨 × 시설 오염 값", D-464 215 출발값,
   * 개발자 페이지 콘텐츠 D-398). 없으면 0
   */
  pollution: z.int().min(0).max(10_000).optional(),
  /**
   * 채집 티어 추첨(D-506, 질문 300·301): 이 시설의 레시피 가운데 산출이 모두 이 중분류인 것은 산출 묶음마다 티어를 뽑는다.
   * 유효 스탯 = 일꾼의 primary + secondary(43 §4: 광산 STR + VIT, 벌목 DEX + STR, 약초 INT + WIS, 낚시 AGI + DEX)
   * + 레벨 보너스(설정 칸 N43 n43_level_bonus × (레벨 − 1)), 확률표 = gather_tiers. 채집 단계(stage gather) 시설에만 쓴다
   */
  gather: z
    .strictObject({
      primary: z.enum(PRIMARY_STAT_CODES),
      secondary: z.enum(PRIMARY_STAT_CODES),
      subcategory: ref("item_subcategories"),
      /**
       * 채집 방식(옛 ITM-10, 43 §4): roll = 확률표 추첨(기본, 광산·벌목장·약초원·낚시터), select = 선택 + 효율(농장·목장):
       * 해금 티어 min(⌊(주 + 보조) ÷ 20⌋, 9)(49 P8)에서 켜진 아이템이 있는 가장 높은 티어를 고른다
       */
      mode: z.enum(GATHER_MODES).optional(),
      /**
       * 수확량(옛 gather_type_config, 기획 D-507·49 N32): 한 번 캘 때 개수 = min(yieldCap, yieldBase + ⌊보조 스탯 × yieldPerStatPm ÷ 1000⌋).
       * 없으면 yieldBase 1, yieldPerStatPm = 설정 칸 n32_sub_yield, 상한 없음. 광석은 개수 = 묶음 수(49 N44).
       * 주 스탯은 진행 속도 max(1, ⌊주 ÷ n32_main_divisor⌋)를 정한다(시설 칸 없음)
       */
      yieldBase: z.int().min(0).max(1000).optional(),
      yieldPerStatPm: z.int().min(0).max(100_000).optional(),
      yieldCap: z.int().min(1).max(1000).optional(),
    })
    .optional(),
  /**
   * 건설 재료(49 M14·D-508, 옛 building_seed.js buildCost — docs/adr/2026-11-02-building-editor.md): 레벨 구간마다 재료를 적는다.
   * 레벨 L에는 from ≤ L인 마지막 구간(levels)을 쓰고, 줄마다 round(qty × L² × mulPm ÷ 1000)(옛 Base × 티어² × 분류 배율, 옛 "티어"를
   * 새 시설 레벨로 읽은 것은 기술 해석 ⏳). 셈은 @terra/shared/facilityBuild 하나다. D-508: 처음 레벨은 1차 원자재로 지어 초기 발전이
   * 막히지 않게, 그 위 레벨 대부분은 가공품(판자·벽돌·주괴). 출발값(옛 raw → Lv1 원자재·Lv2부터 가공품)은 [임시]이고 건물 편집기
   * (/dev/buildings)에서 고친다. 구간 규칙(첫 from 1·늘어나기만·최고 레벨 이하·같은 아이템 한 줄)은 2단계 검사(validate/facilities.ts).
   * 수량은 레시피와 같은 묶음 단위다. mulPm = 옛 분류 배율(PRIMARY 0.8 → 800, SECONDARY 1.2 → 1200). 짓기·레벨 올림·수리는 서버
   * 건물 서비스(docs/adr/2026-11-07-buildings-runtime.md)가 셈한다
   */
  build: z
    .strictObject({
      mulPm: z.int().min(FACILITY_BUILD_LIMITS.mulPm.min).max(FACILITY_BUILD_LIMITS.mulPm.max),
      levels: z
        .array(
          z.strictObject({
            from: z.int().min(1).max(FACILITY_LEVEL_MAX),
            materials: z.array(buildStack).min(1).max(FACILITY_BUILD_LIMITS.materials),
          }),
        )
        .min(1)
        .max(FACILITY_BUILD_LIMITS.levels),
    })
    .optional(),
  /**
   * 장비 수리 줄(D-512 323): 이 시설이 고치는 장비와 기본 재료. 출발값 = 옛 공방 넷(무기 공방 주괴 2, 원거리 공방 목재 2 + 주괴 1, 방어구
   * 공방 주괴 1 + 가죽 1, 장신구 공방 크리스탈 1 — 팩에 크리스탈이 없어 [임시] 은 괴)이고 건물 편집기(/dev/buildings)에서 고친다.
   * 없으면 수리하지 않는 시설. 수리는 끝까지만, 수수료 없음(노동 = 장인의 직무 시간 D-171)
   */
  repair: z.array(repairRule).min(1).max(FACILITY_REPAIR_LIMITS.rules).optional(),
  /**
   * 2차맵에 짓는 칸 크기(배치 칸, 회전 전 가로·세로, D-102·D-5041 레벨이 올라도 넓히지 않음). [임시] 출발값, 건물 편집기에서 고친다.
   * 없으면 2차맵에 지을 수 없다(영토 비콘은 1차맵 칸에 놓아 칸 크기가 없다). docs/adr/2026-11-07-buildings-runtime.md
   */
  footprint: z
    .strictObject({
      width: z.int().min(FACILITY_RUNTIME_LIMITS.footprint.min).max(FACILITY_RUNTIME_LIMITS.footprint.max),
      height: z.int().min(FACILITY_RUNTIME_LIMITS.footprint.min).max(FACILITY_RUNTIME_LIMITS.footprint.max),
    })
    .optional(),
  /**
   * 레벨 1 최대 내구도(49 M15 "건물 에디터 입력값"). 레벨 L = 이 값 × (1 + (L − 1) × 설정 칸 m15_durability_step). 출발값 = 옛
   * seeds/building_seed.js hp. 없으면 100(옛 코드 기본 max_durability). 영토 비콘은 설정 칸 n51_beacon_durability를 쓴다
   */
  durability: z
    .int()
    .min(FACILITY_RUNTIME_LIMITS.durability.min)
    .max(FACILITY_RUNTIME_LIMITS.durability.max)
    .optional(),
  /**
   * 레벨 1 창고 용량(kg, 49 N50 "기본 1t·10t·100t·500t"). 레벨 L = 이 값 × (1 + (L − 1) × 설정 칸 n50_storage_step).
   * 창고 단계(stage storage) 시설만 물건을 넣는다(원장 위치 = 그 건물, 무게 합 ≤ 용량). 그 밖 시설은 칸이 있어도 넣지 않는다.
   * 출발값 = 옛 야적장 1t·창고 10t·중앙창고 100t·대규모 창고 500t(seeds/building_seed.js weight_limit)
   */
  storageKg: z
    .int()
    .min(FACILITY_RUNTIME_LIMITS.storageKg.min)
    .max(FACILITY_RUNTIME_LIMITS.storageKg.max)
    .optional(),
});
export type FacilityEntry = z.output<typeof facilityEntrySchema>;

/** 채집 티어 수(T0~T9, D-5001) */
export const GATHER_TIER_COUNT = 10;
/** 구간 가중치 합(‰) */
export const GATHER_WEIGHT_TOTAL = 1000;

/**
 * 채집·채굴 티어 확률표 한 구간(49 N43, D-506): 유효 스탯이 from 이상(다음 구간 from 미만)이면 이 가중치(‰, T0~T9 차례, 합 1000)로
 * 티어를 뽑는다. 파일 차례 = from 차례(첫 구간 from 0, 늘어나기만, 2단계 검사). 마지막 구간은 위 끝이 없다.
 * 옛 프로젝트 skill_tier_probability(20 단위 구간)를 ‰로 옮겼고, 0~39는 [임시] T0 700·T1 150·T2 100·T3 50(사용자 답 300)
 */
export const gatherTierEntrySchema = z
  .strictObject({
    id: contentId,
    from: z.int().min(0).max(100_000),
    weightsPm: z.array(z.int().min(0).max(GATHER_WEIGHT_TOTAL)).length(GATHER_TIER_COUNT),
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const weights: unknown = entry.weightsPm;
    if (!Array.isArray(weights) || !weights.every((value) => Number.isInteger(value))) return;
    const sum = weights.reduce((total: number, value: number) => total + value, 0);
    if (sum !== GATHER_WEIGHT_TOTAL)
      ctx.addIssue({
        code: "custom",
        path: ["weightsPm"],
        message: `가중치 합이 ${sum}입니다. 합은 ${GATHER_WEIGHT_TOTAL}(‰)이어야 합니다.`,
        params: { rule: "gather_weights_sum" },
      });
  });
export type GatherTierEntry = z.output<typeof gatherTierEntrySchema>;

export const recipeEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  facility: ref("facilities"),
  inputs: z.array(stack).max(16),
  outputs: z.array(stack).min(1).max(16),
  /** [임시] 한 번 만드는 데 드는 작업량(효율 1000인 일꾼 한 시간 = 1000) */
  work: z.int().positive().max(100_000_000),
  enabled,
});
export type RecipeEntry = z.output<typeof recipeEntrySchema>;

export const necessityEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  item: ref("items"),
  /** [임시] 유닛 하나가 주기마다 쓰는 양(E28: 등급별 요구량은 기획 Step 5) */
  perUnit: z.int().positive().max(1_000_000),
  /** 주기(실제 시간 시, 질문 112 기본안: 1시간마다) */
  periodHours: z
    .int()
    .positive()
    .max(24 * 30),
  enabled,
});
export type NecessityEntry = z.output<typeof necessityEntrySchema>;

export const nationPresetEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /** 세력 화폐(D-124·D-131). 원장 자산 코드는 "cur:<code>" */
  currency: z.strictObject({ code: contentId, name: localizedText }),
  /** [임시] 거래세(만분율). NPC 세율은 규칙식(D-323, R5)이 바꾼다 */
  tradeTaxBp: z.int().min(0).max(10_000),
  enabled,
});
export type NationPresetEntry = z.output<typeof nationPresetEntrySchema>;

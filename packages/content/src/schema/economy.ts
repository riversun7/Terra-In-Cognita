// 경제 분류 — 아이템·레시피·시설·생필품·국가 프리셋 (docs/adr/2026-10-31-economy-core.md 1절)
// 기획: 아이템 9대분류(D-5029)·티어 T0~T9와 시설 Lv1~5(D-5001)·생산 4단계(D-114)·유지비 = 생필품(D-150)·
// 세력 화폐(D-124·D-131)·켬/끔(D-398: 모든 콘텐츠를 개발자 페이지에서 켜고 끈다).
// 지금 팩은 형식 확인용 임시 데이터다(placeholder). 기획 출발값이 없는 칸(시작 시세·작업량·수량·세율)은 시험값이다.
import { z } from "zod";
import { PRIMARY_STAT_CODES } from "./combat.ts";
import { contentId, localizedText, ref } from "./common.ts";

// 아이템 항목·대분류는 items.ts(공통 칸 + 대분류별 묶음, docs/adr/2026-11-01-item-editor.md). 옛 가져오기 길을 지킨다
export { ITEM_CATEGORIES, itemEntrySchema, type ItemEntry } from "./items.ts";

/** 생산 단계(D-114) */
export const FACILITY_STAGES = ["gather", "process", "part", "finish"] as const;

/** 채집 방식: roll = 확률표 추첨, select = 선택 + 효율(옛 ITM-10) */
export const GATHER_MODES = ["roll", "select"] as const;

/** 켬·끔(D-398). 끈 항목은 세계에 새로 나오지 않는다(있는 것은 그대로) */
const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });

const stack = z.strictObject({ item: ref("items"), qty: z.int().positive().max(1_000_000) });

export const facilityEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  stage: z.enum(FACILITY_STAGES),
  /** [임시] 레벨당 일하는 자리 수(Lv × 이 값). 기획 수치 없음(E29 근처, 건물 데이터 D-5044) */
  slotsPerLevel: z.int().positive().max(1000),
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
   * 건설 재료(옛 building_seed.js buildCost, 49 M14 출발값 = 옛 값, docs/research/2026-11-02-old-primary-production.md):
   * 레벨 L 비용 = 재료 줄마다 round(qty × L² × mulPm ÷ 1000)의 합(같은 아이템이 여러 줄이면 줄마다 반올림, 옛 그대로).
   * materials = 옛 raw를 옛 MAT_MAP으로 바꾼 것(WOOD·STONE·PLANK·BRICK → 잡석, INGOT → 철 = 철광석 묶음), mulPm = 옛 카테고리 배율
   * (PRIMARY 0.8 → 800, SECONDARY 1.2 → 1200). 지금 건설·레벨 올림·수리를 셈하는 곳은 없다(시설은 처음부터 있다)
   */
  build: z
    .strictObject({
      mulPm: z.int().min(0).max(100_000),
      materials: z.array(stack).min(1).max(16),
    })
    .optional(),
  enabled,
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

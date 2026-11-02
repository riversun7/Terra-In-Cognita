// 경제 분류 — 아이템·레시피·시설·생필품·국가 프리셋 (docs/adr/2026-10-31-economy-core.md 1절)
// 기획: 아이템 9대분류(D-5029)·티어 T0~T9와 시설 Lv1~5(D-5001)·생산 4단계(D-114)·유지비 = 생필품(D-150)·
// 세력 화폐(D-124·D-131)·켬/끔(D-398: 모든 콘텐츠를 개발자 페이지에서 켜고 끈다).
// 지금 팩은 형식 확인용 임시 데이터다(placeholder). 기획 출발값이 없는 칸(시작 시세·작업량·수량·세율)은 시험값이다.
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

// 아이템 항목·대분류는 items.ts(공통 칸 + 대분류별 묶음, docs/adr/2026-11-01-item-editor.md). 옛 가져오기 길을 지킨다
export { ITEM_CATEGORIES, itemEntrySchema, type ItemEntry } from "./items.ts";

/** 생산 단계(D-114) */
export const FACILITY_STAGES = ["gather", "process", "part", "finish"] as const;

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
  enabled,
});
export type FacilityEntry = z.output<typeof facilityEntrySchema>;

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

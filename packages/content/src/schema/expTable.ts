// 유닛 공통 경험치 테이블 한 줄(팩 분류 exp_table, 48 §2.4 · 49 N8) — 레벨 L → L+1 구간 필요 경험치(정수).
// 사이보그·휴먼·크리쳐가 같이 쓴다(안드로이드는 레벨 없음 D-416).
import { EXP_TABLE_LIMITS } from "@terra/shared/expTable";
import { z } from "zod";
import { contentId } from "./common.ts";

export const expTableEntrySchema = z.strictObject({
  id: contentId,
  level: z.int().min(EXP_TABLE_LIMITS.levelMin).max(EXP_TABLE_LIMITS.levelMax),
  requiredExp: z.int().min(EXP_TABLE_LIMITS.requiredExpMin).max(EXP_TABLE_LIMITS.requiredExpMax),
});

export type ExpTableEntry = z.output<typeof expTableEntrySchema>;

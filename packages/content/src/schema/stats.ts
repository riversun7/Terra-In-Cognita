// 스탯 가중치 표 — 기획 D-414(2차 스탯은 저장하지 않고 가중치 표 하나로 계산), docs/adr/2026-10-31-combat-core.md "스탯"
// 행 하나 = 2차 스탯(13개) 또는 활동 수치. weights = STR·DEX·AGI·VIT·INT·WIS 차례, 정수 ‰.
// 양: 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 + 버프 / 확률: 상한(‰) × 점수 ÷ (점수 + 반감 상수).
// 지금 값은 [임시](기획 "주로 쓰는 1차"를 따른 시험값). 계산은 packages/sim combat/stats.ts.
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

const weights = z.array(z.int().min(-100_000).max(100_000)).length(6);
const enabled = z.boolean();

export const statRowEntrySchema = z.discriminatedUnion("shape", [
  z.strictObject({
    id: contentId,
    name: localizedText,
    shape: z.literal("quantity"),
    base: z.int().min(-10_000_000).max(10_000_000),
    weights,
    enabled,
  }),
  z.strictObject({
    id: contentId,
    name: localizedText,
    shape: z.literal("probability"),
    cap: z.int().min(0).max(1000),
    halfConstant: z.int().positive().max(10_000_000),
    weights,
    enabled,
  }),
]);
export type StatRowEntry = z.output<typeof statRowEntrySchema>;

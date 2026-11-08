// 밸런스 분석 입력 형식(zod) — tRPC balanceAnalysis.*(docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)").
// 범위는 @terra/shared ANALYSIS_LIMITS. 짝수 판·같은 합·예산처럼 여러 칸을 함께 보는 검사는 analysisProblem(서버·화면 같이)이 한다.
import { ANALYSIS_LIMITS } from "@terra/shared/balanceAnalysis";
import { normalizeLabName } from "@terra/shared/battleLab";
import { z } from "zod";
import { labUnitSchema } from "./schema.ts";

const L = ANALYSIS_LIMITS;
const int = (min: number, max: number) => z.int().min(min).max(max);
const weight = int(0, L.weightMax);
const weights = z.strictObject({
  str: weight,
  vit: weight,
  int: weight,
  wis: weight,
  dex: weight,
  agi: weight,
});

const conditions = z.strictObject({
  template: labUnitSchema,
  level: int(L.levelMin, L.levelMax),
  mode: z.enum(["sum", "level"]),
  elements: z.union([z.literal("keep"), z.literal("none"), int(0, 11)]),
  skills: z.boolean(),
  gear: z.boolean(),
  teamSize: int(L.teamMin, L.teamMax),
  limitSec: int(L.limitSecMin, L.limitSecMax),
});

const build = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),
  label: z
    .string()
    .max(L.labelMax * 4)
    .refine((text) => normalizeLabName(text, L.labelMax) !== null),
  weights,
  unit: labUnitSchema.nullable(),
});

const seed = int(0, 0x7fff_ffff);

export const analysisStartSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("matrix"),
    conditions,
    builds: z.array(build).min(L.buildsMin).max(L.buildsMax).readonly(),
    sums: z.array(int(L.sumMin, L.sumMax)).min(1).max(L.sumsMax).readonly(),
    runs: int(L.runsMin, L.runsMax),
    seed,
  }),
  z.strictObject({
    kind: z.literal("sensitivity"),
    conditions,
    weights,
    sum: int(L.sumMin, L.sumMax),
    mode: z.enum(["shift", "plus"]),
    steps: z.array(int(-L.stepAbsMax, L.stepAbsMax)).min(1).max(L.stepsMax).readonly(),
    runs: int(0, L.runsMax),
    seed,
  }),
]);

export const analysisJobIdSchema = z.strictObject({ id: z.string().regex(/^job_[0-9a-f]{12}$/) });

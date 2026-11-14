// 전투 보고서 입력 형식(zod) — tRPC battleReport.* 입력과 DB 기록 입력(jsonb) 읽기가 같은 스키마를 쓴다.
// 범위는 @terra/shared REPORT_LIMITS(실험 도구 입력 범위). 판 수·예산 같은 여러 칸 검사는 reportProblem(서버·화면 같이)이 본다.
import { normalizeLabName } from "@terra/shared/battleLab";
import { REPORT_LIMITS, REPORT_MODES } from "@terra/shared/battleReport";
import { REPORT_CITY_LIST_MAX } from "@terra/shared/battleReportCity";
import { z } from "zod";
import { labPartySchema } from "../battleLab/schema.ts";

const L = REPORT_LIMITS;
const int = (min: number, max: number) => z.int().min(min).max(max);
const terrainId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
/** 글(빈 글 허용, 길이·제어 문자 검사) */
const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .refine((value) => value.trim() === "" || normalizeLabName(value, max) !== null);

const cityId = int(1, 0x7fff_ffff);
/** 공성 전투맵 도시(실제 세계 도시면 cityId — 기획 D-543 1383 나. 옛 기록은 cityId가 없다) */
const city = z.strictObject({
  layout: z.enum(["city", "open", "world"]),
  housing: int(0, L.housingMax),
  adminLevel: int(1, L.adminLevelMax),
  cityId: cityId.optional(),
});

export const reportSetupSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("arena"),
    a: labPartySchema,
    b: labPartySchema,
    terrain: terrainId,
    limitSec: int(L.limitSecMin, L.limitSecMax),
  }),
  z.strictObject({
    mode: z.literal("siege"),
    a: labPartySchema,
    b: labPartySchema,
    city,
    nexusDurability: int(1, L.nexusMax),
    limitSec: int(L.limitSecMin, L.siegeLimitSecMax),
    defense: z.enum(["party", "world"]).optional(),
  }),
  z.strictObject({
    mode: z.literal("wave"),
    strength: int(1, L.waveStrengthMax),
    physical: int(0, L.waveStrengthMax),
    creatureTech: int(L.techMin, L.techMax),
    defenders: int(1, L.waveDefendersMax),
    defenderTech: int(L.techMin, L.techMax),
    city,
    nexusDurability: int(1, L.nexusMax),
    limitSec: int(L.limitSecMin, L.siegeLimitSecMax),
    defense: z.enum(["sim", "party", "world"]).optional(),
    b: labPartySchema.optional(),
  }),
]);

export const reportVariantSchema = z.strictObject({
  label: text(L.labelMax),
  setup: reportSetupSchema.nullable(),
  tuning: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{1,63}(\.(str|dex|agi|vit|int|wis|base|cap|half))?$/),
        value: z.int().min(-1_000_000_000).max(1_000_000_000),
      }),
    )
    .max(L.variantChangesMax)
    .readonly(),
});

export const reportStartSchema = z.strictObject({
  name: text(L.nameMax).refine((value) => value.trim() !== ""),
  note: text(L.noteMax),
  setup: reportSetupSchema,
  variant: reportVariantSchema.nullable(),
  runs: int(L.runsMin, L.runsMax),
  seed: int(0, 0x7fff_ffff),
});

export const reportJobIdSchema = z.strictObject({ id: z.string().regex(/^rjob_[0-9a-f]{12}$/) });
/** 기록 ID: `rep_` + 16진 12자 */
export const REPORT_ID = /^rep_[0-9a-f]{12}$/;
export const reportIdSchema = z.strictObject({ id: z.string().regex(REPORT_ID) });

export const reportListSchema = z.strictObject({
  fromMs: z.int().min(0).optional(),
  toMs: z.int().min(0).optional(),
  name: z
    .string()
    .max(L.nameMax * 4)
    .optional(),
  mode: z.enum(REPORT_MODES).optional(),
  limit: int(1, L.listMax).optional(),
  before: z.string().regex(REPORT_ID).optional(),
});

export const reportTraceSchema = z.strictObject({
  reportId: z.string().regex(REPORT_ID),
  which: z.enum(["a", "b"]),
  run: int(0, L.runsMax - 1),
});

/** 도시 고르기 목록(이름 글 또는 도시 ID) */
export const reportCityListSchema = z.strictObject({
  query: z
    .string()
    .max(L.nameMax * 4)
    .optional(),
  limit: int(1, REPORT_CITY_LIST_MAX).optional(),
});

/** 지금 도시 스냅숏(견주기) */
export const reportCitySchema = z.strictObject({ id: cityId });

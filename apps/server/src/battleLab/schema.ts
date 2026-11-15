// 전투 실험실 입력 형식(zod) — tRPC battleLab.* 입력과 DB 프리셋 값(jsonb) 읽기가 같은 스키마를 쓴다.
// 범위는 @terra/shared LAB_LIMITS(실험 도구 입력 범위, 넘침·비용 방지). 팩 참조(종류·무기·장비·스킬)가 있는지는 사양을 만들 때 본다
// (없으면 빼고 dropped로 알린다 — 팩이 바뀌어도 저장된 프리셋을 읽을 수 있게).
import { LAB_LIMITS, LAB_ROWS, normalizeLabName } from "@terra/shared/battleLab";
import { FORMATION_X_MAX, FORMATION_X_MIN, FORMATION_Y_MAX, FORMATION_Y_MIN } from "@terra/shared/roster";
import { z } from "zod";

const L = LAB_LIMITS;
const id = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const int = (min: number, max: number) => z.int().min(min).max(max);
const value = int(-L.valueMax, L.valueMax);
const pm = int(-L.pmMax, L.pmMax);
const twelve = (item: z.ZodInt) => z.array(item).length(12).readonly();
const primaries = (item: z.ZodInt) =>
  z.strictObject({ str: item, vit: item, int: item, wis: item, dex: item, agi: item });

/** 무기 공격력 칸: 공격력과 기본 공격 피해 방식(D-568, 없으면 칸 종류와 같다) */
const weaponField = z.strictObject({
  attack: int(0, L.valueMax),
  damage: z.enum(["physical", "elemental"]).optional(),
});
/** 무기 1차 적정 스탯(D-502: str 물리 공격·int 속성 공격·dex 명중·크리·agi 공격 간격). 0 = 그 몫 적정 없음(비율 100%) */
const weaponAppropriate = z.strictObject({
  str: int(0, L.valueMax),
  int: int(0, L.valueMax),
  dex: int(0, L.valueMax),
  agi: int(0, L.valueMax),
});

export const customWeaponSchema = z
  .strictObject({
    physical: weaponField.nullable(),
    elemental: weaponField.nullable(),
    basic: z.enum(["physical", "elemental"]),
    appropriate: weaponAppropriate,
    hitPm: int(0, L.valueMax),
    critPm: int(0, L.valueMax),
    intervalMs: int(100, 60_000),
    range: int(1, 32),
    arc: z.boolean(),
    staminaCost: int(0, L.valueMax),
    mpCost: int(0, L.valueMax),
    elementsPm: twelve(int(0, L.valueMax)),
  })
  // 공격력 칸이 하나도 없는 무기는 틀린 자료다(D-465, 팩 검사와 같다)
  .refine((weapon) => weapon.physical !== null || weapon.elemental !== null, { message: "no attack field" });

const weaponSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("natural") }),
  z.strictObject({ kind: z.literal("item"), id, pm: int(0, 1000) }),
  z.strictObject({ kind: z.literal("custom"), spec: customWeaponSchema }),
]);

export const labUnitSchema = z.strictObject({
  label: z
    .string()
    .max(L.labelMax * 4)
    .refine((text) => text === "" || normalizeLabName(text, L.labelMax) !== null),
  kind: id,
  level: int(L.levelMin, L.levelMax),
  rebirths: int(0, L.rebirthsMax),
  initial: primaries(int(L.primaryMin, L.primaryMax)),
  kPm: primaries(int(L.kMin, L.kMax)),
  elements: twelve(int(0, L.elementMax)),
  weapon: weaponSchema,
  equipment: z
    .array(z.strictObject({ slot: int(0, 31), item: id, pm: int(0, 1000) }))
    .max(32)
    .readonly(),
  gear: z.strictObject({
    rows: z.array(z.strictObject({ id, value })).max(32).readonly(),
    defenseFlat: int(0, L.valueMax),
    penetrationPm: int(0, L.pmMax),
    resistPm: twelve(pm),
    primaries: primaries(int(-L.primaryMax, L.primaryMax)),
  }),
  skills: z
    .array(z.strictObject({ id, grade: int(L.skillGradeMin, L.skillGradeMax) }))
    .max(16)
    .readonly(),
  row: z.enum(LAB_ROWS),
  pos: z
    .strictObject({
      x: int(FORMATION_X_MIN, FORMATION_X_MAX),
      y: int(FORMATION_Y_MIN, FORMATION_Y_MAX),
    })
    .optional(),
});

export const labPartySchema = z.strictObject({
  units: z.array(labUnitSchema).min(1).max(L.partyMax).readonly(),
  retreatHpPct: int(0, L.retreatMax),
});

export const labNameSchema = z.strictObject({
  ko: z.string().refine((text) => normalizeLabName(text) !== null),
  en: z.string().refine((text) => normalizeLabName(text) !== null),
});

export const labBattleInputSchema = z.strictObject({
  a: labPartySchema,
  b: labPartySchema,
  terrain: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
  limitSec: int(L.limitSecMin, L.limitSecMax),
  seed: int(0, 0x7fff_ffff),
});

export const labMonteCarloInputSchema = labBattleInputSchema.extend({ runs: int(L.runsMin, L.runsMax) });

/** 팀이 만든 프리셋 ID: `lab_` + 16진 12자 */
export const LAB_PRESET_ID = /^lab_[0-9a-f]{12}$/;
/** 샘플 프리셋 ID: `sample_` + 이름 */
export const LAB_SAMPLE_ID = /^sample_[a-z0-9_]{1,40}$/;

const presetId = z.string().refine((text) => LAB_PRESET_ID.test(text) || LAB_SAMPLE_ID.test(text));

export const labPresetSaveSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: presetId.optional(),
    expectedVersion: int(0, 0x7fff_ffff).optional(),
    kind: z.literal("unit"),
    name: labNameSchema,
    data: labUnitSchema,
  }),
  z.strictObject({
    id: presetId.optional(),
    expectedVersion: int(0, 0x7fff_ffff).optional(),
    kind: z.literal("party"),
    name: labNameSchema,
    data: labPartySchema,
  }),
]);

export const labPresetDeleteSchema = z.strictObject({ id: presetId, expectedVersion: int(0, 0x7fff_ffff) });

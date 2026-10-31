// 행성(planets)·바이옴(biomes) 분류 — ADR 2026-10-29-s2-planet-lod "행성 정의 (콘텐츠 팩)"
// 이름·범위와 프리셋 수치표는 @terra/shared(planetDefinition·planetPresets, 생성기와 같은 것)에서 가져온다.
// 생성기가 받지 않는 정의는 여기(스키마)와 2단계 뒤 행성 검사(validate/planets.ts)가 먼저 막는다.
// 지금 데이터는 S2 임시값이다(팩 placeholder: true). 바이옴 목록·기온·습도 범위는 기획 세션에 요청했다(ADR 36).
import {
  CONTINENT_COUNT_RANGE,
  CONTINENT_LAYOUTS,
  type ContinentLayoutDefinition,
  OCEAN_DEPTH_CLASSES,
  PLANET_GENERATOR_FACE_LEVELS,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_RANGES,
  isPlanetPresetLevel,
  presetValues,
  type PlanetPresets,
  type PlanetSettingKey,
} from "@terra/shared";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

/** 표시 색 "#rrggbb" (소문자) */
const displayColor = z
  .string({ error: '색이 없습니다. "#"과 소문자 16진수 6자리로 적으세요(예: "#3d6b4f").' })
  .regex(/^#[0-9a-f]{6}$/, { error: '색은 "#"과 소문자 16진수 6자리로 적으세요(예: "#3d6b4f").' });

/** 정수 범위 {min?, max?}: min은 포함, max는 포함하지 않는다. 없는 쪽은 끝이 없다 */
function intRange(lowest: number, highest: number) {
  const bound = z.int().min(lowest).max(highest).optional();
  return z
    .strictObject({ min: bound, max: bound })
    .refine((range) => range.min === undefined || range.max === undefined || range.min < range.max, {
      error: "min은 max보다 작아야 합니다(min은 포함, max는 포함하지 않음).",
    });
}

/**
 * 바이옴 규칙 — 생성기가 칸마다 바이옴 표를 앞에서부터 보고 처음 맞는 것을 고른다(ADR 36).
 * - ocean: 그 수심 등급의 바다 칸. lake: 호수 칸.
 * - land: 육지 칸 중 연평균 기온(°C)·습도(0~255)·실제 환산 고도(m, 게임 m × 12, 해수면 기준) 조건이 모두 맞는 칸.
 */
const biomeRule = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({ kind: z.literal("ocean"), depthClass: z.enum(OCEAN_DEPTH_CLASSES) }),
    z.strictObject({ kind: z.literal("lake") }),
    z.strictObject({
      kind: z.literal("land"),
      temperatureC: intRange(-100, 100).optional(),
      humidity: intRange(0, 256).optional(),
      realElevationM: intRange(-20_000, 20_000).optional(),
    }),
  ],
  {
    error: (issue) =>
      issue.code === "invalid_union"
        ? '규칙 종류(kind)는 "ocean"(depthClass 필요), "lake", "land" 가운데 하나입니다.'
        : undefined,
  },
);

export const biomeEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  /** 지형 레이어 색 */
  color: displayColor,
  /** 이 바이옴의 기본 숲 밀도(0~255). 생성기가 습도에 따라 칸마다 줄인다 */
  forestDensity: z.int().min(0).max(255),
  rule: biomeRule,
});
export type BiomeEntry = z.output<typeof biomeEntrySchema>;

const presetsSchema = z.strictObject({
  seaLevel: z.enum(PLANET_PRESET_LEVELS.seaLevel),
  temperature: z.enum(PLANET_PRESET_LEVELS.temperature),
  precipitation: z.enum(PLANET_PRESET_LEVELS.precipitation),
  mountains: z.enum(PLANET_PRESET_LEVELS.mountains),
  plates: z.enum(PLANET_PRESET_LEVELS.plates),
  volcanism: z.enum(PLANET_PRESET_LEVELS.volcanism),
}) satisfies z.ZodType<PlanetPresets>;

function settingValue(key: PlanetSettingKey) {
  const [lowest, highest] = PLANET_SETTING_RANGES[key];
  return z.int().min(lowest).max(highest).optional();
}

// 세부 수치 이름은 @terra/shared 목록과 같아야 한다: satisfies가 빠진 이름·모르는 이름을 컴파일 때 잡는다
const overrideShape = {
  landPercent: settingValue("landPercent"),
  shelfPercent: settingValue("shelfPercent"),
  plateCount: settingValue("plateCount"),
  upliftPercent: settingValue("upliftPercent"),
  ruggednessPercent: settingValue("ruggednessPercent"),
  erosionPercent: settingValue("erosionPercent"),
  hotspotCount: settingValue("hotspotCount"),
  volcanismPercent: settingValue("volcanismPercent"),
  equatorTemperatureC: settingValue("equatorTemperatureC"),
  poleTemperatureC: settingValue("poleTemperatureC"),
  precipitationPercent: settingValue("precipitationPercent"),
  riverDensityPercent: settingValue("riverDensityPercent"),
  lakePercent: settingValue("lakePercent"),
} satisfies Record<PlanetSettingKey, z.ZodOptional<z.ZodInt>>;

const overridesSchema = z.strictObject(overrideShape);

/**
 * 대륙 배치(ADR 2026-10-31-continent-layouts): 종류와, 덮어쓸 때만 대륙 수(큰 땅덩어리 수, 섬은 세지 않는다). 없으면
 * 대륙성 노이즈 배치(출력 판 3 그대로). 그래서 이 필드가 없는 옛 항목·초안은 그대로 통과하고 결과도 그대로다
 */
const continentsSchema = z.strictObject({
  layout: z.enum(CONTINENT_LAYOUTS),
  count: z.int().min(CONTINENT_COUNT_RANGE[0]).max(CONTINENT_COUNT_RANGE[1]).optional(),
}) satisfies z.ZodType<ContinentLayoutDefinition>;

/** 객체의 필드(없으면 undefined). Zod는 필드가 틀려도 행성 검사(superRefine)를 부르므로 모양을 믿지 않고 읽는다 */
function property(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** 정수이고 그 세부 수치의 범위 안인지(아니면 필드 검사가 따로 알린다) */
function settingInRange(key: PlanetSettingKey, value: unknown): value is number {
  const [lowest, highest] = PLANET_SETTING_RANGES[key];
  return typeof value === "number" && Number.isInteger(value) && value >= lowest && value <= highest;
}

/**
 * 극 기온 ≤ 적도 기온 — 생성기와 같은 값(기온 프리셋 수치 + 덮어쓰기, @terra/shared planetPresets.ts)으로 본다.
 * 한쪽만 덮어쓰면 다른 쪽은 프리셋 값이다. 틀린 단계 이름·범위 밖 값은 필드 검사가 알리므로 건너뛴다.
 */
function checkTemperatures(planet: unknown, context: z.RefinementCtx): void {
  const level = property(property(planet, "presets"), "temperature");
  if (!isPlanetPresetLevel("temperature", level)) return;
  const preset = presetValues("temperature", level);
  const overrides = property(planet, "overrides");
  const equator = property(overrides, "equatorTemperatureC") ?? preset.equatorTemperatureC;
  const pole = property(overrides, "poleTemperatureC") ?? preset.poleTemperatureC;
  if (!settingInRange("equatorTemperatureC", equator) || !settingInRange("poleTemperatureC", pole)) return;
  if (pole <= equator) return;
  context.addIssue({
    code: "custom",
    path: ["overrides"],
    message: `극 기온(poleTemperatureC ${pole}°C)이 적도 기온(equatorTemperatureC ${equator}°C)보다 높습니다. 덮어쓰지 않은 쪽은 기온 프리셋("${level}")의 값입니다. 극 ≤ 적도가 되게 고치세요.`,
  });
}

const [MIN_FACE_LEVEL, MAX_FACE_LEVEL] = PLANET_GENERATOR_FACE_LEVELS;

/** 행성 항목의 필드(행성 planets와 표본 planet_templates가 같이 쓴다) */
const planetShape = {
  /** 행성 ID = DB에서 칸을 (행성 ID, 셀 키)로 가리킬 때의 행성 ID (ADR 36) */
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  /** 면 레벨(행성 크기: 지구 = 9, 반지름 = 지구 ÷ 12 × 2^(면 레벨 − 9)). 생성기가 받는 범위만(PLANET_GENERATOR_FACE_LEVELS) */
  faceLevel: z.int().min(MIN_FACE_LEVEL).max(MAX_FACE_LEVEL),
  /** 생성 시드(u32) */
  seed: z.int().min(0).max(0xffff_ffff),
  /** 세계 설정 프리셋(기획 D-154) */
  presets: presetsSchema,
  /** 프리셋으로 정한 세부 수치를 덮어쓴다(편집기 슬라이더) */
  overrides: overridesSchema.optional(),
  /** 대륙 배치(선택). 없으면 노이즈 배치 */
  continents: continentsSchema.optional(),
  /**
   * 바이옴 표: 생성 결과의 바이옴 번호 = 이 배열의 위치. 바다·호수·육지 규칙이 하나씩은 있어야 생성된다
   * (참조가 풀린 뒤 validate/planets.ts가 본다)
   */
  biomes: z
    .array(ref("biomes"))
    .min(1)
    .max(255)
    .superRefine((list, context) => {
      const seen = new Set<string>();
      for (const item of list) {
        if (seen.has(item.id)) {
          context.addIssue({
            code: "custom",
            message: `바이옴 "${item.id}"가 두 번 있습니다. 바이옴 번호는 이 표의 위치라 한 번씩만 씁니다.`,
          });
          return;
        }
        seen.add(item.id);
      }
    }),
};

export const planetEntrySchema = z
  .strictObject(planetShape)
  .superRefine((planet, context) => checkTemperatures(planet, context));
export type PlanetEntry = z.output<typeof planetEntrySchema>;

/**
 * 행성 표본(planet_templates, ADR 2026-10-29-planet-editor-stage1 "행성 표본"): 편집기 [새 행성]의 시작점. 서버는 굽지 않는다
 * (서버가 굽는 것은 planets 분류뿐). 모양은 행성 항목과 같고(편집기가 그대로 작업 사본으로 쓴다), 목록에 보이는 한 줄 특징
 * (description)을 꼭 적는다
 */
export const planetTemplateEntrySchema = z
  .strictObject({ ...planetShape, description: localizedText })
  .superRefine((planet, context) => checkTemperatures(planet, context));
export type PlanetTemplateEntry = z.output<typeof planetTemplateEntrySchema>;

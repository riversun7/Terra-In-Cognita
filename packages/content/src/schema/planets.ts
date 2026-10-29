// 행성(planets)·바이옴(biomes) 분류 — ADR 2026-10-29-s2-planet-lod "행성 정의 (콘텐츠 팩)"
// 이름·범위는 @terra/shared planetDefinition(생성기와 같은 어휘)에서 가져온다. 프리셋 단계의 실제 수치는 생성기가 정한다.
// 지금 데이터는 S2 임시값이다(팩 placeholder: true). 바이옴 목록·기온·습도 범위는 기획 세션에 요청했다(ADR 36).
import {
  OCEAN_DEPTH_CLASSES,
  PLANET_GENERATOR_FACE_LEVELS,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_RANGES,
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

const overridesSchema = z
  .strictObject(overrideShape)
  .refine(
    (values) =>
      values.equatorTemperatureC === undefined ||
      values.poleTemperatureC === undefined ||
      values.poleTemperatureC <= values.equatorTemperatureC,
    {
      error: "극 기온(poleTemperatureC)이 적도 기온(equatorTemperatureC)보다 높습니다. 극 ≤ 적도로 고치세요.",
    },
  );

const [MIN_FACE_LEVEL, MAX_FACE_LEVEL] = PLANET_GENERATOR_FACE_LEVELS;

export const planetEntrySchema = z.strictObject({
  /** 행성 ID = DB에서 칸을 (행성 ID, 셀 키)로 가리킬 때의 행성 ID (ADR 36) */
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  /** 면 레벨(행성 크기: 지구 = 9, 반지름 = 지구 ÷ 12 × 2^(면 레벨 − 9)). 생성기 1판은 4~10만 받는다 */
  faceLevel: z.int().min(MIN_FACE_LEVEL).max(MAX_FACE_LEVEL),
  /** 생성 시드(u32) */
  seed: z.int().min(0).max(0xffff_ffff),
  /** 세계 설정 프리셋(기획 D-154) */
  presets: presetsSchema,
  /** 프리셋으로 정한 세부 수치를 덮어쓴다(편집기 슬라이더) */
  overrides: overridesSchema.optional(),
  /** 바이옴 표: 생성 결과의 바이옴 번호 = 이 배열의 위치. 바다·호수·육지 규칙이 하나씩은 있어야 생성된다 */
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
});
export type PlanetEntry = z.output<typeof planetEntrySchema>;

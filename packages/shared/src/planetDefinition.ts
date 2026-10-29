// 행성 정의의 공용 어휘 — 콘텐츠 팩(@terra/content 스키마)과 생성기(@terra/planet/generator)가 함께 쓴다
// (ADR 2026-10-29-s2-planet-lod "행성 정의"). 두 패키지는 서로를 가져올 수 없어서 이름·범위를 여기 한 곳에 둔다.
// - 프리셋 축과 단계 이름(기획 D-154): 단계가 어떤 수치가 되는지는 생성기(PLANET_PRESET_VALUES)가 정한다.
// - 세부 수치의 이름과 정수 범위: 프리셋으로 정한 값을 행성 정의의 overrides가 덮어쓴다.
// - 바이옴 규칙의 종류와 바다 수심 등급.
// 모든 수치는 S2 임시값이다(placeholder). 기온은 절대 °C다(기획 D-154).

/** 프리셋 축 → 단계 이름 (앞에서부터 작은 쪽) */
export const PLANET_PRESET_LEVELS = {
  /** 해수면: 군도·보통·대륙 */
  seaLevel: ["archipelago", "normal", "continent"],
  /** 기온: 추움·보통·더움 */
  temperature: ["cold", "normal", "hot"],
  /** 강수: 건조·보통·습윤 */
  precipitation: ["dry", "normal", "wet"],
  /** 산악도(행성 나이): 젊음·보통·늙음 */
  mountains: ["young", "normal", "old"],
  /** 판 개수: 적음·보통·많음 */
  plates: ["few", "normal", "many"],
  /** 화산: 적음·보통·많음 */
  volcanism: ["low", "normal", "high"],
} as const;

export type PlanetPresetAxis = keyof typeof PLANET_PRESET_LEVELS;
export type PlanetPresetLevel<A extends PlanetPresetAxis> = (typeof PLANET_PRESET_LEVELS)[A][number];
/** 축마다 고른 단계 */
export type PlanetPresets = { readonly [A in PlanetPresetAxis]: PlanetPresetLevel<A> };

/** 프리셋 축 이름(순서 고정) */
export const PLANET_PRESET_AXES = [
  "seaLevel",
  "temperature",
  "precipitation",
  "mountains",
  "plates",
  "volcanism",
] as const satisfies readonly PlanetPresetAxis[];

/** 타입 검사용: T가 true가 아니면 컴파일 오류 */
type ExpectTrue<T extends true> = T;
/** 축 목록이 PLANET_PRESET_LEVELS와 같은지 컴파일 때 본다(빠진 축이 있으면 타입 오류) */
export type PlanetPresetAxesComplete = ExpectTrue<
  [Exclude<PlanetPresetAxis, (typeof PLANET_PRESET_AXES)[number]>] extends [never] ? true : false
>;

/** 값이 그 축의 단계 이름인지 */
export function isPlanetPresetLevel<A extends PlanetPresetAxis>(
  axis: A,
  value: unknown,
): value is PlanetPresetLevel<A> {
  const levels: readonly unknown[] = PLANET_PRESET_LEVELS[axis];
  return levels.includes(value);
}

/** 세부 수치 이름 → 정수 범위 [최소, 최대] (둘 다 포함). 뜻과 단위는 생성기 presets.ts에 적는다 */
export const PLANET_SETTING_RANGES = {
  /** 육지 비율(%, 면적) — 해수면을 이 백분위로 정한다 */
  landPercent: [5, 95],
  /** 바다 밑 대륙 지각(대륙붕) 비율(%, 면적) — 대륙 지각 = 육지 + 이 값 */
  shelfPercent: [0, 40],
  /** 판 개수 */
  plateCount: [2, 64],
  /** 판 경계 산맥·해구 세기(%) */
  upliftPercent: [0, 300],
  /** 지형 기복(노이즈) 세기(%) */
  ruggednessPercent: [0, 300],
  /** 침식 세기(%) */
  erosionPercent: [0, 300],
  /** 열점(화산섬 사슬) 개수 */
  hotspotCount: [0, 64],
  /** 화산호·열점 높이(%) */
  volcanismPercent: [0, 300],
  /** 적도 해수면 연평균 기온(°C) */
  equatorTemperatureC: [-60, 60],
  /** 극 해수면 연평균 기온(°C). 적도 기온보다 높을 수 없다 */
  poleTemperatureC: [-90, 40],
  /** 강수 배율(%) */
  precipitationPercent: [0, 400],
  /** 강 밀도(%) — 클수록 작은 물줄기까지 강이 된다 */
  riverDensityPercent: [0, 400],
  /** 호수 보존(%) — 클수록 증발에 견디는 웅덩이가 호수로 남는다 */
  lakePercent: [0, 400],
} as const satisfies Readonly<Record<string, readonly [number, number]>>;

export type PlanetSettingKey = keyof typeof PLANET_SETTING_RANGES;
/** 풀어 쓴 세부 수치(모든 이름이 있다) */
export type PlanetSettings = { readonly [K in PlanetSettingKey]: number };
/** 덮어쓸 세부 수치(일부만) */
export type PlanetSettingOverrides = { readonly [K in PlanetSettingKey]?: number | undefined };

/** 세부 수치 이름(순서 고정) */
export const PLANET_SETTING_KEYS = [
  "landPercent",
  "shelfPercent",
  "plateCount",
  "upliftPercent",
  "ruggednessPercent",
  "erosionPercent",
  "hotspotCount",
  "volcanismPercent",
  "equatorTemperatureC",
  "poleTemperatureC",
  "precipitationPercent",
  "riverDensityPercent",
  "lakePercent",
] as const satisfies readonly PlanetSettingKey[];

/** 이름 목록이 PLANET_SETTING_RANGES와 같은지 컴파일 때 본다(빠진 이름이 있으면 타입 오류) */
export type PlanetSettingKeysComplete = ExpectTrue<
  [Exclude<PlanetSettingKey, (typeof PLANET_SETTING_KEYS)[number]>] extends [never] ? true : false
>;

/** 바다 수심 등급: 연안·대륙붕·심해 (생성 결과 water 바이트 4~5비트 = 1·2·3, 0은 바다 아님) */
export const OCEAN_DEPTH_CLASSES = ["coastal", "shelf", "deep"] as const;
export type OceanDepthClass = (typeof OCEAN_DEPTH_CLASSES)[number];

/** 바이옴 규칙 종류: 바다(수심 등급별), 호수, 육지(기온·습도·고도 조건) */
export const BIOME_RULE_KINDS = ["ocean", "lake", "land"] as const;
export type BiomeRuleKind = (typeof BIOME_RULE_KINDS)[number];

/**
 * 생성기가 받는 면 레벨 범위(출력 해상도). 격자 계약(4~14)보다 좁다: 레벨 10이 약 55초·최대 RSS 771MiB이고(개발 컨테이너
 * 측정), 레벨이 하나 오를 때마다 칸이 4배라 11부터는 서버 굽기에 너무 크다고 본다(추정, ADR 36 "구현하며 정한 것")
 */
export const PLANET_GENERATOR_FACE_LEVELS = [4, 10] as const;

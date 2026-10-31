// 바이옴 판정 설명(explainBiome) — 칸 하나가 왜 그 바이옴이 되었는지. ADR 38 7·12절(편집기 칸 정보창, D-214 정보창의 1단계)
// 저장 필드(물 비트·기온·습도·고도)와 바이옴 표만 읽는다. 생성기(surface.ts buildSurface)와 같은 차례로 다시 판정한다:
//   바다(물 비트 WATER_OCEAN) → 그 수심 등급의 첫 바다 규칙(없으면 첫 바다 규칙) → 호수(WATER_LAKE) → 첫 호수 규칙
//   → 육지: 표 순서대로 처음 맞는 육지 규칙, 없으면 마지막 육지 바이옴.
// 같은 표 정리(compileBiomes)와 같은 범위 확인(inRange)을 쓰므로 다시 판정한 바이옴은 저장 바이옴과 같다
// (생성기 다양성 고침도 "바이옴은 저장 필드만의 함수"를 지킨다. 시험: explain.test.ts가 모든 칸을 견준다).
// 근접 실패 눈금(기온 2°C, 습도 10, 실제 고도 100m)은 특수 지형 제안서와 같은 값이고 여기 한 곳에 둔다(ADR 38 7절).
import { OCEAN_DEPTH_CLASSES, type OceanDepthClass } from "@terra/shared";
import { compileBiomes, inRange, VERTICAL_SCALE } from "./surface.ts";
import { WATER_DEPTH_MASK, WATER_DEPTH_SHIFT, WATER_LAKE, WATER_OCEAN } from "../tiles/fields.ts";
import type { BiomeRange, PlanetBiome } from "./types.ts";

/** 육지 규칙 조건의 축: 연평균 기온(°C), 습도(0~255), 실제 환산 고도(m = 게임 m × 12) */
export type BiomeAxis = "temperatureC" | "humidity" | "realElevationM";

/** 조건 확인 차례(육지 규칙 조건을 보이는 차례) */
export const BIOME_AXES: readonly BiomeAxis[] = ["temperatureC", "humidity", "realElevationM"];

/** 근접 실패 눈금: 떨어진 조건의 경계까지 거리가 이 값 이하면 "아깝게 떨어짐"(기획 질문 7, 기술 제안값) */
export const BIOME_NEAR_MISS: Readonly<Record<BiomeAxis, number>> = {
  temperatureC: 2,
  humidity: 10,
  realElevationM: 100,
};

/** 판정에 쓰는 칸 값(생성 결과 PlanetFields의 같은 이름 필드) */
export interface BiomeCellInput {
  /** 물 비트(WATER_*, 4~5비트 수심 등급) */
  readonly water: number;
  /** 연평균 기온(°C, 저장 값) */
  readonly temperatureC: number;
  /** 습도(0~255, 저장 값) */
  readonly humidity: number;
  /** 고도(게임 m, 저장 값). 실제 환산은 × VERTICAL_SCALE */
  readonly elevationM: number;
}

/** 육지 규칙의 조건 하나 */
export interface BiomeConditionCheck {
  readonly axis: BiomeAxis;
  readonly value: number;
  /** 범위(min 포함, max 제외). 없는 쪽은 null */
  readonly min: number | null;
  readonly max: number | null;
  readonly pass: boolean;
  /** 떨어졌을 때 경계까지 거리(min − 값, 또는 값 − max. max는 포함하지 않아 경계 값이면 0). 통과면 0 */
  readonly miss: number;
  /** 아깝게 떨어짐: 떨어졌고 miss ≤ 눈금(BIOME_NEAR_MISS) */
  readonly near: boolean;
}

/** 육지 규칙 하나(표 순서) */
export interface BiomeRuleCheck {
  /** 바이옴 표 번호 */
  readonly index: number;
  readonly id: string;
  /** 규칙에 있는 조건만(BIOME_AXES 차례). 조건이 없는 규칙(마지막 육지 바이옴 등)은 빈 목록 = 늘 맞음 */
  readonly conditions: readonly BiomeConditionCheck[];
  readonly pass: boolean;
  /** 떨어졌고, 떨어진 조건이 모두 아깝게 떨어짐 */
  readonly near: boolean;
}

interface ExplanationBase {
  /** 다시 판정한 바이옴(표 번호) */
  readonly chosen: number;
  readonly chosenId: string | null;
  /** 저장 바이옴(넘겼을 때). 없으면 null */
  readonly stored: number | null;
  /** 저장 바이옴과 다시 판정한 것이 같은가(저장 바이옴을 넘기지 않았으면 null) */
  readonly matchesStored: boolean | null;
}

export type BiomeExplanation =
  | (ExplanationBase & {
      readonly kind: "ocean";
      /** 물 비트의 수심 등급(0이면 null) */
      readonly depthClass: OceanDepthClass | null;
      /** 그 등급의 바다 규칙이 표에 없어 첫 바다 규칙으로 떨어졌다 */
      readonly fellBack: boolean;
    })
  | (ExplanationBase & { readonly kind: "lake" })
  | (ExplanationBase & {
      readonly kind: "land";
      /** 판정에 쓴 실제 환산 고도(m) */
      readonly realElevationM: number;
      /** 육지 규칙 전부(표 순서). 처음 맞은 규칙 뒤의 규칙도 넣는다(아깝게 떨어진 것을 보이려고) */
      readonly rules: readonly BiomeRuleCheck[];
      /** 처음 맞은 규칙의 표 번호. 없으면 null */
      readonly matched: number | null;
      /** 맞은 규칙이 없어 마지막 육지 바이옴으로 떨어졌다 */
      readonly fellBack: boolean;
    });

function boundOf(range: BiomeRange | undefined, side: "min" | "max"): number | null {
  const value = range?.[side];
  return value === undefined ? null : value;
}

function checkCondition(axis: BiomeAxis, value: number, range: BiomeRange): BiomeConditionCheck {
  const min = boundOf(range, "min");
  const max = boundOf(range, "max");
  const pass = inRange(value, range);
  let miss = 0;
  if (!pass) {
    if (min !== null && value < min) miss = min - value;
    else if (max !== null) miss = value - max;
  }
  return { axis, value, min, max, pass, miss, near: !pass && miss <= BIOME_NEAR_MISS[axis] };
}

/** 육지 규칙 하나를 칸 값으로 확인한다 */
function checkRule(index: number, biome: PlanetBiome, values: Record<BiomeAxis, number>): BiomeRuleCheck {
  const { rule } = biome;
  const conditions: BiomeConditionCheck[] = [];
  if (rule.kind === "land") {
    for (const axis of BIOME_AXES) {
      const range = rule[axis];
      if (range) conditions.push(checkCondition(axis, values[axis], range));
    }
  }
  const failed = conditions.filter((condition) => !condition.pass);
  return {
    index,
    id: biome.id,
    conditions,
    pass: failed.length === 0,
    near: failed.length > 0 && failed.every((condition) => condition.near),
  };
}

function withStored(chosen: number, biomes: readonly PlanetBiome[], stored: number | undefined) {
  return {
    chosen,
    chosenId: biomes[chosen]?.id ?? null,
    stored: stored ?? null,
    matchesStored: stored === undefined ? null : stored === chosen,
  };
}

/**
 * 칸 하나의 바이옴 판정 설명. stored는 저장 바이옴(결과의 biome 값, 넘기면 같은지 본다).
 * 바이옴 표가 생성기가 받지 않는 모양이면(바다·호수·육지 규칙이 하나씩 없음 등) RangeError(compileBiomes)
 */
export function explainBiome(
  cell: BiomeCellInput,
  biomes: readonly PlanetBiome[],
  stored?: number,
): BiomeExplanation {
  const table = compileBiomes(biomes);
  if ((cell.water & WATER_OCEAN) !== 0) {
    const depth = (cell.water & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT;
    const depthClass = depth > 0 ? (OCEAN_DEPTH_CLASSES[depth - 1] ?? null) : null;
    // 생성기와 같은 길: 등급 → 번호 표(없는 등급은 첫 바다 규칙). 등급 0은 생성기가 내지 않는다(표의 0번 자리 = -1)
    const chosen = table.ocean[depth] ?? 0;
    const rule = biomes[chosen]?.rule;
    const fellBack = !(rule?.kind === "ocean" && rule.depthClass === depthClass);
    return { kind: "ocean", depthClass, fellBack, ...withStored(chosen, biomes, stored) };
  }
  if ((cell.water & WATER_LAKE) !== 0) {
    return { kind: "lake", ...withStored(table.lake, biomes, stored) };
  }
  const values: Record<BiomeAxis, number> = {
    temperatureC: cell.temperatureC,
    humidity: cell.humidity,
    realElevationM: cell.elevationM * VERTICAL_SCALE,
  };
  const rules = table.land.map(({ index, biome }) => checkRule(index, biome, values));
  const matched = rules.find((rule) => rule.pass)?.index ?? null;
  const chosen = matched ?? table.landFallback;
  return {
    kind: "land",
    realElevationM: values.realElevationM,
    rules,
    matched,
    fellBack: matched === null,
    ...withStored(chosen, biomes, stored),
  };
}

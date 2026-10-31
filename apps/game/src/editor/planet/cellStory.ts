// 칸 정보창의 쉬운 설명(순수) — 바이옴 판정 설명(explainBiome)에서 사람이 읽을 한두 문장의 재료를 고른다.
// 사용자 의견(2026-10-31): "칸을 눌러 나오는 설명은 사람이 보기에는 너무 날것의 데이터". 날것의 표는 [자세히 보기] 아래에 남긴다.
// - 육지: 처음 맞은 규칙과 그 규칙의 조건(정한 조건). 맞은 규칙이 없거나 조건 없는 규칙이면 "앞선 조건에 하나도 맞지 않음".
// - 아깝게 놓친 바이옴: 고른 규칙보다 앞에 있는 규칙만 본다(뒤 규칙은 맞아도 고른 규칙이 먼저라 결과가 같다).
//   떨어진 조건이 하나뿐인 규칙 중 눈금 대비 거리가 가장 작은 것. 그런 규칙이 없고 여러 조건으로 아깝게 떨어진 규칙만 있으면
//   그 규칙 이름만 알린다(바꿀 값을 하나로 말할 수 없어서).
// - 바꿀 양: min에서 떨어졌으면 경계까지 거리만큼 높게, max에서 떨어졌으면(max는 포함하지 않는다) 거리 + 저장 단위만큼 낮게.
//   저장 단위는 기온 1°C, 습도 1(0~255), 고도 게임 1m = 실제 12m. 화면이 습도를 %로 바꾼다.
import {
  BIOME_NEAR_MISS,
  type BiomeConditionCheck,
  type BiomeExplanation,
  VERTICAL_SCALE,
} from "@terra/planet/generator";
import type { OceanDepthClass } from "@terra/shared";

/** 조건 축마다 저장 값 한 단위(실제 환산 고도는 게임 m × 12) */
const STEP: Readonly<Record<BiomeConditionCheck["axis"], number>> = {
  temperatureC: 1,
  humidity: 1,
  realElevationM: VERTICAL_SCALE,
};

/** 아깝게 놓친 바이옴 하나 */
export type NearMiss =
  /** 조건 하나만 바꾸면 그 바이옴이었다 */
  | {
      readonly kind: "one";
      readonly biome: number;
      readonly condition: BiomeConditionCheck;
      readonly direction: "higher" | "lower";
      /** 바꿀 양(축 단위: °C, 습도 0~255, 실제 m) */
      readonly amount: number;
    }
  /** 여러 조건이 모두 아깝게 떨어졌다 */
  | { readonly kind: "many"; readonly biome: number };

export type CellStory =
  | { readonly kind: "ocean"; readonly biome: number; readonly depthClass: OceanDepthClass | null }
  | { readonly kind: "lake"; readonly biome: number }
  | {
      readonly kind: "land";
      readonly biome: number;
      /** 고른 규칙의 조건(정한 조건). 맞은 규칙이 없거나 조건 없는 규칙이면 null */
      readonly deciding: readonly BiomeConditionCheck[] | null;
      readonly nearMiss: NearMiss | null;
    };

/** 떨어진 조건 하나를 통과시키는 방향과 양 */
function change(condition: BiomeConditionCheck): { direction: "higher" | "lower"; amount: number } {
  if (condition.min !== null && condition.value < condition.min) {
    return { direction: "higher", amount: condition.miss };
  }
  return { direction: "lower", amount: condition.miss + STEP[condition.axis] };
}

export function cellStory(explanation: BiomeExplanation): CellStory {
  if (explanation.kind === "ocean") {
    return { kind: "ocean", biome: explanation.chosen, depthClass: explanation.depthClass };
  }
  if (explanation.kind === "lake") return { kind: "lake", biome: explanation.chosen };
  const position = explanation.rules.findIndex((rule) => rule.index === explanation.chosen);
  const before = position < 0 ? explanation.rules : explanation.rules.slice(0, position);
  const matched =
    explanation.matched === null
      ? null
      : (explanation.rules.find((rule) => rule.index === explanation.matched) ?? null);
  const deciding = matched && matched.conditions.length > 0 ? matched.conditions : null;
  let best: { score: number; miss: NearMiss } | null = null;
  let many: NearMiss | null = null;
  for (const rule of before) {
    if (!rule.near) continue;
    const failed = rule.conditions.filter((condition) => !condition.pass);
    const only = failed.length === 1 ? failed[0] : undefined;
    if (!only) {
      many ??= { kind: "many", biome: rule.index };
      continue;
    }
    const score = only.miss / BIOME_NEAR_MISS[only.axis];
    if (best === null || score < best.score) {
      best = { score, miss: { kind: "one", biome: rule.index, condition: only, ...change(only) } };
    }
  }
  return { kind: "land", biome: explanation.chosen, deciding, nearMiss: best?.miss ?? many };
}

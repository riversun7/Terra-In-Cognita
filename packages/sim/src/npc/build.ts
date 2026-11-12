// NPC 도시 증축 판단 — 기획 D-534(질문 1101 나 "NPC 증축은 유저와 같은 규칙", D-212), docs/adr/2026-11-11-city-building-layout.md
// "바뀜 (2026-11-12, NPC 증축)". 순수 함수다: 도시 하나의 필요(주거·식량·배후지 원자재 몫)와 지을 수 있는 시설 목록에서 다음에 지을 시설 하나를
// 고른다. 재료·짓는 시간·일꾼은 부르는 쪽(simulator/npcBuild.ts — 시뮬·서버 같은 실행)이 플레이어 짓기와 같은 식(@terra/shared/facilityBuild·
// facilityRuntime)으로 셈한다. 수치는 모두 [임시](설정 칸 npc_build_*, 질문 1141~).
// 점수(정수, 높은 것 하나 — 같으면 목록 앞):
// - 주거: 숙소 침대(숙소 수 × 레벨당 침대)가 휴먼보다 적으면 숙소. 700 + 모자란 숙소 × 20
// - 식량: 농장 목표 = ⌈휴먼 ÷ 농장 하나가 먹이는 휴먼⌉(생필품이 모자라면 + 1). 모자라면 농장. 600 + (1000 − 충족‰) ÷ 4
// - 배후지 원자재 몫(채집 시설): 그 시설 원자재의 땅 몫 × 받은 몫(‰)이 클수록 목표 수가 많다(1 + ⌊몫 × (상한 − 1) ÷ 1000⌋, 몫 0이면 0).
//   모자라면 300 + 몫 ÷ 5 + 상업 성향 ÷ 10. 땅을 모르면(배후지 없음) 이미 가진 채집 시설만 몫 500으로 친다
// - 생산 시설(농장·채집)은 일할 휴먼(경비대 빼고)이 지금 생산 시설 수보다 많을 때만(지은 건물마다 일꾼이 하나는 있게)
// - 도시 건물 수(행정 건물·성벽 빼고)가 상한이면 짓지 않는다. 상한 0 = 증축 끔
import type { NpcCoefficients } from "./coefficients.ts";
import type { Traits } from "./traits.ts";

/** 숙소 시설 ID(팩 content/core/facilities.json, 생활 단계) */
export const BUILD_LODGING = "lodging";
/** 농장 시설 ID(식량 사슬) */
export const BUILD_FARM = "farm";
/** 일꾼을 두는 단계(시뮬 cityPlan.ts PRODUCING_STAGES와 같다) */
export const BUILD_PRODUCING_STAGES: ReadonlySet<string> = new Set(["gather", "process", "parts", "finish"]);
/** 건물 수 상한에 세지 않는 단계(행정 건물·성벽 — 도시마다 정해진 것) */
export const BUILD_UNCOUNTED_STAGES: ReadonlySet<string> = new Set(["government", "defense"]);

/** 지을 수 있는 시설 하나(팩 차례) */
export interface BuildOption {
  readonly facility: string;
  readonly stage: string;
  /** 채집 시설이면 그 원자재 시설(배후지 몫을 보는 열쇠). 아니면 undefined */
  readonly gather: boolean;
}

/** 도시 하나의 필요 */
export interface CityBuildNeeds {
  /** 그 도시 휴먼(경비대 포함 — 숙소에서 쉰다) */
  readonly humans: number;
  /** 그 도시 일할 휴먼(경비대 빼고). 생산 시설(농장·채집)은 지은 뒤에도 생산 시설마다 한 명 넘게 남을 때만 짓는다(빈 건물을 짓지 않게) */
  readonly workers: number;
  /** 오늘 생필품 충족(‰, 모르면 1000) */
  readonly foodPm: number;
  /** 그 도시 시설 수(짓는 중 포함, 시설 ID → 수) */
  readonly counts: ReadonlyMap<string, number>;
  /** 채집 시설 → 배후지 몫(땅 몫 × 받은 몫 ÷ 1000, ‰). undefined = 땅을 모름 */
  readonly gatherPm?: ReadonlyMap<string, number> | undefined;
}

/** 숙소 레벨당 침대(설정 칸 lodging_beds_per_level)를 넘긴다 — 이 파일은 logistics 계수표를 모른다 */
export interface BuildChoiceRules {
  readonly bedsPerLevel: number;
}

/** 상한에 세는 건물 수 */
export function countedBuildings(
  counts: ReadonlyMap<string, number>,
  stageOf: (facility: string) => string | undefined,
): number {
  let total = 0;
  for (const [facility, n] of counts) if (!BUILD_UNCOUNTED_STAGES.has(stageOf(facility) ?? "")) total += n;
  return total;
}

const ceilDiv = (a: number, b: number): number => Math.ceil(Math.max(0, a) / Math.max(1, b));

/** 시설 하나의 점수(지을 까닭이 없으면 undefined) */
function scoreOf(
  option: BuildOption,
  needs: CityBuildNeeds,
  traits: Traits,
  c: NpcCoefficients,
  rules: BuildChoiceRules,
  producing: number,
): number | undefined {
  const have = needs.counts.get(option.facility) ?? 0;
  if (option.facility === BUILD_LODGING) {
    const want = ceilDiv(needs.humans, rules.bedsPerLevel);
    return have < want ? 700 + (want - have) * 20 : undefined;
  }
  if (BUILD_PRODUCING_STAGES.has(option.stage) && needs.workers <= producing) return undefined;
  const land = needs.gatherPm?.get(option.facility);
  if (option.facility === BUILD_FARM) {
    // 농사지을 땅이 없다고 아는데 농장이 이미 있으면 더 짓지 않는다(땅이 없는 도시도 농장 하나는 둔다 — 씨앗 규칙과 같다)
    if (land !== undefined && land <= 0 && have > 0) return undefined;
    const want = ceilDiv(needs.humans, c.buildFarmHumans) + (needs.foodPm < 1000 ? 1 : 0);
    if (have < want) return 600 + Math.floor((1000 - Math.min(1000, needs.foodPm)) / 4);
  }
  if (!option.gather) return undefined;
  const share = land ?? (have > 0 ? 500 : 0);
  const cap = Math.max(0, c.buildGatherMax);
  const want = share <= 0 || cap === 0 ? 0 : Math.min(cap, 1 + Math.floor((share * (cap - 1)) / 1000));
  return have < want ? 300 + Math.floor(share / 5) + Math.floor(traits.commerce / 10) : undefined;
}

/**
 * 다음에 지을 시설(없으면 undefined). options = 지을 수 있는 시설(팩 차례, 재료가 있는 것만), stageOf = 시설 단계(상한 셈)
 */
export function chooseCityBuild(
  needs: CityBuildNeeds,
  options: readonly BuildOption[],
  traits: Traits,
  c: NpcCoefficients,
  rules: BuildChoiceRules,
): string | undefined {
  const cap = Math.max(0, Math.trunc(c.buildMaxBuildings));
  if (cap === 0) return undefined;
  const stages = new Map(options.map((option) => [option.facility, option.stage]));
  if (countedBuildings(needs.counts, (facility) => stages.get(facility)) >= cap) return undefined;
  let producing = 0;
  for (const [facility, n] of needs.counts)
    if (BUILD_PRODUCING_STAGES.has(stages.get(facility) ?? "")) producing += n;
  let best: { facility: string; score: number } | undefined;
  for (const option of options) {
    if (BUILD_UNCOUNTED_STAGES.has(option.stage)) continue;
    const score = scoreOf(option, needs, traits, c, rules, producing);
    if (score !== undefined && (!best || score > best.score)) best = { facility: option.facility, score };
  }
  return best?.facility;
}

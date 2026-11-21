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
// 바뀜 (2026-11-12, 기획 D-535 — 질문 1142 다·1143 나·1146 나·1114 가):
// - 나라 성격(1142 다): 국가 프리셋 특산 줄(cityJobs)의 시설 수와 국력 등급 처음 시설 수 가운데 큰 값이 목표다(targets). 모자라면 650 + 모자란 수
//   × 10 — 건물이 없어 휴먼이 도시 직무로 돌리던 특산이 건물로 옮겨 간다. 채집 시설은 그 땅 몫이 0이라고 알면 짓지 않는다(특산은 도시 직무로 남는다)
// - 숙소: 침대가 휴먼보다 적거나 휴먼이 인구 상한에 닿았고 생필품이 넉넉하면(붐빔 — 숙소를 지어야 상한이 오른다, 1131 나) 숙소
// - 건물 수 상한 = 도시 등급(발전도 → 1~6, D-137) 표(설정 칸 npc_build_cap_l1~l6 [임시]), 전체 끝 npc_build_max_buildings(0 = 끔) — 1143 나.
//   기획 D-554 1187·D-572(질문 1995): 표는 바탕이고 세력·지도자 성향 몫(채)을 더한다. 붐빔 숙소 점수도 성향 몫(1188) — simulator/npcGrowthTemper.ts
// - 상한에 닿으면 레벨 올리기(1146 나, rankCityUpgrades): 숙소가 찼으면(붐빔) 가장 낮은 숙소, 아니면 일꾼이 가장 많은 생산 시설(같으면 낮은 레벨 →
//   ID 차례), 한 번에 한 레벨. 재료·시간은 플레이어 레벨업과 같은 식(팩 buildCostAt·buildTimeAt, 부르는 쪽)
// - 수리(1114 가, chooseCityRepair): 상태가 문턱(설정 칸 npc_build_repair_below_pm [임시]) 아래인 시설을 가장 낮은 것부터 가득까지 — 짓기·레벨
//   올리기보다 먼저. 전투에서 부서진 성벽·건물의 수리 재료가 그 도시를 지키는 값이 된다
// 바뀜 (npc-invest-2, 질문 2508 나 — D-586·D-587 8 NPC 투자 판단): rules.invest가 있으면 짓기 후보마다 재료 값(지난 값, 국고 화폐)을 국고에 견준
// 비용 몫을 점수에서 빼고(npc/invest.ts investCostPenalty), 수요 없이 앞서 가는 후보(이미 하나 있는 채집 시설을 더 짓기 — 배후지 몫이 기대 수익일
// 뿐 지금 모자란 것이 아니다)는 도전 굴림(investGate — 성향 배율 = 상업 성향)을 넘을 때만 둔다. 주거·식량·나라 목표·첫 채집 시설은 수요라 굴리지
// 않는다. 레벨 올리기의 문은 부르는 쪽(simulator/npcBuild.ts — upgradeDemand)이 같은 함수로 연다
// 바뀜 (npc-fix-3, 질문 2566 나 + 다 — D-587 8 "재료나 소모비용, 기대 수익"): rules.invest.returnOf가 있으면 후보마다 하루 기대 산출 값·유지비(일꾼 임금)로
// 기대 수익 몫(npc/invest.ts investReturnPm)을 셈해 0 아래면 점수에서 빼고(investReturnPenalty), 수요 없는 후보는 경제 이득(하루 값 > 유지비, 몫 ≥ 문턱)이 있을 때만 도전 굴림까지 간다
import type { NpcCoefficients } from "./coefficients.ts";
import { type InvestReturn, investCostPenalty, investGate, investReturnPenalty } from "./invest.ts";
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
  /** 나라 성격 목표(시설 ID → 수, 1142 다 — 특산 줄·국력 등급 처음 시설). 없으면 목표 없음 */
  readonly targets?: ReadonlyMap<string, number> | undefined;
  /** 그 도시 숙소 침대 합(쉼터 자리). 없으면 숙소 수 × 레벨당 침대 */
  readonly beds?: number | undefined;
  /** 그 도시 인구 상한(society/logistics.ts cityHousingCap). 휴먼이 닿으면 숙소를 짓는다. 없으면 보지 않는다 */
  readonly housingCap?: number | undefined;
}

/** 숙소 레벨당 침대(설정 칸 lodging_beds_per_level)를 넘긴다 — 이 파일은 logistics 계수표를 모른다 */
export interface BuildChoiceRules {
  readonly bedsPerLevel: number;
  /**
   * 붐빔 숙소 점수(700)에 더하는 성향 몫(기획 D-554 1188·D-572 질문 1995 — simulator/npcGrowthTemper.ts: 신앙이 높으면 +, 상업이 높으면 −).
   * 없으면 0(옛 판)
   */
  readonly lodgingTilt?: number | undefined;
  /** 이 도시의 건물 수 상한(buildingCapOf — 도시 등급). 없으면 설정 칸 npc_build_max_buildings */
  readonly cap?: number | undefined;
  /** 재료를 구할 길이 없는 시설(고르지 않는다 — 다음 점수의 시설을 고른다). 없으면 모두 고를 수 있다 */
  readonly blocked?: ReadonlySet<string> | undefined;
  /** 투자 판단(위 바뀜 npc-invest-2). 없으면 옛 판(비용·도전을 보지 않는다) */
  readonly invest?: BuildInvest | undefined;
}

/** 짓기 투자 판단 입력(npc/invest.ts) */
export interface BuildInvest {
  /** 시설 레벨 1 재료 값(국고 화폐 최소 단위, 지난 값). 모르면 0 */
  costOf(facility: string): bigint;
  /** 국고 */
  readonly capital: bigint;
  /** 도전 굴림(0 이상 정수) */
  readonly roll: number;
  /** 성향 배율(‰ — investTemperPm(상업 성향)) */
  readonly temperPm: number;
  /**
   * 레벨 1 시설의 하루 기대 수익 입력(npc-fix-3, 질문 2566 — simulator/npcReturn.ts facilityReturn: 일꾼 자리만큼의 산출 값 − 먹는 재료, 일꾼 임금).
   * 산출이 없는 시설(숙소)이면 undefined. 없으면 옛 판(기대 수익을 보지 않는다)
   */
  returnOf?(facility: string): InvestReturn | undefined;
}

/** 붐빔 숙소 점수를 성향으로 내리는 끝(농장 600·채집보다 위, 나라 목표 650 + 10 × 모자란 수와 다툰다) */
const LODGING_TILT_FLOOR = -90;

/** 도시 등급 수(D-137, @terra/shared/territory CITY_GRADE_COUNT와 같다) */
const GRADES = 6;

/**
 * 도시 등급(1~6)의 건물 수 상한(1143 나): 등급 표(npc_build_cap_l1~l6) 값, 전체 끝 npc_build_max_buildings. 전체 끝이 0이면 0(증축·레벨 올리기
 * 끔). 표가 비었으면 전체 끝. temperDelta = 세력·지도자 성향 몫(채, 기획 D-554 1187·D-572 질문 1995 — simulator/npcGrowthTemper.ts)을 표 값에
 * 더한다(전체 끝 위는 자른다). 표 값이 1 이상이면 성향 몫을 더해도 1 아래로 내려가지 않는다(misc-574 — 옛 꼴은 0까지 내려가 그 도시 짓기가 멈췄다)
 */
export function buildingCapOf(grade: number, c: NpcCoefficients, temperDelta = 0): number {
  const top = Math.max(0, Math.trunc(c.buildMaxBuildings));
  if (top === 0) return 0;
  const index = Math.min(GRADES, Math.max(1, Math.trunc(grade))) - 1;
  const table = c.buildCapByGrade ?? [];
  const value = table[Math.min(index, table.length - 1)];
  if (value === undefined) return top;
  // 성향 몫으로 0 이하가 되어도 1(misc-574 — D-554 "다양한 변수로 조정"이지 멈춤이 아니다). 표 값 자체가 0 이하면 그대로 0(설정으로 끈 등급)
  const base = Math.trunc(value);
  const sum = base + Math.trunc(temperDelta);
  return Math.min(top, sum > 0 ? sum : base > 0 ? 1 : 0);
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

/** 수요가 있는 후보 점수(undefined면 후보 아님) */
const demand = (score: number | undefined) => (score === undefined ? undefined : { score, demand: true });

/** 시설 하나의 점수와 수요(지을 까닭이 없으면 undefined). demand = 지금 모자란 것(거짓이면 앞서 가는 투자 — 위 바뀜 npc-invest-2) */
function scoreOf(
  option: BuildOption,
  needs: CityBuildNeeds,
  traits: Traits,
  c: NpcCoefficients,
  rules: BuildChoiceRules,
  producing: number,
): { readonly score: number; readonly demand: boolean } | undefined {
  const have = needs.counts.get(option.facility) ?? 0;
  if (option.facility === BUILD_LODGING) {
    const beds = needs.beds ?? have * Math.max(1, rules.bedsPerLevel);
    if (beds < needs.humans) return demand(700 + ceilDiv(needs.humans - beds, rules.bedsPerLevel) * 20);
    // 붐빔(1131 나): 씨앗 숙소는 주거 몫이라 상한을 올리지 않는다 → 상한에 닿으면 숙소를 더 지어야 자란다. 생필품이 모자란 도시는 늘리지 않는다
    // 성향 몫(D-554 1188, D-572 질문 1995·2127 — 세력 평균으로 중립이 되게): + = 생필품이 조금 모자라도(1000 − 몫 ÷ 2‰ 이상) 붐빔 숙소를
    // 짓는다, − = 붐빔 숙소 점수를 내려 나라 목표(650 + 10 × 모자란 수) 뒤로 보낸다(LODGING_TILT_FLOOR까지). 처음 판(점수에 몫을 그대로 더함)은
    // 700이 이미 가장 높은 점수라 +는 차례를 바꾸지 못하고 −만 농장·채집 뒤로까지 밀어 도시가 한쪽으로 줄었다(build16 30일 휴먼 −14%)
    const tilt = Math.trunc(rules.lodgingTilt ?? 0);
    const foodNeed = 1000 - Math.trunc(Math.max(0, tilt) / 2);
    return needs.housingCap !== undefined && needs.humans >= needs.housingCap && needs.foodPm >= foodNeed
      ? demand(700 + Math.max(LODGING_TILT_FLOOR, Math.min(0, tilt)))
      : undefined;
  }
  if (BUILD_PRODUCING_STAGES.has(option.stage) && needs.workers <= producing) return undefined;
  const land = needs.gatherPm?.get(option.facility);
  // 나라 성격 목표(1142 다): 특산 줄·국력 등급 처음 시설
  const target = needs.targets?.get(option.facility) ?? 0;
  if (have < target && !(option.gather && land !== undefined && land <= 0))
    return demand(650 + (target - have) * 10);
  if (option.facility === BUILD_FARM) {
    // 농사지을 땅이 없다고 아는데 농장이 이미 있으면 더 짓지 않는다(땅이 없는 도시도 농장 하나는 둔다 — 씨앗 규칙과 같다)
    if (land !== undefined && land <= 0 && have > 0) return undefined;
    const want = ceilDiv(needs.humans, c.buildFarmHumans) + (needs.foodPm < 1000 ? 1 : 0);
    if (have < want) return demand(600 + Math.floor((1000 - Math.min(1000, needs.foodPm)) / 4));
  }
  if (!option.gather) return undefined;
  const share = land ?? (have > 0 ? 500 : 0);
  const cap = Math.max(0, c.buildGatherMax);
  const want = share <= 0 || cap === 0 ? 0 : Math.min(cap, 1 + Math.floor((share * (cap - 1)) / 1000));
  // 첫 채집 시설은 수요(그 땅의 원자재를 아직 하나도 캐지 않는다), 더 짓기는 앞서 가는 투자(배후지 몫 = 기대 수익)
  return have < want
    ? { score: 300 + Math.floor(share / 5) + Math.floor(traits.commerce / 10), demand: have === 0 }
    : undefined;
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
  const cap = Math.max(0, Math.trunc(rules.cap ?? c.buildMaxBuildings));
  if (cap === 0) return undefined;
  const stages = new Map(options.map((option) => [option.facility, option.stage]));
  if (countedBuildings(needs.counts, (facility) => stages.get(facility)) >= cap) return undefined;
  let producing = 0;
  for (const [facility, n] of needs.counts)
    if (BUILD_PRODUCING_STAGES.has(stages.get(facility) ?? "")) producing += n;
  let best: { facility: string; score: number } | undefined;
  for (const option of options) {
    if (BUILD_UNCOUNTED_STAGES.has(option.stage) || rules.blocked?.has(option.facility) === true) continue;
    const scored = scoreOf(option, needs, traits, c, rules, producing);
    if (scored === undefined) continue;
    let score = scored.score;
    const invest = rules.invest;
    if (invest) {
      const cost = invest.costOf(option.facility);
      const ret = invest.returnOf?.(option.facility);
      if (!investGate(cost, invest.capital, scored.demand, invest.roll, invest.temperPm, c, ret)) continue;
      score -= investCostPenalty(cost, invest.capital, c);
      // 기대 수익(npc-fix-3, 질문 2566 나): 회수 기간 안에 값을 못 돌려받는 시설(유지비·먹는 재료가 산출보다 큼 등)은 그만큼 점수가 내려간다
      if (ret) score -= investReturnPenalty(cost, ret, c);
    }
    if (!best || score > best.score) best = { facility: option.facility, score };
  }
  return best?.facility;
}

/** 그 도시에 다 지은 시설 하나(레벨 올리기·수리 후보) */
export interface SiteFacility {
  /** 실행 자리의 열쇠(시뮬 = 경제 시설 ID, 서버 = 건물 ID) */
  readonly key: number;
  readonly facility: string;
  readonly level: number;
  /** 지금 일꾼 수(도시 경제) */
  readonly workers: number;
  /** 상태(ppm, 가득 1,000,000 — @terra/shared/facilityRuntime). 모르면 undefined(시뮬 — 수리하지 않는다) */
  readonly conditionPpm?: number | undefined;
  /** 붙은 면적 모듈 수(건물 채집소, 기획 D-567·D-569 1768). 없으면 0 */
  readonly plots?: number | undefined;
}

/**
 * 면적 모듈을 붙일 건물 채집소(기획 D-569 1768 "NPC도 모듈", D-212): 다 지었고 일꾼이 있는 선택 방식 채집 시설 가운데 붙은 모듈이 자리 수보다
 * 적은 것을 모듈이 적은 차례(같으면 열쇠 차례)로 첫째. slotsOf = 그 시설·레벨의 자리 수(선택 방식이 아니면 0). 없으면 undefined
 */
export function chooseCityPlot(
  facilities: readonly SiteFacility[],
  slotsOf: (facility: string, level: number) => number,
): SiteFacility | undefined {
  let best: SiteFacility | undefined;
  for (const entry of facilities) {
    const plots = entry.plots ?? 0;
    if (entry.level < 1 || entry.workers <= 0 || plots >= slotsOf(entry.facility, entry.level)) continue;
    if (!best || plots < (best.plots ?? 0) || (plots === (best.plots ?? 0) && entry.key < best.key))
      best = entry;
  }
  return best;
}

/** 레벨 올리기에 쓰는 시설 몫 */
export interface UpgradeSpec {
  readonly stage: string;
  readonly maxLevel: number;
}

/**
 * 건물 수 상한에 닿은 도시의 레벨 올리기 후보(1146 나, 앞이 먼저): 짓기 재료 표가 있고 레벨 상한 아래인 다 지은 시설 가운데(행정 건물·성벽 빼고)
 * 휴먼이 인구 상한에 닿았으면(붐빔) 숙소를 낮은 레벨 차례로 맨 앞에, 그다음 생산 시설을 일꾼 많은 차례(같으면 낮은 레벨 → 열쇠 차례). 부르는 쪽은
 * 재료를 구할 수 있는 첫 후보를 올린다(세계 어느 시설도 내지 않는 재료가 드는 시설은 건너뛴다)
 */
export function rankCityUpgrades(
  facilities: readonly SiteFacility[],
  needs: Pick<CityBuildNeeds, "humans" | "housingCap">,
  specOf: (facility: string) => UpgradeSpec | undefined,
): SiteFacility[] {
  const open = facilities.filter((entry) => {
    const spec = specOf(entry.facility);
    return (
      spec !== undefined &&
      !BUILD_UNCOUNTED_STAGES.has(spec.stage) &&
      entry.level >= 1 &&
      entry.level < spec.maxLevel
    );
  });
  const byLevel = (a: SiteFacility, b: SiteFacility) => a.level - b.level || a.key - b.key;
  const crowded = needs.housingCap !== undefined && needs.humans >= needs.housingCap;
  const lodgings = crowded ? open.filter((entry) => entry.facility === BUILD_LODGING).toSorted(byLevel) : [];
  const producing = open
    .filter((entry) => BUILD_PRODUCING_STAGES.has(specOf(entry.facility)?.stage ?? ""))
    .toSorted((a, b) => b.workers - a.workers || byLevel(a, b));
  return [...lodgings, ...producing];
}

/**
 * 레벨 올리기의 수요(npc-invest-2, 질문 2508 나): 붐빈 도시의 숙소(주거가 모자람). 생산 시설은 늘어날 일꾼 자리를 채울 사람이 있을 때(일꾼이 지금 자리
 * (레벨 × 레벨당 자리)를 다 채웠거나 그 도시에 일 없는 휴먼이 있다 — 기대 수익), 또는 그 도시가 이미 다다른 레벨까지 올릴 때(topLevel — 이미 아는 단계).
 * 그 밖(그 도시에서 처음 다다르는 레벨, 자리가 남고 채울 사람도 없음)은 앞서 가는 도전이라 부르는 쪽이 도전 굴림을 넘을 때만 올린다 — 높은 레벨일수록
 * 재료 값이 커서 덜 넘는다(D-586 "좋을수록 투자 비용이 높다"·D-587 8 "자본이 많으면 도전 확률 증가")
 */
export function upgradeDemand(
  entry: SiteFacility,
  slotsPerLevel: number,
  crowded: boolean,
  idle = 0,
  topLevel = 0,
): boolean {
  if (entry.facility === BUILD_LODGING) return crowded;
  if (idle > 0 || entry.level + 1 <= topLevel) return true;
  return entry.workers >= Math.max(1, Math.trunc(slotsPerLevel)) * Math.max(1, entry.level);
}

/** 수리할 시설(1114 가): 상태가 문턱(‰) 아래인 것 가운데 가장 낮은 것(같으면 열쇠 차례). 문턱 0 = 수리 끔 */
export function chooseCityRepair(
  facilities: readonly SiteFacility[],
  belowPm: number,
): SiteFacility | undefined {
  const floor = Math.max(0, Math.trunc(belowPm)) * 1000;
  if (floor === 0) return undefined;
  return facilities
    .filter((entry) => entry.level >= 1 && entry.conditionPpm !== undefined && entry.conditionPpm < floor)
    .toSorted((a, b) => (a.conditionPpm ?? 0) - (b.conditionPpm ?? 0) || a.key - b.key)[0];
}

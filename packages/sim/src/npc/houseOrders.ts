// 가문 일 지시(상태 점검 → 깃발 → 일꾼 차례) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (가문 일 지시)"
// 가문장은 긴 주기로 전체를 다시 정하지 않는다. 가문 집계 값(식사 몫·만족도·불복 수)을 가볍게 점검해 깃발을 세우고, 바뀐 가문이 있는 도시만
// 일꾼 차례를 다시 짠다(사용자 방향 2026-11-21 "상태체크를 돌려서 간단하게 체크하여 부하를 줄이고, 부족한 부분만 재판단").
// - 일꾼 차례: 도시 시설 일꾼 자리를 누가 채우나. 예전에는 유닛 ID 차례였다. 이제 가문마다 가문장이 따르는 가문원을 근로 의욕 차례로 내고
//   (가문끼리는 한 사람씩 돌아가며), 가문이 없는 휴먼은 도시가 그 뒤에 불러 넣는다(징발 — 지시 없는 유닛).
// - 불복: 복종도(2차 지수)가 문턱 아래인 가문원은 그날 한 번 굴려(기회당 1회, 매 틱 굴림 없음) 지시를 따르지 않는다. 불복한 유닛은 일꾼 자리를
//   받지 않고 도시도 부르지 않는다(지시는 있다 — 태업). 그만큼 그 도시의 일손이 준다.
// 판단은 2차 지수(unitDrives.ts)만 읽는다. 정수만 쓴다. 문턱은 설정 칸(npc_ai_house_* — houseOrderRulesFromAi), 출발값은 [임시].
import type { UnitTraits } from "@terra/shared/unitTraits";
import { mix32 } from "../math/hash.ts";
import type { NpcAiCoefficients } from "./aiCoefficients.ts";

/** 가문원 하나(2차 지수 + 욕구) */
export interface LaborMember {
  readonly unitId: number;
  /** 근로 의욕(0~1000) */
  readonly workPm: number;
  /** 복종도(0~1000) */
  readonly obediencePm: number;
  /** 그날 받은 생필품 몫(‰). null = 모름 */
  readonly fedPm: number | null;
  /** 만족도(밀리점). null = 아직 세지 않음 */
  readonly satisfactionMilli: number | null;
}

export interface LaborHouse {
  readonly houseId: number;
  readonly members: readonly LaborMember[];
}

/** [임시] 문턱 */
export interface HouseOrderRules {
  /** 이 몫(‰) 아래로 받은 가문원을 "못 먹음"으로 센다 */
  readonly unfedBelowPm: number;
  /** 못 먹은 가문원 몫(‰)이 이 이상이면 식량 부족 깃발 */
  readonly foodShortSharePm: number;
  /** 가문 평균 만족도(점)가 이 아래면 사기 낮음 깃발 */
  readonly moraleLowBelow: number;
  /** 복종도가 이 아래면 불복할 수 있다: 불복 확률(‰) = 이 값 − 복종도 */
  readonly refuseBelowPm: number;
  /** 가문세: 가문원이 그날 받은 임금에서 가문 금고로 가는 몫(‰) */
  readonly houseTaxPm: number;
  /** 돌봄에 쓰는 금고 몫(‰)의 바닥·꼭대기 — 가문장 성향이 그 사이를 정한다(houseCarePm) */
  readonly careMinPm: number;
  readonly careMaxPm: number;
}

/** 계수표 → 가문 일 지시·금고 규칙 */
export const houseOrderRulesFromAi = (
  c: Pick<
    NpcAiCoefficients,
    | "houseUnfedBelowPm"
    | "houseFoodShortSharePm"
    | "houseMoraleLowBelow"
    | "houseRefuseBelowPm"
    | "houseTaxPm"
    | "houseCareMinPm"
    | "houseCareMaxPm"
  >,
): HouseOrderRules => ({
  unfedBelowPm: c.houseUnfedBelowPm,
  foodShortSharePm: c.houseFoodShortSharePm,
  moraleLowBelow: c.houseMoraleLowBelow,
  refuseBelowPm: c.houseRefuseBelowPm,
  houseTaxPm: c.houseTaxPm,
  careMinPm: c.houseCareMinPm,
  careMaxPm: c.houseCareMaxPm,
});

export const START_HOUSE_ORDER_RULES: HouseOrderRules = {
  unfedBelowPm: 500,
  foodShortSharePm: 300,
  moraleLowBelow: 45,
  refuseBelowPm: 600,
  houseTaxPm: 100,
  careMinPm: 100,
  careMaxPm: 900,
};

/** 가문 집계 값(가벼운 점검이 보는 것) */
export interface HouseStatus {
  readonly members: number;
  /** 못 먹은 가문원 수 */
  readonly unfed: number;
  /** 평균 식사 몫(‰, 모르는 사람은 가득) */
  readonly avgFedPm: number;
  /** 평균 만족도(점, 세지 않은 사람은 뺀다. 아무도 없으면 null) */
  readonly avgSatisfaction: number | null;
  /** 복종도가 불복 문턱 아래인 가문원 수 */
  readonly sullen: number;
}

export const HOUSE_FLAGS = ["food_short", "morale_low", "unruly"] as const;

export type HouseFlag = (typeof HOUSE_FLAGS)[number];

/** 가문 집계(가문원 한 번 훑기) */
export function houseStatusOf(
  members: readonly LaborMember[],
  rules: HouseOrderRules = START_HOUSE_ORDER_RULES,
): HouseStatus {
  let unfed = 0;
  let fedSum = 0;
  let satSum = 0;
  let satCount = 0;
  let sullen = 0;
  for (const member of members) {
    const fed = member.fedPm ?? 1000;
    fedSum += fed;
    if (fed < rules.unfedBelowPm) unfed += 1;
    if (member.satisfactionMilli !== null) {
      satSum += Math.floor(member.satisfactionMilli / 1000);
      satCount += 1;
    }
    if (member.obediencePm < rules.refuseBelowPm) sullen += 1;
  }
  return {
    members: members.length,
    unfed,
    avgFedPm: members.length === 0 ? 1000 : Math.floor(fedSum / members.length),
    avgSatisfaction: satCount === 0 ? null : Math.floor(satSum / satCount),
    sullen,
  };
}

/** 깃발(부족한 곳): 집계 값을 문턱과 견주기만 한다 */
export function houseFlagsOf(
  status: HouseStatus,
  rules: HouseOrderRules = START_HOUSE_ORDER_RULES,
): HouseFlag[] {
  const flags: HouseFlag[] = [];
  if (status.members === 0) return flags;
  if (status.unfed * 1000 >= status.members * rules.foodShortSharePm) flags.push("food_short");
  if (status.avgSatisfaction !== null && status.avgSatisfaction < rules.moraleLowBelow)
    flags.push("morale_low");
  if (status.sullen * 2 >= status.members) flags.push("unruly");
  return flags;
}

/** 점검 결과를 한 글자열로(지난 점검과 같으면 다시 짜지 않는다) */
export function houseCheckKey(house: LaborHouse, rules: HouseOrderRules = START_HOUSE_ORDER_RULES): string {
  const flags = houseFlagsOf(houseStatusOf(house.members, rules), rules);
  return `${house.members.length}:${flags.join(",")}`;
}

/** 그 가문원이 그날 지시를 따르지 않나(하루에 한 번 굴림 — 유닛·날·시드로 정해진다) */
export function refusesOrder(
  member: Pick<LaborMember, "unitId" | "obediencePm">,
  day: number,
  seed: number,
  rules: HouseOrderRules = START_HOUSE_ORDER_RULES,
): boolean {
  const chancePm = Math.max(0, Math.min(1000, rules.refuseBelowPm - Math.trunc(member.obediencePm)));
  if (chancePm === 0) return false;
  const roll =
    (mix32(seed ^ Math.imul(member.unitId, 0x9e37_79b1) ^ Math.imul(day + 1, 0x85eb_ca6b)) >>> 0) % 1000;
  return roll < chancePm;
}

/** 한 도시의 일 계획 */
export interface CityLaborPlan {
  /** 일꾼 자리를 채우는 차례(유닛 ID): 가문 지시를 따르는 가문원(가문끼리 돌아가며) → 도시가 부른 가문 없는 휴먼 */
  readonly order: readonly number[];
  /** 지시를 따르지 않은 가문원(일꾼 자리도 징발도 받지 않는다) */
  readonly refused: readonly number[];
  /** 도시가 부른 가문 없는 휴먼(order의 뒤쪽) */
  readonly drafted: readonly number[];
  /** 가문 ID → 집계·깃발 */
  readonly houses: ReadonlyMap<
    number,
    { readonly status: HouseStatus; readonly flags: readonly HouseFlag[] }
  >;
}

/**
 * 한 도시의 일 계획(결정적). houses = 그 도시에 사는 가문원으로 추린 가문(경비대 제외), unhoused = 가문 없는 휴먼(경비대 제외).
 * - 가문 안 차례: 근로 의욕 높은 차례(같으면 유닛 ID). 사기 낮음 깃발이 선 가문은 못 먹은 가문원을 뒤로 돌린다(쉬게 둔다).
 * - 가문끼리: 가문 ID 차례로 한 사람씩 돌아가며(자리가 모자랄 때 한 가문이 다 차지하지 않게).
 */
export function planCityLabor(input: {
  readonly houses: readonly LaborHouse[];
  readonly unhoused: readonly LaborMember[];
  readonly day: number;
  readonly seed: number;
  readonly rules?: HouseOrderRules | undefined;
}): CityLaborPlan {
  const rules = input.rules ?? START_HOUSE_ORDER_RULES;
  const refused: number[] = [];
  const houses = new Map<number, { status: HouseStatus; flags: HouseFlag[] }>();
  const queues: number[][] = [];
  for (const house of input.houses.toSorted((a, b) => a.houseId - b.houseId)) {
    const status = houseStatusOf(house.members, rules);
    const flags = houseFlagsOf(status, rules);
    houses.set(house.houseId, { status, flags });
    const spare = flags.includes("morale_low");
    const willing: LaborMember[] = [];
    for (const member of house.members) {
      if (refusesOrder(member, input.day, input.seed, rules)) refused.push(member.unitId);
      else willing.push(member);
    }
    const rested = (member: LaborMember): number =>
      spare && (member.fedPm ?? 1000) < rules.unfedBelowPm ? 1 : 0;
    queues.push(
      willing
        .toSorted((a, b) => rested(a) - rested(b) || b.workPm - a.workPm || a.unitId - b.unitId)
        .map((member) => member.unitId),
    );
  }
  const order: number[] = [];
  for (let round = 0; ; round++) {
    let any = false;
    for (const queue of queues) {
      const unitId = queue[round];
      if (unitId === undefined) continue;
      order.push(unitId);
      any = true;
    }
    if (!any) break;
  }
  const drafted = input.unhoused.map((member) => member.unitId).toSorted((a, b) => a - b);
  return { order: [...order, ...drafted], refused: refused.toSorted((a, b) => a - b), drafted, houses };
}

/** 가문세(그날 받은 임금 → 가문 금고): 내림 */
export function houseTaxOf(paid: bigint, rules: HouseOrderRules = START_HOUSE_ORDER_RULES): bigint {
  if (paid <= 0n) return 0n;
  return (paid * BigInt(Math.max(0, Math.min(1000, Math.trunc(rules.houseTaxPm))))) / 1000n;
}

/**
 * 가문장의 돌봄 몫(금고의 ‰): 공동체 성향이 높을수록 많이 풀고 이윤 성향이 높을수록 쥐고 있는다(가운데 성향 = 바닥과 꼭대기의 가운데쯤).
 * 가문장 성향을 모르면 가운데
 */
export function houseCarePm(
  head: Pick<UnitTraits, "communalism" | "greed"> | undefined,
  rules: HouseOrderRules = START_HOUSE_ORDER_RULES,
): number {
  const lo = Math.min(rules.careMinPm, rules.careMaxPm);
  const hi = Math.max(rules.careMinPm, rules.careMaxPm);
  // 기울기(0~1000): 공동체 6 : (1000 − 이윤) 4
  const tilt = head ? Math.floor((head.communalism * 6 + (1000 - head.greed) * 4) / 10) : 500;
  return lo + Math.floor(((hi - lo) * Math.max(0, Math.min(1000, tilt))) / 1000);
}

/**
 * 돌봄 배당 한 사람 몫: 금고 × 돌봄 몫을 돌볼 가문원에게 똑같이, 한 사람 몫은 하루 임금(cap)을 넘지 않는다. 돌볼 사람이 없거나 금고가 비면 0
 */
export function houseCareShare(vault: bigint, carePm: number, needy: number, cap: bigint): bigint {
  if (vault <= 0n || needy <= 0 || cap <= 0n) return 0n;
  const pool = (vault * BigInt(Math.max(0, Math.min(1000, Math.trunc(carePm))))) / 1000n;
  const each = pool / BigInt(needy);
  return each > cap ? cap : each;
}

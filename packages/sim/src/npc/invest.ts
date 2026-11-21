// NPC 투자 판단(경제 이득 · 자본 → 도전 확률) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (2026-11-22, D-587 연맹 바로잡기·NPC 투자 판단)"
// 사용자 답(D-587, 질문 2465): NPC는 경제적 이득이 있을 때 투자한다(재료·소모 비용, 기대 수익, 수요). 도시·나라는 군사력을 키우려고 투자한다.
// 자본이 많을수록 도전하는 시도(높은 기술, 좋은 아이템·스킬)의 확률이 높다. D-586의 "세력 확장이다 …"는 이 NPC 투자 판단을 두고 한 말이다(연맹이 아니다).
// 틀은 D-323(46 §9.1): 상태 지표 → 후보 점수(성향 가중) → 규칙식. 여기서는 판단 틀이 쓰는 두 규칙식만 둔다.
// - 비용 몫: 값 ÷ 자본(‰, 0~1000). 점수에서 비용 몫 × 가중치 ÷ 1000을 뺀다(자본에 견줘 비쌀수록 덜 한다).
// - 도전 확률: 자본 ÷ 값의 배수에서 1배를 넘는 몫 × 걸음(‰) — 상한에서 자른다. 굴림(0~999)이 이 값보다 작으면 도전한다.
// 지금 수요가 있는 투자(예: 다음 기술이 연구 시설에 막힘 = 기대 수익)는 굴리지 않고 후보가 된다. 수요가 없는 앞선 투자(지금 기술보다 높은 연구 시설)만
// 도전으로 굴린다. 가중치·걸음·상한은 설정 칸이다([임시] 출발값 — 모양은 위 요소만, D-584).
// 정수·BigInt만 쓴다(판정 코드).
import type { NpcCoefficients } from "./coefficients.ts";

type InvestCoefficients = Pick<
  NpcCoefficients,
  "investCostWeightPm" | "investChallengeStepPm" | "investChallengeMaxPm"
>;

/** 자본 대비 값의 몫(‰, 0~1000). 자본이 0 이하면 1000 */
export function investCostSharePm(cost: bigint, capital: bigint): number {
  if (cost <= 0n) return 0;
  if (capital <= 0n || cost >= capital) return 1000;
  return Number((cost * 1000n) / capital);
}

/** 점수에서 뺄 비용 몫(비용 몫 × 가중치 ÷ 1000, 내림) */
export function investCostPenalty(cost: bigint, capital: bigint, c: InvestCoefficients): number {
  return Math.floor(
    (investCostSharePm(cost, capital) * Math.max(0, Math.trunc(c.investCostWeightPm))) / 1000,
  );
}

/** 도전 확률(‰): (자본 ÷ 값 − 1배) × 걸음, 0~상한. 값이 0 이하면 상한 */
export function investChallengePm(cost: bigint, capital: bigint, c: InvestCoefficients): number {
  const max = Math.min(1000, Math.max(0, Math.trunc(c.investChallengeMaxPm)));
  if (cost <= 0n) return max;
  if (capital <= cost) return 0;
  // 배수(‰)는 크게 자라도 상한에서 자르므로 넘치지 않게 먼저 묶는다
  const cap = 1_000_000n;
  const multiplePm = Number((capital * 1000n) / cost > cap ? cap : (capital * 1000n) / cost);
  const step = Math.max(0, Math.trunc(c.investChallengeStepPm));
  return Math.min(max, Math.floor(((multiplePm - 1000) * step) / 1000));
}

/** 도전하는가: 굴림(0 이상 정수)의 1000 나머지가 도전 확률보다 작다 */
export function investChallenges(
  cost: bigint,
  capital: bigint,
  roll: number,
  c: InvestCoefficients,
): boolean {
  return Math.abs(Math.trunc(roll)) % 1000 < investChallengePm(cost, capital, c);
}

// 바뀜 (npc-invest-2, 질문 2508 나·다 — 기획 D-586·D-587 8): 같은 틀을 시설 짓기·레벨 올리기(build.ts·simulator/npcBuild.ts)와 군사(구인 카드 —
// policy.ts recruitPicks)에도 쓴다. 시뮬·서버가 같은 함수를 부른다(서버 NPC 런타임 = npcRun.decide, 가문 자동 구인 = recruitPolicy).
// - 수요가 있는 투자(주거·식량·나라 목표·첫 채집 시설, 일꾼이 다 찬 시설 올리기, 경비대·주거 목표 채우기)는 굴리지 않는다.
// - 수요 없이 앞서 가는 투자(같은 채집 시설 더 짓기, 일꾼 자리가 남는 시설 올리기, 더 좋은 구인 카드 — 좋을수록 비싸다)는 도전 굴림을 넘을 때만.
// - 성향 가중(D-323 성향 프리셋): 도전 확률에 성향 배율(축 값이 가장 낮으면 500‰, 가장 높으면 1500‰)을 곱한다 — 군사(경비대 카드)는 공격 성향,
//   경제(시설·일꾼 카드)는 상업 성향. 연구는 위 점수(성향 몫)를 그대로 쓴다(바꾸지 않았다).

type TemperRange = Pick<NpcCoefficients, "traitMin" | "traitMax">;

/** 성향 배율(‰): 축 값이 가장 낮으면 500, 가장 높으면 1500, 사이는 선형(정수 나눗셈) */
export function investTemperPm(trait: number, c: TemperRange): number {
  const min = Math.min(c.traitMin, c.traitMax);
  const max = Math.max(c.traitMin, c.traitMax);
  if (max <= min) return 1000;
  const value = Math.min(max, Math.max(min, Number.isFinite(trait) ? Math.trunc(trait) : min));
  return 500 + Math.floor(((value - min) * 1000) / (max - min));
}

/** 성향을 곱한 도전 확률(‰, 0~상한) */
export function investTemperedChallengePm(
  cost: bigint,
  capital: bigint,
  temperPm: number,
  c: InvestCoefficients,
): number {
  const max = Math.min(1000, Math.max(0, Math.trunc(c.investChallengeMaxPm)));
  const base = investChallengePm(cost, capital, c);
  return Math.min(max, Math.floor((base * Math.max(0, Math.trunc(temperPm))) / 1000));
}

// 바뀜 (npc-fix-3, 질문 2566 나 + 다 — D-587 8 "재료나 소모비용, 기대 수익. 수요 등 경제적 이점이 있을때"): 기대 수익과 유지비(소모 비용)를 값으로 셈해
// 판단에 넣는다. 셈 꼴은 기술이 정한 것이다([임시] 출발값 — 칸 셋은 설정 칸):
// - 기대 수익 몫(‰, −1000~1000) = ((하루 기대 산출 값 − 하루 유지비) × 회수 기간(일, npc_invest_payback_days) − 값) ÷ 값. 0 이상 = 회수 기간 안에 값을
//   돌려받는다. 하루 산출 값·유지비는 부르는 쪽이 셈한다(시설 = 일꾼 자리만큼의 레시피 산출 − 먹는 재료를 그 도시 지난 값으로, 유지비 = 일꾼 하루 임금 —
//   simulator/npcReturn.ts. 일꾼 구인 카드 = 그 카드 효율의 하루 임금 시세(D-431 임금 = 효율 × 단가)를 산출 값 대신, 유지비 = NPC 일꾼 하루 임금).
// - 점수: 기대 수익 몫이 0 아래(회수 기간 안에 못 돌려받음)면 그 몫 × npc_invest_return_weight_pm ÷ 1000을 뺀다(짓기 후보 — 비용 몫 감점과 함께, 0 위는 더하지
//   않는다 — investReturnPenalty).
// - 문: 수요 없는 앞선 투자는 경제 이득이 있을 때만(하루 값 > 하루 유지비이고 기대 수익 몫 ≥ npc_invest_return_min_pm) 도전 굴림까지 간다. 수요가 있는
//   투자(주거·식량·나라 목표 등)와 군사(경비대 카드 — "도시·국가는 군사력 증대를 위해 투자", 값으로 셈하는 산출이 없다)는 이 문을 거치지 않는다.

type ReturnCoefficients = Pick<
  NpcCoefficients,
  "investPaybackDays" | "investReturnWeightPm" | "investReturnMinPm"
>;

/** 투자 하나의 기대 수익 입력(최소 단위, 하루) */
export interface InvestReturn {
  /** 하루 기대 산출 값(먹는 재료 값을 뺀 것 — 0 아래일 수 있다) */
  readonly dailyValue: bigint;
  /** 하루 유지비(일꾼 임금 등) */
  readonly dailyUpkeep: bigint;
  /** 기대 수익 몫을 견줄 값(없으면 투자 값). 더 좋은 구인 카드처럼 덧붙는 몫만 볼 때 그 값 차이 */
  readonly basis?: bigint | undefined;
}

/** 회수 기간(일, 1 이상). 칸이 없으면 30 */
const paybackDays = (c: Partial<ReturnCoefficients>): bigint =>
  BigInt(Math.max(1, Math.trunc(c.investPaybackDays ?? 30)));

/** 기대 수익 몫(‰, −1000~1000): ((하루 값 − 하루 유지비) × 회수 기간 − 값) ÷ 값(값 = r.basis가 있으면 그것). 값이 0 이하면 하루 남는 몫의 부호(±1000, 0) */
export function investReturnPm(cost: bigint, r: InvestReturn, c: Partial<ReturnCoefficients>): number {
  const net = r.dailyValue - r.dailyUpkeep;
  const basis = r.basis ?? cost;
  if (basis <= 0n) return net > 0n ? 1000 : net < 0n ? -1000 : 0;
  const gain = net * paybackDays(c) - basis;
  const pm = (gain * 1000n) / basis;
  return pm > 1000n ? 1000 : pm < -1000n ? -1000 : Number(pm);
}

/**
 * 점수에서 뺄 기대 수익 몫: 기대 수익 몫이 0 아래(회수 기간 안에 값을 못 돌려받음)면 그 몫 × 가중치 ÷ 1000(0 쪽으로 자름), 아니면 0. 칸이 없으면 가중치 300.
 * 0 위는 더하지 않는다 — 짓기 점수(주거·식량·나라 목표·배후지)는 이미 "필요하면 짓는다"는 몫이고 숙소처럼 산출이 없는 후보와 견주므로, 돈을 버는
 * 시설에 같은 몫을 얹으면 차례가 산출 시설 쪽으로 쏠린다(시뮬 30일: 모두 +1000 몫 → 새 건물 −2~−12%, 휴먼 −8~−24%. 작업 기록)
 */
export function investReturnPenalty(cost: bigint, r: InvestReturn, c: Partial<ReturnCoefficients>): number {
  const pm = investReturnPm(cost, r, c);
  if (pm >= 0) return 0;
  const weight = Math.max(0, Math.trunc(c.investReturnWeightPm ?? 300));
  return Math.trunc((-pm * weight) / 1000);
}

/** 경제 이득이 있나: 하루 값 > 하루 유지비이고 기대 수익 몫 ≥ 문턱(칸이 없으면 −1000 = 하루 남는 몫만 본다) */
export function investPays(cost: bigint, r: InvestReturn, c: Partial<ReturnCoefficients>): boolean {
  if (r.dailyValue <= r.dailyUpkeep) return false;
  return investReturnPm(cost, r, c) >= Math.trunc(c.investReturnMinPm ?? -1000);
}

/**
 * 투자 문: 수요가 있으면 열리고, 없으면 성향을 곱한 도전 굴림(0 이상 정수의 1000 나머지)이 확률보다 작을 때만 열린다.
 * ret(npc-fix-3)이 있으면 수요 없는 투자는 경제 이득(investPays)이 있을 때만 굴린다. 없으면(값으로 셈하는 산출이 없는 투자) 옛 판처럼 굴림만
 */
export function investGate(
  cost: bigint,
  capital: bigint,
  demand: boolean,
  roll: number,
  temperPm: number,
  c: InvestCoefficients & Partial<ReturnCoefficients>,
  ret?: InvestReturn,
): boolean {
  if (demand) return true;
  if (ret !== undefined && !investPays(cost, ret, c)) return false;
  return Math.abs(Math.trunc(roll)) % 1000 < investTemperedChallengePm(cost, capital, temperPm, c);
}

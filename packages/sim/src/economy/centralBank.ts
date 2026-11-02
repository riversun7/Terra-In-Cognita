// NPC 중앙은행 공식 — docs/adr/2026-10-31-economy-core.md 6절, 기획 D-131(기본 NPC 국가 = 공식대로 움직이는 중앙은행,
// 테일러 준칙)·D-303(발행 이자 → 세금보다 먼저 소각)·D-411 5(은행이 잠긴 동안 공식이 정한 양을 시스템이 직접 낸다)
// 은행·금리가 없어서(출시 잠금) 테일러 준칙의 "금리" 자리를 "통화량 조절"로 읽는다(기술 해석):
//   물가 지수가 목표보다 낮으면 늘리고(국고로 발행), 높으면 줄인다(국고에서 소각). 하루 한 번.
// - 물가 지수 = 그 화폐로 매긴 생필품 시세 ÷ 시작 시세(천분율, 부르는 쪽이 낸다). 시작 시세는 그 세계 시장의 첫 가격(295)이라 지수는
//   "첫 가격 대비"다. 시세가 없으면 목표로 본다(손대지 않음).
// - 조절은 시중 통화량(발행 잔액 − 발행 나라 국고)을 본다: 조절량 = 시중 × 이득(만분율) × (목표 − 지수) ÷ 목표,
//   하루 상한(E5, 시중의 만분율) 안. 국고에만 쌓인 돈은 시중에 없으므로 더 찍을 까닭이 없다(가격이 돈에 반응하지 않을 때
//   국고로 끝없이 찍는 것을 막는다, 시뮬 R2에서 봄). 소각은 국고 잔고까지만.
// - 발행 이자(D-303) = 발행 잔액 × 이율(S1)을 날마다 쌓고, 조절보다 먼저 국고에서 소각한다(모자라면 남겨 둔다).
// - 처음 발행량(E6 기존 공식) = 인구 × 1인당 하루 거래액 × 7.
// [임시] 이득·상한·이율·1인당 거래액은 설정 칸(E5·E6·S1) 출발값이 없어 시험값이다.

export interface CentralBankRule {
  /** 목표 물가 지수(천분율, 1000 = 시작 시세 = 그 세계 시장의 첫 가격) */
  readonly targetMilli: number;
  /** 이득(만분율) */
  readonly gainBp: number;
  /** 하루 조절 상한(통화량의 만분율, E5) */
  readonly dailyCapBp: number;
  /** 하루 발행 이율(만분율, S1·D-303) */
  readonly interestBpPerDay: number;
}

export const TEST_CENTRAL_BANK_RULE: CentralBankRule = {
  targetMilli: 1000,
  gainBp: 2000,
  dailyCapBp: 300,
  interestBpPerDay: 1,
};

export interface CentralBankInput {
  /** 발행 잔액(발행 − 소각) */
  readonly outstanding: bigint;
  /** 물가 지수(천분율). 시세가 없으면 undefined */
  readonly indexMilli: number | undefined;
  readonly treasury: bigint;
  /** 아직 소각하지 못한 발행 이자 */
  readonly interestOwed: bigint;
}

export interface CentralBankStep {
  readonly interestBurn: bigint;
  readonly interestOwed: bigint;
  /** 국고로 발행할 양(0 이상) */
  readonly issue: bigint;
  /** 국고에서 소각할 양(0 이상, 이자 소각 뺀 나머지) */
  readonly burn: bigint;
}

export function centralBankStep(input: CentralBankInput, rule: CentralBankRule): CentralBankStep {
  const owed = input.interestOwed + (input.outstanding * BigInt(rule.interestBpPerDay)) / 10_000n;
  const interestBurn = owed < input.treasury ? owed : input.treasury;
  let treasury = input.treasury - interestBurn;
  let issue = 0n;
  let burn = 0n;
  const circulating = input.outstanding - input.treasury;
  if (input.indexMilli !== undefined && circulating > 0n) {
    const cap = (circulating * BigInt(rule.dailyCapBp)) / 10_000n;
    const gap = BigInt(rule.targetMilli - input.indexMilli);
    const raw = (circulating * BigInt(rule.gainBp) * gap) / (10_000n * BigInt(rule.targetMilli));
    if (raw > 0n) issue = raw < cap ? raw : cap;
    else if (raw < 0n) {
      const want = -raw < cap ? -raw : cap;
      burn = want < treasury ? want : treasury;
      treasury -= burn;
    }
  }
  return { interestBurn, interestOwed: owed - interestBurn, issue, burn };
}

/** 처음 발행량(E6): 인구 × 1인당 하루 거래액 × 7 */
export function initialMint(population: number, perCapitaDaily: bigint): bigint {
  return BigInt(population) * perCapitaDaily * 7n;
}

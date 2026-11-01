// 정원사 웨이브 공식 — docs/adr/2026-11-01-gardener-r5b.md 2절, 기획 D-188·D-192·D-196·D-230·D-273·D-319·D-322,
// D-460 201·202, D-464(질문 214·222). 순수 함수: 확률(C14)·세기(C16)·도착(C15)·쉬는 시간(C18)·물리형 비율(C17)·모함 몫(S16).
// ⌊log2(x)⌋는 정수 비트 길이로 센다(x의 이진 자릿수 − 1, D-460 201 덧붙임). 실수 로그를 쓰지 않아 결정적이다.
import type { GardenerCoefficients } from "./coefficients.ts";

/** 도시 하나의 오늘 웨이브 확률(‰): min(chanceMaxPm, ⌊합 ÷ chanceDivisor⌋), 쉬는 시간 중이면 그 몫(만분율, 내림) */
export function waveChancePm(influenceSum: number, coolingDown: boolean, c: GardenerCoefficients): number {
  const base = Math.min(c.chanceMaxPm, Math.floor(Math.max(0, influenceSum) / Math.max(1, c.chanceDivisor)));
  return coolingDown ? Math.floor((base * c.cooldownChanceBp) / 10_000) : base;
}

/** x의 이진 자릿수(x ≥ 1) */
export function bitLength(x: bigint): number {
  if (x < 1n) throw new RangeError(`bit length needs x >= 1: ${x}`);
  let n = 0;
  for (let rest = x; rest > 0n; rest >>= 1n) n += 1;
  return n;
}

/** ⌊log2(x)⌋ = 비트 길이 − 1 (x ≥ 1) */
export function floorLog2(x: bigint): number {
  return bitLength(x) - 1;
}

/** 웨이브 세기를 정하는 세력 규모(D-322): 도시 수, 유닛(휴먼) 수, 국고(질문 220 가: 그 세력 화폐 그대로) */
export interface FactionScale {
  readonly cities: number;
  readonly humans: number;
  readonly treasury: bigint;
}

/** 세기(정원사 유닛 수) = strengthBase × (1 + ⌊log2(1 + 도시 + ⌊휴먼 ÷ k⌋ + ⌊국고 ÷ 단위⌋)⌋). 빚(음수 국고)은 0 */
export function waveStrength(scale: FactionScale, c: GardenerCoefficients): number {
  const treasury = scale.treasury > 0n ? scale.treasury / BigInt(Math.max(1, c.strengthTreasuryUnit)) : 0n;
  const x =
    1n +
    BigInt(Math.max(0, scale.cities)) +
    BigInt(Math.floor(Math.max(0, scale.humans) / Math.max(1, c.strengthHumansPer))) +
    treasury;
  return c.strengthBase * (1 + floorLog2(x));
}

/** 도착 시각 = 생성 + max(이동, 최소 예고)(D-196). 이동 시간은 진군 경로가 생기기 전까지 0(질문 219 가) */
export function waveArrivalMs(createdAtMs: number, travelMs: number, c: GardenerCoefficients): number {
  return createdAtMs + Math.max(Math.max(0, travelMs), c.noticeMs);
}

/** 물리형 공성 크리쳐 비율(‰, 질문 214 가): min(physicalMaxPm, ⌊합 ÷ physicalDivisor⌋) */
export function physicalPm(influenceSum: number, c: GardenerCoefficients): number {
  return Math.min(c.physicalMaxPm, Math.floor(Math.max(0, influenceSum) / Math.max(1, c.physicalDivisor)));
}

/** 세기 가운데 물리형 마리 수(내림) */
export function physicalCount(strength: number, pm: number): number {
  return Math.floor((Math.max(0, strength) * Math.max(0, Math.min(1000, pm))) / 1000);
}

/** 모함 몫(행성 하나): 서버 유닛 예산 × 만분율(S16, D-379 행성마다) */
export function mothershipCap(c: GardenerCoefficients): number {
  return Math.floor((c.unitBudget * c.mothershipBp) / 10_000);
}

/**
 * 모함 몫에서 줄 수 있는 정원사 유닛 수(질문 222 가): min(원하는 수, 몫 − 진군·전투 중인 수).
 * 웨이브 하나의 최소(strengthBase)보다 적게 남으면 0(그 웨이브는 그날 생기지 않는다)
 */
export function grantGardenerUnits(want: number, inUse: number, c: GardenerCoefficients): number {
  const granted = Math.min(Math.max(0, want), mothershipCap(c) - Math.max(0, inUse));
  return granted >= Math.min(c.strengthBase, want) && granted > 0 ? granted : 0;
}

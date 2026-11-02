// 소모품 효과량(D-496 286, D-501 "적정 스탯") — 아이템 사용 효과 줄 하나의 효과량 범위와 굴림.
// - 효과량 = 기준 값 × min(상한, 쓰는 유닛의 그 1차 스탯 ÷ 적정 스탯) × (1 ± 오차). 무기 효율(D-420 틀, formula.ts weaponScaled)과 같은
//   비율·같은 상한(설정 칸 N10 n10_appropriate_cap = 계수표 appropriateCapPm)을 쓴다. 그래서 적정 스탯이 낮은 기준 30 물약이 스탯이 낮은
//   유닛에게는 적정 스탯이 높은 기준 50 물약보다 더 많이 채울 수 있다.
// - 셈은 정수만(BigInt): 가운데 값 = ⌊기준 × 비율‰ ÷ 1000⌋, 범위 = ⌊가운데 × (1000 ∓ 오차‰) ÷ 1000⌋(음수 기준 값도 아래로 내림).
//   결과가 안전 정수를 넘으면 그 값으로 자른다(기술 보호, 게임 규칙이 아님).
// - 굴림: [최소, 최대] 안 균등한 정수 하나(시드 난수). 실제로 먹고 쓰는 실행은 보유 물건(인스턴스) 뒤 소비 줄기이고, 지금은 아이템 편집기
//   미리 보기(서버)가 범위만 셈한다.
import type { Rng } from "@terra/shared";
import { appropriateRatioPm } from "./formula.ts";

/** 효과 줄의 비례 칸(없으면 기준 값 그대로) */
export interface UseScale {
  /** 쓰는 유닛의 그 1차 스탯 값 */
  readonly statValue: number;
  /** 적정 스탯(1 이상) */
  readonly appropriate: number;
}

export interface UseAmountRange {
  /** 기준 값에 곱하는 비율(‰) = min(상한, 스탯 ÷ 적정 스탯). 비례 칸이 없으면 1000 */
  readonly ratioPm: number;
  /** 가운데 값(오차 전) */
  readonly scaled: number;
  readonly min: number;
  readonly max: number;
}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const toSafe = (value: bigint): number => Number(value > SAFE ? SAFE : value < -SAFE ? -SAFE : value);

/** 내림 나눗셈(음수도 아래로) */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/**
 * 효과 줄 하나의 효과량 범위. capPm = 적정 비율 상한(무기 효율과 같은 계수표 appropriateCapPm), variancePm = ±오차(줄 값 또는 설정 칸
 * d496_use_variance). 적정 스탯이 1보다 작으면(스키마가 막는다) 기준 값 그대로 셈한다
 */
export function useAmountRange(
  base: number,
  scale: UseScale | null,
  capPm: number,
  variancePm: number,
): UseAmountRange {
  const ratioPm =
    scale === null || scale.appropriate < 1
      ? 1000
      : appropriateRatioPm(scale.statValue, scale.appropriate, capPm);
  const scaled = floorDiv(BigInt(base) * BigInt(ratioPm), 1000n);
  const low = floorDiv(scaled * BigInt(1000 - variancePm), 1000n);
  const high = floorDiv(scaled * BigInt(1000 + variancePm), 1000n);
  return {
    ratioPm,
    scaled: toSafe(scaled),
    min: toSafe(low < high ? low : high),
    max: toSafe(low < high ? high : low),
  };
}

const U32 = 0x1_0000_0000;

/** [최소, 최대] 안 균등한 정수 하나(시드 난수). 폭이 2^32를 넘으면 64비트 두 번 뽑기의 나머지(그 크기에서 치우침은 무시할 만하다) */
export function rollUseAmount(range: { readonly min: number; readonly max: number }, rng: Rng): number {
  const width = range.max - range.min + 1;
  if (width <= 1) return range.min;
  if (width <= U32) return range.min + rng.nextInt(width);
  const wide = (BigInt(rng.nextU32()) << 32n) | BigInt(rng.nextU32());
  return range.min + Number(wide % BigInt(width));
}

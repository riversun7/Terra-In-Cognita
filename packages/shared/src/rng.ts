// 시드 기반 결정적 난수 생성기 (mulberry32)
// 판정 코드에서 Math.random 대신 사용한다. 정수 연산(Math.imul, 비트 연산)만 써서
// 브라우저·서버 엔진이 달라도 같은 시드면 같은 수열이 나온다.

export interface Rng {
  /** 0 이상 2^32 미만의 부호 없는 32비트 정수 */
  nextU32(): number;
  /** 0 이상 maxExclusive 미만의 정수 */
  nextInt(maxExclusive: number): number;
}

export function createRng(seed: number): Rng {
  // 시드를 32비트 부호 없는 정수로 정규화
  let state = seed >>> 0;

  const nextU32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
      throw new RangeError(`maxExclusive must be an integer in (0, 2^32]: ${maxExclusive}`);
    }
    // 나머지 편향을 없애기 위해 범위를 벗어난 값은 버리고 다시 뽑는다
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
    for (;;) {
      const value = nextU32();
      if (value < limit) return value % maxExclusive;
    }
  };

  return { nextU32, nextInt };
}

// 정수 제곱근 — 결과가 엔진과 무관하게 정확하다.
// Math.sqrt는 IEEE 754가 정확한 반올림을 요구하는 연산(초월함수 아님)이라 첫 추정에만 쓰고,
// 정수 곱셈으로 앞뒤를 맞춰 정의(r² ≤ n < (r+1)²)를 항상 지킨다.
// 기기도 같은 경로 보간을 해야 하므로 나중에 @terra/shared로 옮길 수 있다.

/** 내림 정수 제곱근: r² ≤ n < (r+1)²인 r. n은 0 이상의 안전 정수다. */
export function isqrt(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`isqrt: n must be a non-negative safe integer: ${n}`);
  }
  let r = Math.floor(Math.sqrt(n));
  // r은 최대 94,906,266이라 r²은 2^54 안이다. 2^53을 넘는 곱은 이미 n보다 커서 비교가 틀리지 않는다.
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** 가장 가까운 정수 제곱근. n이 정수라 정확히 가운데(r + 0.5)²는 나오지 않는다. */
export function isqrtRound(n: number): number {
  const r = isqrt(n);
  // (r + 0.5)² = r² + r + 0.25 이므로 n - r² > r 이면 r + 1에 더 가깝다
  return n - r * r > r ? r + 1 : r;
}

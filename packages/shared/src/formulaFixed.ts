// 계산식 고정 소수점 셈 — docs/adr/2026-11-01-formula-editor.md "수의 모양"
// 계산식의 모든 값은 1000배 정수(밀리 단위, 소수 셋째 자리까지)다. 0.2는 200, 3은 3000으로 든다.
// 엔진·기기와 무관하게 같은 값을 내려고 정수 셈만 쓴다(사칙연산·Math.floor 같은 명세가 정한 것만, AGENTS.md 결정적 계산).
// - 곱: ⌊a × b ÷ 1000⌋, 나눗셈: ⌊a × 1000 ÷ b⌋ (둘 다 음의 무한대 쪽으로 내림). 0으로 나누면 0(부른 쪽이 표시한다).
// - 곱이 안전 정수(2^53 − 1)를 넘으면 BigInt로 셈하고, 결과는 ±(2^53 − 1)에서 자른다(기술 보호, 게임 규칙이 아님).

/** 고정 소수점 배율: 값 1 = 1000 */
export const FX_SCALE = 1000;
const SAFE = Number.MAX_SAFE_INTEGER;
const BIG_SAFE = BigInt(SAFE);
const BIG_SCALE = 1000n;

/** 안전 정수 범위로 자른다 */
export function fxClamp(value: number): number {
  if (value > SAFE) return SAFE;
  if (value < -SAFE) return -SAFE;
  return value;
}

function clampBig(value: bigint): number {
  if (value > BIG_SAFE) return SAFE;
  if (value < -BIG_SAFE) return -SAFE;
  return Number(value);
}

/** 정수 p ÷ 정수 d를 음의 무한대 쪽으로 내린다(둘 다 안전 정수, d ≠ 0). 실수 나눗셈의 반올림을 나머지로 바로잡는다 */
export function floorDiv(p: number, d: number): number {
  let q = Math.floor(p / d);
  const r = p - q * d;
  if (d > 0) {
    if (r < 0) q -= 1;
    else if (r >= d) q += 1;
  } else if (r > 0) q -= 1;
  else if (r <= d) q += 1;
  return q;
}

/** BigInt 내림 나눗셈(d ≠ 0) */
function bigFloorDiv(p: bigint, d: bigint): bigint {
  const q = p / d;
  return p % d !== 0n && p < 0n !== d < 0n ? q - 1n : q;
}

export function fxAdd(a: number, b: number): number {
  return fxClamp(a + b);
}

export function fxSub(a: number, b: number): number {
  return fxClamp(a - b);
}

/** 곱 ⌊a × b ÷ 1000⌋ */
export function fxMul(a: number, b: number): number {
  const p = a * b;
  if (Number.isSafeInteger(p)) return floorDiv(p, FX_SCALE);
  return clampBig(bigFloorDiv(BigInt(a) * BigInt(b), BIG_SCALE));
}

/** 나눗셈 ⌊a × 1000 ÷ b⌋. b = 0이면 null(부른 쪽이 0으로 두고 알린다) */
export function fxDiv(a: number, b: number): number | null {
  if (b === 0) return null;
  const p = a * FX_SCALE;
  if (Number.isSafeInteger(p)) return fxClamp(floorDiv(p, b));
  return clampBig(bigFloorDiv(BigInt(a) * BIG_SCALE, BigInt(b)));
}

/** 소수점 아래 버림(음의 무한대 쪽) */
export function fxFloor(a: number): number {
  return floorDiv(a, FX_SCALE) * FX_SCALE;
}

export function fxCeil(a: number): number {
  return -fxFloor(-a);
}

/** 반올림(0.5는 위로) */
export function fxRound(a: number): number {
  return fxFloor(fxClamp(a + FX_SCALE / 2));
}

/** 0 쪽으로 버림 */
export function fxTrunc(a: number): number {
  return a >= 0 ? fxFloor(a) : fxCeil(a);
}

/** 정수 → 고정 소수점 */
export function fxFromInt(value: number): number {
  return fxClamp(Math.trunc(value) * FX_SCALE);
}

/** 천분율(‰) 정수 → 배(고정 소수점에서는 같은 정수다: 500‰ = 0.5 = 500) */
export function fxFromPm(pm: number): number {
  return fxClamp(Math.trunc(pm));
}

/** 고정 소수점 → 정수(내림) */
export function fxToInt(raw: number): number {
  return floorDiv(raw, FX_SCALE);
}

/** 보이기용 글(소수 셋째 자리까지, 끝 0은 뗀다): 1500 → "1.5", −250 → "-0.25" */
export function fxFormat(raw: number): string {
  const sign = raw < 0 ? "-" : "";
  const abs = Math.abs(raw);
  const whole = Math.floor(abs / FX_SCALE);
  const frac = abs - whole * FX_SCALE;
  if (frac === 0) return `${sign}${whole}`;
  let digits = String(frac).padStart(3, "0");
  while (digits.endsWith("0")) digits = digits.slice(0, -1);
  return `${sign}${whole}.${digits}`;
}

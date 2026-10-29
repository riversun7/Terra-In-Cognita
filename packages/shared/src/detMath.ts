// 결정적 수학 함수 — 엔진(브라우저·Node 버전)과 무관하게 같은 값을 낸다 (ADR 2026-10-29-s2-planet-lod "생성기 결정성")
//
// ECMA-262는 사칙연산(IEEE 754 배정밀도, 가장 가까운 값으로 반올림)과 Math의 sqrt·floor·ceil·round·trunc·abs·min·max·
// sign·fround·imul 결과를 정확히 정한다. 사인·코사인·탄젠트·아크탄젠트·지수·로그·거듭제곱(** 연산자 포함)은
// "구현이 근사한 값"이라 엔진마다 마지막 자리가 다를 수 있다. 그래서 판정·생성 코드는 이 파일의 함수를 쓴다.
// 이 파일은 사칙연산과 위의 정확한 함수만 쓴다. 상수는 17자리 이하 리터럴이라 파싱 결과도 명세가 정한다.
//
// 방법: 인수 줄이기(π/2·ln 2를 세 조각·두 조각으로 나눈 Cody–Waite 방식) + 테일러 다항식(계수 1/n!, 1/(2k+1)).
// 상수는 Python decimal 90자리로 계산했다(π는 Machin 공식, ln 2는 급수, atan(m/8)은 인수 반감 + 급수).
// 잰 최대 오차(2026-10-29, 함수마다 무작위 점 4~8만 개, 4배 정밀도 C quadmath 값을 반올림한 기준과 비교):
//   sin·cos |x| ≤ 100: 1ulp, atan(모든 범위)·exp [-700, 700]: 1ulp, asin·atan2: 2ulp,
//   tan |x| ≤ π/4: 2ulp, |x| ≤ 20(극 근처 |cos x| < 1e-3 제외): 3ulp. (같은 점에서 Node 24.22.1 Math 함수는 1ulp)
//   시험(detMath.test.ts)은 엔진의 Math 함수와 비교한다(그 자체 오차 1ulp를 더한 상한).
// 큰 인수: sin·cos·tan은 |x| ≤ 약 1e6(= 2^20·π/2)까지 인수 줄이기가 정확하다. 그보다 크면 값은 결정적이지만 정확하지 않다.

// π/2 = PIO2_1 + PIO2_2 + PIO2_3. 앞 두 조각은 유효 비트 33개라 정수 k(|k| < 2^20)를 곱해도 정확하다
const PIO2_1 = 1.5707963267341256;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_3 = 2.0222662487959506e-21;
const TWO_OVER_PI = 0.6366197723675814;
// π/2·π를 가장 가까운 실수(HI)와 나머지(LO)로
const PIO2_HI = 1.5707963267948966;
const PIO2_LO = 6.123233995736766e-17;
const PI_HI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

// sin r = r - r³/3! + … + r¹⁷/17! (|r| ≤ π/4에서 자르기 오차 < 1e-19)
const S3 = -0.16666666666666666;
const S5 = 0.008333333333333333;
const S7 = -0.0001984126984126984;
const S9 = 2.7557319223985893e-6;
const S11 = -2.505210838544172e-8;
const S13 = 1.6059043836821613e-10;
const S15 = -7.647163731819816e-13;
const S17 = 2.8114572543455206e-15;
// cos r = 1 - r²/2! + … + r¹⁶/16! (자르기 오차 < 3e-18)
const C2 = -0.5;
const C4 = 0.041666666666666664;
const C6 = -0.001388888888888889;
const C8 = 2.48015873015873e-5;
const C10 = -2.755731922398589e-7;
const C12 = 2.08767569878681e-9;
const C14 = -1.1470745597729725e-11;
const C16 = 4.779477332387385e-14;

/** |r| ≤ π/4 근처의 사인 (줄인 인수용) */
function sinKernel(r: number): number {
  const z = r * r;
  return r + r * z * (S3 + z * (S5 + z * (S7 + z * (S9 + z * (S11 + z * (S13 + z * (S15 + z * S17)))))));
}

/** |r| ≤ π/4 근처의 코사인 (줄인 인수용) */
function cosKernel(r: number): number {
  const z = r * r;
  return 1 + z * (C2 + z * (C4 + z * (C6 + z * (C8 + z * (C10 + z * (C12 + z * (C14 + z * C16)))))));
}

// 인수 줄이기 결과의 나머지 (함수 하나가 값 두 개를 돌려주려고 둔다. 자바스크립트는 한 실행 흐름 안에서 순서대로 돈다)
let reducedRemainder = 0;

/** ax(0 이상) = k·π/2 + r로 나눈다. k를 돌려주고 r(|r| ≤ π/4 근처)은 reducedRemainder에 둔다 */
function reduceHalfPi(ax: number): number {
  const k = Math.round(ax * TWO_OVER_PI);
  // k·PIO2_1은 정확하고, ax와 가까워 첫 뺄셈도 정확하다(Sterbenz)
  reducedRemainder = ax - k * PIO2_1 - k * PIO2_2 - k * PIO2_3;
  return k;
}

/** 사인 */
export function detSin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (x === 0) return x;
  const k = reduceHalfPi(Math.abs(x));
  const r = reducedRemainder;
  const quadrant = k % 4;
  const value =
    quadrant === 0
      ? sinKernel(r)
      : quadrant === 1
        ? cosKernel(r)
        : quadrant === 2
          ? -sinKernel(r)
          : -cosKernel(r);
  return x < 0 ? -value : value;
}

/** 코사인 */
export function detCos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  const k = reduceHalfPi(Math.abs(x));
  const r = reducedRemainder;
  const quadrant = k % 4;
  return quadrant === 0
    ? cosKernel(r)
    : quadrant === 1
      ? -sinKernel(r)
      : quadrant === 2
        ? -cosKernel(r)
        : sinKernel(r);
}

/** 탄젠트. π/2의 홀수배 바로 옆에서는 인수 줄이기 오차가 상대적으로 커진다(극 근처) */
export function detTan(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (x === 0) return x;
  const k = reduceHalfPi(Math.abs(x));
  const r = reducedRemainder;
  const value = k % 2 === 0 ? sinKernel(r) / cosKernel(r) : -cosKernel(r) / sinKernel(r);
  return x < 0 ? -value : value;
}

// atan(m/8) (m = 0~8)을 가장 가까운 실수(HI)와 나머지(LO)로
const ATAN_HI: readonly number[] = [
  0, 0.12435499454676144, 0.24497866312686414, 0.35877067027057225, 0.4636476090008061, 0.5585993153435624,
  0.6435011087932844, 0.7188299996216245, 0.7853981633974483,
];
const ATAN_LO: readonly number[] = [
  0, -3.1253241424539383e-18, 1.0698755618734451e-17, -2.4623815582638635e-17, 2.2698777452961687e-17,
  -5.4556305485916264e-18, 1.5834785051444286e-17, -2.1478388444456983e-17, 3.061616997868383e-17,
];
// atan t = t - t³/3 + … - t¹⁵/15 (|t| ≤ 1/16에서 자르기 오차 < 4e-21·|t|)
const T3 = -0.3333333333333333;
const T5 = 0.2;
const T7 = -0.14285714285714285;
const T9 = 0.1111111111111111;
const T11 = -0.09090909090909091;
const T13 = 0.07692307692307693;
const T15 = -0.06666666666666667;

/** |t| ≤ 1/16의 아크탄젠트 */
function atanSmall(t: number): number {
  const z = t * t;
  return t + t * z * (T3 + z * (T5 + z * (T7 + z * (T9 + z * (T11 + z * (T13 + z * T15))))));
}

/** 0 ≤ a ≤ 1의 아크탄젠트: 가장 가까운 m/8에서 atan a = atan(m/8) + atan((a - m/8) / (1 + a·m/8)) */
function atanUnit(a: number): number {
  const m = Math.round(a * 8);
  if (m === 0) return atanSmall(a);
  const c = m * 0.125;
  const t = (a - c) / (1 + a * c);
  return (ATAN_HI[m] ?? 0) + (atanSmall(t) + (ATAN_LO[m] ?? 0));
}

/** 아크탄젠트 (결과 -π/2 ~ π/2) */
export function detAtan(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x === 0) return x;
  const ax = Math.abs(x);
  // |x| > 1이면 atan x = π/2 - atan(1/x) (x = ∞도 여기서 π/2)
  const value = ax <= 1 ? atanUnit(ax) : PIO2_HI - (atanUnit(1 / ax) - PIO2_LO);
  return x < 0 ? -value : value;
}

/** 두 인수 아크탄젠트 (결과 -π ~ π). 0·무한의 경우는 ECMA-262 Math.atan2와 같다 */
export function detAtan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  const yNegative = y < 0 || Object.is(y, -0);
  const xNegative = x < 0 || Object.is(x, -0);
  if (y === 0) {
    if (!xNegative) return y;
    return yNegative ? -PI_HI : PI_HI;
  }
  if (x === 0) return yNegative ? -PIO2_HI : PIO2_HI;
  if (!Number.isFinite(y)) {
    const quarter = PIO2_HI / 2;
    const angle =
      x === Number.POSITIVE_INFINITY ? quarter : x === Number.NEGATIVE_INFINITY ? 3 * quarter : PIO2_HI;
    return yNegative ? -angle : angle;
  }
  if (x === Number.POSITIVE_INFINITY) return yNegative ? -0 : 0;
  if (x === Number.NEGATIVE_INFINITY) return yNegative ? -PI_HI : PI_HI;
  const t = detAtan(y / x);
  if (x > 0) return t;
  return yNegative ? t - PI_LO - PI_HI : t + PI_LO + PI_HI;
}

/** 아크사인 (결과 -π/2 ~ π/2). |x| > 1이면 NaN */
export function detAsin(x: number): number {
  if (Number.isNaN(x) || x > 1 || x < -1) return Number.NaN;
  if (x === 0) return x;
  // 1 - x²를 (1 - x)(1 + x)로: ±1 근처에서 자리를 덜 잃는다
  return detAtan2(x, Math.sqrt((1 - x) * (1 + x)));
}

// ln 2 = LN2_HI + LN2_LO. LN2_HI는 유효 비트 33개라 정수 k(|k| < 2^20)를 곱해도 정확하다
const LN2_HI = 0.6931471804855391;
const LN2_LO = 7.440617110012397e-11;
const LOG2E = 1.4426950408889634;
// e^r = 1 + r + r²/2! + … + r¹³/13! (|r| ≤ ln2/2에서 자르기 오차 < 5e-18)
const E2 = 0.5;
const E3 = 0.16666666666666666;
const E4 = 0.041666666666666664;
const E5 = 0.008333333333333333;
const E6 = 0.001388888888888889;
const E7 = 0.0001984126984126984;
const E8 = 2.48015873015873e-5;
const E9 = 2.7557319223985893e-6;
const E10 = 2.755731922398589e-7;
const E11 = 2.505210838544172e-8;
const E12 = 2.08767569878681e-9;
const E13 = 1.6059043836821613e-10;
/** 이보다 크면 e^x는 가장 큰 실수를 넘는다 */
const EXP_OVERFLOW = 709.782712893384;
/** 이보다 작으면 e^x는 가장 작은 실수의 절반보다 작다 */
const EXP_UNDERFLOW = -745.1332191019412;

// 2^k (k = -1022 ~ 1023, 정규 실수) 표: 2를 곱하고 나눠서만 만들어 정확하다
const POW2_OFFSET = 1022;
const POW2: number[] = [];
{
  let value = 1;
  for (let k = 0; k <= 1023; k++, value *= 2) POW2[k + POW2_OFFSET] = value;
  value = 0.5;
  for (let k = -1; k >= -1022; k--, value *= 0.5) POW2[k + POW2_OFFSET] = value;
}

/** value × 2^k. 중간값이 넘치거나 비정규 수가 되지 않게 두 번에 나눠 곱한다 */
function scaleByPowerOfTwo(value: number, k: number): number {
  let result = value;
  let rest = k;
  if (rest > 1023) {
    result *= POW2[1023 + POW2_OFFSET] ?? 0;
    rest -= 1023;
  } else if (rest < -1022) {
    result *= POW2[0] ?? 0;
    rest += 1022;
  }
  return result * (POW2[rest + POW2_OFFSET] ?? 0);
}

/** 지수 함수 e^x */
export function detExp(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > EXP_OVERFLOW) return Number.POSITIVE_INFINITY;
  if (x < EXP_UNDERFLOW) return 0;
  const k = Math.round(x * LOG2E);
  const r = x - k * LN2_HI - k * LN2_LO;
  const er =
    1 +
    r *
      (1 +
        r *
          (E2 +
            r *
              (E3 +
                r *
                  (E4 +
                    r *
                      (E5 +
                        r *
                          (E6 +
                            r *
                              (E7 + r * (E8 + r * (E9 + r * (E10 + r * (E11 + r * (E12 + r * E13))))))))))));
  return scaleByPowerOfTwo(er, k);
}

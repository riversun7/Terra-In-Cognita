// 사이보그 초기 스탯 굴림 — 생성(D-6039)과 환생 분포 변경(D-444 164)이 함께 쓰는 함수. docs/adr/2026-10-31-faction-society-core.md
// "바뀜 (2026-11-01, D-444)", 기획 48 §2(사이보그 = 성향 쪽으로 치우친 정규분포, 합 60, 다시 굴리기), 49 N6·N9
// - 성향을 고르면 그 성향 칸의 평균이 오르고(나머지 칸은 합이 그대로가 되게 내려간다) 칸마다 정규분포로 굴린 뒤 합 60·칸 1~20으로
//   맞춘다(옛 CHR-1 §4.2: 평균 10, 표준편차 약 3 → 합 60 비율 보정). 직접 나누기는 없다(D-444).
// - 정규분포는 균등 굴림 12개 합(어윈-홀, 분산 1)으로 근사한다. 정수 셈만 쓴다(초월함수·실수 반올림 없음, AGENTS 4장 판정 코드).
// - 성향 목록은 D-445 168(균형·전투·기술·교역, 균형은 치우침 없음). 치우침 출발값은 D-445 168이 받은 값: 고른 두 칸 평균 14,
//   나머지 넷 8(initialFavorMilli 4000), 균형은 모두 10, 표준편차 약 3(설정값, 팩 tuning n9_initial_favor·n9_initial_spread).
//   첫 접속 서버(apps/server/src/cyborg/service.ts)도 이 함수를 쓴다 — 굴리기 규칙은 이 파일 하나다(첫 접속 ADR 2026-11-01).
// - 다시 굴리기는 처음 1번 + N9 횟수(출발값 3)이고 성향을 바꿔
//   굴려도 1번, 마지막 값만 남는다(D-445 169). 이 횟수 하나를 생성과 환생이 함께 쓴다(D-444 164).
//   굴림 상태(StatRolls)는 서버가 들고 있는다(서버 권위).
// - 바뀜(2026-11-12, 사용자 지시 "선택된 둘다 12이상으로 나오던지하게해라"): 성향을 고르면 그 성향 칸은 바닥값(설정 칸
//   n9_initial_favor_floor, 출발값 12) 아래로 나오지 않는다. 바닥까지 올린 만큼은 나머지 칸에서 무게 비례로 덜어 합 60을 지킨다.
// - 시드 난수(Rng)는 부르는 쪽이 준다(같은 시드·성향이면 같은 값).
import type { Rng } from "@terra/shared";
import type { Primaries } from "../combat/stats.ts";
import type { SocietyCoefficients } from "./coefficients.ts";

export type PrimaryStat = keyof Primaries;

/** 성향 하나(N9 성향 목록): 평균이 오르는 칸 */
export interface CyborgTemperament {
  readonly id: string;
  readonly favored: readonly PrimaryStat[];
}

/** 굴린 분포와 남은 다시 굴리기(생성 화면·환생 화면이 같은 모양을 쓴다) */
export interface StatRolls {
  readonly temperament: string;
  readonly spread: Primaries;
  readonly rerollsLeft: number;
}

export const PRIMARY_STATS: readonly PrimaryStat[] = ["str", "dex", "agi", "vit", "int", "wis"];

/** 어윈-홀 굴림 수(균등 12개 합의 분산 = 1) */
const NORMAL_DRAWS = 12;
const ROLL_SPAN = 10_000;

/** 성향 찾기(없으면 undefined) */
export function temperamentOf(id: string, c: SocietyCoefficients): CyborgTemperament | undefined {
  return c.cyborg.temperaments.find((t) => t.id === id);
}

/** 표준 정규분포 근사 × 20,000: 굴림 k(0~9999)를 칸 가운데 (2k + 1) / 20,000으로 보고 12개 합 − 6 */
function normalTwentyThousandths(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < NORMAL_DRAWS; i += 1) sum += 2 * rng.nextInt(ROLL_SPAN) + 1;
  return sum - NORMAL_DRAWS * ROLL_SPAN;
}

/**
 * 합을 칸들의 무게 비례로 나눈다(가장 큰 나머지, 같으면 칸 차례 앞쪽). 칸 범위를 넘으면 그 칸을 끝값에 묶고 남은 합을 다시
 * 나눈다(칸 하나 이상이 묶일 때마다 다시, 많아야 칸 수만큼)
 */
function fitSum(weights: readonly number[], sum: number, mins: readonly number[], max: number): number[] {
  const out: number[] = weights.map(() => 0);
  const fixed: boolean[] = weights.map(() => false);
  for (let round = 0; round <= weights.length; round += 1) {
    const free = weights.flatMap((_, index) => (fixed[index] ? [] : [index]));
    const left = sum - out.reduce((acc, value, index) => acc + (fixed[index] ? value : 0), 0);
    const total = free.reduce((acc, index) => acc + (weights[index] ?? 0), 0);
    const parts = free.map((index) => {
      const scaled = (weights[index] ?? 0) * left;
      return { index, value: Math.floor(scaled / total), rest: scaled % total };
    });
    let spare = left - parts.reduce((acc, part) => acc + part.value, 0);
    for (const part of parts.toSorted((a, b) => b.rest - a.rest || a.index - b.index)) {
      if (spare <= 0) break;
      part.value += 1;
      spare -= 1;
    }
    const over = parts.filter((part) => part.value > max);
    const under = over.length > 0 ? [] : parts.filter((part) => part.value < (mins[part.index] ?? 0));
    for (const part of parts) out[part.index] = part.value;
    if (over.length === 0 && under.length === 0) return out;
    for (const part of over.length > 0 ? over : under) {
      out[part.index] = over.length > 0 ? max : (mins[part.index] ?? 0);
      fixed[part.index] = true;
    }
  }
  return out;
}

/** 한 번 굴린다: 성향 평균 + 정규분포(표준편차 설정값) → 칸 범위로 자르고 → 합 N9로 맞춘다 */
export function rollStatSpread(temperamentId: string, rng: Rng, c: SocietyCoefficients): Primaries {
  const temperament = temperamentOf(temperamentId, c);
  if (temperament === undefined) throw new RangeError(`unknown temperament: ${temperamentId}`);
  const { initialSum, initialMin, initialMax, initialFavorMilli, initialSpreadMilli, initialFavorFloor } =
    c.cyborg;
  const count = PRIMARY_STATS.length;
  if (initialMin < 1 || initialMin * count > initialSum || initialMax * count < initialSum)
    throw new RangeError("N9 sum and per-stat range do not fit");
  const favored = PRIMARY_STATS.filter((stat) => temperament.favored.includes(stat));
  // 성향 칸 바닥(칸 범위 안으로 묶고, 성향 칸 바닥 + 나머지 칸 최소가 합을 넘으면 바닥을 낮춘다)
  const floorCap =
    favored.length === 0
      ? initialMin
      : Math.floor((initialSum - initialMin * (count - favored.length)) / favored.length);
  const favorFloor = Math.max(initialMin, Math.min(initialMax, floorCap, initialFavorFloor));
  const mins = PRIMARY_STATS.map((stat) => (favored.includes(stat) ? favorFloor : initialMin));
  const base = Math.floor((initialSum * 1000) / count);
  const others = count - favored.length;
  const favorMean = others === 0 ? base : base + initialFavorMilli;
  const otherMean = others === 0 ? base : base - Math.floor((initialFavorMilli * favored.length) / others);
  const weights = PRIMARY_STATS.map((stat) => {
    const mean = favored.includes(stat) ? favorMean : otherMean;
    const value = mean + Math.floor((initialSpreadMilli * normalTwentyThousandths(rng)) / 20_000);
    // 무게는 칸 최소로만 묶는다(바닥으로 묶으면 낮게 굴린 성향 칸의 몫이 오히려 커진다) — 바닥은 합 맞추기에서 지킨다
    return Math.min(initialMax * 1000, Math.max(initialMin * 1000, value));
  });
  const [str = 0, dex = 0, agi = 0, vit = 0, int = 0, wis = 0] = fitSum(
    weights,
    initialSum,
    mins,
    initialMax,
  );
  return { str, dex, agi, vit, int, wis };
}

/** 첫 굴림(생성 화면·환생 화면을 열 때). 다시 굴리기는 N9 횟수 */
export function firstStatRoll(temperamentId: string, rng: Rng, c: SocietyCoefficients): StatRolls {
  return {
    temperament: temperamentId,
    spread: rollStatSpread(temperamentId, rng, c),
    rerollsLeft: c.cyborg.initialRerolls,
  };
}

/** 다시 굴린다(성향을 다시 고를 수 있다). 다시 굴리기를 다 썼으면 null(마지막 값이 남는다) */
export function rerollStats(
  previous: StatRolls,
  temperamentId: string,
  rng: Rng,
  c: SocietyCoefficients,
): StatRolls | null {
  if (previous.rerollsLeft <= 0) return null;
  return {
    temperament: temperamentId,
    spread: rollStatSpread(temperamentId, rng, c),
    rerollsLeft: previous.rerollsLeft - 1,
  };
}

/** K 여섯(생성·환생 리롤): 굴림 0~9999마다 N6 범위 안 균등(양 끝 포함), STR·DEX·AGI·VIT·INT·WIS 차례 */
export function kFromRolls(rolls: readonly number[], c: SocietyCoefficients): Primaries {
  if (
    rolls.length !== PRIMARY_STATS.length ||
    rolls.some((r) => !Number.isInteger(r) || r < 0 || r >= ROLL_SPAN)
  )
    throw new RangeError("kRolls must be six integers in 0..9999");
  const span = c.cyborg.kMaxPm - c.cyborg.kMinPm + 1;
  const [str = 0, dex = 0, agi = 0, vit = 0, int = 0, wis = 0] = rolls.map(
    (roll) => c.cyborg.kMinPm + Math.floor((span * roll) / ROLL_SPAN),
  );
  return { str, dex, agi, vit, int, wis };
}

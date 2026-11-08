// 밸런스 분석(/dev/balance [분포 상성]·[스탯 영향도] 탭) 공용 자료 모양과 순수 계산 —
// docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)".
// 서버(tRPC balanceAnalysis.*, apps/server/src/battleLab/analysis*.ts)와 화면(apps/game/src/editor/balance/analysis/)이 같이 쓴다.
// 판정(전투)은 서버만 한다. 여기 있는 것은 점수 나누기·옮기기, 신뢰 구간, 상성 요약, 비용 어림처럼 판정과 무관한 정수·실수 계산이다.
// 1차 스탯 키는 roster의 PrimaryStat, 차례는 화면 차례 PRIMARY_STATS(STR·VIT·INT·WIS·DEX·AGI)다.
import type { LabDropped, LabPrimaries, LabUnit } from "./battleLab.ts";
import { PRIMARY_STATS, type PrimaryStat } from "./roster.ts";

/** 입력 범위(서버 검사·화면 같이). 수치는 실험 도구의 비용 상한이지 게임 규칙이 아니다 */
export const ANALYSIS_LIMITS = {
  buildsMin: 2,
  buildsMax: 10,
  /** 한 일에 견줄 총합 수(분포 상성) */
  sumsMax: 4,
  /** 1차 총합 */
  sumMin: 6,
  sumMax: 6000,
  /** 분포 가중치 한 칸 */
  weightMax: 1000,
  /** 짝(분포 상성)·변형(영향도)마다 판 수. 짝수(편을 반씩 바꾼다). 영향도는 0 = 전투 없이 2차 스탯만 */
  runsMin: 2,
  runsMax: 400,
  limitSecMin: 30,
  limitSecMax: 600,
  teamMin: 1,
  teamMax: 6,
  /** 영향도 단계 수·한 단계 절댓값(점) */
  stepsMax: 8,
  stepAbsMax: 1000,
  /**
   * 일 하나의 최악 비용(판 수 × 제한 시간 초의 합). 개발 컨테이너에서 초당 약 720~890 전투 초(Verified, ADR) → 모든 판이 제한 시간까지
   * 가면 약 12분. 보통은 판이 제한 시간보다 훨씬 일찍 끝난다(Lv 30 1 대 1 평균 13~18초)
   */
  budgetSeconds: 600_000,
  labelMax: 24,
  levelMin: 1,
  levelMax: 999,
} as const;

/** 분포 하나(가중치는 몫, 합으로 나눠 쓴다). unit = 이 분포만의 유닛 틀(null = 조건의 공통 틀) */
export interface AnalysisBuild {
  readonly id: string;
  readonly label: string;
  readonly weights: LabPrimaries;
  readonly unit: LabUnit | null;
}

/**
 * 시험 조건. template = 공통 유닛 틀(종류·K·무기·장비·스킬·속성값·진형). 1차는 분포가 정한다.
 * - mode "sum": 그 레벨에서 1차 총합 = sum(성장 끔, 레벨은 행 식 LV·맨손 적정에만 든다)
 * - mode "level": 처음 총합 = sum(새 사이보그 60 등)을 나누고 성장률 N5·K로 그 레벨까지 키운다
 * - elements: "keep" = 틀 그대로, "none" = 모두 0, 숫자 = 그 칸(ELEMENT_CODES 차례) 10, 나머지 0
 * - skills false = 고유·장비 스킬 모두 끔, gear false = 무기 밖 장비·직접 값 장비 뺌
 */
export interface AnalysisConditions {
  readonly template: LabUnit;
  readonly level: number;
  readonly mode: "sum" | "level";
  readonly elements: "keep" | "none" | number;
  readonly skills: boolean;
  readonly gear: boolean;
  readonly teamSize: number;
  readonly limitSec: number;
}

export interface AnalysisMatrixInput {
  readonly conditions: AnalysisConditions;
  readonly builds: readonly AnalysisBuild[];
  readonly sums: readonly number[];
  readonly runs: number;
  readonly seed: number;
}

/** 영향도: shift = 총합을 지키며 다른 1차에서 옮겨 옴(음수면 내줌), plus = 그 1차에 +k(총합이 늘어남) */
export type AnalysisSensitivityMode = "shift" | "plus";

export interface AnalysisSensitivityInput {
  readonly conditions: AnalysisConditions;
  readonly weights: LabPrimaries;
  readonly sum: number;
  readonly mode: AnalysisSensitivityMode;
  readonly steps: readonly number[];
  readonly runs: number;
  readonly seed: number;
}

export type AnalysisStartInput =
  | ({ readonly kind: "matrix" } & AnalysisMatrixInput)
  | ({ readonly kind: "sensitivity" } & AnalysisSensitivityInput);

/** 짝 하나의 전투 통계(편 A 쪽에서 본 값). 판정승·같음은 대결 도구와 같은 판정(D-467 229) */
export interface AnalysisDuelStats {
  readonly runs: number;
  readonly wins: number;
  readonly losses: number;
  readonly timeoutWins: number;
  readonly timeoutLosses: number;
  readonly even: number;
  /** 승률(‰) = (승 + 판정승 + 같음 ÷ 2) ÷ 판 수 */
  readonly scorePm: number;
  readonly avgMs: number;
  readonly medianMs: number;
  /** 편마다 판 평균 준 피해 ÷ 평균 전투 시간(초당, 정수) */
  readonly dpsA: number;
  readonly dpsB: number;
  /** 편마다 끝났을 때 서 있던 몫(‰, 유닛 평균) */
  readonly survivalA: number;
  readonly survivalB: number;
}

/** 유닛 하나의 전투 사양 요약(서버 사양 그대로, 공식 수 없음) */
export interface AnalysisUnitSummary {
  /** 성장·장비 뒤 1차 */
  readonly primaries: LabPrimaries;
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly realAttack: number;
  readonly hitPm: number;
  readonly critPm: number;
  readonly critMulPm: number;
  readonly attackIntervalMs: number;
  readonly evadePm: number;
  readonly defenseRatePm: number;
  /** 버팀 = HP + 아머 + 쉴드 */
  readonly ehp: number;
  /** 초당 공격 지수 = 실제 공격력 × 명중 × (1 + 크리 × (배율 − 1)) ÷ 간격(방어 전, 비교용) */
  readonly dpsIndex: number;
}

export interface AnalysisMatrixCell extends AnalysisDuelStats {
  /** 분포 차례 i < j. 값은 i 쪽(편 A)에서 본다 */
  readonly i: number;
  readonly j: number;
}

export interface AnalysisMatrixTable {
  readonly sum: number;
  /** 분포마다(입력 차례) 처음 1차(나눈 값)와 사양 요약 */
  readonly initial: readonly LabPrimaries[];
  readonly units: readonly AnalysisUnitSummary[];
  readonly cells: readonly AnalysisMatrixCell[];
}

export interface AnalysisMatrixResult {
  readonly kind: "matrix";
  readonly revision: number;
  readonly seed: number;
  readonly runs: number;
  readonly builds: readonly { readonly id: string; readonly label: string }[];
  readonly tables: readonly AnalysisMatrixTable[];
  readonly dropped: readonly LabDropped[];
}

export interface AnalysisSensitivityPoint {
  readonly stat: PrimaryStat;
  readonly step: number;
  /** 옮긴 뒤 처음 1차. 옮길 수 없으면(0 아래) null */
  readonly initial: LabPrimaries | null;
  readonly unit: AnalysisUnitSummary | null;
  /** 2차 스탯(rows 차례) */
  readonly secondary: readonly number[] | null;
  /** 이 변형 vs 기준(편 A = 변형). 판 수 0이면 null */
  readonly duel: AnalysisDuelStats | null;
}

export interface AnalysisSensitivityResult {
  readonly kind: "sensitivity";
  readonly revision: number;
  readonly seed: number;
  readonly runs: number;
  readonly mode: AnalysisSensitivityMode;
  readonly sum: number;
  readonly steps: readonly number[];
  /** 2차 스탯 행 ID(실효 표 차례) */
  readonly rows: readonly string[];
  readonly base: {
    readonly initial: LabPrimaries;
    readonly unit: AnalysisUnitSummary;
    readonly secondary: readonly number[];
  };
  /** 기준 vs 기준(같은 유닛, 기대 500‰ — 시드·편 차이 확인용) */
  readonly control: AnalysisDuelStats | null;
  readonly points: readonly AnalysisSensitivityPoint[];
  readonly dropped: readonly LabDropped[];
}

export type AnalysisResult = AnalysisMatrixResult | AnalysisSensitivityResult;

export type AnalysisJobState = "running" | "done" | "failed" | "cancelled";

export interface AnalysisJobView {
  readonly id: string;
  readonly kind: "matrix" | "sensitivity";
  readonly state: AnalysisJobState;
  /** 끝난 판 수 / 전체 판 수 */
  readonly done: number;
  readonly total: number;
  readonly battleSeconds: number;
  readonly startedAtMs: number;
  readonly finishedAtMs: number | null;
  readonly elapsedMs: number;
  /** 실패 까닭(timeout·failed·restart) */
  readonly reason: string | null;
}

export interface AnalysisStatusResponse {
  readonly job: AnalysisJobView;
  readonly result: AnalysisResult | null;
}

export interface AnalysisListResponse {
  readonly jobs: readonly AnalysisJobView[];
  /** 서버에서 지금 도는 분석 일이 있나(누구 것이든) */
  readonly busy: boolean;
}

/** 서버가 받지 않은 까닭(오류 data.reason) */
export const ANALYSIS_REASONS = [
  "invalid_settings",
  "invalid_unit",
  "budget",
  "busy",
  "rate_limited",
  "unknown_job",
  "timeout",
  "failed",
] as const;
export type AnalysisReason = (typeof ANALYSIS_REASONS)[number];

// ── 점수 나누기·옮기기 ─────────────────────────────────────────────

const zeroPrimaries = (): Record<PrimaryStat, number> => ({ str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 });

/**
 * 몫(weights)대로 sum점을 1차 여섯에 정수로 나눈다(가장 큰 나머지, 같으면 화면 차례 앞). 몫 합이 0이면 고르게.
 * 결과 합은 늘 sum이다
 */
export function distributePoints(weights: LabPrimaries, sum: number): LabPrimaries {
  const total = PRIMARY_STATS.reduce((acc, stat) => acc + Math.max(0, weights[stat]), 0);
  const shares = PRIMARY_STATS.map((stat) => (total === 0 ? 1 : Math.max(0, weights[stat])));
  const shareSum = total === 0 ? PRIMARY_STATS.length : total;
  const out = zeroPrimaries();
  const rest: { stat: PrimaryStat; remainder: number; order: number }[] = [];
  let given = 0;
  PRIMARY_STATS.forEach((stat, order) => {
    const raw = (sum * (shares[order] ?? 0)) / shareSum;
    const whole = Math.floor(raw);
    out[stat] = whole;
    given += whole;
    rest.push({ stat, remainder: raw - whole, order });
  });
  rest.sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (let k = 0; k < sum - given; k++) {
    const pick = rest[k % rest.length];
    if (pick) out[pick.stat] += 1;
  }
  return out;
}

/**
 * 총합을 지키며 stat에 k점을 옮긴다: k > 0이면 다른 다섯에서 지금 값 몫대로 빼 오고, k < 0이면 stat에서 빼 다섯에 지금 값 몫대로
 * 나눠 준다(다섯이 모두 0이면 고르게). 0 아래로 내려가야 하면 null
 */
export function shiftPoints(primaries: LabPrimaries, stat: PrimaryStat, k: number): LabPrimaries | null {
  if (k === 0) return { ...primaries };
  const others = PRIMARY_STATS.filter((entry) => entry !== stat);
  const otherSum = others.reduce((acc, entry) => acc + primaries[entry], 0);
  if (k > 0 && otherSum < k) return null;
  if (k < 0 && primaries[stat] < -k) return null;
  const moved = Math.abs(k);
  // 다섯에게 줄(또는 뺄) 몫 = 지금 값 몫(다섯이 모두 0이고 주는 쪽이면 고르게)
  const weights = zeroPrimaries();
  for (const entry of others) weights[entry] = otherSum === 0 ? 1 : primaries[entry];
  const portions = distributePoints(weights, moved);
  const out: Record<PrimaryStat, number> = { ...primaries };
  out[stat] = primaries[stat] + k;
  if (k < 0) {
    for (const entry of others) out[entry] = primaries[entry] + portions[entry];
    return out;
  }
  // 빼 올 때 나눈 몫이 그 칸 값을 넘으면(반올림) 넘친 만큼을 다음 칸에서 뺀다(차례 고정)
  let carry = 0;
  for (const entry of others) {
    const want = portions[entry] + carry;
    const take = Math.min(primaries[entry], want);
    carry = want - take;
    out[entry] = primaries[entry] - take;
  }
  for (const entry of others) {
    if (carry === 0) break;
    const take = Math.min(out[entry], carry);
    out[entry] -= take;
    carry -= take;
  }
  return carry === 0 ? out : null;
}

/** stat에 k점을 더한다(총합이 바뀜). 0 아래로 내려가야 하면 null */
export function plusPoints(primaries: LabPrimaries, stat: PrimaryStat, k: number): LabPrimaries | null {
  const value = primaries[stat] + k;
  return value < 0 ? null : { ...primaries, [stat]: value };
}

// ── 통계 ──────────────────────────────────────────────────────────

/** 정규 분포 95% 양쪽 z */
export const Z95 = 1.96;

/**
 * 승률(‰)의 95% 윌슨 구간(‰, 정수). 같음은 반 승으로 센 점수를 그대로 비율로 본다(근사).
 * n = 0이면 0~1000
 */
export function wilsonInterval(
  scorePm: number,
  n: number,
  z: number = Z95,
): { lowPm: number; highPm: number } {
  if (n <= 0) return { lowPm: 0, highPm: 1000 };
  const p = Math.min(1, Math.max(0, scorePm / 1000));
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    lowPm: Math.max(0, Math.round((center - half) * 1000)),
    highPm: Math.min(1000, Math.round((center + half) * 1000)),
  };
}

/** 구간이 500‰(반반)을 넘지 않나: 1 = 확실히 이김, −1 = 확실히 짐, 0 = 가릴 수 없음 */
export function verdictOf(scorePm: number, n: number): 1 | -1 | 0 {
  const { lowPm, highPm } = wilsonInterval(scorePm, n);
  if (lowPm > 500) return 1;
  if (highPm < 500) return -1;
  return 0;
}

/** 짝 칸에서 i가 j를 상대로 낸 승률(‰). 같은 분포는 500, 칸이 없으면 null */
export function matrixScore(cells: readonly AnalysisMatrixCell[], i: number, j: number): number | null {
  if (i === j) return 500;
  const cell = cells.find((entry) => (entry.i === i && entry.j === j) || (entry.i === j && entry.j === i));
  if (!cell) return null;
  return cell.i === i ? cell.scorePm : 1000 - cell.scorePm;
}

export interface RpsBuildSummary {
  /** 다른 분포 모두를 상대로 낸 승률 평균(‰) */
  readonly meanPm: number;
  /** 확실히 이긴(구간이 500 위) 상대 수·진 상대 수 */
  readonly beats: number;
  readonly losesTo: number;
  /** 가장 잘 이기는 상대·가장 크게 지는 상대(분포 차례, 없으면 null) */
  readonly best: number | null;
  readonly worst: number | null;
}

export interface RpsSummary {
  readonly builds: readonly RpsBuildSummary[];
  /** 승률 평균 높은 차례(분포 차례) */
  readonly ranking: readonly number[];
  /** 가위바위보 고리 a > b > c > a(세 짝 모두 확실). 고리마다 가장 작은 차례가 앞, 차례 고정 */
  readonly cycles: readonly (readonly [number, number, number])[];
  /** 모두를 확실히 이긴 분포(우세)·모두에게 확실히 진 분포(열세) */
  readonly dominant: readonly number[];
  readonly dominated: readonly number[];
}

/** 상성 요약(분포 n개, 짝 칸) */
export function rpsSummary(count: number, cells: readonly AnalysisMatrixCell[]): RpsSummary {
  const verdict = (i: number, j: number): 1 | -1 | 0 => {
    const cell = cells.find((entry) => (entry.i === i && entry.j === j) || (entry.i === j && entry.j === i));
    if (!cell) return 0;
    const v = verdictOf(cell.scorePm, cell.runs);
    return cell.i === i ? v : v === 0 ? 0 : v === 1 ? -1 : 1;
  };
  const builds: RpsBuildSummary[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    let seen = 0;
    let beats = 0;
    let losesTo = 0;
    let best: number | null = null;
    let worst: number | null = null;
    let bestScore = -1;
    let worstScore = 1001;
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const score = matrixScore(cells, i, j);
      if (score === null) continue;
      sum += score;
      seen += 1;
      const v = verdict(i, j);
      if (v === 1) beats += 1;
      if (v === -1) losesTo += 1;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
      if (score < worstScore) {
        worstScore = score;
        worst = j;
      }
    }
    builds.push({ meanPm: seen === 0 ? 500 : Math.round(sum / seen), beats, losesTo, best, worst });
  }
  const ranking = builds
    .map((entry, index) => ({ index, meanPm: entry.meanPm }))
    .toSorted((a, b) => b.meanPm - a.meanPm || a.index - b.index)
    .map((entry) => entry.index);
  const cycles: [number, number, number][] = [];
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++)
      for (let c = a + 1; c < count; c++) {
        if (c === b) continue;
        // a > b > c > a (a가 가장 작은 차례라 같은 고리를 한 번만 센다)
        if (verdict(a, b) === 1 && verdict(b, c) === 1 && verdict(c, a) === 1) cycles.push([a, b, c]);
      }
  const others = count - 1;
  const dominant = builds.flatMap((entry, index) => (others > 0 && entry.beats === others ? [index] : []));
  const dominated = builds.flatMap((entry, index) => (others > 0 && entry.losesTo === others ? [index] : []));
  return { builds, ranking, cycles, dominant, dominated };
}

// ── 비용·입력 검사 ────────────────────────────────────────────────

export interface AnalysisCost {
  /** 전투 판 수 */
  readonly battles: number;
  /** 최악 비용(판 수 × 제한 시간 초) */
  readonly battleSeconds: number;
}

/** 분포 n개의 짝 수(i < j) */
export const pairCount = (builds: number): number => (builds * (builds - 1)) / 2;

export function analysisCost(input: AnalysisStartInput): AnalysisCost {
  const battles =
    input.kind === "matrix"
      ? pairCount(input.builds.length) * input.sums.length * input.runs
      : // 1차 여섯 × 단계 + 기준 vs 기준 한 줄
        (PRIMARY_STATS.length * input.steps.length + 1) * input.runs;
  return { battles, battleSeconds: battles * input.conditions.limitSec };
}

const isInt = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

/** 범위·짝수·예산 검사(서버·화면 같이). 형식(타입)은 스키마가 먼저 본다 */
export function analysisProblem(input: AnalysisStartInput): "invalid_settings" | "budget" | null {
  const L = ANALYSIS_LIMITS;
  const c = input.conditions;
  if (!isInt(c.limitSec, L.limitSecMin, L.limitSecMax)) return "invalid_settings";
  if (!isInt(c.teamSize, L.teamMin, L.teamMax)) return "invalid_settings";
  if (!isInt(c.level, L.levelMin, L.levelMax)) return "invalid_settings";
  if (input.kind === "matrix") {
    if (input.builds.length < L.buildsMin || input.builds.length > L.buildsMax) return "invalid_settings";
    if (input.sums.length < 1 || input.sums.length > L.sumsMax) return "invalid_settings";
    if (input.sums.some((sum) => !isInt(sum, L.sumMin, L.sumMax))) return "invalid_settings";
    if (new Set(input.sums).size !== input.sums.length) return "invalid_settings";
    if (new Set(input.builds.map((build) => build.id)).size !== input.builds.length)
      return "invalid_settings";
    if (!isInt(input.runs, L.runsMin, L.runsMax) || input.runs % 2 !== 0) return "invalid_settings";
  } else {
    if (!isInt(input.sum, L.sumMin, L.sumMax)) return "invalid_settings";
    if (input.steps.length < 1 || input.steps.length > L.stepsMax) return "invalid_settings";
    if (input.steps.some((step) => !isInt(Math.abs(step), 1, L.stepAbsMax))) return "invalid_settings";
    if (input.mode === "plus" && input.steps.some((step) => step < 0)) return "invalid_settings";
    if (new Set(input.steps).size !== input.steps.length) return "invalid_settings";
    if (input.runs !== 0 && (!isInt(input.runs, L.runsMin, L.runsMax) || input.runs % 2 !== 0))
      return "invalid_settings";
  }
  return analysisCost(input).battleSeconds > L.budgetSeconds ? "budget" : null;
}

// ── 분포 출발값 ──────────────────────────────────────────────────

const w = (str: number, vit: number, int: number, wis: number, dex: number, agi: number): LabPrimaries => ({
  str,
  vit,
  int,
  wis,
  dex,
  agi,
});

/**
 * 분포 출발값(화면이 이름을 메시지 키 dev_analysis_build_<id>로 보인다). [임시] 기술 출발값 — 성향 모양만 다르게 고른 것이다.
 * 마법 분포(int_wis)는 속성 무기가 없으면 힘을 못 쓰므로 화면이 틀을 따로 고를 수 있다(분포마다 unit)
 */
export const ANALYSIS_BUILD_PRESETS: readonly { readonly id: string; readonly weights: LabPrimaries }[] = [
  { id: "balanced", weights: w(1, 1, 1, 1, 1, 1) },
  { id: "str", weights: w(40, 20, 5, 5, 20, 10) },
  { id: "vit", weights: w(20, 40, 5, 15, 10, 10) },
  { id: "dex_agi", weights: w(15, 10, 5, 5, 35, 30) },
  { id: "int_wis", weights: w(5, 15, 40, 25, 10, 5) },
  { id: "str_dex", weights: w(35, 10, 5, 5, 35, 10) },
  { id: "glass", weights: w(45, 0, 0, 0, 40, 15) },
];

/** 영향도 단계 출발값(점) */
export const ANALYSIS_DEFAULT_STEPS = {
  shift: [-20, -10, 10, 20],
  plus: [5, 10, 20, 40],
} as const;

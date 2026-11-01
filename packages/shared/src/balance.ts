// 밸런스 화면(/dev/balance) 공용 자료 모양 — docs/adr/2026-11-01-balance-screen.md 3절
// 서버(tRPC balance.*, apps/server/src/balance/)와 화면(apps/game/src/editor/balance/)이 같이 쓴다. 계산은 서버만 한다
// (기기는 판정 코드를 받지 않는다). 1차 스탯 키는 roster의 PrimaryStat(str·dex·agi·vit·int·wis)이다.
import type { PrimaryStat } from "./roster.ts";
import type { StatCellField, TuningOverrideView } from "./tuning.ts";

/** 1차 스탯 6개 */
export type BalancePrimaries = Readonly<Record<PrimaryStat, number>>;

/** 1차 스탯 입력 범위(기준 유닛). sim 입력 범위보다 훨씬 작게(대결 비용·넘침) */
export const BALANCE_PRIMARY_MIN = 0;
export const BALANCE_PRIMARY_MAX = 10_000;
/** +몇을 보나(D-458 "1차 스탯 +10") */
export const BALANCE_PLUS = 10;

/** 대결 상한(NAS 부담, ADR 3절). 판 수는 짝수(두 편 차례로 반씩) */
export const BALANCE_LIMITS = {
  runsMin: 2,
  runsMax: 40,
  limitSecMin: 30,
  limitSecMax: 300,
  /** 판 수 × 제한 시간(초) 상한 */
  runSecondsMax: 2400,
  countMin: 1,
  countMax: 3,
} as const;

/** 맨손(유닛 종류의 타고난 무기) 무기 ID */
export const BALANCE_UNARMED = "unarmed";

/** 가중치 칸 하나(화면) */
export interface BalanceCellView {
  readonly field: StatCellField;
  readonly pack: number;
  /** 실효 값(세계 덮어쓰기가 들면 그 값) */
  readonly value: number;
  readonly override: TuningOverrideView | null;
}

/** 가중치 표 한 행(팩 차례, 켜진 행만) */
export interface BalanceRowView {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly shape: "quantity" | "probability";
  /** 모양에 있는 칸(가중치 6개 + base 또는 cap·half) */
  readonly cells: readonly BalanceCellView[];
  /**
   * 이 행을 계산식으로 셈하는가(docs/adr/2026-11-01-formula-editor.md 3절): "pack" = 팩 행 식, "world" = 이 세계에서 바꾼 행 식,
   * null = 가중치. 식으로 셈하는 행은 가중치 칸을 고쳐도 값이 바뀌지 않는다(화면이 표시한다)
   */
  readonly formula: "pack" | "world" | null;
}

export interface BalanceWeaponView {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  /** 공격력 칸(D-465: 하나 또는 둘). 없는 칸은 null */
  readonly physical: { readonly attack: number; readonly appropriate: number } | null;
  readonly elemental: { readonly attack: number; readonly appropriate: number } | null;
  /** 기본 공격이 쓰는 칸 */
  readonly basic: "physical" | "elemental";
}

export interface BalanceDuelSettings {
  readonly primaries: BalancePrimaries;
  readonly weapon: string;
  readonly count: number;
  readonly runs: number;
  readonly seed: number;
  readonly limitSec: number;
}

export interface BalanceTableResponse {
  readonly contentVersion: string;
  /** 세계 설정 판(tuning.save의 expectedRevision) */
  readonly revision: number;
  readonly rows: readonly BalanceRowView[];
  readonly weapons: readonly BalanceWeaponView[];
  /** 기준 유닛 기본값(새 사이보그 평균 1차 10, 맨손) */
  readonly defaults: BalanceDuelSettings;
}

/** 담은 변경 하나: key = `<행 ID>.<칸>`(또는 설정 칸 ID), value null = 팩 값 */
export interface BalanceEdit {
  readonly key: string;
  readonly value: number | null;
}

export interface BalanceContributionInput {
  readonly primaries: BalancePrimaries;
  readonly edits: readonly BalanceEdit[];
}

export interface BalanceDuelsInput extends BalanceDuelSettings {
  readonly edits: readonly BalanceEdit[];
}

/** 담은 변경 수 상한(가중치 칸 18행 × 9칸보다 넉넉히, tuning.save 묶음 상한과 같다) */
export const BALANCE_EDITS_MAX = 200;

/**
 * 서버가 받지 않은 까닭(오류 data.reason): 대결 설정이 상한 밖, 모르는 무기, 다른 대결이 도는 중(서버 전체 하나), 사용자 속도 제한,
 * 워커 제한 시간·오류
 */
export const BALANCE_REASONS = [
  "invalid_settings",
  "unknown_weapon",
  "busy",
  "rate_limited",
  "timeout",
  "failed",
] as const;
export type BalanceReason = (typeof BALANCE_REASONS)[number];

/** 표 한 벌의 기여: 2차 스탯마다 기준 값과 1차 +10 차이(PrimaryStat 키) */
export interface BalanceContributionTable {
  readonly stats: readonly {
    readonly id: string;
    readonly value: number;
    readonly plus: BalancePrimaries;
  }[];
  /** +10이 어느 2차 스탯도 바꾸지 않는 1차(가치 없는 1차) */
  readonly worthless: readonly PrimaryStat[];
}

/** 담은 변경을 tuning.save가 받지 않을 까닭(받으면 null) */
export interface BalanceEditProblem {
  readonly reason: string;
  readonly key: string | null;
  readonly problems: readonly string[];
}

export interface BalanceContributionResponse {
  readonly revision: number;
  readonly current: BalanceContributionTable;
  /** 담은 변경이 없으면 null */
  readonly edited: BalanceContributionTable | null;
  readonly problem: BalanceEditProblem | null;
}

/** 1차 하나의 대결 결과("기준 + 10" 쪽에서 센 수, 두 편 차례를 합침) */
export interface BalanceDuelRow {
  readonly primary: PrimaryStat;
  readonly runs: number;
  readonly wins: number;
  readonly losses: number;
  /** 시간 초과에서 남은 HP 몫이 더 큼·작음·같음 */
  readonly timeoutWins: number;
  readonly timeoutLosses: number;
  readonly timeoutEven: number;
  /** 평균 걸린 시간(ms) */
  readonly avgMs: number;
  /** (승 + 판정승 + 같음 ÷ 2) ÷ 판 수(‰) */
  readonly scorePm: number;
  /** 끝났을 때 남은 (HP + 아머 + 쉴드) 몫의 차(기준 + 10 − 기준)의 판 평균(‰). 모두 이겨도 얼마나 앞서는지 */
  readonly marginPm: number;
}

export interface BalanceDuelsResponse {
  readonly revision: number;
  readonly settings: BalanceDuelSettings;
  readonly current: readonly BalanceDuelRow[];
  readonly edited: readonly BalanceDuelRow[] | null;
  readonly problem: BalanceEditProblem | null;
  /** 서버가 쓴 시간(ms, 워커 띄우기 포함) */
  readonly ms: number;
}

/** "약한 1차" 표시 기준(막지 않음): +10 승률이 이것 이하면(기준과 같은 유닛 = 500‰) */
export const BALANCE_WEAK_SCORE_PM = 500;

/** 승률(‰) = (승 + 판정승 + 같음 ÷ 2) ÷ 판 수 */
export function balanceScorePm(
  row: Pick<BalanceDuelRow, "runs" | "wins" | "timeoutWins" | "timeoutEven">,
): number {
  if (row.runs <= 0) return 0;
  return Math.round(((row.wins + row.timeoutWins) * 1000 + row.timeoutEven * 500) / row.runs);
}

/** 대결 설정이 상한 안인가(서버·화면이 같이 본다) */
export function balanceSettingsProblem(settings: {
  readonly runs: number;
  readonly limitSec: number;
  readonly count: number;
}): "runs" | "limit" | "budget" | "count" | null {
  const l = BALANCE_LIMITS;
  if (
    !Number.isInteger(settings.runs) ||
    settings.runs < l.runsMin ||
    settings.runs > l.runsMax ||
    settings.runs % 2 !== 0
  )
    return "runs";
  if (
    !Number.isInteger(settings.limitSec) ||
    settings.limitSec < l.limitSecMin ||
    settings.limitSec > l.limitSecMax
  )
    return "limit";
  if (!Number.isInteger(settings.count) || settings.count < l.countMin || settings.count > l.countMax)
    return "count";
  if (settings.runs * settings.limitSec > l.runSecondsMax) return "budget";
  return null;
}

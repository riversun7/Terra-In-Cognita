// 밸런스 화면(/dev/balance) 공용 자료 모양 — docs/adr/2026-11-01-balance-screen.md 3절
// 서버(tRPC balance.*, apps/server/src/balance/)와 화면(apps/game/src/editor/balance/)이 같이 쓴다. 계산은 서버만 한다
// (기기는 판정 코드를 받지 않는다). 1차 스탯 키는 roster의 PrimaryStat(str·dex·agi·vit·int·wis)이다.
import type { PrimaryStat } from "./roster.ts";
import { hasUnstorableText } from "./settings.ts";
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

/** 프리셋 목록(표 응답에 들고, 프리셋 저장·지우기의 응답) */
export interface BalancePresetsResponse {
  /** 기준 유닛 프리셋(팩 씨앗 + 화면에서 고친 것·만든 것, ADR "바뀜 (D-467)") */
  readonly presets: readonly BalancePresetView[];
  /** 프리셋을 고칠 수 있는가(DB가 있는 서버) */
  readonly presetsWritable: boolean;
}

export interface BalanceTableResponse extends BalancePresetsResponse {
  readonly contentVersion: string;
  /** 세계 설정 판(tuning.save의 expectedRevision) */
  readonly revision: number;
  readonly rows: readonly BalanceRowView[];
  readonly weapons: readonly BalanceWeaponView[];
  /** 기준 유닛 기본값(새 사이보그 평균 1차 10, 맨손) */
  readonly defaults: BalanceDuelSettings;
}

/** 기준 유닛 프리셋 값(D-467 228 다): 이름(ko·en)·1차 6·무기·인원·판 수·제한 시간. 대결 시드는 담지 않는다 */
export interface BalancePresetValues {
  readonly name: { readonly ko: string; readonly en: string };
  readonly primaries: BalancePrimaries;
  /** 무기 ID(맨손 = BALANCE_UNARMED, 아니면 팩 무기 아이템 ID) */
  readonly weapon: string;
  readonly count: number;
  readonly runs: number;
  readonly limitSec: number;
}

/** 프리셋 출처: 팩 그대로, 팩 프리셋을 화면에서 고침, 화면에서 만듦 */
export const BALANCE_PRESET_SOURCES = ["pack", "edited", "custom"] as const;
export type BalancePresetSource = (typeof BALANCE_PRESET_SOURCES)[number];

/** 프리셋 하나(화면) */
export interface BalancePresetView extends BalancePresetValues {
  readonly id: string;
  readonly source: BalancePresetSource;
  /** DB 줄의 판(줄이 없으면 0). 저장·지우기의 expectedVersion */
  readonly version: number;
  /** 마지막으로 바꾼 사람·때(팩 그대로면 null) */
  readonly updatedBy: string | null;
  readonly updatedAt: number | null;
}

/** 프리셋 저장 입력: id null = 새로 만들기(서버가 ID를 만든다) */
export interface BalancePresetSaveInput {
  readonly id: string | null;
  readonly expectedVersion: number;
  readonly values: BalancePresetValues;
}

/** 프리셋 지우기 입력: 화면에서 만든 것은 지우고, 팩 프리셋은 팩 값으로 되돌린다 */
export interface BalancePresetDeleteInput {
  readonly id: string;
  readonly expectedVersion: number;
}

/** 프리셋 이름 최대 길이(코드 포인트) */
export const BALANCE_PRESET_NAME_MAX = 40;
/** 화면에서 만든 프리셋 수 상한 */
export const BALANCE_CUSTOM_PRESETS_MAX = 50;
/** 화면에서 만든 프리셋 ID 앞머리(팩 분류는 이 앞머리를 받지 않는다) */
export const BALANCE_CUSTOM_PRESET_PREFIX = "dev_";
/** 화면에서 만든 프리셋 ID 모양: dev_ + 16진 12자 */
export const BALANCE_CUSTOM_PRESET_ID = /^dev_[0-9a-f]{12}$/;

/** 코드 포인트 수(짝이 맞는 대리 문자 둘 = 한 글자) */
function codePointLength(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) index += 1;
    count += 1;
  }
  return count;
}

function hasControlText(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** 프리셋 이름 정리: 앞뒤 빈칸을 떼고 1~40 코드 포인트, 제어 문자 없음, DB에 담을 수 있는 글자. 틀리면 null */
export function normalizeBalancePresetName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const length = codePointLength(name);
  if (length === 0 || length > BALANCE_PRESET_NAME_MAX) return null;
  if (hasControlText(name) || hasUnstorableText({ name })) return null;
  return name;
}

/** 프리셋 값 검사(서버·화면 같이): 이름(ko·en)·1차 범위·대결 설정 상한. 무기가 있는지는 부르는 쪽이 본다 */
export function balancePresetProblem(
  values: BalancePresetValues,
): "name" | "primaries" | "runs" | "limit" | "budget" | "count" | null {
  if (
    normalizeBalancePresetName(values.name.ko) === null ||
    normalizeBalancePresetName(values.name.en) === null
  )
    return "name";
  const primaries = Object.values(values.primaries);
  if (
    primaries.length !== 6 ||
    primaries.some(
      (value) => !Number.isInteger(value) || value < BALANCE_PRIMARY_MIN || value > BALANCE_PRIMARY_MAX,
    )
  )
    return "primaries";
  return balanceSettingsProblem(values);
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
 * 워커 제한 시간·오류, 프리셋 값이 틀림·없는 프리셋·판 충돌(다른 사람이 먼저 바꿈)·화면에서 만든 프리셋 수 상한
 */
export const BALANCE_REASONS = [
  "invalid_settings",
  "unknown_weapon",
  "busy",
  "rate_limited",
  "timeout",
  "failed",
  "invalid_preset",
  "unknown_preset",
  "preset_conflict",
  "too_many_presets",
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

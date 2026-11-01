// 설정 칸(49) 공용 표·자료 모양 — docs/adr/2026-11-01-dev-settings-panel.md(D1)
// 서버(tRPC tuning.*)·개발자 패널(/dev/tuning)·콘텐츠 형식(packages/content tuning 분류)·규칙 검사(@terra/sim tuningProblems)가 같이 쓴다.
// 값의 층: 실효 값 = 팩 값 위에 그 세계(DB 하나)의 덮어쓰기. 팩이 정본이다.

/** 칸의 저장 단위(게임 규칙 단위, PLAN 7장). 화면은 ms를 시간 글로, pm·bp를 %로도 보인다 */
export const TUNING_UNITS = [
  "ms",
  "pm",
  "bp",
  "pct",
  "cells",
  "count",
  "minor",
  "milli",
  "points",
  "level",
] as const;
export type TuningUnit = (typeof TUNING_UNITS)[number];

export function isTuningUnit(value: unknown): value is TuningUnit {
  return typeof value === "string" && (TUNING_UNITS as readonly string[]).includes(value);
}

/** 이름 끝 괄호의 첫 낱말 → 단위(팩 항목에 unit이 없을 때 보이기만 한다. 새 칸은 unit을 적는다) */
const NAME_UNITS: Readonly<Record<string, TuningUnit>> = {
  ms: "ms",
  "‰": "pm",
  bp: "bp",
  "%": "pct",
  cells: "cells",
  "minor units": "minor",
  cyborgs: "count",
};

/** 영어 이름의 끝 괄호(예: "Retreat dwell (ms)", "Dictatorship reissue loyalty share (‰, D-444)")에서 단위를 읽는다. 모르면 null */
export function tuningUnitFromName(nameEn: string): TuningUnit | null {
  const match = /\(([^()]*)\)\s*$/.exec(nameEn);
  if (!match) return null;
  const first = (match[1] ?? "").split(",")[0]?.trim() ?? "";
  return NAME_UNITS[first] ?? null;
}

/**
 * 49 코드 앞 글자 무리, 49 차례(§1 T 시간·유닛, §2 M 맵·영토·건물, §3 P 생산·물류, §4 E 경제, §5 C 전투,
 * §6 F 크리쳐·아이템·스킬, §6.5 N 수치·공식, §7 S 세력·사회, §7.5 U 우주, §8 B BM). 그 밖의 글자는 글자 차례로 뒤에,
 * 코드 없는 칸(결정 ID 칸)은 맨 끝("")
 */
export const TUNING_FAMILIES = ["T", "M", "P", "E", "C", "F", "N", "S", "U", "B"] as const;
export type KnownTuningFamily = (typeof TUNING_FAMILIES)[number];

/** 칸 코드(예: "N13") → 무리 글자("N"). 코드가 없으면 "" */
export function tuningFamilyOf(code: string): string {
  const match = /^([A-Z])[0-9]/.exec(code);
  return match ? (match[1] ?? "") : "";
}

/** 무리 차례(작을수록 앞) */
export function tuningFamilyRank(family: string): number {
  if (family === "") return TUNING_FAMILIES.length + 26;
  const known = (TUNING_FAMILIES as readonly string[]).indexOf(family);
  return known >= 0 ? known : TUNING_FAMILIES.length + (family.codePointAt(0) ?? 90) - 65;
}

/** 코드 안 번호(정렬용, "N13" → 13). 없으면 0 */
export function tuningCodeNumber(code: string): number {
  const match = /^[A-Z]([0-9]{1,2})$/.exec(code);
  return match ? Number(match[1]) : 0;
}

/**
 * 칸이 어디에 듣나(ADR 7절)
 * - live: 서버가 쓸 때마다 실효 값을 읽는다(다음 요청부터)
 * - sim: 규칙 코드 표(@terra/sim TUNING_KEYS)에는 있지만 서버는 아직 읽지 않는다(시뮬레이터·내보내기에만)
 * - none: 코드 표에 없는 ID(아무도 읽지 않는다)
 */
export const TUNING_SCOPES = ["live", "sim", "none"] as const;
export type TuningScope = (typeof TUNING_SCOPES)[number];

/** 덮어쓰기가 지금 듣는가. 아니면 까닭(켤 때 본다: 팩에서 빠진 ID, 지금 팩 범위 밖, 다른 칸과 맞지 않음) */
export const TUNING_OVERRIDE_STATES = ["applied", "unknown_entry", "out_of_range", "rules_conflict"] as const;
export type TuningOverrideState = (typeof TUNING_OVERRIDE_STATES)[number];

/**
 * 여러 칸 규칙 문제 코드(@terra/sim tuningProblems). 서버가 덮어쓰기를 받지 않을 때 오류 data.details에 싣는다
 */
export const TUNING_PROBLEMS = [
  "n9_fit",
  "n6_order",
  "n36_fit",
  "n39_order",
  "crowd_order",
  "unrest_order",
  "lifespan_order",
  "fatigue_order",
  "wage_order",
  "employer_order",
  "food_order",
] as const;
export type TuningProblem = (typeof TUNING_PROBLEMS)[number];

export function isTuningProblem(value: unknown): value is TuningProblem {
  return typeof value === "string" && (TUNING_PROBLEMS as readonly string[]).includes(value);
}

/** 서버가 받지 않은 까닭(오류 data.reason). rate_limited·cross_origin은 tRPC 전체 규칙 */
export const TUNING_REASONS = [
  "unknown_entry",
  "out_of_range",
  "rules_conflict",
  "structural_unconfirmed",
  "invalid_note",
  "revision_conflict",
  "tuning_locked",
  "rate_limited",
] as const;
export type TuningReason = (typeof TUNING_REASONS)[number];

/** 메모 길이 상한(코드 포인트) */
export const TUNING_NOTE_MAX = 200;
/** 최근 바꿈 줄 수 */
export const TUNING_HISTORY_LIMIT = 30;

/** 칸 값 한계(팩 스키마와 같다: 시각 ms가 커서 10^12) */
export const TUNING_VALUE_LIMIT = 1_000_000_000_000;

/** 덮어쓰기 하나(화면) */
export interface TuningOverrideView {
  readonly value: number;
  /** 저장할 때의 팩 값. 지금 팩 값과 다르면 "팩 값이 바뀜" */
  readonly packValueAtSave: number;
  /** 저장할 때의 팩 판(core@N) */
  readonly contentVersionAtSave: string;
  readonly note: string | null;
  /** 바꾼 사람의 계정 이름(지운 계정이면 null) */
  readonly updatedBy: string | null;
  /** ms */
  readonly updatedAt: number;
  readonly state: TuningOverrideState;
  /** state가 rules_conflict일 때 문제 코드 */
  readonly problems: readonly TuningProblem[];
}

/** 칸 하나(화면). 이름·단위·범위는 팩 항목 그대로 */
export interface TuningEntryView {
  readonly id: string;
  readonly code: string;
  readonly name: { readonly ko: string; readonly en: string };
  /** 팩 항목의 unit, 없으면 이름에서 읽은 값, 그것도 없으면 null */
  readonly unit: TuningUnit | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly structural: boolean;
  readonly packValue: number;
  /** 실효 값(덮어쓰기가 듣으면 그 값) */
  readonly value: number;
  readonly scope: TuningScope;
  readonly override: TuningOverrideView | null;
}

/** 팩에 없는 ID의 덮어쓰기(되돌리기만) */
export interface TuningOrphanView {
  readonly id: string;
  readonly override: TuningOverrideView;
}

export interface TuningListResponse {
  readonly contentVersion: string;
  readonly contentHash: string;
  /** 쓰기 잠금(TUNING_EDIT=off, ADR 9절) */
  readonly locked: boolean;
  /** 실효 값 판(바뀔 때마다 +1, 켤 때 0) */
  readonly revision: number;
  /** 팩 차례 */
  readonly entries: readonly TuningEntryView[];
  readonly orphans: readonly TuningOrphanView[];
}

export const TUNING_HISTORY_ACTIONS = ["set", "revert", "revert_all", "absorbed"] as const;
export type TuningHistoryAction = (typeof TUNING_HISTORY_ACTIONS)[number];

/** 최근 바꿈 한 줄(감사 기록) */
export interface TuningHistoryRow {
  readonly at: number;
  readonly action: TuningHistoryAction;
  /** 사람 계정 이름(시스템이면 null) */
  readonly actor: string | null;
  /** 칸 ID(모두 되돌리기는 지운 칸들) */
  readonly ids: readonly string[];
  /** 앞 값(덮어쓰기가 없었으면 null). 모두 되돌리기는 null */
  readonly before: number | null;
  /** 뒤 값(되돌리기면 null) */
  readonly after: number | null;
  readonly note: string | null;
}

export interface TuningHistoryResponse {
  readonly rows: readonly TuningHistoryRow[];
}

/**
 * 메모 정리·검사: 앞뒤 빈칸을 떼고 0~TUNING_NOTE_MAX 코드 포인트, 제어 문자 없음, NUL·짝 없는 대리 문자 없음(DB text·jsonb가
 * 받지 않는다). 빈 메모·없음은 null, 맞으면 정리한 글, 틀리면 false
 */
export function normalizeTuningNote(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return false;
  const note = raw.trim();
  if (note === "") return null;
  let length = 0;
  for (let index = 0; index < note.length; index++) {
    const code = note.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = note.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    length += 1;
  }
  return length <= TUNING_NOTE_MAX ? note : false;
}

/** 내보내기 차이(@terra/content tuningDiffSchema와 같은 모양, docs/adr/2026-11-01-dev-settings-panel.md 11절) */
export interface TuningDiffView {
  readonly format: "terra-tuning-diff";
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly packId: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly changes: readonly {
    readonly id: string;
    readonly code: string;
    readonly from: number;
    readonly to: number;
  }[];
}

export interface TuningExportResponse {
  readonly diff: TuningDiffView;
  /** 받을 파일 이름(예: tuning-core@15-20261101-1343.json) */
  readonly fileName: string;
}

/** 시간(ms)을 일·시·분·초·ms로 나눈다(화면이 언어에 맞게 붙인다). 음수는 절댓값으로 나누고 sign을 돌려준다 */
export function durationParts(ms: number): {
  sign: -1 | 1;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  millis: number;
} {
  const sign = ms < 0 ? -1 : 1;
  let rest = Math.abs(Math.trunc(ms));
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  return { sign, days, hours, minutes, seconds, millis: rest - seconds * 1000 };
}

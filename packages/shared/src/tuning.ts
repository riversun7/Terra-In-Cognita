// 설정 칸(49) 공용 표·자료 모양 — docs/adr/2026-11-01-dev-settings-panel.md(D1)
// 서버(tRPC tuning.*)·개발자 패널(/dev/tuning)·콘텐츠 형식(packages/content tuning 분류)·규칙 검사(@terra/sim tuningProblems)가 같이 쓴다.
// 값의 층: 실효 값 = 팩 값 위에 그 세계(DB 하나)의 덮어쓰기. 팩이 정본이다.
import type { EntryDiffChange, RetiredIdRow } from "./contentEdit.ts";

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
  // 무게(g, 기본 단위가 1g인 광석 등. D-506 채집 시설 창고 용량)
  "grams",
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
 * 패널 분야 페이지(docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 분야별 페이지)"). 칸이 어느 페이지에 서는지는
 * 그 칸을 읽는 규칙 코드가 정한다(@terra/sim tuningPageOf). 차례 = 화면 탭 차례, 맨 끝은 그 밖(사이보그·랭킹·영토·스위치 등)
 */
export const TUNING_PAGES = ["society", "npc", "gardener", "holdings", "combat", "economy", "other"] as const;
export type TuningPage = (typeof TUNING_PAGES)[number];

export function isTuningPage(value: unknown): value is TuningPage {
  return typeof value === "string" && (TUNING_PAGES as readonly string[]).includes(value);
}

/**
 * 칸이 어디에 듣나(ADR 7절)
 * - live: 서버가 쓸 때마다 실효 값을 읽는다(다음 요청부터)
 * - sim: 규칙 코드 표(@terra/sim TUNING_KEYS)에는 있지만 서버는 아직 읽지 않는다(시뮬레이터·내보내기에만)
 * - none: 코드 표에 없는 ID(아무도 읽지 않는다)
 */
export const TUNING_SCOPES = ["live", "sim", "none"] as const;
export type TuningScope = (typeof TUNING_SCOPES)[number];

/**
 * 켤 때 덮어쓰기를 지운 까닭(감사 tuning.dropped, ADR 6절): 새 팩에 없는 칸(빠짐·이름 바뀜), 단위가 바뀜, 새 범위 밖,
 * 저장 차례대로 얹을 때 다른 칸과 맞지 않음. 팩이 더 나중에 바꾼 칸은 tuning.pack_won이다(까닭 없음)
 */
export const TUNING_DROP_REASONS = [
  "unknown_entry",
  "unit_changed",
  "out_of_range",
  "rules_conflict",
  // 계산식 덮어쓰기가 새 팩의 그 칸 변수로 읽히지 않음(docs/adr/2026-11-01-formula-editor.md)
  "invalid_formula",
] as const;
export type TuningDropReason = (typeof TUNING_DROP_REASONS)[number];

export function isTuningDropReason(value: unknown): value is TuningDropReason {
  return typeof value === "string" && (TUNING_DROP_REASONS as readonly string[]).includes(value);
}

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
  // N45 구인 카드(D-469): 레벨마다 카드 수·토탈 스탯 최소 ≤ 최대, 원소 수 1~4·최소 ≤ 최대, 속성 점수가 원소 수 안에 들어감
  "n45_fit",
  // 가중치 표(stat_rows): 켜진 모든 행에서 가중치가 0인 1차 스탯(가치 없는 1차, D-458). docs/adr/2026-11-01-balance-screen.md 1절
  "stat_primary_unused",
  // 초기 스탯 합 상한(D-534): 사이보그 합 N9·휴먼·크리쳐 최대 ≤ 100, 구인 카드 토탈·유전자 총합 상한 ≤ 휴먼 최대, 컨디션 상한 ≥ 0
  "stat_sum_cap",
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
  "duplicate_entry",
  "revision_conflict",
  "rate_limited",
  // 계산식이 그 칸 변수로 읽히지 않음(data.details = 식 오류 코드, docs/adr/2026-11-01-formula-editor.md)
  "invalid_formula",
] as const;
export type TuningReason = (typeof TUNING_REASONS)[number];

/** 한 묶음에 담는 계산식 수 상한 */
export const TUNING_FORMULAS_MAX = 40;

/** 메모 길이 상한(코드 포인트) */
export const TUNING_NOTE_MAX = 200;
/** 한 묶음(tuning.apply)에 담는 칸 수 상한 */
export const TUNING_APPLY_MAX = 200;
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
  /** 분야 페이지(규칙 코드가 정한다, 모르는 칸은 "other") */
  readonly page: TuningPage;
  /** 쉬운 풀이(팩 항목 desc, 없으면 null) */
  readonly desc: { readonly ko: string; readonly en: string } | null;
  /** 출처(팩 항목 source: ADR·기획 결정 ID, 없으면 null) */
  readonly source: string | null;
}

export interface TuningListResponse {
  readonly contentVersion: string;
  readonly contentHash: string;
  /** 세계 설정 판(DB tuning_revision, 덮어쓰기를 바꿀 때마다 +1). 쓰기의 expectedRevision으로 보낸다 */
  readonly revision: number;
  /** 팩 차례 */
  readonly entries: readonly TuningEntryView[];
  /** 가중치 표(stat_rows) 칸 덮어쓰기 수(밸런스 화면 /dev/balance에서 본다) */
  readonly statOverrides: number;
  /** 계산식 덮어쓰기 수(밸런스 화면 계산식 탭에서 본다) */
  readonly formulaOverrides?: number;
}

/** 최근 바꿈 동작(감사 기록 tuning.*): 묶음 적용, 모두 되돌리기, 켤 때 팩이 이김, 켤 때 지움 */
export const TUNING_HISTORY_ACTIONS = ["apply", "revert_all", "pack_won", "dropped"] as const;
export type TuningHistoryAction = (typeof TUNING_HISTORY_ACTIONS)[number];

/** 최근 바꿈 한 칸: 앞·뒤 덮어쓰기 값(없으면 null = 팩 값) */
export interface TuningHistoryChange {
  readonly id: string;
  readonly before: number | null;
  readonly after: number | null;
  /** 켤 때 지운 까닭(dropped), 팩이 이긴 칸은 그때 팩 값(pack_won) */
  readonly reason: TuningDropReason | null;
  readonly packValue: number | null;
}

/** 최근 바꿈 한 식: 앞·뒤 덮어쓴 식(없으면 null = 팩 식) */
export interface TuningHistoryFormulaChange {
  readonly id: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly reason: TuningDropReason | null;
}

/** 최근 바꿈 한 줄(감사 기록) */
export interface TuningHistoryRow {
  readonly at: number;
  readonly action: TuningHistoryAction;
  /** 사람 계정 이름(시스템이면 null) */
  readonly actor: string | null;
  /** 이 바꿈 뒤의 세계 설정 판(모르면 null) */
  readonly revision: number | null;
  readonly changes: readonly TuningHistoryChange[];
  /** 계산식 바꿈(있을 때만, docs/adr/2026-11-01-formula-editor.md) */
  readonly formulas?: readonly TuningHistoryFormulaChange[];
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
  /** 가중치 표 칸 차이(덮어쓰기가 있을 때만, docs/adr/2026-11-01-balance-screen.md 2절) */
  readonly statRows?: readonly StatCellChange[];
  /** 팩 항목 차이(스킬·아이템·유닛 종류·아이템 분류 자료 덮어쓰기가 있을 때만, docs/adr/2026-11-01-skill-editor.md 7절) */
  readonly entries?: readonly EntryDiffChange[];
  /**
   * 그 세계에서 만든 뒤 지운 항목 ID(은퇴 ID, 있을 때만, docs/adr/2026-11-01-item-editor.md 4절). `pnpm tuning:apply`는 이 ID를 새 항목으로
   * 넣지 않고, 팩에 이미 있으면 알린다(종료 코드 1)
   */
  readonly retiredIds?: readonly RetiredIdRow[];
  /** 계산식 차이(덮어쓰기가 있을 때만, docs/adr/2026-11-01-formula-editor.md): from = 팩 식, to = 덮어쓴 식 */
  readonly formulas?: readonly { readonly id: string; readonly from: string; readonly to: string }[];
}

// ── 가중치 표(콘텐츠 팩 stat_rows) 칸 — 밸런스 화면(/dev/balance, docs/adr/2026-11-01-balance-screen.md 1절) ──
// 칸 하나 = 행 하나의 가중치 6개(팩 weights 차례 STR·DEX·AGI·VIT·INT·WIS) 또는 양 모양 기본(base)·확률 모양 상한(cap)·반감 상수(half).
// 덮어쓰기 키는 `<행 ID>.<칸>`이고 설정 칸 덮어쓰기(tuning_overrides)와 같은 표·판·감사 기록에 든다(점이 있어 설정 칸 ID와 겹치지 않는다).

/** 가중치 칸(팩 weights 차례 = 규칙 차례) */
export const STAT_WEIGHT_FIELDS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type StatWeightField = (typeof STAT_WEIGHT_FIELDS)[number];
/** 칸 이름 전체 */
export const STAT_CELL_FIELDS = [...STAT_WEIGHT_FIELDS, "base", "cap", "half"] as const;
export type StatCellField = (typeof STAT_CELL_FIELDS)[number];

export function isStatCellField(value: unknown): value is StatCellField {
  return typeof value === "string" && (STAT_CELL_FIELDS as readonly string[]).includes(value);
}

/** 덮어쓰기 키 모양(DB 검사 tuning_overrides_id_format과 같은 칸 이름) */
export const STAT_CELL_KEY = /^([a-z][a-z0-9_]{1,47})\.(str|dex|agi|vit|int|wis|base|cap|half)$/;

export function statCellKey(row: string, field: StatCellField): string {
  return `${row}.${field}`;
}

/** 키 → 행·칸. 가중치 칸 키가 아니면 null(설정 칸 ID) */
export function parseStatCellKey(key: string): { row: string; field: StatCellField } | null {
  const match = STAT_CELL_KEY.exec(key);
  const row = match?.[1];
  const field = match?.[2];
  return row !== undefined && isStatCellField(field) ? { row, field } : null;
}

/** 칸의 저장 단위: 가중치·상한 ‰, 기본·반감 상수 점수 */
export function statCellUnit(field: StatCellField): TuningUnit {
  return field === "base" || field === "half" ? "points" : "pm";
}

/** 칸 기술 범위(양 끝 포함) = 팩 스키마(stat_rows)·sim 입력 범위(MAX_WEIGHT_PM·MAX_STAT_INPUT)와 같다 */
export const STAT_CELL_LIMITS: Readonly<
  Record<StatCellField, { readonly min: number; readonly max: number }>
> = {
  str: { min: -100_000, max: 100_000 },
  dex: { min: -100_000, max: 100_000 },
  agi: { min: -100_000, max: 100_000 },
  vit: { min: -100_000, max: 100_000 },
  int: { min: -100_000, max: 100_000 },
  wis: { min: -100_000, max: 100_000 },
  base: { min: -10_000_000, max: 10_000_000 },
  cap: { min: 0, max: 1000 },
  half: { min: 1, max: 10_000_000 },
};

export function statCellInRange(field: StatCellField, value: number): boolean {
  const limit = STAT_CELL_LIMITS[field];
  return Number.isSafeInteger(value) && value >= limit.min && value <= limit.max;
}

/** 모양마다 있는 칸(가중치 6개 + 양 모양 base, 확률 모양 cap·half) */
export function statCellFieldsOf(shape: "quantity" | "probability"): readonly StatCellField[] {
  return shape === "quantity" ? [...STAT_WEIGHT_FIELDS, "base"] : [...STAT_WEIGHT_FIELDS, "cap", "half"];
}

/** 내보내기 차이의 가중치 칸 하나: from = 내보낼 때의 팩 값, to = 덮어쓰기 값 */
export interface StatCellChange {
  readonly row: string;
  readonly field: StatCellField;
  readonly from: number;
  readonly to: number;
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

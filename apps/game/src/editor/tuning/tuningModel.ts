// 설정 칸 패널 순수 코드 — 찾기·거르기·무리 나누기, 담은 변경, 값 글·입력 검사, 서버 오류 → 문구 키, 49 칸 목록 상태(시험 대상).
// docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜: D-462"·"바뀜 (2026-11-08 분야별 페이지)"·"바뀜 (2026-11-08 화면 개편)".
// 판정은 서버가 한다(범위·규칙 검사). 기기는 보이기만 하고, 입력 검사는 보내기 전에 알려 주는 것뿐이다.
import {
  type TuningEntryView,
  type TuningPage,
  type TuningProblem,
  type TuningReason,
  type TuningScope,
  type TuningUnit,
  TUNING_PAGES,
  TUNING_REASONS,
  TUNING_UNITS,
  TUNING_VALUE_LIMIT,
  durationParts,
  isTuningPage,
  isTuningProblem,
  tuningCodeNumber,
  tuningFamilyOf,
  tuningFamilyRank,
} from "@terra/shared/tuning";
import { field } from "../../net/json.ts";

/** 반영 범위 거르기: 전체 또는 범위 하나(서버 즉시·시뮬만·연결 없음) */
export const SCOPE_FILTERS = ["all", "live", "sim", "none"] as const satisfies readonly (
  | TuningScope
  | "all"
)[];
export type ScopeFilter = (typeof SCOPE_FILTERS)[number];

/** 무리 고르기에서 "모든 무리" */
export const ALL_FAMILIES = "*";
/** 단위 고르기에서 "모든 단위"·"단위 없음" */
export const ALL_UNITS = "*";
export const NO_UNIT = "-";

/** 담은 변경: 칸 ID → 새 값(null = 팩 값으로 되돌리기). 넣은 차례를 지킨다 */
export type Pending = ReadonlyMap<string, number | null>;

/** 페이지 탭 "전체"(분야를 가리지 않음) */
export const ALL_PAGES = "all";
export type TuningPageTab = TuningPage | typeof ALL_PAGES;
/** 탭 차례: 전체 → 분야 페이지(@terra/shared TUNING_PAGES 차례) */
export const TUNING_PAGE_TABS: readonly TuningPageTab[] = [ALL_PAGES, ...TUNING_PAGES];

/** 저장해 둔 탭 글 → 탭(모르는 값은 null) */
export function parsePageTab(value: unknown): TuningPageTab | null {
  if (value === ALL_PAGES) return ALL_PAGES;
  return isTuningPage(value) ? value : null;
}

/** 탭마다 칸 수(전체 포함) */
export function pageCounts(entries: readonly TuningEntryView[]): Record<TuningPageTab, number> {
  // 페이지가 늘면 타입 검사가 여기서 알린다
  const counts: Record<TuningPageTab, number> = {
    [ALL_PAGES]: entries.length,
    society: 0,
    npc: 0,
    gardener: 0,
    holdings: 0,
    combat: 0,
    economy: 0,
    other: 0,
  };
  for (const entry of entries) counts[entry.page] += 1;
  return counts;
}

/** 탭마다 바뀐 칸 수(덮어쓰기가 있거나 담은 칸, 전체 포함) — 분야 목록의 표시 */
export function pageChangedCounts(
  entries: readonly TuningEntryView[],
  pending: Pending,
): Record<TuningPageTab, number> {
  const counts = pageCounts([]);
  for (const entry of entries) {
    if (entry.override === null && !pending.has(entry.id)) continue;
    counts[ALL_PAGES] += 1;
    counts[entry.page] += 1;
  }
  return counts;
}

export interface TuningQuery {
  readonly text: string;
  /** 바꾼 칸만(덮어쓰기·담은 변경) */
  readonly changedOnly: boolean;
  readonly scope: ScopeFilter;
  /** 단위(TuningUnit) 또는 ALL_UNITS·NO_UNIT */
  readonly unit: string;
  /** 무리 글자("" = 코드 없음) 또는 ALL_FAMILIES */
  readonly family: string;
  /** 분야 페이지 또는 ALL_PAGES */
  readonly page: TuningPageTab;
}

/** 아무것도 거르지 않는 질의(페이지만 고른다) */
export const openQuery = (page: TuningPageTab): TuningQuery => ({
  text: "",
  changedOnly: false,
  scope: "all",
  unit: ALL_UNITS,
  family: ALL_FAMILIES,
  page,
});

/**
 * 찾는 글이 코드·ID·이름(ko·en)·풀이(ko·en)·출처에 들어 있는가(대소문자 무시).
 * 빈칸으로 나눈 낱말이 모두 어딘가에 있으면 맞는다(예: "반란 S26").
 */
export function matchesSearch(entry: TuningEntryView, text: string): boolean {
  const words = text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length === 0) return true;
  const haystack = [
    entry.code,
    entry.id,
    entry.name.ko,
    entry.name.en,
    entry.desc?.ko ?? "",
    entry.desc?.en ?? "",
    entry.source ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** 칸 단위 → 단위 고르기 값 */
export const unitKey = (unit: TuningUnit | null): string => unit ?? NO_UNIT;

export function filterEntries(
  entries: readonly TuningEntryView[],
  query: TuningQuery,
  pending: Pending,
): TuningEntryView[] {
  return entries.filter((entry) => {
    if (query.page !== ALL_PAGES && entry.page !== query.page) return false;
    if (query.family !== ALL_FAMILIES && tuningFamilyOf(entry.code) !== query.family) return false;
    if (query.changedOnly && entry.override === null && !pending.has(entry.id)) return false;
    if (query.scope !== "all" && entry.scope !== query.scope) return false;
    if (query.unit !== ALL_UNITS && unitKey(entry.unit) !== query.unit) return false;
    return matchesSearch(entry, query.text);
  });
}

export interface TuningGroup {
  /** 무리 글자("" = 코드 없음) */
  readonly family: string;
  readonly entries: readonly TuningEntryView[];
}

/** 49 차례 무리로 나눈다. 무리 안은 코드 번호 차례, 같으면 팩 차례 */
export function groupEntries(entries: readonly TuningEntryView[]): TuningGroup[] {
  const groups = new Map<string, { entry: TuningEntryView; index: number }[]>();
  entries.forEach((entry, index) => {
    const family = tuningFamilyOf(entry.code);
    const list = groups.get(family) ?? [];
    list.push({ entry, index });
    groups.set(family, list);
  });
  return [...groups.entries()]
    .toSorted(([a], [b]) => tuningFamilyRank(a) - tuningFamilyRank(b))
    .map(([family, list]) => ({
      family,
      entries: list
        .toSorted(
          (a, b) => tuningCodeNumber(a.entry.code) - tuningCodeNumber(b.entry.code) || a.index - b.index,
        )
        .map((item) => item.entry),
    }));
}

/** 목록에 있는 무리(49 차례) */
export function familiesOf(entries: readonly TuningEntryView[]): string[] {
  return [...new Set(entries.map((entry) => tuningFamilyOf(entry.code)))].toSorted(
    (a, b) => tuningFamilyRank(a) - tuningFamilyRank(b),
  );
}

/** 목록에 있는 단위(TUNING_UNITS 차례, 단위 없음은 끝) */
export function unitsOf(entries: readonly TuningEntryView[]): string[] {
  const present = new Set(entries.map((entry) => unitKey(entry.unit)));
  return [...TUNING_UNITS.filter((unit) => present.has(unit)), ...(present.has(NO_UNIT) ? [NO_UNIT] : [])];
}

/** 값 입력 글 → 정수(쉼표·밑줄·빈칸은 뺀다). 정수가 아니거나 ±10¹² 밖이면 null */
export function parseValueInput(text: string): number | null {
  const cleaned = text.replaceAll(/[\s,_]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || Math.abs(value) > TUNING_VALUE_LIMIT) return null;
  return value === 0 ? 0 : value;
}

/** 칸 범위 안인가(서버와 같은 규칙: 양 끝 포함) */
export function inRange(entry: Pick<TuningEntryView, "min" | "max">, value: number): boolean {
  return (entry.min === null || value >= entry.min) && (entry.max === null || value <= entry.max);
}

/** 줄 입력 검사: 처음 값과 같음·정수 아님·범위 밖·담을 수 있음 */
export type ValueCheck =
  | { readonly status: "same" }
  | { readonly status: "invalid" }
  | { readonly status: "out_of_range"; readonly value: number }
  | { readonly status: "ok"; readonly value: number };

export function checkValueInput(
  entry: Pick<TuningEntryView, "min" | "max">,
  text: string,
  start: number,
): ValueCheck {
  const value = parseValueInput(text);
  if (value === null) return { status: "invalid" };
  if (value === start) return { status: "same" };
  if (!inRange(entry, value)) return { status: "out_of_range", value };
  return { status: "ok", value };
}

/** 담은 변경을 얹은 값(되돌리기 = 팩 값). 담지 않았으면 지금 값 */
export function stagedValue(entry: TuningEntryView, pending: Pending): number {
  if (!pending.has(entry.id)) return entry.value;
  return pending.get(entry.id) ?? entry.packValue;
}

/** 팩 값과의 차이와 비율(%, 소수 한 자리). 팩 값이 0이면 비율 없음 */
export function deltaOf(value: number, pack: number): { diff: number; percent: number | null } {
  const diff = value - pack;
  return { diff, percent: pack === 0 ? null : Math.round((diff / Math.abs(pack)) * 1000) / 10 };
}

/** 범위 막대 위 자리(0~100%): 범위 양 끝이 다 있을 때만 */
export function rangePositions(
  entry: Pick<TuningEntryView, "min" | "max" | "packValue">,
  value: number,
): { pack: number; now: number } | null {
  if (entry.min === null || entry.max === null || entry.max <= entry.min) return null;
  const { min, max } = entry;
  const at = (v: number) => Math.round(((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 1000) / 10;
  return { pack: at(entry.packValue), now: at(value) };
}

/** 담은 변경 → 서버 묶음(넣은 차례) */
export function pendingChanges(pending: Pending): { id: string; value: number | null }[] {
  return [...pending.entries()].map(([id, value]) => ({ id, value }));
}

/** 새 목록에서 바뀔 것이 없는 담은 변경을 뺀다(다른 사람이 같은 값으로 바꿨거나 칸이 없어짐) */
export function prunePending(
  pending: Pending,
  entries: readonly TuningEntryView[],
): Map<string, number | null> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const next = new Map<string, number | null>();
  for (const [id, value] of pending) {
    const entry = byId.get(id);
    if (!entry) continue;
    const target = value ?? entry.packValue;
    if (target !== entry.value) next.set(id, value);
  }
  return next;
}

/** 쉼표 붙인 수(지금 언어) */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

const DURATION_UNITS = [
  ["days", "day"],
  ["hours", "hour"],
  ["minutes", "minute"],
  ["seconds", "second"],
  ["millis", "millisecond"],
] as const;

/** 시간 글: 0이 아닌 큰 단위 둘까지(예: 7일, 1시간 30분, 500ms) */
export function formatDuration(ms: number, locale: string): string {
  const parts = durationParts(ms);
  const shown = DURATION_UNITS.filter(([key]) => parts[key] !== 0).slice(0, 2);
  const list = shown.length > 0 ? shown : ([["millis", "millisecond"]] as const);
  const text = list
    .map(([key, unit]) =>
      new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(parts[key]),
    )
    .join(" ");
  return parts.sign < 0 ? `−${text}` : text;
}

/** 값 옆 풀이: ms → 시간 글, ‰·만분율 → %, % → %. 그 밖은 null */
export function formatGloss(value: number, unit: TuningUnit | null, locale: string): string | null {
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(ratio);
  switch (unit) {
    case "ms":
      return formatDuration(value, locale);
    case "pm":
      return percent(value / 1000);
    case "bp":
      return percent(value / 10_000);
    case "pct":
      return percent(value / 100);
    default:
      return null;
  }
}

/** ms 칸의 화면 편집 단위(큰 단위부터 내림차순) */
export const DURATION_EDIT_UNITS = ["hours", "minutes", "seconds", "ms"] as const;
export type DurationEditUnit = (typeof DURATION_EDIT_UNITS)[number];

/** 편집 단위 1에 해당하는 밀리초 */
export const DURATION_UNIT_MS: Record<DurationEditUnit, number> = {
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1_000,
  ms: 1,
};

const normZero = (value: number): number => (value === 0 ? 0 : value);

/** 팩 기본값·상한을 보고 고르는 ms 칸의 기본 편집 단위(정밀도 확인 전) */
export function preferredDurationUnit(entry: Pick<TuningEntryView, "packValue" | "max">): DurationEditUnit {
  const packAbs = Math.abs(entry.packValue);
  if (packAbs > 0) {
    if (packAbs >= DURATION_UNIT_MS.hours) return "hours";
    if (packAbs >= DURATION_UNIT_MS.minutes) return "minutes";
    if (packAbs >= DURATION_UNIT_MS.seconds) return "seconds";
    return "ms";
  }
  const maxAbs = entry.max === null ? 0 : Math.abs(entry.max);
  if (maxAbs >= DURATION_UNIT_MS.hours) return "hours";
  if (maxAbs >= DURATION_UNIT_MS.minutes * 2) return "minutes";
  if (maxAbs >= DURATION_UNIT_MS.seconds) return "seconds";
  return "ms";
}

/** 선택 단위에서 허용되는 정수 min~max 범위(ms 경계를 절대 넘지 않게 안쪽으로 올림·내림) */
export function durationEditBounds(
  entry: Pick<TuningEntryView, "min" | "max">,
  unit: DurationEditUnit,
): { min: number | null; max: number | null } {
  const unitMs = DURATION_UNIT_MS[unit];
  if (unitMs === 1) return { min: entry.min, max: entry.max };
  return {
    min: entry.min === null ? null : normZero(Math.ceil(entry.min / unitMs)),
    max: entry.max === null ? null : normZero(Math.floor(entry.max / unitMs)),
  };
}

/** 현재 값(ms)을 손실 없이 해당 단위 정수로 편집할 수 있는지 */
export function canEditDurationInUnit(
  entry: Pick<TuningEntryView, "min" | "max">,
  targetMs: number,
  unit: DurationEditUnit,
): boolean {
  const unitMs = DURATION_UNIT_MS[unit];
  if (targetMs % unitMs !== 0) return false;
  const bounds = durationEditBounds(entry, unit);
  return bounds.min === null || bounds.max === null || bounds.min <= bounds.max;
}

/** 정밀도 손실 없이 편집 가능한 기본 단위(우선 단위 → 나누어떨어지는 가장 큰 단위) */
export function defaultDurationUnitOf(
  entry: Pick<TuningEntryView, "packValue" | "min" | "max">,
  targetMs: number,
): DurationEditUnit {
  const preferred = preferredDurationUnit(entry);
  const startIndex = DURATION_EDIT_UNITS.indexOf(preferred);
  for (let i = startIndex; i < DURATION_EDIT_UNITS.length; i += 1) {
    const unit = DURATION_EDIT_UNITS[i];
    if (unit && canEditDurationInUnit(entry, targetMs, unit)) return unit;
  }
  return "ms";
}

/** ms → 선택 단위 정수(나누어떨어지지 않으면 null) */
export function msToDurationEdit(ms: number, unit: DurationEditUnit): number | null {
  const unitMs = DURATION_UNIT_MS[unit];
  if (ms % unitMs !== 0) return null;
  return normZero(ms / unitMs);
}

/** 선택 단위 정수 → ms 정수(안전 범위 밖이면 null) */
export function durationEditToMs(value: number, unit: DurationEditUnit): number | null {
  const ms = value * DURATION_UNIT_MS[unit];
  if (!Number.isSafeInteger(ms) || Math.abs(ms) > TUNING_VALUE_LIMIT) return null;
  return normZero(ms);
}

/** 선택 단위로 입력한 시간 글 검사(ok.value · out_of_range.value는 항상 ms) */
export function checkDurationInput(
  entry: Pick<TuningEntryView, "min" | "max">,
  text: string,
  startMs: number,
  unit: DurationEditUnit,
): ValueCheck {
  const unitValue = parseValueInput(text);
  if (unitValue === null) return { status: "invalid" };
  const ms = durationEditToMs(unitValue, unit);
  if (ms === null) return { status: "invalid" };
  if (ms === startMs) return { status: "same" };
  if (!inRange(entry, ms)) return { status: "out_of_range", value: ms };
  return { status: "ok", value: ms };
}

/** 서버 오류 → 화면이 쓸 까닭(TUNING_REASONS 또는 공통 코드) */
export type TuningErrorKey =
  | TuningReason
  | "forbidden"
  | "unauthorized"
  | "unavailable"
  | "network"
  | "unknown";

export interface TuningErrorInfo {
  readonly key: TuningErrorKey;
  /** 규칙 문제 코드(data.details, rules_conflict) */
  readonly problems: readonly TuningProblem[];
  readonly sessionEnded: boolean;
}

const isReason = (value: unknown): value is TuningReason =>
  typeof value === "string" && (TUNING_REASONS as readonly string[]).includes(value);

export function tuningErrorOf(error: unknown): TuningErrorInfo {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  const detailsRaw = field(data, "details");
  const problems = Array.isArray(detailsRaw) ? detailsRaw.filter(isTuningProblem) : [];
  if (isReason(reason)) return { key: reason, problems, sessionEnded: false };
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", problems, sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", problems, sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", problems, sessionEnded: false };
    case undefined:
      return { key: "network", problems, sessionEnded: false };
    default:
      return { key: "unknown", problems, sessionEnded: false };
  }
}

/** 49 칸 하나(scripts/build-settings-cells.mjs가 만든 settingsCells.json) */
export interface SettingsCell {
  readonly code: string;
  readonly section: string;
  readonly name: string;
  readonly what: string;
  readonly unit: string;
  readonly start: string;
  readonly basis: string;
  readonly noValue: boolean;
}

export type CellStatus = "connected" | "no_value" | "not_connected";

export interface CellRow {
  readonly cell: SettingsCell;
  readonly status: CellStatus;
  /** 그 코드를 가진 팩 칸 ID */
  readonly ids: readonly string[];
}

/** 49 칸마다 상태(D-462): 팩에 그 코드 칸이 있으면 연결됨, 아니면 출발값이 없으면 값 없음, 있으면 연결 없음 */
export function cellRows(cells: readonly SettingsCell[], entries: readonly TuningEntryView[]): CellRow[] {
  const idsByCode = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.code === "") continue;
    const list = idsByCode.get(entry.code) ?? [];
    list.push(entry.id);
    idsByCode.set(entry.code, list);
  }
  return cells.map((cell) => {
    const ids = idsByCode.get(cell.code) ?? [];
    const status: CellStatus = ids.length > 0 ? "connected" : cell.noValue ? "no_value" : "not_connected";
    return { cell, status, ids };
  });
}

export function cellCounts(rows: readonly CellRow[]): Record<CellStatus, number> & { total: number } {
  const counts = { connected: 0, no_value: 0, not_connected: 0, total: rows.length };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** JSON에서 읽은 값이 칸 목록인지(모양이 틀린 줄은 버린다) */
export function parseSettingsCells(value: unknown): SettingsCell[] {
  const list = field(value, "cells");
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown): SettingsCell[] => {
    const text = (key: string): string | null => {
      const raw = field(item, key);
      return typeof raw === "string" ? raw : null;
    };
    const code = text("code");
    const name = text("name");
    const noValue = field(item, "noValue");
    if (code === null || name === null || typeof noValue !== "boolean") return [];
    return [
      {
        code,
        name,
        noValue,
        section: text("section") ?? "",
        what: text("what") ?? "",
        unit: text("unit") ?? "",
        start: text("start") ?? "",
        basis: text("basis") ?? "",
      },
    ];
  });
}

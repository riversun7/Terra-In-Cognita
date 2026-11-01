// 밸런스 화면 순수 코드 — 담은 칸, 칸 상태, 입력 글, 대결 설정 검사, 서버 오류 → 문구 키, 약한 1차, 숫자 글(시험 대상).
// docs/adr/2026-11-01-balance-screen.md 7절. 판정·계산은 서버가 한다(기기는 판정 코드를 받지 않는다). 여기서는 보이기만 한다.
import {
  BALANCE_PRIMARY_MAX,
  BALANCE_PRIMARY_MIN,
  BALANCE_REASONS,
  BALANCE_WEAK_SCORE_PM,
  type BalanceCellView,
  type BalanceDuelRow,
  type BalanceEdit,
  type BalancePrimaries,
  type BalanceReason,
  type BalanceRowView,
  balanceSettingsProblem,
} from "@terra/shared/balance";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import {
  STAT_CELL_LIMITS,
  type StatCellField,
  TUNING_REASONS,
  type TuningProblem,
  type TuningReason,
  isTuningProblem,
  statCellKey,
} from "@terra/shared/tuning";
import { field } from "../../net/json.ts";

/** 담은 칸: 칸 키 → 새 값(null = 팩 값). 넣은 차례를 지킨다 */
export type Pending = ReadonlyMap<string, number | null>;

/** 칸 상태: 담음, 세계 덮어쓰기(팩과 다름), 팩 값 */
export type CellState = "staged" | "override" | "pack";

export function cellState(row: BalanceRowView, cell: BalanceCellView, pending: Pending): CellState {
  if (pending.has(statCellKey(row.id, cell.field))) return "staged";
  return cell.value !== cell.pack ? "override" : "pack";
}

/** 칸에 보이는 값: 담은 값(null = 팩 값) → 실효 값 */
export function shownValue(row: BalanceRowView, cell: BalanceCellView, pending: Pending): number {
  const key = statCellKey(row.id, cell.field);
  if (!pending.has(key)) return cell.value;
  return pending.get(key) ?? cell.pack;
}

/** 칸 입력 글 → 정수(빈 글·소수·범위 밖이면 null) */
export function parseCellInput(text: string, cellField: StatCellField): number | null {
  const trimmed = text.trim().replaceAll(",", "");
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  const limit = STAT_CELL_LIMITS[cellField];
  return Number.isSafeInteger(value) && value >= limit.min && value <= limit.max ? value : null;
}

/**
 * 칸 하나를 담는다: 실효 값과 같으면 담지 않는다(이미 그 값). 팩 값이면 null(되돌리기)로 담는다(덮어쓰기가 있을 때만 뜻이 있다)
 */
export function stageCell(
  pending: Pending,
  row: BalanceRowView,
  cell: BalanceCellView,
  value: number | null,
): Map<string, number | null> {
  const key = statCellKey(row.id, cell.field);
  const next = new Map(pending);
  const target = value ?? cell.pack;
  if (target === cell.value) next.delete(key);
  else next.set(key, target === cell.pack ? null : target);
  return next;
}

/** 담은 칸 → 서버 입력(밸런스 조회·tuning.save 같은 차례) */
export function editsOf(pending: Pending): BalanceEdit[] {
  return [...pending].map(([key, value]) => ({ key, value }));
}

/** 새 표를 받은 뒤: 바뀔 것이 없어진 칸(담은 값 = 지금 실효 값)과 표에 없는 칸은 뺀다 */
export function prunePending(pending: Pending, rows: readonly BalanceRowView[]): Map<string, number | null> {
  const cells = new Map<string, BalanceCellView>();
  for (const row of rows) for (const cell of row.cells) cells.set(statCellKey(row.id, cell.field), cell);
  const next = new Map<string, number | null>();
  for (const [key, value] of pending) {
    const cell = cells.get(key);
    if (cell && (value ?? cell.pack) !== cell.value) next.set(key, value);
  }
  return next;
}

/** 1차 입력 글 6칸 → 정수 6개(하나라도 틀리면 null) */
export function parsePrimaries(text: Readonly<Record<PrimaryStat, string>>): BalancePrimaries | null {
  const out: Partial<Record<PrimaryStat, number>> = {};
  for (const stat of PRIMARY_STATS) {
    const raw = text[stat].trim();
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    if (value < BALANCE_PRIMARY_MIN || value > BALANCE_PRIMARY_MAX) return null;
    out[stat] = value;
  }
  const { str, vit, int, wis, dex, agi } = out;
  if (str === undefined || vit === undefined || int === undefined) return null;
  if (wis === undefined || dex === undefined || agi === undefined) return null;
  return { str, vit, int, wis, dex, agi };
}

export function primariesText(primaries: BalancePrimaries): Record<PrimaryStat, string> {
  return {
    str: String(primaries.str),
    vit: String(primaries.vit),
    int: String(primaries.int),
    wis: String(primaries.wis),
    dex: String(primaries.dex),
    agi: String(primaries.agi),
  };
}

/** 판 수·제한 시간 고르기(상한 안의 짝수 판 수) */
export const RUN_OPTIONS = [4, 6, 10, 20, 40] as const;
export const LIMIT_OPTIONS = [60, 120, 180, 300] as const;
export const COUNT_OPTIONS = [1, 2, 3] as const;

/** 대결 설정이 서버 상한 안인가(서버도 같은 함수로 본다) */
export const settingsProblem = balanceSettingsProblem;

/** +10 승률이 기준(같은 유닛 50%)을 넘지 못한 1차 — 막지 않고 보이기만 한다 */
export function weakPrimaries(rows: readonly BalanceDuelRow[]): PrimaryStat[] {
  return rows.filter((row) => row.scorePm <= BALANCE_WEAK_SCORE_PM).map((row) => row.primary);
}

/** 차이 글: +15 · −3 · 0 */
export function formatDelta(value: number, locale: string): string {
  const text = new Intl.NumberFormat(locale).format(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** ‰ → % 글(소수 한 자리) */
export function percentText(pm: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10);
}

/** 남은 몫 차(‰) → %p 글(+12.3 · −4 · 0, 소수 한 자리) */
export function marginText(pm: number, locale: string): string {
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(pm) / 10);
  if (pm > 0) return `+${text}`;
  if (pm < 0) return `−${text}`;
  return text;
}

/** ms → 분·초 */
export function minutesSeconds(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** 대결 설정 + 담은 칸의 지문(결과가 지금 입력과 같은지 본다) */
export function duelKey(settings: object, pending: Pending): string {
  return JSON.stringify([settings, [...pending]]);
}

/** 서버 오류 → 문구 키 */
export type BalanceErrorKey =
  | BalanceReason
  | Exclude<TuningReason, "rate_limited">
  | "structural_unconfirmed"
  | "forbidden"
  | "unauthorized"
  | "unavailable"
  | "network"
  | "unknown";

export interface BalanceErrorInfo {
  readonly key: BalanceErrorKey;
  readonly problems: readonly TuningProblem[];
  readonly sessionEnded: boolean;
}

const isBalanceReason = (value: unknown): value is BalanceReason =>
  typeof value === "string" && (BALANCE_REASONS as readonly string[]).includes(value);
const isTuningReason = (value: unknown): value is TuningReason =>
  typeof value === "string" && (TUNING_REASONS as readonly string[]).includes(value);

/** tRPC 오류(밸런스 조회·tuning.save) → 문구 키와 규칙 문제 */
export function balanceErrorOf(error: unknown): BalanceErrorInfo {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  const detailsRaw = field(data, "details");
  const problems = Array.isArray(detailsRaw) ? detailsRaw.filter(isTuningProblem) : [];
  if (isBalanceReason(reason)) return { key: reason, problems, sessionEnded: false };
  if (isTuningReason(reason)) return { key: reason, problems, sessionEnded: false };
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

/** 미리 검사(contribution.problem)의 까닭 글 → 문구 키(모르는 까닭은 unknown) */
export function keyOfReason(reason: string): BalanceErrorKey {
  if (isBalanceReason(reason) || isTuningReason(reason)) return reason;
  return "unknown";
}

/** 미리 검사(contribution.problem)의 규칙 문제만 */
export function problemCodes(problems: readonly string[]): TuningProblem[] {
  return problems.filter(isTuningProblem);
}

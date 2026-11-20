// 유닛 공통 경험치 테이블(팩 분류 exp_table, 48 §2.4 · 49 N8) — 사이보그·휴먼·크리쳐가 같이 쓰는 레벨 구간별 필요 경험치 표.
// 안드로이드는 레벨이 없어 쓰지 않는다(D-416). 판정·서버·편집기가 같은 순수 정수 계산만 쓰도록 초월함수(Math.pow 등)를 두지 않는다.
// 항목 하나는 레벨 L → L+1로 오르는 데 필요한 경험치(requiredExp)다(ID = lv_01..lv_59 → Lv 1..60).
import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentIssueView,
  ContentOverrideView,
  ContentSleepingRow,
} from "./contentEdit.ts";

/** 경험치 테이블 범위·기본 구간 경계(팩 스키마 packages/content/src/schema/expTable.ts와 맞춘다) */
export const EXP_TABLE_LIMITS = {
  /** 표 항목 레벨 최솟값(Lv 1 → Lv 2) */
  levelMin: 1,
  /** 표 항목 레벨 최댓값(Lv 99 → Lv 100) */
  levelMax: 99,
  /** 한 구간 필요 경험치 최솟값 */
  requiredExpMin: 1,
  /** 한 구간 필요 경험치 최댓값 */
  requiredExpMax: 1_000_000_000,
  /** 기본 성장 구간 끝 레벨(1~50: 채집·NPC 활동만으로 1~2개월 내 도달) */
  defaultBaseCapLevel: 50,
  /** 기본 테이블 최고 레벨(50~60: 1~50 누적 경험치와 비슷한 분량으로 난이도 상향) */
  defaultMaxLevel: 60,
  /** 한 묶음 최대 변경 수 */
  changesMax: 120,
  /** 최근 바꿈 조회 개수 */
  historyLimit: 30,
} as const;

/** 서버가 거절할 때 data.reason에 실어 보내는 코드 */
export const EXP_TABLE_EDITOR_REASONS = [
  "invalid_entry",
  "invalid_note",
  "unknown_entry",
  "stale_revision",
  "conflict",
  "validation_failed",
  "rate_limited",
] as const;
export type ExpTableEditorReason = (typeof EXP_TABLE_EDITOR_REASONS)[number];

/** 경험치 테이블 한 줄(팩 exp_table.json 항목 모양) */
export interface ExpTableEntryJson {
  /** 항목 ID("lv_01".."lv_59") */
  readonly id: string;
  /** 시작 레벨(L → L+1 구간) */
  readonly level: number;
  /** 다음 레벨(level + 1)까지 필요한 경험치(정수) */
  readonly requiredExp: number;
}

/** 편집기 목록의 한 줄(실효·팩·덮어쓰기·해시) */
export interface ExpTableRowView {
  readonly entry: ExpTableEntryJson;
  readonly pack: ExpTableEntryJson | null;
  readonly origin: ContentEditOrigin;
  readonly override: ContentOverrideView | null;
  readonly hash: string;
}

/** tRPC expTable.list 응답 */
export interface ExpTableListResponse {
  readonly contentVersion: string;
  readonly revision: number;
  readonly entries: readonly ExpTableRowView[];
  /** 설정 칸 N7 기본 만렙(예: 50) */
  readonly baseMaxLevel: number;
  /** 설정 칸 T4 휴먼 수명 최소(ms, 기본 60일) */
  readonly lifespanMinMs: number;
  /** 설정 칸 T4 휴먼 수명 최대(ms, 기본 90일) */
  readonly lifespanMaxMs: number;
  readonly retired: readonly string[];
  readonly sleeping: readonly ContentSleepingRow[];
}

/** 편집기 묶음 변경 한 줄 */
export type ExpTableChange =
  | { readonly op: "put"; readonly entry: ExpTableEntryJson; readonly baseHash: string | null }
  | { readonly op: "revert"; readonly id: string; readonly baseHash: string }
  | { readonly op: "discard_sleeping"; readonly id: string };

/** tRPC expTable.check 응답 */
export interface ExpTableCheckResponse {
  readonly ok: boolean;
  readonly issues: readonly ContentIssueView[];
}

export type ExpTableHistoryRow = ContentHistoryRow;

/** 레벨 번호(1..99) → 정규 항목 ID("lv_01".."lv_99") */
export function expLevelId(level: number): string {
  const n = Math.max(EXP_TABLE_LIMITS.levelMin, Math.min(EXP_TABLE_LIMITS.levelMax, Math.floor(level)));
  return `lv_${String(n).padStart(2, "0")}`;
}

/** 레벨 오름차순으로 정렬한 새 배열을 돌려준다 */
export function sortExpEntries(entries: readonly ExpTableEntryJson[]): ExpTableEntryJson[] {
  return [...entries].toSorted((a, b) => a.level - b.level);
}

/** 표가 다루는 최고 도달 레벨(마지막 구간 level + 1). 비었으면 1 */
export function expMaxLevelOf(entries: readonly ExpTableEntryJson[]): number {
  let max = 0;
  for (const entry of entries) {
    if (entry.level > max) max = entry.level;
  }
  return max > 0 ? max + 1 : 1;
}

/**
 * 현재 레벨에서 다음 레벨(level + 1)까지 필요한 구간 경험치.
 * 표의 최고 레벨 이상이거나 구간이 없으면 0(만렙 도달).
 */
export function expSpanAt(entries: readonly ExpTableEntryJson[], level: number): number {
  const lv = Math.floor(level);
  if (lv < 1) return 0;
  for (const entry of entries) {
    if (entry.level === lv) return Math.max(0, Math.floor(entry.requiredExp));
  }
  return 0;
}

/**
 * Lv 1(누적 0)에서 목표 레벨(targetLevel)까지 도달하는 데 필요한 총 누적 경험치.
 * targetLevel ≤ 1이면 0, 표 범위를 넘기면 표 전체 누적 합을 돌려준다.
 */
export function cumulativeExpAt(entries: readonly ExpTableEntryJson[], targetLevel: number): number {
  const target = Math.floor(targetLevel);
  if (target <= 1) return 0;
  let sum = 0;
  for (const entry of entries) {
    if (entry.level >= 1 && entry.level < target) sum += Math.max(0, Math.floor(entry.requiredExp));
  }
  return sum;
}

/** 구간별 누적 경험치·비중 요약(표·시각화 공통) */
export interface ExpTableMilestones {
  readonly maxLevel: number;
  readonly baseCapLevel: number;
  /** Lv 1 → baseCapLevel 누적 경험치 */
  readonly expToBaseCap: number;
  /** baseCapLevel → maxLevel 구간 경험치 합 */
  readonly expAfterBaseCap: number;
  /** Lv 1 → maxLevel 총 누적 경험치 */
  readonly totalExp: number;
  /** (baseCapLevel→maxLevel ÷ 1→baseCapLevel)의 1000분율(‰, 1000 = 100%) */
  readonly prestigeRatioPm: number;
  readonly minSpan: number;
  readonly maxSpan: number;
  /** 앞 레벨보다 필요 경험치가 줄어든 레벨 목록(경고 표시용) */
  readonly nonMonotoneLevels: readonly number[];
}

export function expTableMilestones(
  entries: readonly ExpTableEntryJson[],
  baseCapLevel: number = EXP_TABLE_LIMITS.defaultBaseCapLevel,
): ExpTableMilestones {
  const sorted = sortExpEntries(entries);
  const maxLevel = expMaxLevelOf(sorted);
  let expToBaseCap = 0;
  let expAfterBaseCap = 0;
  let minSpan = sorted.length > 0 ? Number.MAX_SAFE_INTEGER : 0;
  let maxSpan = 0;
  const nonMonotoneLevels: number[] = [];
  let prev = 0;
  for (const entry of sorted) {
    const span = Math.max(0, Math.floor(entry.requiredExp));
    if (entry.level < baseCapLevel) expToBaseCap += span;
    else expAfterBaseCap += span;
    if (span < minSpan) minSpan = span;
    if (span > maxSpan) maxSpan = span;
    if (prev > 0 && span < prev) nonMonotoneLevels.push(entry.level);
    prev = span;
  }
  const totalExp = expToBaseCap + expAfterBaseCap;
  const prestigeRatioPm = expToBaseCap > 0 ? Math.round((expAfterBaseCap * 1000) / expToBaseCap) : 0;
  return {
    maxLevel,
    baseCapLevel,
    expToBaseCap,
    expAfterBaseCap,
    totalExp,
    prestigeRatioPm,
    minSpan,
    maxSpan,
    nonMonotoneLevels,
  };
}

/** 누적 경험치 → 현재 레벨·구간 내 진행도·다음 레벨까지 필요치 */
export interface ExpProgress {
  readonly level: number;
  readonly expInto: number;
  readonly expSpan: number;
  readonly maxed: boolean;
}

/** 누적 경험치 총량으로 현재 레벨과 구간 내 진행도를 구한다 */
export function levelFromTotalExp(
  entries: readonly ExpTableEntryJson[],
  totalExp: number,
  maxLevelCap?: number,
): ExpProgress {
  const sorted = sortExpEntries(entries);
  const tableMax = expMaxLevelOf(sorted);
  const cap = maxLevelCap !== undefined ? Math.max(1, Math.min(tableMax, Math.floor(maxLevelCap))) : tableMax;
  let remaining = Math.max(0, Math.floor(totalExp));
  let level = 1;
  for (const entry of sorted) {
    if (entry.level !== level || level >= cap) break;
    const span = Math.max(1, Math.floor(entry.requiredExp));
    if (remaining < span) {
      return { level, expInto: remaining, expSpan: span, maxed: false };
    }
    remaining -= span;
    level += 1;
  }
  return { level, expInto: 0, expSpan: 0, maxed: true };
}

/** 현재 (레벨, 구간 경험치)에 새 경험치를 더해 올린 레벨과 남은 경험치를 셈한다 */
export function applyExpGain(
  entries: readonly ExpTableEntryJson[],
  level: number,
  expInto: number,
  gain: number,
  maxLevelCap?: number,
): ExpProgress & { readonly gainedLevels: number } {
  const startLevel = Math.max(1, Math.floor(level));
  const sorted = sortExpEntries(entries);
  const tableMax = expMaxLevelOf(sorted);
  const cap = maxLevelCap !== undefined ? Math.max(1, Math.min(tableMax, Math.floor(maxLevelCap))) : tableMax;
  if (startLevel >= cap) {
    return { level: startLevel, expInto: 0, expSpan: 0, maxed: true, gainedLevels: 0 };
  }
  let curLevel = startLevel;
  let curExp = Math.max(0, Math.floor(expInto)) + Math.max(0, Math.floor(gain));
  while (curLevel < cap) {
    const span = expSpanAt(sorted, curLevel);
    if (span <= 0) break;
    if (curExp < span) {
      return {
        level: curLevel,
        expInto: curExp,
        expSpan: span,
        maxed: false,
        gainedLevels: curLevel - startLevel,
      };
    }
    curExp -= span;
    curLevel += 1;
  }
  return { level: curLevel, expInto: 0, expSpan: 0, maxed: true, gainedLevels: curLevel - startLevel };
}

/**
 * 기본 유닛 공통 경험치 테이블(Lv 1 → Lv 60, 59구간) — content/core/exp_table.json 기본값과 같다.
 * - Lv 1 → Lv 50 누적: 1,000,000 XP(채집·NPC 1,500 XP/h × 15h/일 기준 약 44.4일, 2~3개월 수명 중 1~2개월 내 도달)
 * - Lv 50 → Lv 60 구간 합: 1,000,000 XP(1→50 누적과 1:1 비율, 완만하게 가팔라지는 상위 10레벨)
 * - Lv 1 → Lv 60 총 누적: 2,000,000 XP
 */
const DEFAULT_EXP_SPANS: readonly number[] = [
  35, 132, 285, 492, 752, 1063, 1425, 1836, 2297, 2806, 3363, 3968, 4619, 5318, 6063, 6853, 7690, 8572, 9500,
  10472, 11489, 12551, 13657, 14808, 16002, 17240, 18521, 19846, 21215, 22626, 24081, 25578, 27118, 28701,
  30326, 31993, 33703, 35455, 37248, 39084, 40961, 42880, 44841, 46843, 48886, 50971, 53097, 55265, 57473,
  61093, 67026, 74326, 82684, 91928, 101947, 112660, 124004, 135931, 148401,
];

export const DEFAULT_EXP_TABLE: readonly ExpTableEntryJson[] = DEFAULT_EXP_SPANS.map(
  (requiredExp, index) => ({
    id: expLevelId(index + 1),
    level: index + 1,
    requiredExp,
  }),
);

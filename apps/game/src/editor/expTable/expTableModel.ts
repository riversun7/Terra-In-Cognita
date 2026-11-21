// 유닛 공통 경험치 테이블 편집기 상태·곡선 생성·속도 시뮬레이션 모형(/dev/exp-table).
// 순수 함수만 둔다(React·DOM 없음 — 단위 시험으로 바로 검증한다).
import {
  EXP_TABLE_LIMITS,
  type ExpTableChange,
  type ExpTableEntryJson,
  type ExpTableRowView,
  expLevelId,
  sortExpEntries,
} from "@terra/shared/expTable";

/** 곡선 생성기 매개변수(2구간: 1~baseCapLevel 기본 성장 + baseCapLevel~maxLevel 상위 성장) */
export interface ExpCurveParams {
  /** 기본 성장 끝 레벨(기본 50) */
  readonly baseCapLevel: number;
  /** 테이블 최고 도달 레벨(기본 60) */
  readonly maxLevel: number;
  /** Lv 1 → baseCapLevel 목표 누적 경험치 */
  readonly totalToBaseCap: number;
  /** Lv 1 → baseCapLevel 거듭제곱 지수(1.0~3.5, 기본 1.9) */
  readonly baseExponent: number;
  /** baseCapLevel → maxLevel 구간 경험치 비중(1→baseCapLevel 대비 %, 기본 100 = 1:1) */
  readonly prestigeRatioPct: number;
  /** baseCapLevel → maxLevel 구간 가파름 지수(0.5~3.0, 기본 1.4) */
  readonly prestigeExponent: number;
}

export type ExpCurvePresetId = "balanced" | "relaxed" | "fast" | "legacy";

export const DEFAULT_CURVE_PARAMS: ExpCurveParams = {
  baseCapLevel: EXP_TABLE_LIMITS.defaultBaseCapLevel,
  maxLevel: EXP_TABLE_LIMITS.defaultMaxLevel,
  totalToBaseCap: 1_000_000,
  baseExponent: 1.9,
  prestigeRatioPct: 100,
  prestigeExponent: 1.4,
};

export const EXP_CURVE_PRESETS: Readonly<Record<ExpCurvePresetId, ExpCurveParams>> = {
  balanced: DEFAULT_CURVE_PARAMS,
  relaxed: {
    baseCapLevel: 50,
    maxLevel: 60,
    totalToBaseCap: 1_350_000,
    baseExponent: 1.85,
    prestigeRatioPct: 80,
    prestigeExponent: 1.3,
  },
  fast: {
    baseCapLevel: 50,
    maxLevel: 60,
    totalToBaseCap: 675_000,
    baseExponent: 1.95,
    prestigeRatioPct: 150,
    prestigeExponent: 1.6,
  },
  legacy: {
    baseCapLevel: 50,
    maxLevel: 60,
    totalToBaseCap: 1_140_000,
    baseExponent: 1.9,
    prestigeRatioPct: 70,
    prestigeExponent: 1.0,
  },
};

export type ActivityProfileId = "gather_npc" | "casual" | "training" | "combat";

export interface ActivityProfile {
  readonly id: ActivityProfileId;
  readonly xpPerHour: number;
  readonly hoursPerDay: number;
  readonly color: string;
  readonly dash?: string | undefined;
}

export const ACTIVITY_PROFILES: readonly ActivityProfile[] = [
  { id: "gather_npc", xpPerHour: 1500, hoursPerDay: 15, color: "var(--color-stat-vit)" },
  { id: "casual", xpPerHour: 1000, hoursPerDay: 14, color: "var(--color-stat-agi)", dash: "6 3" },
  { id: "training", xpPerHour: 1800, hoursPerDay: 16, color: "var(--color-stat-int)", dash: "2 3" },
  { id: "combat", xpPerHour: 2500, hoursPerDay: 15, color: "var(--color-stat-str)", dash: "10 4 2 4" },
];

/** 가중치 배열을 목표 합계(targetTotal)에 정확히 맞는 정수 배열로 배분한다 */
function allocateExact(weights: readonly number[], targetTotal: number, minEach: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const total = Math.max(n * minEach, Math.round(targetTotal));
  const sumW = weights.reduce((acc, value) => acc + value, 0);
  if (sumW <= 0) {
    const each = Math.max(minEach, Math.floor(total / n));
    const out = Array.from({ length: n }, () => each);
    let rem = total - each * n;
    for (let i = n - 1; rem > 0 && i >= 0; i--) {
      out[i] = (out[i] ?? each) + 1;
      rem -= 1;
    }
    return out;
  }
  const raw = weights.map((weight) => Math.max(minEach, Math.round((total * weight) / sumW)));
  let diff = total - raw.reduce((acc, value) => acc + value, 0);
  while (diff !== 0) {
    let changed = false;
    for (let i = n - 1; diff !== 0 && i >= 0; i--) {
      const step = diff > 0 ? 1 : -1;
      const cur = raw[i] ?? minEach;
      if (cur + step >= minEach) {
        raw[i] = cur + step;
        diff -= step;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return raw;
}

/**
 * 2구간(1~baseCapLevel 기본 + baseCapLevel~maxLevel 상위) 정수 경험치 테이블을 생성한다.
 * - 기본 구간 합 = exact totalToBaseCap
 * - 상위 구간 합 = exact round(totalToBaseCap × prestigeRatioPct ÷ 100)
 * - 상위 구간 평균이 마지막 기본 구간보다 크면 마지막 기본 구간을 바닥으로 삼아 매끄럽게 이어진다.
 */
export function generateExpCurve(params: ExpCurveParams): ExpTableEntryJson[] {
  const maxLv = Math.max(2, Math.min(EXP_TABLE_LIMITS.levelMax + 1, Math.floor(params.maxLevel)));
  const baseCap = Math.max(2, Math.min(maxLv, Math.floor(params.baseCapLevel)));
  const baseCount = baseCap - 1;
  const baseExp = Math.max(0.5, Math.min(4.0, params.baseExponent));
  const baseWeights = Array.from({ length: baseCount }, (_, index) => Math.pow(index + 1, baseExp));
  const baseSpans = allocateExact(baseWeights, params.totalToBaseCap, 10);

  const prestigeCount = maxLv - baseCap;
  let prestigeSpans: number[] = [];
  if (prestigeCount > 0) {
    const lastBase = baseSpans[baseSpans.length - 1] ?? 10;
    const prestigeTotal = Math.max(
      prestigeCount * 10,
      Math.round((params.totalToBaseCap * Math.max(1, params.prestigeRatioPct)) / 100),
    );
    const prestigeExp = Math.max(0.3, Math.min(4.0, params.prestigeExponent));
    const avgPrestige = prestigeTotal / prestigeCount;
    if (avgPrestige > lastBase) {
      const extraTotal = prestigeTotal - lastBase * prestigeCount;
      const rampWeights = Array.from({ length: prestigeCount }, (_, index) =>
        Math.pow((index + 1) / prestigeCount, prestigeExp),
      );
      const extras = allocateExact(rampWeights, extraTotal, 1);
      prestigeSpans = extras.map((extra) => lastBase + extra);
    } else {
      const rampWeights = Array.from(
        { length: prestigeCount },
        (_, index) => 1 + Math.pow((index + 1) / prestigeCount, prestigeExp),
      );
      prestigeSpans = allocateExact(rampWeights, prestigeTotal, 10);
    }
  }

  return [...baseSpans, ...prestigeSpans].map((requiredExp, index) => {
    const level = index + 1;
    const clamped = Math.max(
      EXP_TABLE_LIMITS.requiredExpMin,
      Math.min(EXP_TABLE_LIMITS.requiredExpMax, Math.floor(requiredExp)),
    );
    return { id: expLevelId(level), level, requiredExp: clamped };
  });
}

/** 초안에 담긴 한 줄 변경 */
export type StagedExpItem =
  | {
      readonly op: "put";
      readonly entry: ExpTableEntryJson;
      readonly baseHash: string | null;
    }
  | {
      readonly op: "revert";
      readonly id: string;
      readonly baseHash: string;
    };

export interface ExpStage {
  readonly items: Readonly<Record<string, StagedExpItem>>;
  readonly discards: readonly string[];
}

export const EMPTY_EXP_STAGE: ExpStage = { items: {}, discards: [] };

/** 서버 목록 + 초안을 합친 실효 경험치 목록(레벨 오름차순) */
export function effectiveEntriesOf(rows: readonly ExpTableRowView[], stage: ExpStage): ExpTableEntryJson[] {
  const byId = new Map<string, ExpTableEntryJson>();
  const packById = new Map<string, ExpTableEntryJson>();
  for (const row of rows) {
    byId.set(row.entry.id, row.entry);
    if (row.pack) packById.set(row.entry.id, row.pack);
  }
  for (const [id, item] of Object.entries(stage.items)) {
    if (item.op === "put") {
      byId.set(id, item.entry);
    } else {
      const pack = packById.get(id);
      if (pack) byId.set(id, pack);
      else byId.delete(id);
    }
  }
  return sortExpEntries([...byId.values()]);
}

/** 단일 레벨 구간 경험치를 초안에 담는다(현재 서버 실효 값과 같으면 초안에서 뺀다) */
export function stageExpSpan(
  stage: ExpStage,
  rows: readonly ExpTableRowView[],
  level: number,
  requiredExp: number,
): ExpStage {
  const id = expLevelId(level);
  const clamped = Math.max(
    EXP_TABLE_LIMITS.requiredExpMin,
    Math.min(EXP_TABLE_LIMITS.requiredExpMax, Math.round(requiredExp)),
  );
  const row = rows.find((item) => item.entry.id === id);
  const nextItems = { ...stage.items };
  if (row && row.entry.requiredExp === clamped) {
    delete nextItems[id];
  } else {
    nextItems[id] = {
      op: "put",
      entry: { id, level, requiredExp: clamped },
      baseHash: row ? row.hash : null,
    };
  }
  return { ...stage, items: nextItems };
}

/** 생성된 곡선 전체를 초안에 담는다(서버 실효 값과 달라진 줄만 담는다) */
export function stageExpCurve(
  stage: ExpStage,
  rows: readonly ExpTableRowView[],
  generated: readonly ExpTableEntryJson[],
): ExpStage {
  let next = stage;
  for (const entry of generated) {
    next = stageExpSpan(next, rows, entry.level, entry.requiredExp);
  }
  return next;
}

/** 한 줄을 팩 기본값으로 되돌리는 변경을 초안에 담는다 */
export function stageExpRevertRow(stage: ExpStage, row: ExpTableRowView): ExpStage {
  const nextItems = { ...stage.items };
  if (row.origin === "pack") {
    // 팩 그대로였던 줄은 초안에서 빼기만 하면 팩 값으로 돌아간다
    delete nextItems[row.entry.id];
  } else {
    nextItems[row.entry.id] = { op: "revert", id: row.entry.id, baseHash: row.hash };
  }
  return { ...stage, items: nextItems };
}

/** 모든 덮어쓴 줄을 팩 기본값으로 되돌리도록 초안에 담는다 */
export function stageExpRevertAll(rows: readonly ExpTableRowView[]): ExpStage {
  const items: Record<string, StagedExpItem> = {};
  for (const row of rows) {
    if (row.origin !== "pack") {
      items[row.entry.id] = { op: "revert", id: row.entry.id, baseHash: row.hash };
    }
  }
  return { items, discards: [] };
}

/** 잠든 줄 하나 버리기를 초안에 담는다 */
export function stageExpDiscardSleeping(stage: ExpStage, id: string): ExpStage {
  if (stage.discards.includes(id)) return stage;
  return { ...stage, discards: [...stage.discards, id] };
}

/** 초안 → tRPC expTable.check / save 입력 배열 */
export function expChangesOf(stage: ExpStage): ExpTableChange[] {
  const out: ExpTableChange[] = [];
  const keys = Object.keys(stage.items).toSorted();
  for (const key of keys) {
    const item = stage.items[key];
    if (!item) continue;
    if (item.op === "put") {
      out.push({ op: "put", entry: item.entry, baseHash: item.baseHash });
    } else {
      out.push({ op: "revert", id: item.id, baseHash: item.baseHash });
    }
  }
  for (const id of stage.discards) {
    out.push({ op: "discard_sleeping", id });
  }
  return out;
}

export function expStageCount(stage: ExpStage): number {
  return Object.keys(stage.items).length + stage.discards.length;
}

/** 표·차트 공통 계산 행(레벨 1→2 … 59→60) */
export interface ComputedExpRow {
  readonly id: string;
  readonly level: number;
  readonly nextLevel: number;
  readonly requiredExp: number;
  readonly packRequiredExp: number | null;
  readonly deltaSpan: number;
  readonly cumStart: number;
  readonly cumEnd: number;
  readonly packCumEnd: number | null;
  readonly sharePct: number;
  readonly daysForSpan: number;
  readonly daysToReach: number;
  readonly isPrestige: boolean;
  readonly nonMonotone: boolean;
  readonly staged: boolean;
  readonly overridden: boolean;
}

export function buildComputedExpRows(
  serverRows: readonly ExpTableRowView[],
  stage: ExpStage,
  baseCapLevel: number,
  dailyXp: number,
): ComputedExpRow[] {
  const effective = effectiveEntriesOf(serverRows, stage);
  const rowById = new Map(serverRows.map((row) => [row.entry.id, row]));
  const totalExp = effective.reduce((sum, entry) => sum + entry.requiredExp, 0);
  const safeDaily = Math.max(1, dailyXp);

  let cum = 0;
  let packCum = 0;
  let prevSpan = 0;
  let hasAllPack = true;

  return effective.map((entry) => {
    const serverRow = rowById.get(entry.id);
    const packSpan = serverRow?.pack?.requiredExp ?? null;
    const cumStart = cum;
    cum += entry.requiredExp;
    if (packSpan !== null) packCum += packSpan;
    else hasAllPack = false;

    const nonMonotone = prevSpan > 0 && entry.requiredExp < prevSpan;
    prevSpan = entry.requiredExp;

    return {
      id: entry.id,
      level: entry.level,
      nextLevel: entry.level + 1,
      requiredExp: entry.requiredExp,
      packRequiredExp: packSpan,
      deltaSpan: packSpan === null ? 0 : entry.requiredExp - packSpan,
      cumStart,
      cumEnd: cum,
      packCumEnd: hasAllPack && packSpan !== null ? packCum : null,
      sharePct: totalExp > 0 ? (entry.requiredExp / totalExp) * 100 : 0,
      daysForSpan: entry.requiredExp / safeDaily,
      daysToReach: cum / safeDaily,
      isPrestige: entry.level >= baseCapLevel,
      nonMonotone,
      staged: Object.hasOwn(stage.items, entry.id),
      overridden: serverRow !== undefined && serverRow.origin !== "pack",
    };
  });
}

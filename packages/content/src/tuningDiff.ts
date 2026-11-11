// 설정 칸 차이(내보내기) — docs/adr/2026-11-01-dev-settings-panel.md 11절
// 개발자 패널(/dev/tuning)의 [내보내기]가 그 세계의 덮어쓰기를 이 모양으로 낸다. 쓰는 곳은 둘이다:
// - 팩에 넣기: scripts/apply-tuning-diff.mjs(`pnpm tuning:apply`)가 applyTuningDiff로 tuning.json의 value만 바꾼다.
// - 시뮬레이터: `pnpm --filter @terra/sim sim … --tuning <차이.json>`이 overlayTuningDiff로 팩 값 위에 얹는다(서버와 같은 실효 값).
// 가중치 표(stat_rows) 칸 차이는 선택 칸 statRows(docs/adr/2026-11-01-balance-screen.md 2절): applyStatRowsDiff가 stat_rows.json의
// 그 칸만 바꾸고, overlayStatRowsDiff가 팩 행 위에 얹는다(시뮬레이터). 덮어쓰기가 없으면 칸을 넣지 않아 옛 모양 그대로다.
// 팩 항목(스킬·무기·유닛 종류) 차이는 선택 칸 entries(docs/adr/2026-11-01-skill-editor.md 7절): 해시가 필요해 적용 함수는
// "@terra/content/node" applyEntriesDiff다.
// 계산식 차이는 선택 칸 formulas(formulaDiff.ts, docs/adr/2026-11-01-formula-editor.md).
// Node API를 쓰지 않는다(파일 읽기는 부르는 쪽).
import {
  STAT_CELL_FIELDS,
  type StatCellField,
  TUNING_VALUE_LIMIT,
  statCellFieldsOf,
  statCellInRange,
} from "@terra/shared/tuning";
import { z } from "zod";
import { formulaDiffChangeSchema } from "./formulaDiff.ts";
import { contentId } from "./schema/common.ts";
import { type StatRowEntry, statRowEntrySchema } from "./schema/stats.ts";
import { type TuningEntry, tuningEntrySchema, tuningValueInRange } from "./schema/tuning.ts";

export const TUNING_DIFF_FORMAT = "terra-tuning-diff";
export const TUNING_DIFF_FORMAT_VERSION = 1;
/** 한 차이의 칸 수 상한(팩 칸 수보다 넉넉히) */
export const TUNING_DIFF_MAX_CHANGES = 2000;

const tuningInt = z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT);

export const tuningDiffChangeSchema = z.strictObject({
  id: contentId,
  /** 49 칸 코드(보기용, 적용은 ID로) */
  // 49 코드(끼운 칸은 끝에 소문자 하나, C16a) 또는 빈 값
  code: z.string().regex(/^([A-Z][0-9]{1,2}[a-z]?)?$/),
  /** 내보낼 때의 팩 값 */
  from: tuningInt,
  /** 덮어쓰기 값 */
  to: tuningInt,
});
export type TuningDiffChange = z.output<typeof tuningDiffChangeSchema>;

export const statRowsDiffChangeSchema = z.strictObject({
  row: contentId,
  field: z.enum(STAT_CELL_FIELDS),
  /** 내보낼 때의 팩 칸 값 */
  from: tuningInt,
  /** 덮어쓰기 값 */
  to: tuningInt,
});
export type StatRowsDiffChange = z.output<typeof statRowsDiffChangeSchema>;

/**
 * 팩 항목 차이를 넣을 수 있는 분류(스킬 편집기·행동별 소모 docs/adr/2026-11-01-skill-editor.md 7절, 아이템 편집기·분류 자료
 * docs/adr/2026-11-01-item-editor.md 4절, 효과 사전 WP-6, 건물 편집기 시설 docs/adr/2026-11-02-building-editor.md). 서버 @terra/shared CONTENT_EDIT_CATEGORIES·적용 스크립트 ENTRY_FILES와
 * 같다(시험이 본다)
 */
export const ENTRY_DIFF_CATEGORIES = [
  "skills",
  "items",
  "unit_kinds",
  "item_subcategories",
  "item_tags",
  "weapon_types",
  "effects",
  "facilities",
  "gather_tiers",
  "creatures",
  "nation_presets",
  "nation_tiers",
] as const;

export const entriesDiffChangeSchema = z.strictObject({
  category: z.enum(ENTRY_DIFF_CATEGORIES),
  id: contentId,
  /** 내보낼 때의 팩 항목 정규 JSON SHA-256(팩에 없던 항목 = 편집기에서 만든 항목이면 null) */
  from: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  /** 덮어쓴 항목 통째(팩 파일 한 줄 모양). 칸 검사는 넣은 뒤 팩 검사(pnpm check:content)가 한다 */
  entry: z.record(z.string(), z.unknown()),
});
export type EntriesDiffChange = z.output<typeof entriesDiffChangeSchema>;

export const tuningDiffSchema = z
  .strictObject({
    format: z.literal(TUNING_DIFF_FORMAT),
    formatVersion: z.literal(TUNING_DIFF_FORMAT_VERSION),
    /** ISO 8601 */
    exportedAt: z.string().min(1).max(64),
    packId: contentId,
    /** 내보낸 세계의 팩 판(core@N) */
    contentVersion: z.string().min(1).max(64),
    contentHash: z.string().max(128),
    changes: z.array(tuningDiffChangeSchema).max(TUNING_DIFF_MAX_CHANGES),
    /** 가중치 표 칸 차이(선택, 덮어쓰기가 있을 때만) */
    statRows: z.array(statRowsDiffChangeSchema).max(TUNING_DIFF_MAX_CHANGES).optional(),
    /** 팩 항목 차이(선택, 스킬·무기·유닛 종류 덮어쓰기가 있을 때만) */
    entries: z.array(entriesDiffChangeSchema).max(TUNING_DIFF_MAX_CHANGES).optional(),
    /** 계산식 차이(선택, 식 덮어쓰기가 있을 때만, docs/adr/2026-11-01-formula-editor.md) */
    formulas: z.array(formulaDiffChangeSchema).max(TUNING_DIFF_MAX_CHANGES).optional(),
    /** 그 세계에서 만든 뒤 지운 항목 ID(선택, 은퇴 ID, docs/adr/2026-11-01-item-editor.md 4절) */
    retiredIds: z
      .array(z.strictObject({ category: z.enum(ENTRY_DIFF_CATEGORIES), id: contentId }))
      .max(TUNING_DIFF_MAX_CHANGES)
      .optional(),
  })
  .superRefine((diff, ctx) => {
    if (Array.isArray(diff.changes)) {
      const seen = new Set<string>();
      diff.changes.forEach((change, index) => {
        const id = typeof change === "object" && change !== null ? change.id : undefined;
        if (typeof id !== "string") return;
        if (seen.has(id))
          ctx.addIssue({ code: "custom", path: ["changes", index, "id"], message: `ID가 두 번: ${id}` });
        seen.add(id);
      });
    }
    if (Array.isArray(diff.entries)) {
      const seen = new Set<string>();
      diff.entries.forEach((change, index) => {
        if (typeof change !== "object" || change === null) return;
        const key = `${change.category}/${change.id}`;
        if (seen.has(key))
          ctx.addIssue({ code: "custom", path: ["entries", index], message: `항목이 두 번: ${key}` });
        seen.add(key);
      });
    }
    if (Array.isArray(diff.formulas)) {
      const seen = new Set<string>();
      diff.formulas.forEach((change, index) => {
        const id = typeof change === "object" && change !== null ? change.id : undefined;
        if (typeof id !== "string") return;
        if (seen.has(id))
          ctx.addIssue({ code: "custom", path: ["formulas", index, "id"], message: `식 칸이 두 번: ${id}` });
        seen.add(id);
      });
    }
    if (Array.isArray(diff.statRows)) {
      const seen = new Set<string>();
      diff.statRows.forEach((change, index) => {
        if (typeof change !== "object" || change === null) return;
        const key = `${change.row}.${change.field}`;
        if (seen.has(key))
          ctx.addIssue({ code: "custom", path: ["statRows", index], message: `칸이 두 번: ${key}` });
        seen.add(key);
      });
    }
  });
export type TuningDiff = z.output<typeof tuningDiffSchema>;

/** 팩 값(ID → 값) 위에 차이를 얹는다. 팩에 없는 ID는 얹지 않고 unknown에 돌려준다(서버도 팩에 없는 ID는 듣지 않는다) */
export function overlayTuningDiff(
  values: ReadonlyMap<string, number>,
  diff: TuningDiff,
): { values: Map<string, number>; unknown: string[]; stale: string[] } {
  const out = new Map(values);
  const unknown: string[] = [];
  const stale: string[] = [];
  for (const change of diff.changes) {
    const current = values.get(change.id);
    if (current === undefined) {
      unknown.push(change.id);
      continue;
    }
    if (current !== change.from) stale.push(change.id);
    out.set(change.id, change.to);
  }
  return { values: out, unknown, stale };
}

export type TuningApplySkip = "unknown" | "stale" | "out_of_range";

export interface TuningApplyResult {
  /** 고친 항목 목록(원래 객체의 다른 칸·키 차례는 그대로, value만 바뀜) */
  readonly entries: unknown[];
  readonly applied: { id: string; from: number; to: number }[];
  readonly skipped: { id: string; reason: TuningApplySkip; current?: number }[];
}

/**
 * 팩 tuning.json의 항목 배열(JSON.parse 그대로)에 차이를 적용한다.
 * - 팩에 없는 ID → unknown, 지금 팩 값 ≠ from → stale(force면 넣는다), 범위 밖 → out_of_range. 건너뛴 칸은 그대로 둔다.
 * - 바꾼 항목은 tuningEntrySchema로 다시 검사한다(범위 포함). 항목 모양이 틀렸으면 던진다(팩 검사부터 고친다).
 */
export function applyTuningDiff(
  rawEntries: readonly unknown[],
  diff: TuningDiff,
  options: { force?: boolean } = {},
): TuningApplyResult {
  const parsed: TuningEntry[] = rawEntries.map((raw) => tuningEntrySchema.parse(raw));
  const index = new Map(parsed.map((entry, i) => [entry.id, i]));
  const entries: unknown[] = rawEntries.map((raw) =>
    typeof raw === "object" && raw !== null ? { ...raw } : raw,
  );
  const applied: TuningApplyResult["applied"] = [];
  const skipped: TuningApplyResult["skipped"] = [];
  for (const change of diff.changes) {
    const at = index.get(change.id);
    const entry = at === undefined ? undefined : parsed[at];
    if (at === undefined || entry === undefined) {
      skipped.push({ id: change.id, reason: "unknown" });
      continue;
    }
    if (entry.value !== change.from && !options.force) {
      skipped.push({ id: change.id, reason: "stale", current: entry.value });
      continue;
    }
    if (!tuningValueInRange(entry, change.to)) {
      skipped.push({ id: change.id, reason: "out_of_range", current: entry.value });
      continue;
    }
    const target = entries[at];
    if (typeof target === "object" && target !== null) Reflect.set(target, "value", change.to);
    applied.push({ id: change.id, from: entry.value, to: change.to });
  }
  return { entries, applied, skipped };
}

/** 팩 가중치 칸 값(없는 칸이면 undefined) */
export function statRowCell(row: StatRowEntry, field: StatCellField): number | undefined {
  const index = STAT_CELL_FIELDS.indexOf(field);
  if (index < 6) return row.weights[index];
  if (field === "base") return row.shape === "quantity" ? row.base : undefined;
  if (field === "cap") return row.shape === "probability" ? row.cap : undefined;
  return row.shape === "probability" ? row.halfConstant : undefined;
}

/** 행에 칸 값 하나를 넣은 새 행(모양에 없는 칸이면 그대로) */
export function withStatRowCell(row: StatRowEntry, field: StatCellField, value: number): StatRowEntry {
  const index = STAT_CELL_FIELDS.indexOf(field);
  if (index < 6) return { ...row, weights: row.weights.map((weight, i) => (i === index ? value : weight)) };
  if (field === "base" && row.shape === "quantity") return { ...row, base: value };
  if (field === "cap" && row.shape === "probability") return { ...row, cap: value };
  if (field === "half" && row.shape === "probability") return { ...row, halfConstant: value };
  return row;
}

export type StatRowsSkip = "unknown" | "stale" | "out_of_range";

/** 칸 하나를 행 목록에서 찾아 검사한다: 없는 행·꺼진 행·모양에 없는 칸 → unknown, 범위 밖 → out_of_range */
function statCellTarget(
  rows: readonly StatRowEntry[],
  change: StatRowsDiffChange,
): { index: number; current: number } | StatRowsSkip {
  const index = rows.findIndex((row) => row.id === change.row);
  const row = rows[index];
  if (!row || !row.enabled || !statCellFieldsOf(row.shape).includes(change.field)) return "unknown";
  const current = statRowCell(row, change.field);
  if (current === undefined) return "unknown";
  if (!statCellInRange(change.field, change.to)) return "out_of_range";
  return { index, current };
}

/**
 * 팩 행 위에 가중치 칸 차이를 얹는다(시뮬레이터 --tuning). 팩에 없는 칸·범위 밖은 얹지 않고 unknown에, 팩 값이 from과 다르면
 * stale에 적는다(서버도 같은 칸만 듣는다)
 */
export function overlayStatRowsDiff(
  rows: readonly StatRowEntry[],
  changes: readonly StatRowsDiffChange[],
): { rows: StatRowEntry[]; unknown: string[]; stale: string[] } {
  const out = [...rows];
  const unknown: string[] = [];
  const stale: string[] = [];
  for (const change of changes) {
    const key = `${change.row}.${change.field}`;
    const target = statCellTarget(out, change);
    if (typeof target === "string") {
      unknown.push(key);
      continue;
    }
    const row = out[target.index];
    if (!row) continue;
    if (statRowCell(rows[target.index] ?? row, change.field) !== change.from) stale.push(key);
    out[target.index] = withStatRowCell(row, change.field, change.to);
  }
  return { rows: out, unknown, stale };
}

export interface StatRowsApplyResult {
  /** 고친 행 목록(원래 객체의 다른 칸·키 차례는 그대로, 그 칸만 바뀜) */
  readonly entries: unknown[];
  readonly applied: { row: string; field: StatCellField; from: number; to: number }[];
  readonly skipped: { row: string; field: StatCellField; reason: StatRowsSkip; current?: number }[];
}

/**
 * 팩 stat_rows.json의 행 배열(JSON.parse 그대로)에 가중치 칸 차이를 적용한다(pnpm tuning:apply).
 * 칸마다 팩에 있는가(없으면 unknown)·지금 팩 값 = from인가(아니면 stale, force면 넣음)·범위 안인가(아니면 out_of_range).
 * 바꾼 행은 statRowEntrySchema로 다시 검사한다. 행 모양이 틀렸으면 던진다(팩 검사부터 고친다)
 */
export function applyStatRowsDiff(
  rawEntries: readonly unknown[],
  changes: readonly StatRowsDiffChange[],
  options: { force?: boolean } = {},
): StatRowsApplyResult {
  let parsed: StatRowEntry[] = rawEntries.map((raw) => statRowEntrySchema.parse(raw));
  const entries: unknown[] = rawEntries.map((raw) =>
    typeof raw === "object" && raw !== null ? { ...raw } : raw,
  );
  const applied: StatRowsApplyResult["applied"] = [];
  const skipped: StatRowsApplyResult["skipped"] = [];
  for (const change of changes) {
    const target = statCellTarget(parsed, change);
    if (typeof target === "string") {
      const row = parsed.find((entry) => entry.id === change.row);
      const current = row ? statRowCell(row, change.field) : undefined;
      skipped.push({
        row: change.row,
        field: change.field,
        reason: target,
        ...(current === undefined ? {} : { current }),
      });
      continue;
    }
    if (target.current !== change.from && !options.force) {
      skipped.push({ row: change.row, field: change.field, reason: "stale", current: target.current });
      continue;
    }
    const row = parsed[target.index];
    const raw = entries[target.index];
    if (!row || typeof raw !== "object" || raw === null) continue;
    const next = statRowEntrySchema.parse(withStatRowCell(row, change.field, change.to));
    parsed = parsed.map((entry, i) => (i === target.index ? next : entry));
    // 원래 객체의 키 차례를 지키며 그 칸만 바꾼다
    if (change.field === "base" || change.field === "cap") Reflect.set(raw, change.field, change.to);
    else if (change.field === "half") Reflect.set(raw, "halfConstant", change.to);
    else Reflect.set(raw, "weights", [...next.weights]);
    applied.push({ row: change.row, field: change.field, from: target.current, to: change.to });
  }
  return { entries, applied, skipped };
}

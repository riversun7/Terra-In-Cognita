// 설정 칸 차이(내보내기) — docs/adr/2026-11-01-dev-settings-panel.md 11절
// 개발자 패널(/dev/tuning)의 [내보내기]가 그 세계의 덮어쓰기를 이 모양으로 낸다. 쓰는 곳은 둘이다:
// - 팩에 넣기: scripts/apply-tuning-diff.mjs(`pnpm tuning:apply`)가 applyTuningDiff로 tuning.json의 value만 바꾼다.
// - 시뮬레이터: `pnpm --filter @terra/sim sim … --tuning <차이.json>`이 overlayTuningDiff로 팩 값 위에 얹는다(서버와 같은 실효 값).
// Node API를 쓰지 않는다(파일 읽기는 부르는 쪽).
import { TUNING_VALUE_LIMIT } from "@terra/shared/tuning";
import { z } from "zod";
import { contentId } from "./schema/common.ts";
import { type TuningEntry, tuningEntrySchema, tuningValueInRange } from "./schema/tuning.ts";

export const TUNING_DIFF_FORMAT = "terra-tuning-diff";
export const TUNING_DIFF_FORMAT_VERSION = 1;
/** 한 차이의 칸 수 상한(팩 칸 수보다 넉넉히) */
export const TUNING_DIFF_MAX_CHANGES = 2000;

const tuningInt = z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT);

export const tuningDiffChangeSchema = z.strictObject({
  id: contentId,
  /** 49 칸 코드(보기용, 적용은 ID로) */
  code: z.string().regex(/^([A-Z][0-9]{1,2})?$/),
  /** 내보낼 때의 팩 값 */
  from: tuningInt,
  /** 덮어쓰기 값 */
  to: tuningInt,
});
export type TuningDiffChange = z.output<typeof tuningDiffChangeSchema>;

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
  })
  .superRefine((diff, ctx) => {
    if (!Array.isArray(diff.changes)) return;
    const seen = new Set<string>();
    diff.changes.forEach((change, index) => {
      const id = typeof change === "object" && change !== null ? change.id : undefined;
      if (typeof id !== "string") return;
      if (seen.has(id))
        ctx.addIssue({ code: "custom", path: ["changes", index, "id"], message: `ID가 두 번: ${id}` });
      seen.add(id);
    });
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

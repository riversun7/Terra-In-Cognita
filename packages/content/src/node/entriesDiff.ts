// 팩 항목 차이 적용 — 내보내기 차이(terra-tuning-diff)의 entries를 분류 파일 항목 배열에 넣는다(docs/adr/2026-11-01-skill-editor.md 7절).
// `pnpm tuning:apply`(scripts/apply-tuning-diff.mjs)가 쓴다. 해시(node:crypto) 때문에 Node 전용 부분에 둔다.
// 칸마다: 팩에 그 ID가 있으면 지금 항목 해시 = from이어야 바꾼다(아니면 stale, force면 넣음). from이 null(편집기에서 만든 항목)이면
// 팩에 없어야 끝에 붙인다(이미 있으면 stale, force면 바꿈). from이 있는데 팩에 없으면 unknown. 항목 모양은 그 분류 스키마로 본다
// (틀리면 invalid). 넣은 뒤 팩 전체 검사는 pnpm check:content가 한다. 새 항목은 ID 차례로 끝에 붙인다(실효 차례와 같게).
import type { z } from "zod";
import { hashEntry } from "./hash.ts";

export type EntriesApplySkip = "unknown" | "stale" | "invalid";

export interface EntriesApplyResult {
  readonly entries: unknown[];
  readonly applied: { id: string; kind: "replaced" | "added" }[];
  readonly skipped: { id: string; reason: EntriesApplySkip }[];
}

const idOf = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return undefined;
  const id: unknown = Reflect.get(entry, "id");
  return typeof id === "string" ? id : undefined;
};

/** 분류 하나의 항목 배열(JSON.parse 그대로)에 그 분류 칸만 넣는다 */
export function applyEntriesDiff(
  rawEntries: readonly unknown[],
  changes: readonly { id: string; from: string | null; entry: Readonly<Record<string, unknown>> }[],
  schema: z.ZodType,
  options: { force?: boolean } = {},
): EntriesApplyResult {
  const entries: unknown[] = [...rawEntries];
  const applied: EntriesApplyResult["applied"] = [];
  const skipped: EntriesApplyResult["skipped"] = [];
  /** 끝에 붙일 새 항목(ID → 항목). 다 본 뒤 ID 차례로 붙인다(서버 실효 차례·시뮬 --tuning과 같게, effective.ts) */
  const added = new Map<string, Record<string, unknown>>();
  for (const change of changes) {
    if (idOf(change.entry) !== change.id || !schema.safeParse(change.entry).success) {
      skipped.push({ id: change.id, reason: "invalid" });
      continue;
    }
    const at = entries.findIndex((entry) => idOf(entry) === change.id);
    if (at < 0) {
      if (change.from !== null && !options.force) {
        skipped.push({ id: change.id, reason: "unknown" });
        continue;
      }
      added.set(change.id, { ...change.entry });
      applied.push({ id: change.id, kind: "added" });
      continue;
    }
    if (change.from !== hashEntry(entries[at]) && !options.force) {
      skipped.push({ id: change.id, reason: "stale" });
      continue;
    }
    entries[at] = { ...change.entry };
    applied.push({ id: change.id, kind: "replaced" });
  }
  for (const id of [...added.keys()].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const entry = added.get(id);
    if (entry) entries.push(entry);
  }
  return { entries, applied, skipped };
}

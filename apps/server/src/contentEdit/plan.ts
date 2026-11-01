// 묶음 검사 — 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다(메모리는 바꾸지 않는다). docs/adr/2026-11-01-skill-editor.md 2절,
// docs/adr/2026-11-01-item-editor.md 4절(baseHash·은퇴 ID·대분류 잠금·크기 상한·만든 항목 상한).
// - baseHash(선택): 그 항목을 고치기 시작할 때의 실효 항목 해시(새 항목 null). 지금 해시와 다르면 entry_changed(data.details = 키들).
// - 만든 항목(팩에 없음)을 지우면 그 ID를 은퇴시킨다(retire): 그 세계에서 다시 쓰지 못한다(PROTECTED "한 번 쓴 ID").
// - 아이템 대분류: 팩 항목은 잠근다. 만든 항목은 다른 항목이 가리키지 않을 때만, 귀금속으로·귀금속에서는 막는다(category_locked).
import { formatIssue, hasErrors, type ContentIssue } from "@terra/content";
import { hasUnstorableText } from "@terra/shared";
import type { ContentEditCategory, ContentIssueView } from "@terra/shared/contentEdit";
import { ITEM_LIMITS } from "@terra/shared/itemEditor";
import {
  type ContentCore,
  type EntryJson,
  type RawEntries,
  contentKey,
  entryHash,
  idOf,
  issueView,
} from "./core.ts";

/** 묶음의 한 칸: entry null = 덮어쓰기 지움(팩 항목으로, 만든 항목은 사라지고 ID는 은퇴) */
export interface ContentPut {
  readonly category: ContentEditCategory;
  readonly id: string;
  readonly entry: EntryJson | null;
  /** 고치기 시작할 때의 실효 항목 해시(새 항목 null). undefined면 보지 않는다(옛 기기 → 판 충돌 규칙) */
  readonly baseHash?: string | null | undefined;
}

export interface PlannedContentChange {
  readonly category: ContentEditCategory;
  readonly id: string;
  /** 앞·뒤 덮어쓰기 항목(null = 덮어쓰기 없음) */
  readonly before: EntryJson | null;
  readonly after: EntryJson | null;
  /** 지금 팩 항목 해시(팩에 없으면 null) */
  readonly packHash: string | null;
}

export type ContentPlanReason =
  | "invalid_entry"
  | "unknown_entry"
  | "retired_id"
  | "duplicate_entry"
  | "entry_changed"
  | "category_locked"
  | "entry_too_large"
  | "created_limit";

export type ContentPlan =
  | {
      readonly ok: true;
      readonly changes: readonly PlannedContentChange[];
      /** 지우며 은퇴시킬 만든 항목 ID */
      readonly retire: readonly { readonly category: ContentEditCategory; readonly id: string }[];
      /** 묶음을 얹은 실효 항목(권고 셈에 쓴다) */
      readonly raw: RawEntries;
      /** 팩 검사 권고(저장을 막지 않는다) */
      readonly warnings: readonly ContentIssue[];
    }
  | {
      readonly ok: false;
      readonly reason: ContentPlanReason;
      readonly id: string | null;
      /** 사람이 읽는 줄(최대 20, 스킬 편집기) 또는 entry_changed의 키 */
      readonly details: readonly string[];
      /** 코드가 붙은 문제(아이템 편집기) */
      readonly issues: readonly ContentIssueView[];
    };

/** 묶음 검사가 보는 지금 상태 */
export interface PlanContext {
  readonly core: ContentCore;
  readonly overrides: ReadonlyMap<string, { readonly entry: EntryJson }>;
  readonly raw: RawEntries;
  /** 지금 실효 항목 해시(없으면 null) */
  hashOf(category: ContentEditCategory, id: string): string | null;
  /** 은퇴 ID(팩 id-changes + 이 세계에서 지운 만든 항목) */
  isRetired(category: ContentEditCategory, id: string): boolean;
}

const DETAILS_MAX = 20;
const encoder = new TextEncoder();
const fail = (
  reason: ContentPlanReason,
  id: string | null,
  details: readonly string[] = [],
  issues: readonly ContentIssueView[] = [],
): ContentPlan => ({ ok: false, reason, id, details, issues });

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const spoilsTo = (entry: EntryJson): string | undefined => {
  const perish: unknown = entry.perish;
  return typeof perish === "object" && perish !== null ? text(Reflect.get(perish, "spoilsTo")) : undefined;
};

/** 아이템 대분류 바꾸기 규칙(설계안 2.7): 팩 항목은 잠금, 만든 항목은 가리키는 곳이 없고 귀금속과 오가지 않을 때만 */
function categoryLocked(
  ctx: PlanContext,
  put: ContentPut & { entry: EntryJson },
  before: EntryJson | null,
): boolean {
  if (put.category !== "items") return false;
  const next = text(put.entry.category);
  const packed = ctx.core.packEntry("items", put.id);
  if (packed) return text(packed.category) !== next;
  if (!before) return false;
  const was = text(before.category);
  if (was === next) return false;
  if (was === "precious" || next === "precious") return true;
  if ((ctx.core.packItemRefs.get(put.id) ?? []).length > 0) return true;
  return ctx.raw.items.some((item) => idOf(item) !== put.id && spoilsTo(item) === put.id);
}

export function planContent(ctx: PlanContext, puts: readonly ContentPut[]): ContentPlan {
  const { core } = ctx;
  const seen = new Set<string>();
  const next = new Map<string, { category: string; id: string; entry: EntryJson }>();
  for (const [key, record] of ctx.overrides) {
    const at = key.indexOf("/");
    next.set(key, { category: key.slice(0, at), id: key.slice(at + 1), entry: record.entry });
  }
  const planned: PlannedContentChange[] = [];
  const retire: { category: ContentEditCategory; id: string }[] = [];
  const changed: string[] = [];
  const created = new Set<ContentEditCategory>();
  for (const put of puts) {
    const key = contentKey(put.category, put.id);
    if (seen.has(key)) return fail("duplicate_entry", put.id);
    seen.add(key);
    if (put.baseHash !== undefined && ctx.hashOf(put.category, put.id) !== put.baseHash) {
      changed.push(key);
      continue;
    }
    const packed = core.packEntry(put.category, put.id);
    const before = ctx.overrides.get(key)?.entry ?? null;
    if (put.entry !== null) {
      if (idOf(put.entry) !== put.id) return fail("invalid_entry", put.id, ["id"]);
      if (hasUnstorableText(put.entry)) return fail("invalid_entry", put.id, ["text"]);
      if (encoder.encode(JSON.stringify(put.entry)).length > ITEM_LIMITS.entryBytesMax)
        return fail("entry_too_large", put.id);
      if (!packed && !before && ctx.isRetired(put.category, put.id)) return fail("retired_id", put.id);
      if (categoryLocked(ctx, { ...put, entry: put.entry }, before)) return fail("category_locked", put.id);
      if (!packed && !before) created.add(put.category);
    } else if (!packed && !before) {
      // 덮어쓰기도 팩 항목도 없는 칸 되돌리기: 할 일이 없다
      continue;
    }
    // 팩 항목과 같은 내용이면 덮어쓰기를 두지 않는다(되돌리기와 같다)
    const after =
      put.entry === null || (packed !== undefined && entryHash(packed) === entryHash(put.entry))
        ? null
        : put.entry;
    if ((after === null && before === null) || (after && before && entryHash(after) === entryHash(before)))
      continue;
    if (after === null) next.delete(key);
    else next.set(key, { category: put.category, id: put.id, entry: after });
    if (after === null && !packed) retire.push({ category: put.category, id: put.id });
    planned.push({
      category: put.category,
      id: put.id,
      before,
      after,
      packHash: core.packHash(put.category, put.id),
    });
  }
  if (changed.length > 0) return fail("entry_changed", null, changed);
  if (planned.length === 0) return { ok: true, changes: [], retire: [], raw: ctx.raw, warnings: [] };
  for (const category of created) {
    const count = [...next.values()].filter(
      (entry) => entry.category === category && !core.packEntry(category, entry.id),
    ).length;
    if (count > ITEM_LIMITS.createdMax) return fail("created_limit", null, [category]);
  }
  const raw = core.rawOf(next.values());
  const issues = core.validate(raw);
  if (hasErrors(issues)) {
    const errors = issues.filter((issue) => issue.level === "error");
    return fail(
      "invalid_entry",
      null,
      errors.slice(0, DETAILS_MAX).map((issue) => formatIssue(issue)),
      errors.map(issueView),
    );
  }
  return {
    ok: true,
    changes: planned,
    retire,
    raw,
    warnings: issues.filter((issue) => issue.level === "warning"),
  };
}

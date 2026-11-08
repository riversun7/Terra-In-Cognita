// 아이템 편집기 [대량 도구] 동작(WP-7) — 가져온 항목 담기·여러 개 고치기 바로 적용. 화면(ItemEditorScreen)이 600줄을 넘지 않게 따로 둔다.
import type { ItemEditorListResponse, ItemJson, ItemPatch } from "@terra/shared/itemEditor";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { stageItem } from "./itemModel.ts";
import type { ItemStageState } from "./useItemStage.ts";

export interface BulkContext {
  readonly list: ItemEditorListResponse;
  readonly staging: ItemStageState;
  /** 지금 목록의 실효 항목 해시(고침의 바탕) */
  readonly hashOf: (id: string) => string | null;
  readonly note: string;
  readonly setList: (list: ItemEditorListResponse) => void;
  readonly notice: (lines: string[]) => void;
  /** 오류를 알리고 까닭 코드를 돌려준다 */
  readonly fail: (error: unknown) => { readonly key: string };
  readonly reload: () => Promise<unknown>;
}

/** 가져온 항목을 담는다(새로 = 바탕 없음, 고침 = 지금 항목·해시가 바탕) */
export function stageImport(
  ctx: BulkContext,
  entries: readonly ItemJson[],
  current: ReadonlyMap<string, ItemJson>,
): void {
  let next = ctx.staging.current();
  for (const entry of entries) {
    const base = current.get(entry.id) ?? null;
    next = stageItem(next, entry.id, { op: "put", entry, base, baseHash: ctx.hashOf(entry.id) });
  }
  ctx.staging.push(next);
  ctx.notice([m.dev_items_bulk_staged_count({ count: entries.length })]);
}

/** 여러 개 고치기를 바로 적용한다(서버 patch 명령 하나) */
export async function applyPatch(
  ctx: BulkContext,
  ids: readonly string[],
  patch: ItemPatch,
): Promise<boolean> {
  try {
    const next = await api.items.save.mutate({
      expectedRevision: ctx.list.revision,
      changes: [{ op: "patch", category: "items", ids: [...ids], patch }],
      note: ctx.note.trim() === "" ? null : ctx.note,
    });
    ctx.setList(next);
    ctx.notice([m.dev_items_applied({ count: ids.length, revision: next.revision })]);
    return true;
  } catch (error: unknown) {
    if (ctx.fail(error).key === "revision_conflict") await ctx.reload();
    return false;
  }
}

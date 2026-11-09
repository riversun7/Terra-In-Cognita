// 최근 바꿈의 한 줄을 다시 담기(설계안 3.10 [다시 담기]·[이 판으로 되돌리기]) — 감사 줄 ID로 그 판의 항목 하나만 받아 담은 변경에
// 넣는다. 아이템·분류 자료·효과 사전(WP-6) 모두(효과 사전 화면 /dev/effects도 같은 줄을 다시 담는다). 화면(ItemEditorScreen)에서 뗀 비동기 함수다(파일 크기).
import type { ContentHistoryRow } from "@terra/shared/contentEdit";
import {
  ITEM_EDIT_CATEGORIES,
  type ItemEditorGetResponse,
  type ItemEditorListResponse,
} from "@terra/shared/itemEditor";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import {
  type Stage,
  isEffectJson,
  isItemJson,
  isTaxonomyJson,
  stageEffect,
  stageItem,
  stageTaxonomy,
} from "./itemModel.ts";
import { TAXONOMY_CATEGORIES, effectRows, taxonomyRows } from "./itemRebase.ts";

export interface RestageDeps {
  readonly list: ItemEditorListResponse;
  readonly current: () => Stage;
  readonly push: (next: Stage) => void;
  readonly setDetail: (id: string, data: ItemEditorGetResponse) => void;
  readonly openItem: (id: string) => void;
  readonly openTab: (tab: "taxonomy") => void;
  readonly notice: (lines: string[]) => void;
  readonly problem: (lines: string[]) => void;
  readonly fail: (error: unknown) => void;
}

/** 감사 줄 하나의 바꿈 하나를 담는다(없으면 알린다) */
export async function restageFromHistory(
  deps: RestageDeps,
  line: ContentHistoryRow,
  change: ContentHistoryRow["changes"][number],
): Promise<void> {
  const category = ITEM_EDIT_CATEGORIES.find((item) => item === change.category);
  const auditId = line.auditId;
  if (!category || auditId === null) return;
  const id = change.id;
  try {
    const { entry } = await api.items.historyEntry.query({ auditId, category, id });
    if (!entry) {
      deps.problem([m.dev_items_restage_missing({ id })]);
      return;
    }
    if (category === "items") {
      if (!isItemJson(entry)) return;
      const data = await api.items.get.query({ id });
      deps.push(stageItem(deps.current(), id, { op: "put", entry, base: data.entry, baseHash: data.hash }));
      deps.setDetail(id, data);
      deps.openItem(id);
    } else if (category === "effects") {
      if (!isEffectJson(entry)) return;
      const row = effectRows(deps.list).find((item) => item.entry.id === id);
      deps.push(
        stageEffect(deps.current(), id, {
          op: "put",
          entry,
          base: row?.entry ?? null,
          baseHash: row?.hash ?? null,
        }),
      );
      // 효과 사전은 따로 화면(/dev/effects)이다: 담은 변경 막대에만 보이고 같은 묶음으로 간다
    } else {
      const tax = TAXONOMY_CATEGORIES.find((item) => item === category);
      if (!tax || !isTaxonomyJson(tax, entry)) return;
      const row = taxonomyRows(deps.list, tax).find((item) => item.entry.id === id);
      deps.push(
        stageTaxonomy(deps.current(), tax, id, {
          op: "put",
          entry,
          base: row?.entry ?? null,
          baseHash: row?.hash ?? null,
        }),
      );
      deps.openTab("taxonomy");
    }
    deps.notice([m.dev_items_restaged({ id })]);
  } catch (error: unknown) {
    deps.fail(error);
  }
}

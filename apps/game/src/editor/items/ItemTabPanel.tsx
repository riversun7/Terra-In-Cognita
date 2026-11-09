// 아이템 편집기 탭 이름과 [아이템 분류]·[대량 도구] 탭 판 — 화면(ItemEditorScreen)이 고른 탭 하나를 그린다.
// [아이템] 탭(목록 + 편집 판)은 화면이 직접 그린다(고른 아이템·미리 보기 상태가 화면에 있다). 효과 사전은 따로 화면(/dev/effects)이다
// (docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)").
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { ItemEditorListResponse, ItemJson, ItemPatch } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { ItemBulk } from "./ItemBulk.tsx";
import { ItemTaxonomy, type TaxonomyFocus } from "./ItemTaxonomy.tsx";
import type { ItemQuery, Stage, Staged, TaxonomyCategory, TaxonomyJson } from "./itemModel.ts";

export type ItemTab = "items" | "taxonomy" | "bulk";
export const ITEM_TABS: readonly ItemTab[] = ["items", "taxonomy", "bulk"];
export const ITEM_TAB_TEXT: Readonly<Record<ItemTab, () => string>> = {
  items: m.dev_items_tab_items,
  taxonomy: m.dev_items_tab_taxonomy,
  bulk: m.dev_items_tab_bulk,
};

export function ItemTabPanel({
  id,
  tab,
  list,
  stage,
  locale,
  focus,
  issues,
  onStageTaxonomy,
  onShowItems,
  onOpenItem,
  onImport,
  onPatch,
}: {
  /** 탭 줄 id(탭 판 id = `${id}-${tab}-panel`) */
  id: string;
  tab: Exclude<ItemTab, "items">;
  list: ItemEditorListResponse;
  stage: Stage;
  locale: "ko" | "en";
  /** [아이템 분류] 탭에서 열 마디(담은 변경 막대에서 고른 분류 자료) */
  focus: TaxonomyFocus | null;
  /** 마지막 서버 검사의 문제(가져오기 판이 보인다) */
  issues: readonly ContentIssueView[];
  onStageTaxonomy: (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null) => void;
  /** [아이템] 탭을 그 거르기로 연다(분류 나무 마디의 [아이템 탭에서 거르기]) */
  onShowItems: (patch: Partial<ItemQuery>) => void;
  onOpenItem: (id: string) => void;
  onImport: (entries: readonly ItemJson[], current: ReadonlyMap<string, ItemJson>) => void;
  onPatch: (ids: readonly string[], patch: ItemPatch) => Promise<boolean>;
}) {
  return (
    <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`}>
      {tab === "taxonomy" ? (
        <ItemTaxonomy
          list={list}
          stage={stage}
          locale={locale}
          focus={focus}
          onStage={onStageTaxonomy}
          onOpenItem={onOpenItem}
          onShowItems={onShowItems}
        />
      ) : (
        <ItemBulk list={list} locale={locale} issues={issues} onStage={onImport} onPatch={onPatch} />
      )}
    </div>
  );
}

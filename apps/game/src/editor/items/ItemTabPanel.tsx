// 아이템 편집기 탭 이름과 [아이템 분류]·[효과 사전]·[대량 도구] 탭 판 — 화면(ItemEditorScreen)이 고른 탭 하나를 그린다.
// [아이템] 탭(목록 + 편집 판)은 화면이 직접 그린다(고른 아이템·미리 보기 상태가 화면에 있다).
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { EffectJson, ItemEditorListResponse, ItemJson, ItemPatch } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { ItemBulk } from "./ItemBulk.tsx";
import { ItemEffects } from "./ItemEffects.tsx";
import { ItemTaxonomy } from "./ItemTaxonomy.tsx";
import type { Stage, Staged, TaxonomyCategory, TaxonomyJson } from "./itemModel.ts";

export type ItemTab = "items" | "taxonomy" | "effects" | "bulk";
export const ITEM_TABS: readonly ItemTab[] = ["items", "taxonomy", "effects", "bulk"];
export const ITEM_TAB_TEXT: Readonly<Record<ItemTab, () => string>> = {
  items: m.dev_items_tab_items,
  taxonomy: m.dev_items_tab_taxonomy,
  effects: m.dev_items_tab_effects,
  bulk: m.dev_items_tab_bulk,
};

export function ItemTabPanel({
  id,
  tab,
  list,
  stage,
  locale,
  issues,
  onStageTaxonomy,
  onStageEffect,
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
  /** 마지막 서버 검사의 문제(가져오기 판이 보인다) */
  issues: readonly ContentIssueView[];
  onStageTaxonomy: (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null) => void;
  onStageEffect: (id: string, next: Staged<EffectJson> | null) => void;
  onOpenItem: (id: string) => void;
  onImport: (entries: readonly ItemJson[], current: ReadonlyMap<string, ItemJson>) => void;
  onPatch: (ids: readonly string[], patch: ItemPatch) => Promise<boolean>;
}) {
  return (
    <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`}>
      {tab === "taxonomy" ? (
        <ItemTaxonomy list={list} stage={stage} locale={locale} onStage={onStageTaxonomy} />
      ) : tab === "effects" ? (
        <ItemEffects
          list={list}
          staged={stage.effects}
          locale={locale}
          onStage={onStageEffect}
          onOpenItem={onOpenItem}
        />
      ) : (
        <ItemBulk list={list} locale={locale} issues={issues} onStage={onImport} onPatch={onPatch} />
      )}
    </div>
  );
}

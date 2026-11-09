// 대분류 타일 줄 — 그림 · 개수 · 이름(옛 아이템 편집기의 대분류 타일, 사용자 2026-11-09 "대분류를 직관적으로 아이콘으로").
// [아이템] 탭은 누르면 목록을 그 대분류로 거르고, [아이템 분류] 탭은 그 대분류의 나무를 연다. 같은 부품이라 두 탭이 같은 모양이다.
// 고른 타일은 aria-pressed. 넓은 폭은 한 줄(10칸), 좁은 폭은 줄을 바꿔 감싼다(가로 넘침 없음).
import { ITEM_CATEGORY_IDS, type ItemCategoryId } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { CategoryIcon } from "./itemIcons.tsx";
import { CATEGORY_TEXT } from "./itemMessages.ts";
import "./itemTree.css";

export function ItemCategoryTiles({
  counts,
  total,
  selected,
  onSelect,
  subtitle,
  showAll = true,
}: {
  counts: Readonly<Record<ItemCategoryId, number>>;
  total: number;
  selected: ItemCategoryId | "all";
  onSelect: (category: ItemCategoryId | "all") => void;
  /** 타일 아래 작은 글(분류 탭: 중분류 수) */
  subtitle?: ((category: ItemCategoryId) => string) | undefined;
  showAll?: boolean;
}) {
  const tiles: readonly (ItemCategoryId | "all")[] = showAll
    ? ["all", ...ITEM_CATEGORY_IDS]
    : ITEM_CATEGORY_IDS;
  return (
    <div className="ie-tiles" role="group" aria-label={m.dev_items_tiles_label()}>
      {tiles.map((category) => {
        const count = category === "all" ? total : counts[category];
        const name = category === "all" ? m.dev_items_tile_all() : CATEGORY_TEXT[category]();
        const sub = category === "all" || !subtitle ? null : subtitle(category);
        return (
          <button
            key={category}
            type="button"
            className="ie-tile"
            data-category={category}
            data-empty={count === 0 ? "" : undefined}
            aria-pressed={selected === category}
            title={name}
            onClick={() => onSelect(category)}
          >
            <span className="ie-tile-icon">
              <CategoryIcon category={category} />
            </span>
            <span className="ie-tile-count">{count}</span>
            <span className="ie-tile-name">{name}</span>
            {sub ? <span className="ie-tile-sub">{sub}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

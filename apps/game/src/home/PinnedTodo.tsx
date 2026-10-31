// 위에 고정한 처리할 일(조합 템플릿) — 맨 위에 늘 있고 접을 수 있다(D-6005 DT-HYBRID). 접으면 분류별 수만 한 줄로 보인다.
// 접힘은 기기에만 둔다(homePrefs.ts). 처리할 일이 없으면 "지금 처리할 일이 없습니다"이고 접기 단추는 없다.
import type { InboxListResponse } from "@terra/shared/inbox";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { CategoryIcon, ChevronDownIcon, InboxIcon } from "./cards/icons.tsx";
import { PendingCount } from "./cards/InboxCard.tsx";
import { setInboxCollapsed, useInboxCollapsed } from "./homePrefs.ts";
import type { HomeViewProps } from "./homeTypes.ts";
import { nonZeroCounts } from "./homeView.ts";
import { InboxBody } from "./InboxBody.tsx";
import { CATEGORY_NAMES } from "./inboxParts.ts";
import { formatCount } from "./numbers.ts";

/** 위 고정 칸에 보이는 줄 수. 나머지는 처리함에서(묶은 줄이라 보통 이 안에 든다, 기술 해석) */
export const PINNED_ROWS = 6;

/** 분류별 수(접은 머리, 처리함 템플릿 머리). 분류는 아이콘 + 이름 + 수 */
export function CategoryCounts({ counts }: { counts: InboxListResponse["counts"] }) {
  return (
    <ul className="home-counts">
      {nonZeroCounts(counts).map(({ category, count }) => (
        <li key={category} className="home-count-chip" data-category={category}>
          <CategoryIcon category={category} />
          <span>
            {m.home_category_count({ category: CATEGORY_NAMES[category](), count: formatCount(count) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PinnedTodo({ data }: Pick<HomeViewProps, "data">) {
  const collapsed = useInboxCollapsed();
  const titleId = useId();
  const bodyId = useId();
  const response = data.inbox.value;
  const hasItems = response !== null && response.items.length > 0;
  const folded = collapsed && hasItems;
  return (
    <section className="home-panel home-pinned" aria-labelledby={titleId}>
      <div className="home-panel-head">
        <span className="home-card-icon" data-card-icon="inbox">
          <InboxIcon />
        </span>
        <h2 id={titleId} className="home-panel-title">
          {m.card_inbox()} <PendingCount data={data} />
        </h2>
        {hasItems ? (
          <button
            type="button"
            className="button-small home-collapse"
            aria-expanded={!folded}
            aria-controls={bodyId}
            onClick={() => setInboxCollapsed(!collapsed)}
          >
            <ChevronDownIcon />
            <span className="home-collapse-text">
              {folded ? m.home_inbox_expand() : m.home_inbox_collapse()}
            </span>
          </button>
        ) : null}
      </div>
      {folded && response !== null ? <CategoryCounts counts={response.counts} /> : null}
      <div id={bodyId} className="home-panel-body" hidden={folded}>
        <InboxBody data={data} limit={PINNED_ROWS} />
      </div>
    </section>
  );
}

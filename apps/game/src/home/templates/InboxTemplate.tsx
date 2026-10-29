// DT-INBOX 처리함 — 처리할 일 목록이 중심(분류별 묶음, 모든 줄). 아래에 요약 카드 한 줄(가로로 넘김, 기술 해석: "한 줄" = 한 행).
// 처리하면 사라지는 목록(D-6005)은 서버가 그 상태를 다시 만들 때 빠지는 것으로 이룬다(바로 처리 결과 뒤 다시 받기).
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CardGrid } from "../CardGrid.tsx";
import { CategoryIcon, InboxIcon } from "../cards/icons.tsx";
import { PendingCount } from "../cards/InboxCard.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { groupByCategory, headItems } from "../homeView.ts";
import { HomeEmpty, HomeLoading, MoreInInbox, inboxItemsOf } from "../InboxBody.tsx";
import { categoryName } from "../itemText.ts";
import { TodoList } from "../TodoList.tsx";
import "./templates.css";
import { formatCount } from "../numbers.ts";

/** 처리함 템플릿에 보이는 줄 수. 나머지는 처리함 화면에서(묶은 줄이라 보통 이 안에 든다) */
const INBOX_TEMPLATE_ROWS = 30;

function InboxGroups({ data, onQuickAction }: Pick<TemplateProps, "data" | "onQuickAction">) {
  const items = inboxItemsOf(data);
  if (items === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  if (items.length === 0) return <HomeEmpty text={m.card_inbox_empty()} />;
  const { shown, rest } = headItems(items, INBOX_TEMPLATE_ROWS);
  return (
    <div className="inbox-groups">
      {groupByCategory(shown).map((group) => (
        <section key={group.category} className="inbox-group" data-category={group.category}>
          <h3 className="inbox-group-title">
            <span className="inbox-group-icon">
              <CategoryIcon category={group.category} />
            </span>
            <span>{categoryName(group.category)}</span>
            <span className="inbox-group-count">{formatCount(group.items.length)}</span>
          </h3>
          <TodoList items={group.items} onQuickAction={onQuickAction} showCategory={false} />
        </section>
      ))}
      {rest > 0 ? <MoreInInbox count={rest} /> : null}
    </div>
  );
}

export default function InboxTemplate(props: TemplateProps) {
  const titleId = useId();
  return (
    <>
      <section className="home-panel home-inbox-hero" aria-labelledby={titleId}>
        <div className="home-panel-head">
          <span className="home-card-icon" data-card-icon="inbox">
            <InboxIcon />
          </span>
          <h2 id={titleId} className="home-panel-title">
            {m.card_inbox()} <PendingCount data={props.data} />
          </h2>
        </div>
        <InboxGroups data={props.data} onQuickAction={props.onQuickAction} />
      </section>
      <CardGrid {...props} variant="strip" />
    </>
  );
}

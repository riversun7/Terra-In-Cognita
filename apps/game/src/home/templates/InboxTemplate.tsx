// DT-INBOX 처리함 — 처리할 일 목록이 중심(분류별 묶음, 모든 줄). 아래에 요약 카드 한 줄(가로로 넘김, 기술 해석: "한 줄" = 한 행).
// 처리하면 사라지는 목록(D-6005)은 서버가 그 상태를 다시 만들 때 빠지는 것으로 이룬다(바로 처리 결과 뒤 다시 받기).
// 이 기기가 모르는 분류(더 새 서버)의 줄은 끝의 "그 밖의 알림" 묶음에 둔다(처리함 화면과 같다, 줄이 빠지지 않는다).
// 묶음 이름 클래스는 home-inbox-group*이다(처리함 화면 W3의 inbox-group*과 겹치지 않게: CSS는 전역이다).
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CardGrid } from "../CardGrid.tsx";
import { CategoryIcon, InboxIcon } from "../cards/icons.tsx";
import { PendingCount } from "../cards/InboxCard.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { type InboxGroupKey, groupByCategory, headItems } from "../homeView.ts";
import { HomeEmpty, HomeLoading, MoreInInbox, inboxOf } from "../InboxBody.tsx";
import { CATEGORY_NAMES, INBOX_TEXT } from "../inboxParts.ts";
import { formatCount } from "../numbers.ts";
import { TodoList } from "../TodoList.tsx";
import "./templates.css";

/** 처리함 템플릿에 보이는 줄 수. 나머지는 처리함 화면에서(묶은 줄이라 보통 이 안에 든다) */
const INBOX_TEMPLATE_ROWS = 30;

function groupName(key: InboxGroupKey): string {
  return key === "other" ? INBOX_TEXT.otherGroup() : CATEGORY_NAMES[key]();
}

function InboxGroups({ data }: Pick<TemplateProps, "data">) {
  const response = inboxOf(data);
  if (response === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  if (response.items.length === 0) return <HomeEmpty text={m.card_inbox_empty()} />;
  const { shown, hidden } = headItems(response.items, INBOX_TEMPLATE_ROWS);
  return (
    <div className="home-inbox-groups">
      {groupByCategory(shown).map((group) => (
        <section key={group.key} className="home-inbox-group" data-category={group.key}>
          <h3 className="home-inbox-group-title">
            <span className="home-inbox-group-icon">
              <CategoryIcon category={group.key} />
            </span>
            <span>{groupName(group.key)}</span>
            <span className="home-inbox-group-count">{formatCount(group.items.length)}</span>
          </h3>
          <TodoList items={group.items} now={response.generatedAt} showCategory={false} />
        </section>
      ))}
      {hidden.length > 0 ? <MoreInInbox hidden={hidden} /> : null}
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
        <InboxGroups data={props.data} />
      </section>
      <CardGrid {...props} variant="strip" />
    </>
  );
}

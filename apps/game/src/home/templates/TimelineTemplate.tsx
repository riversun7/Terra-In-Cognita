// DT-TIMELINE 타임라인 — 맨 위에 마감 없는 처리할 일 묶음("지금"), 아래에 마감 있는 일을 시간 순서로(ADR 2026-10-29-app-shell 6절 해석).
// 마감 없는 항목도 빠지지 않는다. 처리할 일이 아닌 "다가올 일"(운송 도착 등)은 그 시스템이 생길 때 더한다. 아래는 카드 격자.
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CardGrid } from "../CardGrid.tsx";
import { InboxIcon } from "../cards/icons.tsx";
import { PendingCount } from "../cards/InboxCard.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { splitTimeline } from "../homeView.ts";
import { HomeEmpty, HomeLoading, inboxItemsOf } from "../InboxBody.tsx";
import { TimelineList } from "../TimelineList.tsx";
import { TodoList } from "../TodoList.tsx";

function TimelineBody({ data, onQuickAction }: Pick<TemplateProps, "data" | "onQuickAction">) {
  const items = inboxItemsOf(data);
  if (items === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  const { now, upcoming } = splitTimeline(items);
  return (
    <>
      <section className="timeline-section">
        <h3 className="timeline-section-title">{m.home_timeline_now()}</h3>
        {now.length === 0 ? (
          <HomeEmpty text={m.card_inbox_empty()} />
        ) : (
          <TodoList items={now} onQuickAction={onQuickAction} />
        )}
      </section>
      <section className="timeline-section">
        <h3 className="timeline-section-title">{m.card_timeline()}</h3>
        {upcoming.length === 0 ? (
          <HomeEmpty text={m.card_timeline_empty()} />
        ) : (
          <TimelineList items={upcoming} onQuickAction={onQuickAction} />
        )}
      </section>
    </>
  );
}

export default function TimelineTemplate(props: TemplateProps) {
  const titleId = useId();
  return (
    <>
      <section className="home-panel home-timeline-hero" aria-labelledby={titleId}>
        <div className="home-panel-head">
          <span className="home-card-icon" data-card-icon="inbox">
            <InboxIcon />
          </span>
          <h2 id={titleId} className="home-panel-title">
            {m.card_inbox()} <PendingCount data={props.data} />
          </h2>
        </div>
        <TimelineBody data={props.data} onQuickAction={props.onQuickAction} />
      </section>
      <CardGrid {...props} />
    </>
  );
}

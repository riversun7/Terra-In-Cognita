// DT-TIMELINE 타임라인 — 맨 위에 마감 없는 할 일 묶음("지금"), 아래에 마감 있는 일을 시간 순서로(ADR 2026-10-29-app-shell 6절 해석),
// 맨 끝에 완료(확인할 소식, D-6006). 마감 없는 항목도 빠지지 않는다. 처리할 일이 아닌 "다가올 일"(운송 도착 등)은 그 시스템이
// 생길 때 더한다. 아래는 카드 격자.
// D-6005 비교 메모: "지금"이 마감 없는 일이라 마감 있는 위협(웨이브·공성)이 "다가올 일"에서 그 뒤에 온다. D-6009의 "손실이 큰 일 먼저"와
// 어긋나는 이 템플릿의 모양 그대로다(통합 세션이 템플릿 비교 때 기획에 넘긴다).
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CardGrid } from "../CardGrid.tsx";
import { InboxIcon } from "../cards/icons.tsx";
import { PendingCount } from "../cards/InboxCard.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { splitTimeline } from "../homeView.ts";
import { HomeEmpty, HomeLoading, inboxOf } from "../InboxBody.tsx";
import { CATEGORY_NAMES } from "../inboxParts.ts";
import { TimelineList } from "../TimelineList.tsx";
import { TodoList } from "../TodoList.tsx";

function TimelineBody({ data }: Pick<TemplateProps, "data">) {
  const response = inboxOf(data);
  if (response === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  const { now, upcoming, done } = splitTimeline(response.items);
  const at = response.generatedAt;
  return (
    <>
      <section className="timeline-section">
        <h3 className="timeline-section-title">{m.home_timeline_now()}</h3>
        {now.length === 0 ? <HomeEmpty text={m.card_inbox_empty()} /> : <TodoList items={now} now={at} />}
      </section>
      <section className="timeline-section">
        <h3 className="timeline-section-title">{m.card_timeline()}</h3>
        {upcoming.length === 0 ? (
          <HomeEmpty text={m.card_timeline_empty()} />
        ) : (
          <TimelineList items={upcoming} now={at} />
        )}
      </section>
      {done.length === 0 ? null : (
        <section className="timeline-section">
          <h3 className="timeline-section-title">{CATEGORY_NAMES.done()}</h3>
          <TodoList items={done} now={at} showCategory={false} />
        </section>
      )}
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
        <TimelineBody data={props.data} />
      </section>
      <CardGrid {...props} />
    </>
  );
}

// DT-BRIEF 부관 브리핑 — 처리할 일을 말풍선 + 답 단추로(D-6005). 부관 인물이 없어 이름 없는 기본 모습이다(ADR 2026-10-29-app-shell 6절).
// 첫 말풍선은 복귀 요약 줄(있을 때), 그다음 처리할 일(앞 6줄, 나머지는 처리함에서 — 가린 줄의 분류별 수와 함께). 아래는 카드 격자.
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { BriefConversation, summaryRows } from "../BriefConversation.tsx";
import { CardGrid } from "../CardGrid.tsx";
import { BriefingIcon } from "../cards/icons.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { headItems } from "../homeView.ts";
import { HomeEmpty, HomeLoading, MoreInInbox, inboxOf } from "../InboxBody.tsx";
import { PINNED_ROWS } from "../PinnedTodo.tsx";

function BriefBody({ data }: Pick<TemplateProps, "data">) {
  const response = inboxOf(data);
  const summary = data.summary.value;
  const waiting = data.inbox.status === "loading" || data.summary.status === "loading";
  if (response === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  const { shown, hidden } = headItems(response.items, PINNED_ROWS);
  if (shown.length === 0 && summaryRows(summary).length === 0) {
    return waiting ? <HomeLoading /> : <HomeEmpty text={m.card_briefing_empty()} />;
  }
  return (
    <>
      <BriefConversation summary={summary} items={shown} now={response.generatedAt} />
      {hidden.length > 0 ? <MoreInInbox hidden={hidden} /> : null}
    </>
  );
}

export default function BriefTemplate(props: TemplateProps) {
  const titleId = useId();
  return (
    <>
      <section className="home-panel home-brief-hero" aria-labelledby={titleId}>
        <div className="home-panel-head">
          <span className="home-card-icon" data-card-icon="briefing">
            <BriefingIcon />
          </span>
          <h2 id={titleId} className="home-panel-title">
            {m.card_briefing()}
          </h2>
        </div>
        <BriefBody data={props.data} />
      </section>
      <CardGrid {...props} />
    </>
  );
}

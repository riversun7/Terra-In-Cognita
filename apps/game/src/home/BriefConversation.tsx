// 부관 보고 — 부관이 말풍선으로 복귀 요약과 처리할 일을 알리고 답 단추(바로 처리)로 처리한다(D-6005 DT-BRIEF, 시안 ⑤).
// 부관 인물(휴먼)이 아직 없어 이름 없는 기본 모습이다(ADR 2026-10-29-app-shell 6절). 브리핑 템플릿과 부관 보고 카드가 쓴다.
// 복귀 요약 칸은 복귀 요약 대화상자와 같은 이름·수(W3 summaryText: 아는 칸이고 사건이 있는 칸만)이고, 숫자를 누르면 그 화면이다(D-6014).
// 처리할 일 말풍선의 글·갈 곳·단추는 처리함 화면과 같은 W3 규칙이다(itemView.ts).
import { type RouteTarget, isRouteTarget } from "@terra/shared";
import type { InboxItem, SummaryGetResponse } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { AideIcon } from "./cards/icons.tsx";
import { INBOX_TEXT, SECTION_LABELS, visibleSections } from "./inboxParts.ts";
import { homeItemView } from "./itemView.ts";
import { formatCount } from "./numbers.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoActions, TodoMeta, categoryAttr } from "./TodoList.tsx";

interface SummaryRow {
  readonly key: string;
  readonly label: string;
  readonly count: string;
  readonly to: RouteTarget | null;
}

/** 그릴 수 있는 복귀 요약 줄(모르는 칸·사건 없는 칸은 뺀다) */
export function summaryRows(summary: SummaryGetResponse | null): SummaryRow[] {
  if (summary === null) return [];
  return visibleSections(summary).map((section) => {
    const target: unknown = section.target;
    return {
      key: section.kind,
      label: SECTION_LABELS[section.kind](),
      count: formatCount(section.count),
      to: isRouteTarget(target) ? target : null,
    };
  });
}

function SummaryLine({ row }: { row: SummaryRow }) {
  const body = (
    <>
      <span className="brief-summary-label">{row.label}</span>
      <span className="brief-summary-count">{row.count}</span>
    </>
  );
  return row.to === null ? (
    <span className="brief-summary-row">{body}</span>
  ) : (
    <HomeLink to={row.to} className="brief-summary-row brief-summary-link">
      {body}
    </HomeLink>
  );
}

function BriefItem({ item, now, actions }: { item: InboxItem; now: number; actions: boolean }) {
  const view = homeItemView(item, now);
  return (
    <li className="brief-bubble" data-category={categoryAttr(item, view)}>
      <HomeLink to={view.target} className="brief-item-link">
        <span className="todo-title">{view.title}</span>
        <TodoMeta item={item} view={view} />
      </HomeLink>
      {actions ? <TodoActions actions={view.actions} /> : null}
    </li>
  );
}

interface BriefConversationProps {
  readonly summary: SummaryGetResponse | null;
  readonly summaryRowLimit?: number;
  readonly items: readonly InboxItem[];
  /** 목록을 만든 서버 시각(generatedAt) */
  readonly now: number;
  /** false면 답 단추를 그리지 않는다(카드) */
  readonly actions?: boolean;
}

export function BriefConversation({
  summary,
  summaryRowLimit,
  items,
  now,
  actions = true,
}: BriefConversationProps) {
  const rows = summaryRows(summary).slice(0, summaryRowLimit);
  const samples = summary?.sections.some((section) => section.preview === true) ?? false;
  return (
    <div className="brief">
      <p className="brief-aide">
        <span className="brief-avatar">
          <AideIcon />
        </span>
        <span className="brief-name">{m.home_brief_aide()}</span>
      </p>
      <ol className="brief-bubbles">
        {rows.length > 0 ? (
          <li className="brief-bubble">
            <p className="brief-lead">
              {m.home_brief_summary()}
              {samples ? <span className="home-sample">{INBOX_TEXT.previewTag()}</span> : null}
            </p>
            <ul className="brief-summary">
              {rows.map((row) => (
                <li key={row.key}>
                  <SummaryLine row={row} />
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {items.map((item) => (
          <BriefItem key={item.id} item={item} now={now} actions={actions} />
        ))}
      </ol>
    </div>
  );
}

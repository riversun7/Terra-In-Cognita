// 부관 보고 — 부관이 말풍선으로 복귀 요약과 처리할 일을 알리고 답 단추(바로 처리)로 처리한다(D-6005 DT-BRIEF, 시안 ⑤).
// 부관 인물(휴먼)이 아직 없어 이름 없는 기본 모습이다(ADR 2026-10-29-app-shell 6절). 브리핑 템플릿과 부관 보고 카드가 쓴다.
// 복귀 요약 칸은 summary.get의 칸을 한 줄씩(숫자를 누르면 그 화면, D-6014). 모르는 칸은 그리지 않는다.
import { isRouteTarget, targetPath } from "@terra/shared";
import type { InboxItem, SummaryGetResponse } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { AideIcon } from "./cards/icons.tsx";
import { itemHref } from "./homeView.ts";
import { itemTitle, summaryLine } from "./itemText.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoActions, TodoMeta } from "./TodoList.tsx";

interface SummaryRow {
  readonly key: string;
  readonly text: string;
  readonly href: string | null;
}

/** 그릴 수 있는 복귀 요약 줄(모르는 칸은 뺀다) */
export function summaryRows(summary: SummaryGetResponse | null): SummaryRow[] {
  if (summary === null) return [];
  const rows: SummaryRow[] = [];
  for (const section of summary.sections) {
    const text = summaryLine(section);
    if (text === null) continue;
    rows.push({
      key: section.kind,
      text,
      href: isRouteTarget(section.target) ? targetPath(section.target) : null,
    });
  }
  return rows;
}

interface BriefConversationProps {
  readonly summary: SummaryGetResponse | null;
  readonly summaryRowLimit?: number;
  readonly items: readonly InboxItem[];
  readonly onQuickAction: (item: InboxItem, action: string) => void;
  /** false면 답 단추를 그리지 않는다(카드) */
  readonly actions?: boolean;
}

export function BriefConversation({
  summary,
  summaryRowLimit,
  items,
  onQuickAction,
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
              {samples ? <span className="home-sample">{m.home_preview_tag()}</span> : null}
            </p>
            <ul className="brief-summary">
              {rows.map((row) => (
                <li key={row.key}>
                  {row.href === null ? (
                    row.text
                  ) : (
                    <HomeLink href={row.href} className="brief-summary-link">
                      {row.text}
                    </HomeLink>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {items.map((item) => (
          <li key={item.id} className="brief-bubble" data-category={item.category}>
            <HomeLink href={itemHref(item)} className="brief-item-link">
              <span className="todo-title">{itemTitle(item)}</span>
              <TodoMeta item={item} />
            </HomeLink>
            {actions ? <TodoActions item={item} onQuickAction={onQuickAction} /> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

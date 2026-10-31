// 경제 화면 작은 부품 — 시험 자료 표, 준비 중 판, 받는 중·실패, 오르내림 글, 작은 선.
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { LiveMessage } from "../ui/LiveMessage.tsx";
import { Icon } from "../ui/icons.tsx";
import { text } from "../ui/text.ts";
import { formatAmount, formatBp, trendOf } from "./amount.ts";
import type { QueryView } from "./queries.ts";
import { sparkPath } from "./shape.ts";

/** "시험" 표(시안 자료 줄). 읽기 프로그램에는 "시험 자료"로 읽힌다 */
export function PreviewTag() {
  return <span className="eco-tag eco-tag-preview">{m.economy_preview_tag()}</span>;
}

/** 서버가 아직 돌리지 않는 시스템 */
export function NotReady({ body }: { body: string }) {
  return (
    <div className="panel eco-not-ready">
      <p className="eco-not-ready-title">{m.economy_not_ready_title()}</p>
      <p className="lead">{body}</p>
    </div>
  );
}

/** 받는 중·실패를 그리고, 받은 값이 있으면 children(값) */
export function Loaded<T>({
  view,
  children,
}: {
  view: QueryView<T> & { refresh: () => void };
  children: (data: T) => ReactNode;
}) {
  if (view.data !== null) {
    return (
      <>
        {view.status === "failed" && view.error !== null ? (
          <LiveMessage tone="error" lines={[m.economy_load_failed(), text({ key: view.error })]} />
        ) : null}
        {children(view.data)}
      </>
    );
  }
  if (view.status === "failed") {
    return (
      <>
        <LiveMessage
          tone="error"
          lines={[m.economy_load_failed(), ...(view.error === null ? [] : [text({ key: view.error })])]}
        />
        <div className="form-actions">
          <button type="button" onClick={view.refresh}>
            {m.retry()}
          </button>
        </div>
      </>
    );
  }
  return (
    <p className="status eco-loading" role="status">
      {m.shell_loading()}
    </p>
  );
}

/** 오르내림(만분율): 화살표 + 부호 있는 백분율. 색만으로 알리지 않는다 */
export function Change({ bp }: { bp: number | null }) {
  if (bp === null) return <span className="eco-change">—</span>;
  const trend = trendOf(bp);
  return (
    <span className="eco-change" data-trend={trend}>
      {trend === "flat" ? null : <Icon name={trend === "up" ? "up" : "down"} className="eco-change-icon" />}
      {formatBp(bp)}
    </span>
  );
}

/** 금액·수량(자리 나눔, 고정폭 숫자) */
export function Amount({ value, className }: { value: bigint | string; className?: string }) {
  return (
    <span className={className ? `eco-num ${className}` : "eco-num"}>{formatAmount(value, getLocale())}</span>
  );
}

/** 작은 선(꾸밈. 값은 옆 글이 알린다) */
export function Spark({ values, trend }: { values: readonly string[]; trend: "up" | "down" | "flat" }) {
  const path = sparkPath(values, 64, 20);
  if (path === "") return null;
  return (
    <svg className="eco-spark" data-trend={trend} viewBox="0 0 64 20" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

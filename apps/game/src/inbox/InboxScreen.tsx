// 처리함 화면(/inbox) — 처리할 일 전체. ?item=<항목 ID>로 한 줄을 강조한다(ADR 2026-10-29-app-shell 1·7절).
// 지연 로딩 조각이다(default export). 화면 틀(W1)의 주소 → 화면 표(shell/routeViews.tsx)가 한 줄로 그린다.
// - 자료는 처리할 일 저장소(store.ts) 하나다. 위 띠 종 배지와 같다. 화면을 열면 없거나 60초가 지났을 때만 받는다.
// - 플레이어는 늘 빈 처리함이다(지금 제공 함수 0개). dev·admin이 시안 자료를 켜면 항목마다 "시험 자료"가 붙는다.
// - 바로 처리: 시안 자료는 명령을 보내지 않고 알림 영역에 그렇다고 읽어 준다(quickActions.ts).
// - 제목(h1)은 tabIndex=-1이다. 앱 안 이동 때 초점은 화면 틀(라우터)이 옮긴다. 이 화면은 스스로 옮기지 않는다.
import type { InboxItem } from "@terra/shared/inbox";
import { type ReactNode, useCallback, useEffect } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { text } from "../ui/text.ts";
import { InboxList } from "./InboxList.tsx";
import { ensureInbox, refreshInbox, useInbox } from "./store.ts";
import "./inbox.css";

export interface InboxScreenProps {
  /** ?item= 값(강조할 항목 ID). 없으면 undefined */
  readonly itemId?: string | undefined;
  /** 앱 안 이동(라우터의 쌓기). 없으면 보통 링크다 */
  readonly navigate?: ((path: string) => void) | undefined;
  /** 제목 줄 끝에 둘 것(화면 틀의 [뒤로] 등) */
  readonly headerEnd?: ReactNode;
}

export default function InboxScreen({ itemId, navigate, headerEnd }: InboxScreenProps) {
  const inbox = useInbox();
  const { lines: noticeLines, version: noticeVersion, show: showNotice } = useLiveLines();

  useEffect(() => {
    void ensureInbox();
  }, []);

  const onQuickAction = useCallback(
    (item: InboxItem) => {
      // 실제 항목에는 버튼이 없다(명령을 보낼 길이 아직 없다). 시안 자료는 보내지 않고 알린다
      if (item.preview === true) showNotice([m.inbox_action_preview_done()]);
    },
    [showNotice],
  );

  const { data } = inbox;
  const failureKey = inbox.status === "failed" ? inbox.error : null;
  const failed = failureKey !== null;
  const failureLines = failureKey === null ? [] : [m.inbox_load_failed(), text({ key: failureKey })];
  const missing = itemId !== undefined && data !== null && !data.items.some((item) => item.id === itemId);

  let body: ReactNode;
  if (data === null) {
    body = failed ? null : (
      <p className="status" role="status">
        {m.inbox_loading()}
      </p>
    );
  } else if (data.items.length === 0) {
    body = (
      <div className="panel inbox-empty">
        <p className="inbox-empty-title">{m.inbox_empty()}</p>
        <p className="lead">{m.inbox_empty_hint()}</p>
      </div>
    );
  } else {
    body = (
      <InboxList
        items={data.items}
        now={data.generatedAt}
        highlightId={itemId}
        onInboxScreen
        navigate={navigate}
        onQuickAction={onQuickAction}
      />
    );
  }

  return (
    <section className="screen inbox" aria-labelledby="inbox-title">
      <div className="screen-header">
        <h1 id="inbox-title" className="screen-title" tabIndex={-1}>
          {m.inbox_title()}
        </h1>
        {headerEnd}
      </div>
      {inbox.preview ? <p className="inbox-notice">{m.inbox_preview_notice()}</p> : null}
      <LiveMessage tone="error" lines={failureLines} />
      {failed ? (
        <div className="form-actions">
          <button type="button" onClick={() => void refreshInbox()}>
            {m.retry()}
          </button>
        </div>
      ) : null}
      <LiveMessage tone="info" lines={noticeLines} version={noticeVersion} />
      {missing ? <p className="inbox-missing">{m.inbox_item_missing()}</p> : null}
      {body}
    </section>
  );
}

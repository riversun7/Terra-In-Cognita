// 우편 화면(/mail) — 받은 우편·보낸 우편·쓰기(D-270: 물건·세력 화폐를 보내는 우편. 감시는 서버 규칙이라 화면에 없다).
// 지연 로딩 조각이다(default export, shell/routeViews.tsx).
// - 자료: mail.list 하나. 우편 표가 아직 없어 실제 우편함은 비어 있다. dev·admin이 시안 자료를 켜면(홈과 같은 스위치) 시안 우편.
// - 배치: 좁으면 목록 → 누르면 읽기 칸(목록은 숨기고 [목록으로]). 본문이 48em 이상이면 왼쪽 목록 + 오른쪽 읽기 칸(옆 판).
// - 보내기·첨부 받기·지우기는 WebSocket 명령이라 곧 열림. 쓰기는 칸 검사만 한다.
import type { MailItem, MailListResponse } from "@terra/shared/mail";
import { useState } from "react";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import {
  PreviewNotice,
  PreviewSwitch,
  QueryFailure,
  SoonProvider,
  TabList,
  panelId,
  tabId,
} from "../sections/screenParts.tsx";
import { useScreenQuery } from "../sections/useScreenQuery.ts";
import { type DraftState, EMPTY_DRAFT, MailCompose } from "./MailCompose.tsx";
import { MailList } from "./MailList.tsx";
import { MailReader, READER_TITLE_ID } from "./MailReader.tsx";
import { loadMailList } from "./mailQueries.ts";
import { MAIL_TABS, type MailTab, folderItems, replySubjectBase } from "./mailView.ts";
import "../sections/screenParts.css";
import "./mail.css";

const TAB_PREFIX = "mail";

const TAB_NAMES = {
  inbox: m.mail_tab_inbox,
  sent: m.mail_tab_sent,
  compose: m.mail_tab_compose,
} satisfies Record<MailTab, () => string>;

/** 다음 그림 뒤에 초점(그려지기 전에는 요소가 없다) */
function focusLater(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

function MailBody({ list }: { list: MailListResponse }) {
  const [tab, setTab] = useState<MailTab>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const folder = tab === "sent" ? "sent" : "inbox";
  const items = folderItems(list.items, folder);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const tabs = MAIL_TABS.map((id) => ({
    id,
    name: TAB_NAMES[id](),
    count: id === "inbox" && list.unread > 0 ? list.unread : null,
  }));

  const choose = (next: MailTab): void => {
    setTab(next);
    setSelectedId(null);
  };
  const open = (id: string): void => {
    setSelectedId(id);
    focusLater(READER_TITLE_ID);
  };
  const back = (): void => {
    const id = selectedId;
    setSelectedId(null);
    if (id !== null) focusLater(`mail-row-${id}`);
  };
  const reply = (item: MailItem): void => {
    setDraft({
      ...EMPTY_DRAFT,
      recipient: item.from.name,
      subject: replySubjectBase(item.subject) ?? m.mail_reply_subject({ subject: item.subject }),
    });
    setTab("compose");
    setSelectedId(null);
    focusLater(tabId(TAB_PREFIX, "compose"));
  };

  return (
    <div className="mail-main">
      <TabList
        label={m.mail_tabs_label()}
        prefix={TAB_PREFIX}
        tabs={tabs}
        selected={tab}
        onSelect={choose}
        formatCount={formatCount}
      />
      <section
        className="mail-panel"
        role="tabpanel"
        id={panelId(TAB_PREFIX, tab)}
        aria-labelledby={tabId(TAB_PREFIX, tab)}
      >
        {tab === "compose" ? (
          <div className="mail-compose-wrap">
            <MailCompose draft={draft} onChange={setDraft} attachables={list.attachables} />
          </div>
        ) : (
          <div className="mail-layout" data-reading={selected !== null}>
            <div className="mail-list-pane">
              <MailList
                items={items}
                folder={folder}
                selectedId={selectedId}
                now={list.generatedAt}
                onSelect={open}
              />
            </div>
            <div className="mail-reader-pane">
              {selected === null ? (
                items.length === 0 ? null : (
                  <p className="mail-pick">{m.mail_pick_hint()}</p>
                )
              ) : (
                <MailReader item={selected} now={list.generatedAt} onBack={back} onReply={reply} />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function MailScreen() {
  const { state, refresh } = useScreenQuery(loadMailList);
  const list = state.data;
  return (
    <section className="screen screen-wide mail" aria-labelledby="mail-title">
      <SoonProvider>
        <div className="screen-header">
          <h1 id="mail-title" className="screen-title" tabIndex={-1}>
            {m.shell_mail()}
          </h1>
          <BackButton />
        </div>
        <PreviewSwitch />
        {list?.preview === true ? <PreviewNotice message={m.mail_preview_notice()} /> : null}
        <QueryFailure
          error={state.status === "failed" ? state.error : null}
          title={m.mail_load_failed()}
          onRetry={refresh}
        />
        {list === null ? (
          state.status === "failed" ? null : (
            <p className="status" role="status">
              {m.mail_loading()}
            </p>
          )
        ) : (
          <MailBody list={list} />
        )}
      </SoonProvider>
    </section>
  );
}

// 우편 목록 — 한 줄 = 단추(누르면 읽기 칸에 연다). 받은 우편은 읽지 않은 줄을 굵게 + 점 + 숨은 글 "읽지 않음"(색만으로 알리지 않는다).
import type { MailFolder, MailItem, MailParty } from "@terra/shared/mail";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { relativeText } from "../sections/screenText.ts";
import { Icon } from "../ui/icons.tsx";
import { snippet } from "./mailView.ts";

/** 사람 이름 + 세력 태그 */
export function partyText(party: MailParty): string {
  return party.factionTag === null ? party.name : m.mail_party({ name: party.name, tag: party.factionTag });
}

export function MailList({
  items,
  folder,
  selectedId,
  now,
  onSelect,
}: {
  items: readonly MailItem[];
  folder: MailFolder;
  selectedId: string | null;
  now: number;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mail-empty">
        <span className="mail-empty-mark" aria-hidden="true">
          <Icon name="mail" />
        </span>
        <p className="mail-empty-title">{folder === "inbox" ? m.mail_empty_inbox() : m.mail_empty_sent()}</p>
        {folder === "inbox" ? <p className="mail-muted">{m.mail_empty_inbox_hint()}</p> : null}
      </div>
    );
  }
  return (
    <ul className="mail-list" aria-label={m.mail_list_label()}>
      {items.map((item) => {
        const unread = folder === "inbox" && !item.read;
        const who = folder === "inbox" ? item.from : item.to;
        return (
          <li key={item.id}>
            <button
              type="button"
              id={`mail-row-${item.id}`}
              className="mail-row"
              data-unread={unread}
              aria-current={item.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="mail-row-top">
                {unread ? <span className="mail-dot" aria-hidden="true" /> : null}
                <span className="mail-row-who">
                  {folder === "sent" ? `${m.mail_to()} · ` : ""}
                  {partyText(who)}
                </span>
                <time className="mail-row-time" dateTime={new Date(item.sentAt).toISOString()}>
                  {relativeText(item.sentAt, now)}
                </time>
              </span>
              <span className="mail-row-subject">
                {unread ? <span className="visually-hidden">{m.mail_unread()}: </span> : null}
                {item.subject}
              </span>
              {item.body === "" ? null : <span className="mail-row-snippet">{snippet(item.body)}</span>}
              {item.attachments.length === 0 ? null : (
                <span className="mail-row-attach">
                  <span>{m.mail_has_attachments()}</span>
                  <span className="mail-count">{formatCount(item.attachments.length)}</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

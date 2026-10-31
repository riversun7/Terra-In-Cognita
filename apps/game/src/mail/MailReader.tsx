// 우편 읽기 칸 — 제목·보낸·받는 사람·보낸 때·본문(유저 글 원문, D-6046)과 첨부(물건·세력 화폐, D-270).
// 다른 언어로 쓴 우편은 [번역](곧 열림). 첨부 받기·지우기는 명령이라 곧 열림. [답장]은 쓰기 칸을 채워 연다(기기 안).
import type { MailAttachment, MailItem } from "@terra/shared/mail";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, PreviewTag, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText, dateText, relativeText } from "../sections/screenText.ts";
import { Icon } from "../ui/icons.tsx";
import { partyText } from "./MailList.tsx";
import { needsTranslate } from "./mailView.ts";

export const READER_TITLE_ID = "mail-reader-title";

function attachmentText(attachment: MailAttachment, locale: string): string {
  if (attachment.kind === "item") {
    const name = locale.startsWith("ko") ? attachment.label.ko : attachment.label.en;
    return m.mail_attachment_item({ name, count: formatCount(attachment.quantity) });
  }
  return m.mail_attachment_currency({ name: attachment.name, amount: amountText(attachment.amount) });
}

function claimState(item: MailItem): { tone: "good" | "plain"; label: string } {
  if (item.folder === "sent") {
    return item.claimed
      ? { tone: "good", label: m.mail_claimed_by_recipient() }
      : { tone: "plain", label: m.mail_unclaimed_by_recipient() };
  }
  return { tone: "good", label: m.mail_claimed() };
}

export function MailReader({
  item,
  now,
  onBack,
  onReply,
}: {
  item: MailItem;
  now: number;
  onBack: () => void;
  onReply: (item: MailItem) => void;
}) {
  const locale = getLocale();
  const inbox = item.folder === "inbox";
  const state = claimState(item);
  return (
    <article className="mail-reader" aria-labelledby={READER_TITLE_ID}>
      <button type="button" className="button-small mail-back" onClick={onBack}>
        <Icon name="back" />
        {m.mail_back_to_list()}
      </button>
      <div className="mail-reader-head">
        <h2 id={READER_TITLE_ID} className="mail-reader-title" tabIndex={-1}>
          {item.subject}
        </h2>
        {item.preview === true ? <PreviewTag /> : null}
      </div>
      <dl className="mail-meta">
        <div>
          <dt>{m.mail_from()}</dt>
          <dd>{partyText(item.from)}</dd>
        </div>
        <div>
          <dt>{m.mail_to()}</dt>
          <dd>{partyText(item.to)}</dd>
        </div>
        <div>
          <dt>{m.mail_sent_at()}</dt>
          <dd>
            <time dateTime={new Date(item.sentAt).toISOString()} title={dateText(item.sentAt)}>
              {relativeText(item.sentAt, now)}
            </time>
          </dd>
        </div>
        {inbox ? null : (
          <div>
            <dt className="visually-hidden">{m.mail_unread()}</dt>
            <dd>
              <StateChip
                tone={item.read ? "good" : "plain"}
                label={item.read ? m.mail_read_by_recipient() : m.mail_unread_by_recipient()}
              />
            </dd>
          </div>
        )}
      </dl>
      <p className="mail-body" lang={item.lang ?? undefined}>
        {item.body}
      </p>
      {item.attachments.length === 0 ? null : (
        <section className="mail-attachments" aria-labelledby="mail-attachments-title">
          <h3 id="mail-attachments-title" className="mail-section-title">
            {m.mail_attachments()}
          </h3>
          <ul className="mail-attachment-list">
            {item.attachments.map((attachment) => (
              <li
                key={attachment.kind === "item" ? attachment.item : attachment.currency}
                className="mail-attachment"
              >
                <span className="mail-attachment-kind">
                  {attachment.kind === "item" ? m.mail_attach_kind_item() : m.mail_attach_kind_currency()}
                </span>
                <span className="mail-attachment-text">{attachmentText(attachment, locale)}</span>
              </li>
            ))}
          </ul>
          <ActionRow>
            {inbox && !item.claimed ? (
              <SoonButton label={m.mail_claim()} primary />
            ) : (
              <StateChip {...state} />
            )}
          </ActionRow>
        </section>
      )}
      <ActionRow>
        {inbox ? (
          <button type="button" className="button-small" onClick={() => onReply(item)}>
            {m.mail_reply()}
          </button>
        ) : null}
        {needsTranslate(item.lang, locale) ? <SoonButton label={m.mail_translate()} /> : null}
        <SoonButton label={m.mail_delete()} />
      </ActionRow>
    </article>
  );
}

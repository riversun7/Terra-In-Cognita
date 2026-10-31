// 우편 목록(mail.list) — 받은·보낸 우편과 쓰기 칸에서 고를 수 있는 첨부. 기획 46 §10.2(D-270).
// 우편 표가 아직 없다(보내기·받기는 WebSocket 명령으로 만들 때 표와 함께 만든다). 그래서 실제 자료는 늘 빈 우편함이다.
// 시안 자료(dev·admin)는 src/mail/preview.ts. 정렬: 새것부터, 같은 시각이면 ID 순(입력 차례와 상관없이 같은 응답).
import type { MailAttachable, MailItem, MailListResponse } from "@terra/shared/mail";
import type { HomeQuery, MailServices } from "../trpc/context.ts";
import { previewAttachables, previewMailItems } from "./preview.ts";

/** 우편 목록 한 장 */
export function buildMailList(
  real: { readonly items: readonly MailItem[]; readonly attachables: readonly MailAttachable[] },
  query: HomeQuery,
): MailListResponse {
  const items = [...real.items, ...(query.preview ? previewMailItems(query.now) : [])].toSorted(
    (a, b) => b.sentAt - a.sentAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const attachables = [...real.attachables, ...(query.preview ? previewAttachables() : [])];
  const unread = items.filter((item) => item.folder === "inbox" && !item.read).length;
  return { generatedAt: query.now, preview: query.preview, items, unread, attachables };
}

/** 우편 표가 없는 지금의 실제 자료 */
const EMPTY_MAILBOX = { items: [], attachables: [] } as const;

export function createMailServices(): MailServices {
  return {
    list: (_viewer, query) => Promise.resolve(buildMailList(EMPTY_MAILBOX, query)),
  };
}

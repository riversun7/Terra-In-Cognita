// 우편 화면(/mail) 전송 타입과 쓰기 칸 검사 — 기획 46 §10.2(D-270): 유저끼리 물건과 세력 화폐를 보낸다(보내기만, 거래 없음).
// 진입점은 @terra/shared/mail이다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 11절).
// - 유닛·테라코인·계정 귀속 물건은 보내지 않는다(D-270 해석, D-7014·D-7050). 그래서 첨부 종류는 물건·세력 화폐 둘뿐이다.
// - 모든 이동의 감시(D-7019·D-7025)는 서버 규칙이라 화면에 보이지 않는다.
// - 보내기는 게임 상태를 바꾸는 명령이라 WebSocket으로만 간다(AGENTS 4장). 지금은 곧 열림: 기기는 칸 검사만 한다.
//   검사는 화면 안내용이다. 서버가 받을 때 다시 본다(서버 권위).
// [임시] 길이·개수 상한은 기획 값이 없어 기술이 정했다(docs/questions/2026-10-31-ui-faction-mail.md 질문 158).
import type { LocalizedName } from "./faction.ts";
import { hasUnstorableText } from "./settings.ts";

/** [임시] 받는 사람 이름(사이보그 이름) 글자 수 */
export const MAIL_RECIPIENT_MIN = 2;
export const MAIL_RECIPIENT_MAX = 24;
/** [임시] 제목·본문 글자 수(유니코드 코드 포인트) */
export const MAIL_SUBJECT_MAX = 60;
export const MAIL_BODY_MAX = 2000;
/** [임시] 우편 하나의 첨부 수 */
export const MAIL_ATTACHMENTS_MAX = 5;

/** 우편함 */
export const MAIL_FOLDERS = ["inbox", "sent"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

/** 보내거나 받은 사람(사이보그 이름 + 세력 태그). 로그인 아이디는 남에게 보이지 않는다 */
export interface MailParty {
  readonly name: string;
  readonly factionTag: string | null;
}

/** 첨부 하나. 물건은 콘텐츠 이름(두 언어), 세력 화폐는 사람이 지은 이름(번역하지 않음). amount는 최소 단위 정수 글자 */
export type MailAttachment =
  | { readonly kind: "item"; readonly item: string; readonly label: LocalizedName; readonly quantity: number }
  | { readonly kind: "currency"; readonly currency: string; readonly name: string; readonly amount: string };

/** 우편 하나 */
export interface MailItem {
  readonly id: string;
  readonly folder: MailFolder;
  readonly from: MailParty;
  readonly to: MailParty;
  /** 유저 글(원문 그대로, D-6046). lang = 쓴 사람의 언어(다른 언어면 [번역] 단추) */
  readonly subject: string;
  readonly body: string;
  readonly lang: "ko" | "en" | null;
  readonly sentAt: number;
  /** 받은 우편: 읽었는지. 보낸 우편: 받는 사람이 읽었는지 */
  readonly read: boolean;
  readonly attachments: readonly MailAttachment[];
  /** 첨부를 받았는지(첨부가 없으면 false) */
  readonly claimed: boolean;
  readonly preview?: true;
}

/** 쓰기 칸에서 고를 수 있는 첨부(내가 가진 물건·세력 화폐). max는 보낼 수 있는 최대(최소 단위 정수 글자) */
export type MailAttachable =
  | { readonly kind: "item"; readonly key: string; readonly label: LocalizedName; readonly max: string }
  | { readonly kind: "currency"; readonly key: string; readonly name: string; readonly max: string };

/** mail.list 응답 */
export interface MailListResponse {
  readonly generatedAt: number;
  readonly preview: boolean;
  /** 받은·보낸 우편, 새것부터 */
  readonly items: readonly MailItem[];
  /** 읽지 않은 받은 우편 수 */
  readonly unread: number;
  readonly attachables: readonly MailAttachable[];
}

/** 쓰기 칸의 값(기기 입력 그대로) */
export interface MailDraft {
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  /** 첨부 줄: 고른 것의 key(MailAttachable.key)와 수 */
  readonly attachments: readonly { readonly key: string; readonly amount: string }[];
}

export type RecipientProblem = "empty" | "too_short" | "too_long" | "invalid_text";
export type SubjectProblem = "empty" | "too_long" | "invalid_text";
export type BodyProblem = "too_long" | "invalid_text";
export type AttachmentProblem = "unknown" | "duplicate" | "not_integer" | "not_positive" | "over_max";

/** 칸마다 문제(없으면 null). attachments는 줄 순서와 같다 */
export interface MailDraftCheck {
  readonly ok: boolean;
  readonly recipient: RecipientProblem | null;
  readonly subject: SubjectProblem | null;
  readonly body: BodyProblem | null;
  readonly tooManyAttachments: boolean;
  readonly attachments: readonly (AttachmentProblem | null)[];
}

/** 코드 포인트 수(이모지 하나 = 1) */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/** 제어 문자(줄바꿈·탭은 allowBreaks일 때만 허용)나 저장할 수 없는 글자가 있는지 */
export function hasBadText(text: string, allowBreaks: boolean): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const isBreak = code === 0x0a || code === 0x09 || code === 0x0d;
    if ((code < 0x20 || code === 0x7f) && !(allowBreaks && isBreak)) return true;
  }
  return hasUnstorableText({ text });
}

/** 10진 정수 글자(앞뒤 공백 허용, 부호·소수점·지수 없음) */
const INTEGER = /^\d+$/;

function checkAmount(raw: string, max: string): AttachmentProblem | null {
  const value = raw.trim();
  if (!INTEGER.test(value)) return "not_integer";
  const amount = BigInt(value);
  if (amount <= 0n) return "not_positive";
  return amount > BigInt(max) ? "over_max" : null;
}

function checkRecipient(raw: string): RecipientProblem | null {
  const name = raw.trim();
  if (name.length === 0) return "empty";
  if (hasBadText(name, false)) return "invalid_text";
  const length = textLength(name);
  if (length < MAIL_RECIPIENT_MIN) return "too_short";
  return length > MAIL_RECIPIENT_MAX ? "too_long" : null;
}

function checkSubject(raw: string): SubjectProblem | null {
  const subject = raw.trim();
  if (subject.length === 0) return "empty";
  if (hasBadText(subject, false)) return "invalid_text";
  return textLength(subject) > MAIL_SUBJECT_MAX ? "too_long" : null;
}

function checkBody(body: string): BodyProblem | null {
  if (hasBadText(body, true)) return "invalid_text";
  return textLength(body) > MAIL_BODY_MAX ? "too_long" : null;
}

/** 쓰기 칸 검사(화면 안내용). attachables = 고를 수 있는 첨부(응답의 attachables) */
export function checkMailDraft(draft: MailDraft, attachables: readonly MailAttachable[]): MailDraftCheck {
  const byKey = new Map(attachables.map((entry) => [entry.key, entry]));
  const seen = new Set<string>();
  const attachments = draft.attachments.map((row): AttachmentProblem | null => {
    const found = byKey.get(row.key);
    if (found === undefined) return "unknown";
    if (seen.has(row.key)) return "duplicate";
    seen.add(row.key);
    return checkAmount(row.amount, found.max);
  });
  const recipient = checkRecipient(draft.recipient);
  const subject = checkSubject(draft.subject);
  const body = checkBody(draft.body);
  const tooManyAttachments = draft.attachments.length > MAIL_ATTACHMENTS_MAX;
  const ok =
    recipient === null &&
    subject === null &&
    body === null &&
    !tooManyAttachments &&
    attachments.every((problem) => problem === null);
  return { ok, recipient, subject, body, tooManyAttachments, attachments };
}

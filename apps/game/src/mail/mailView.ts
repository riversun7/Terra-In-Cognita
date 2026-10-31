// 우편 화면 자료 다듬기 — 순수 함수(시험 대상). 우편함 거르기, 미리 보기 한 줄, 답장 초안, 쓰기 칸 문제 → 문구 키.
// 문장은 화면(메시지 키)이 만든다. 이 파일은 메시지를 가져오지 않는다(시험이 생성 파일 없이 돈다).
import {
  type AttachmentProblem,
  type BodyProblem,
  MAIL_BODY_MAX,
  MAIL_RECIPIENT_MAX,
  MAIL_RECIPIENT_MIN,
  MAIL_SUBJECT_MAX,
  type MailDraftCheck,
  type MailFolder,
  type MailItem,
  type RecipientProblem,
  type SubjectProblem,
} from "@terra/shared/mail";

/** 탭: 받은 우편·보낸 우편·쓰기 */
export const MAIL_TABS = ["inbox", "sent", "compose"] as const;
export type MailTab = (typeof MAIL_TABS)[number];

/** 그 우편함의 우편(서버 순서 = 새것부터) */
export function folderItems(items: readonly MailItem[], folder: MailFolder): MailItem[] {
  return items.filter((item) => item.folder === folder);
}

/** 미리 보기 한 줄: 줄바꿈·연속 공백을 한 칸으로, max 코드 포인트에서 자르고 "…" */
export function snippet(body: string, max = 80): string {
  const flat = body.replaceAll(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** 답장 제목: 이미 "Re:"로 시작하면 그대로(겹치지 않게). 그 밖은 화면이 "Re: {subject}" 문구로 만든다 → null */
export function replySubjectBase(subject: string): string | null {
  return /^re:/i.test(subject.trim()) ? subject.trim() : null;
}

/** 다른 언어로 쓴 우편인지([번역] 단추). 언어를 모르면 false */
export function needsTranslate(lang: MailItem["lang"], locale: string): boolean {
  return lang !== null && !locale.toLowerCase().startsWith(lang);
}

/** 문구 키와 값(화면이 m[...]로 바꾸지 않고 표로 고른다) */
export type ProblemText =
  | {
      readonly key:
        | "recipient_empty"
        | "subject_empty"
        | "text_invalid"
        | "attach_unknown"
        | "attach_duplicate";
    }
  | { readonly key: "attach_integer" | "attach_over" }
  | { readonly key: "too_short"; readonly min: number }
  | { readonly key: "too_long"; readonly max: number };

export function recipientProblem(problem: RecipientProblem | null): ProblemText | null {
  switch (problem) {
    case null:
      return null;
    case "empty":
      return { key: "recipient_empty" };
    case "too_short":
      return { key: "too_short", min: MAIL_RECIPIENT_MIN };
    case "too_long":
      return { key: "too_long", max: MAIL_RECIPIENT_MAX };
    case "invalid_text":
      return { key: "text_invalid" };
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

export function subjectProblem(problem: SubjectProblem | null): ProblemText | null {
  switch (problem) {
    case null:
      return null;
    case "empty":
      return { key: "subject_empty" };
    case "too_long":
      return { key: "too_long", max: MAIL_SUBJECT_MAX };
    case "invalid_text":
      return { key: "text_invalid" };
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

export function bodyProblem(problem: BodyProblem | null): ProblemText | null {
  switch (problem) {
    case null:
      return null;
    case "too_long":
      return { key: "too_long", max: MAIL_BODY_MAX };
    case "invalid_text":
      return { key: "text_invalid" };
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

export function attachmentProblem(problem: AttachmentProblem | null): ProblemText | null {
  switch (problem) {
    case null:
      return null;
    case "unknown":
      return { key: "attach_unknown" };
    case "duplicate":
      return { key: "attach_duplicate" };
    case "not_integer":
    case "not_positive":
      return { key: "attach_integer" };
    case "over_max":
      return { key: "attach_over" };
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

/** 검사 결과에서 처음 문제가 있는 칸(보내기를 누르면 그 칸으로 초점) */
export type DraftField = "recipient" | "subject" | "body" | `attachment-${number}` | "attachments";

export function firstProblemField(check: MailDraftCheck): DraftField | null {
  if (check.recipient !== null) return "recipient";
  if (check.subject !== null) return "subject";
  if (check.body !== null) return "body";
  const index = check.attachments.findIndex((problem) => problem !== null);
  if (index >= 0) return `attachment-${index}`;
  return check.tooManyAttachments ? "attachments" : null;
}

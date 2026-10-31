// 우편 화면 자료 다듬기 시험 — 우편함 거르기, 미리 보기 한 줄, 답장 제목, 번역 단추, 쓰기 칸 문제 → 문구, 처음 틀린 칸
import { MAIL_BODY_MAX, MAIL_RECIPIENT_MIN, type MailDraftCheck, type MailItem } from "@terra/shared/mail";
import { describe, expect, it } from "vitest";
import {
  attachmentProblem,
  bodyProblem,
  firstProblemField,
  folderItems,
  needsTranslate,
  recipientProblem,
  replySubjectBase,
  snippet,
  subjectProblem,
} from "./mailView.ts";

const ITEM: MailItem = {
  id: "a",
  folder: "inbox",
  from: { name: "Mora", factionTag: "SOL" },
  to: { name: "Aster", factionTag: "SOL" },
  subject: "hi",
  body: "",
  lang: "ko",
  sentAt: 0,
  read: false,
  attachments: [],
  claimed: false,
};

const OK_CHECK: MailDraftCheck = {
  ok: true,
  recipient: null,
  subject: null,
  body: null,
  tooManyAttachments: false,
  attachments: [null, null],
};

describe("우편 목록", () => {
  it("우편함으로 거른다(순서는 그대로)", () => {
    const sent = { ...ITEM, id: "b", folder: "sent" } as const;
    expect(folderItems([ITEM, sent, { ...ITEM, id: "c" }], "inbox").map((item) => item.id)).toEqual([
      "a",
      "c",
    ]);
    expect(folderItems([ITEM, sent], "sent").map((item) => item.id)).toEqual(["b"]);
  });

  it("미리 보기: 줄바꿈·공백을 한 칸으로, 길면 코드 포인트로 자르고 …", () => {
    expect(snippet("첫 줄\n\n  둘째  줄")).toBe("첫 줄 둘째 줄");
    expect(snippet("😀".repeat(10), 4)).toBe("😀😀😀😀…");
    expect(snippet("abc", 3)).toBe("abc");
  });

  it("답장 제목: 이미 Re:면 그대로, 아니면 null(화면이 붙인다)", () => {
    expect(replySubjectBase("Re: siege")).toBe("Re: siege");
    expect(replySubjectBase(" re: x ")).toBe("re: x");
    expect(replySubjectBase("창고")).toBeNull();
  });

  it("번역 단추: 쓴 언어가 화면 언어와 다를 때만", () => {
    expect(needsTranslate("ko", "ko")).toBe(false);
    expect(needsTranslate("ko", "en")).toBe(true);
    expect(needsTranslate("en", "en-US")).toBe(false);
    expect(needsTranslate(null, "en")).toBe(false);
  });
});

describe("쓰기 칸 문제 → 문구", () => {
  it("칸마다 문구 키와 값", () => {
    expect(recipientProblem(null)).toBeNull();
    expect(recipientProblem("too_short")).toEqual({ key: "too_short", min: MAIL_RECIPIENT_MIN });
    expect(subjectProblem("empty")).toEqual({ key: "subject_empty" });
    expect(bodyProblem("too_long")).toEqual({ key: "too_long", max: MAIL_BODY_MAX });
    expect(attachmentProblem("not_positive")).toEqual({ key: "attach_integer" });
    expect(attachmentProblem("not_integer")).toEqual({ key: "attach_integer" });
    expect(attachmentProblem("over_max")).toEqual({ key: "attach_over" });
  });

  it("처음 틀린 칸: 받는 사람 → 제목 → 내용 → 첨부 줄 → 첨부 수", () => {
    expect(firstProblemField(OK_CHECK)).toBeNull();
    expect(firstProblemField({ ...OK_CHECK, ok: false, subject: "empty", body: "too_long" })).toBe("subject");
    expect(firstProblemField({ ...OK_CHECK, ok: false, attachments: [null, "over_max"] })).toBe(
      "attachment-1",
    );
    expect(firstProblemField({ ...OK_CHECK, ok: false, tooManyAttachments: true })).toBe("attachments");
  });
});

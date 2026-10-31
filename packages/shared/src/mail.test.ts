// 우편 쓰기 칸 검사 시험 — 받는 사람·제목·본문·첨부(물건·세력 화폐, D-270). 상한은 [임시] 값
import { describe, expect, it } from "vitest";
import {
  MAIL_ATTACHMENTS_MAX,
  MAIL_BODY_MAX,
  MAIL_RECIPIENT_MAX,
  MAIL_SUBJECT_MAX,
  type MailAttachable,
  type MailDraft,
  checkMailDraft,
  hasBadText,
  textLength,
} from "./mail.ts";

const ATTACHABLES: MailAttachable[] = [
  { kind: "item", key: "iron_ore", label: { ko: "철광석", en: "Iron ore" }, max: "40" },
  { kind: "currency", key: "sol_mark", name: "Sol", max: "1250000" },
];

const GOOD: MailDraft = {
  recipient: "Mora",
  subject: "창고 정리",
  body: "보냅니다.\n고마워요",
  attachments: [],
};

describe("우편 쓰기 칸 검사", () => {
  it("맞는 칸이면 ok, 칸마다 문제 없음", () => {
    const check = checkMailDraft({ ...GOOD, attachments: [{ key: "iron_ore", amount: "40" }] }, ATTACHABLES);
    expect(check).toEqual({
      ok: true,
      recipient: null,
      subject: null,
      body: null,
      tooManyAttachments: false,
      attachments: [null],
    });
  });

  it("받는 사람: 비어 있음·짧음·김·제어 문자", () => {
    expect(checkMailDraft({ ...GOOD, recipient: "   " }, []).recipient).toBe("empty");
    expect(checkMailDraft({ ...GOOD, recipient: "a" }, []).recipient).toBe("too_short");
    expect(checkMailDraft({ ...GOOD, recipient: "가".repeat(MAIL_RECIPIENT_MAX + 1) }, []).recipient).toBe(
      "too_long",
    );
    expect(checkMailDraft({ ...GOOD, recipient: "Mo\u0007ra" }, []).recipient).toBe("invalid_text");
    expect(checkMailDraft({ ...GOOD, recipient: "  Mora  " }, []).ok).toBe(true);
  });

  it("제목: 비어 있음·김(코드 포인트로 센다)·줄바꿈", () => {
    expect(checkMailDraft({ ...GOOD, subject: "" }, []).subject).toBe("empty");
    expect(checkMailDraft({ ...GOOD, subject: "😀".repeat(MAIL_SUBJECT_MAX) }, []).subject).toBeNull();
    expect(checkMailDraft({ ...GOOD, subject: "x".repeat(MAIL_SUBJECT_MAX + 1) }, []).subject).toBe(
      "too_long",
    );
    expect(checkMailDraft({ ...GOOD, subject: "둘\n줄" }, []).subject).toBe("invalid_text");
  });

  it("본문: 비어도 되고 줄바꿈·탭은 되지만 길이·NUL·짝 없는 대리 문자는 안 된다", () => {
    expect(checkMailDraft({ ...GOOD, body: "" }, []).body).toBeNull();
    expect(checkMailDraft({ ...GOOD, body: "a\tb\r\nc" }, []).body).toBeNull();
    expect(checkMailDraft({ ...GOOD, body: "x".repeat(MAIL_BODY_MAX + 1) }, []).body).toBe("too_long");
    expect(checkMailDraft({ ...GOOD, body: "a\u0000b" }, []).body).toBe("invalid_text");
    expect(checkMailDraft({ ...GOOD, body: "a\ud800b" }, []).body).toBe("invalid_text");
  });

  it("첨부: 모르는 것·겹침·정수 아님·0 이하·가진 것보다 많음", () => {
    const check = checkMailDraft(
      {
        ...GOOD,
        attachments: [
          { key: "unit_worker", amount: "1" },
          { key: "iron_ore", amount: "41" },
          { key: "iron_ore", amount: "1" },
          { key: "sol_mark", amount: "1.5" },
        ],
      },
      ATTACHABLES,
    );
    expect(check.ok).toBe(false);
    expect(check.attachments).toEqual(["unknown", "over_max", "duplicate", "not_integer"]);
    expect(
      checkMailDraft({ ...GOOD, attachments: [{ key: "sol_mark", amount: "0" }] }, ATTACHABLES).attachments,
    ).toEqual(["not_positive"]);
    expect(
      checkMailDraft({ ...GOOD, attachments: [{ key: "sol_mark", amount: "-5" }] }, ATTACHABLES).attachments,
    ).toEqual(["not_integer"]);
    // 아주 큰 수도 BigInt로 비교한다
    expect(
      checkMailDraft(
        { ...GOOD, attachments: [{ key: "sol_mark", amount: "99999999999999999999" }] },
        ATTACHABLES,
      ).attachments,
    ).toEqual(["over_max"]);
  });

  it("첨부 수 상한", () => {
    const rows = Array.from({ length: MAIL_ATTACHMENTS_MAX + 1 }, () => ({ key: "sol_mark", amount: "1" }));
    expect(checkMailDraft({ ...GOOD, attachments: rows }, ATTACHABLES).tooManyAttachments).toBe(true);
  });
});

describe("글자 도우미", () => {
  it("코드 포인트 수와 제어 문자", () => {
    expect(textLength("가나😀")).toBe(3);
    expect(hasBadText("줄\n바꿈", true)).toBe(false);
    expect(hasBadText("줄\n바꿈", false)).toBe(true);
    expect(hasBadText("del\u007f", true)).toBe(true);
  });
});

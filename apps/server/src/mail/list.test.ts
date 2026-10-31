// 우편 목록 시험 — 실제 우편함(지금은 빈 것)·시안 자료 섞기·정렬·읽지 않은 수·첨부 종류(D-270)
import type { MailItem } from "@terra/shared/mail";
import { describe, expect, it } from "vitest";
import { buildMailList, createMailServices } from "./list.ts";
import { previewMailItems } from "./preview.ts";

const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);

const REAL: MailItem = {
  id: "mail_1",
  folder: "inbox",
  from: { name: "Mora", factionTag: null },
  to: { name: "Aster", factionTag: null },
  subject: "hello",
  body: "",
  lang: "en",
  sentAt: NOW - 1,
  read: false,
  attachments: [],
  claimed: false,
};

describe("우편 목록", () => {
  it("실제 우편함은 지금 비어 있다(우편 표 없음)", async () => {
    const list = await createMailServices().list(
      { id: "u", loginId: "tester", roles: [] },
      { preview: false, now: NOW },
    );
    expect(list).toEqual({ generatedAt: NOW, preview: false, items: [], unread: 0, attachables: [] });
  });

  it("시안 자료는 실제 우편에 더하고, 새것부터·같은 시각은 ID 순, 읽지 않은 받은 우편 수", () => {
    const list = buildMailList({ items: [REAL], attachables: [] }, { preview: true, now: NOW });
    expect(list.items[0]?.id).toBe("mail_1");
    const times = list.items.map((item) => item.sentAt);
    expect(times).toEqual(times.toSorted((a, b) => b - a));
    const unread = list.items.filter((item) => item.folder === "inbox" && !item.read).length;
    expect(list.unread).toBe(unread);
    expect(list.unread).toBeGreaterThan(1);
    expect(list.attachables.length).toBeGreaterThan(0);
  });

  it("입력 차례를 바꿔도 같은 응답", () => {
    const twin = { ...REAL, id: "mail_0" };
    const a = buildMailList({ items: [REAL, twin], attachables: [] }, { preview: false, now: NOW });
    const b = buildMailList({ items: [twin, REAL], attachables: [] }, { preview: false, now: NOW });
    expect(a).toEqual(b);
    expect(a.items.map((item) => item.id)).toEqual(["mail_0", "mail_1"]);
  });

  it("시안 우편: 받은·보낸 둘 다, 첨부는 물건·세력 화폐뿐, 두 언어의 원문이 섞여 있다", () => {
    const items = previewMailItems(NOW);
    expect(new Set(items.map((item) => item.folder))).toEqual(new Set(["inbox", "sent"]));
    const kinds = new Set(items.flatMap((item) => item.attachments.map((attachment) => attachment.kind)));
    expect(kinds).toEqual(new Set(["item", "currency"]));
    expect(new Set(items.map((item) => item.lang))).toEqual(new Set(["ko", "en"]));
    for (const item of items) {
      expect(item.preview).toBe(true);
      expect(item.id).toMatch(/^preview_/);
      expect(item.sentAt).toBeLessThan(NOW);
    }
  });
});

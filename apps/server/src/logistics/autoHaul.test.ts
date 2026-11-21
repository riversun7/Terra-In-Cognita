// 물류센터 자동 맡기기 계정 설정 시험(DB 없음 — 가짜 연결) — 기획 대조 2272, logistics/autoHaul.ts
import { describe, expect, it } from "vitest";
import { createAutoHaulPrefs } from "./autoHaul.ts";

describe("자동 맡기기 계정 설정", () => {
  it("켤 때 켠 계정을 읽고, 쓰기는 DB 다음 메모리를 바꾼다, 계정 없는 주체(NPC)는 끔", async () => {
    const sent: { text: string; values: unknown[] | undefined }[] = [];
    const prefs = createAutoHaulPrefs({
      pool: {
        query: async (text, values) => {
          sent.push({ text, values });
          return { rows: text.includes("where auto_haul") ? [{ user_id: "u1" }] : [] };
        },
      },
      userOf: (ownerId) => (ownerId === 1 ? "u1" : ownerId === 2 ? "u2" : null),
    });
    // 읽기 전에는 DB에서 묻는다
    expect(await prefs.get("u2")).toBe(false);
    await prefs.load();
    expect(prefs.on(1)).toBe(true);
    expect(prefs.on(2)).toBe(false);
    expect(prefs.on(3)).toBe(false);
    expect(await prefs.set("u2", true)).toBe(true);
    expect(prefs.on(2)).toBe(true);
    expect(sent.at(-1)?.values).toEqual(["u2", true]);
    expect(await prefs.set("u1", false)).toBe(false);
    expect(prefs.on(1)).toBe(false);
    expect(await prefs.get("u1")).toBe(false);
  });
});

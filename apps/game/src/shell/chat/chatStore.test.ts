import { describe, expect, it } from "vitest";
import { CHAT_CHANNELS, CHAT_MAX_LEN, createChatStore } from "./chatStore.ts";

describe("chatStore", () => {
  it("4개 기본 채널(시장·장소·세력·파티)과 초기 샘플 대화를 가진다", () => {
    const store = createChatStore();
    const snap = store.snapshot();
    expect(CHAT_CHANNELS).toEqual(["market", "place", "faction", "party"]);
    expect(snap.channel).toBe("market");
    expect(snap.expanded).toBe(false);
    expect(snap.desktopOpen).toBe(true);
    expect(snap.messages.market.length).toBeGreaterThan(0);
    expect(snap.messages.place.length).toBeGreaterThan(0);
    expect(snap.messages.faction.length).toBeGreaterThan(0);
    expect(snap.messages.party.length).toBeGreaterThan(0);
  });

  it("채널을 바꾸고 현재 채널에 새 메시지를 추가한다", () => {
    const store = createChatStore();
    store.setChannel("faction");
    expect(store.snapshot().channel).toBe("faction");

    const before = store.snapshot().messages.faction.length;
    expect(store.sendMessage("Commander", "  집결 준비 완료  ")).toBe(true);
    const after = store.snapshot().messages.faction;
    expect(after.length).toBe(before + 1);
    const last = after[after.length - 1];
    expect(last?.author).toBe("Commander");
    expect(last?.text).toBe("집결 준비 완료");
    expect(last?.mine).toBe(true);
  });

  it("빈 문자열·저장 불가 문자는 거절하고 긴 글은 상한 길이로 자른다", () => {
    const store = createChatStore();
    expect(store.sendMessage("Tester", "   ")).toBe(false);
    expect(store.sendMessage("Tester", "bad\u0000text")).toBe(false);

    const over = "가".repeat(CHAT_MAX_LEN + 25);
    expect(store.sendMessage("Tester", over)).toBe(true);
    const list = store.snapshot().messages.market;
    expect(list[list.length - 1]?.text.length).toBe(CHAT_MAX_LEN);
  });

  it("번역 토글과 펼침·PC 패널 상태를 바꾼다", () => {
    const store = createChatStore();
    store.toggleTranslation(2);
    expect(store.snapshot().translatedIds.has(2)).toBe(true);
    store.toggleTranslation(2);
    expect(store.snapshot().translatedIds.has(2)).toBe(false);

    store.toggleExpanded();
    expect(store.snapshot().expanded).toBe(true);
    store.setExpanded(false);
    expect(store.snapshot().expanded).toBe(false);

    store.setDesktopOpen(false);
    expect(store.snapshot().desktopOpen).toBe(false);
  });
});

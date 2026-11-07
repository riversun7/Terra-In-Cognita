// 처리할 일 등록부 시험 — 제공 함수 모으기, 시안 자료 더하기, 등록부와 종류 표의 planned가 맞는지
import { INBOX_KINDS, type InboxKindId } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import { checkProviders, collectInbox, createInboxProviders } from "./registry.ts";
import type { InboxAccount, InboxEntry, InboxProvider } from "./types.ts";

const NOW = 1_761_700_000_000;
const ACCOUNT: InboxAccount = { userId: "user_1", roles: ["player"] };

/** 시험용 제공 함수: 받은 계정을 기억하고 정해 둔 건을 낸다 */
function fakeProvider(kind: InboxKindId, entries: readonly InboxEntry[]) {
  const seen: InboxAccount[] = [];
  const provider: InboxProvider = {
    kind,
    async collect(account, now) {
      seen.push(account);
      expect(now).toBe(NOW);
      return entries;
    },
  };
  return { provider, seen };
}

const idle = (key: string): InboxEntry => ({
  kind: "unit_idle",
  key,
  deadlineAt: null,
  firstSeenAt: NOW - 1_000,
  params: {},
  target: { route: "units" },
});

describe("처리할 일 등록부", () => {
  it("DB가 없으면 제공 함수가 없다: 실제 계정의 처리함은 비어 있다", async () => {
    const providers = createInboxProviders();
    expect(providers).toEqual([]);
    const list = await collectInbox(providers, ACCOUNT, NOW, false);
    expect(list.items).toEqual([]);
    expect(list.generatedAt).toBe(NOW);
  });

  it("DB가 있으면 웨이브 예고(wave_incoming): 진군 중인 웨이브가 마감 = 도착 시각인 건이 된다", async () => {
    const seen: unknown[][] = [];
    const pool = {
      query: async (_text: string, values?: unknown[]) => {
        seen.push(values ?? []);
        return {
          rows: [{ id: "7", created_at_ms: String(NOW - 1000), arrive_at_ms: String(NOW + 8 * 3_600_000) }],
        };
      },
    };
    const providers = createInboxProviders({ pool });
    expect(providers.map((provider) => provider.kind)).toEqual(["wave_incoming"]);
    const list = await collectInbox(providers, ACCOUNT, NOW, false);
    expect(list.items.map((item) => [item.id, item.category, item.deadlineAt])).toEqual([
      ["wave_incoming:wave_7", "threat", NOW + 8 * 3_600_000],
    ]);
    expect(seen).toEqual([[ACCOUNT.userId, NOW]]);
  });

  it("등록부와 종류 표가 맞다: 제공 함수가 있는 종류는 planned가 아니고, planned가 아닌 종류는 제공 함수가 있다", () => {
    const pool = { query: async () => ({ rows: [] }) };
    const registered = new Set<string>(
      createInboxProviders({ pool, travel: () => ({ list: () => [] }) }).map((provider) => provider.kind),
    );
    for (const [kind, definition] of Object.entries(INBOX_KINDS)) {
      expect(definition.planned, kind).toBe(!registered.has(kind));
    }
  });

  it("제공 함수의 건을 모아 묶고 정렬한다(계정과 지금 시각을 넘긴다)", async () => {
    const units = fakeProvider("unit_idle", [idle("city_1"), idle("city_1"), idle("city_2")]);
    const waves = fakeProvider("wave_incoming", [
      {
        kind: "wave_incoming",
        key: "w1",
        deadlineAt: NOW + 60_000,
        firstSeenAt: NOW,
        params: {},
        target: { route: "map" },
      },
    ]);
    const list = await collectInbox([units.provider, waves.provider], ACCOUNT, NOW, false);
    expect(list.items.map(({ id, count }) => [id, count])).toEqual([
      ["wave_incoming:w1", 1],
      ["unit_idle:city_1", 2],
      ["unit_idle:city_2", 1],
    ]);
    expect(units.seen).toEqual([ACCOUNT]);
    expect(waves.seen).toEqual([ACCOUNT]);
  });

  it("preview면 시안 자료를 더한다(실제 항목과 ID가 겹치지 않는다)", async () => {
    const units = fakeProvider("unit_idle", [idle("city_1")]);
    const list = await collectInbox([units.provider], ACCOUNT, NOW, true);
    const ids = list.items.map((item) => item.id);
    expect(ids).toContain("unit_idle:city_1");
    expect(ids).toContain("unit_idle:preview_base_1");
    expect(list.items.filter((item) => item.preview === true)).toHaveLength(8);
  });

  it("제공 함수가 다른 종류의 건을 내면 실패한다", async () => {
    const wrong = fakeProvider("wave_incoming", [idle("city_1")]);
    await expect(collectInbox([wrong.provider], ACCOUNT, NOW, false)).rejects.toThrow(/returned an entry/);
  });

  it("제공 함수가 실패하면 목록 전체가 실패한다(위협을 빠뜨린 목록을 보이지 않는다)", async () => {
    const broken: InboxProvider = {
      kind: "wave_incoming",
      collect: async () => {
        throw new Error("db down");
      },
    };
    await expect(collectInbox([broken], ACCOUNT, NOW, false)).rejects.toThrow("db down");
  });

  it("한 종류에 제공 함수가 둘이면 검사가 막는다", () => {
    const a = fakeProvider("unit_idle", []).provider;
    const b = fakeProvider("unit_idle", []).provider;
    expect(() => checkProviders([a])).not.toThrow();
    expect(() => checkProviders([a, b])).toThrow(/two providers/);
  });
});

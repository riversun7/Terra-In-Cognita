// 홈 서버 카드 상태 시험(dashboard.cards, ADR 2026-10-29-app-shell 6절)
import { describe, expect, it } from "vitest";
import type { InboxAccount } from "../inbox/types.ts";
import {
  type ServerCardProvider,
  createServerCardProviders,
  loadDashboardCards,
  serverCardIds,
} from "./cards.ts";

const NOW = 1_761_700_000_000;
const ACCOUNT: InboxAccount = { userId: "user_1", roles: ["player"] };

describe("홈 서버 카드", () => {
  it("서버 카드(사이보그·보유 유닛·자산·세력)만 요청 순서대로, 겹침·모르는 ID·기기 카드는 뺀다", () => {
    expect(
      serverCardIds([
        "faction",
        "inbox",
        "units",
        "nope",
        "faction",
        "maps",
        "cyborg",
        "diagnostics",
        "assets",
      ]),
    ).toEqual(["faction", "units", "cyborg", "assets"]);
    expect(serverCardIds(["__proto__", "constructor", "toString"])).toEqual([]);
  });

  it("지금은 카드 제공 함수가 없다: 모두 not_ready(그 시스템이 아직 없음)", async () => {
    expect(createServerCardProviders()).toEqual([]);
    expect(
      await loadDashboardCards(
        createServerCardProviders(),
        ["cyborg", "units", "assets", "faction"],
        ACCOUNT,
        NOW,
      ),
    ).toEqual({
      cards: [
        { id: "cyborg", status: "not_ready" },
        { id: "units", status: "not_ready" },
        { id: "assets", status: "not_ready" },
        { id: "faction", status: "not_ready" },
      ],
    });
  });

  it("제공 함수가 있는 카드는 그 상태를 쓴다(계정과 지금 시각을 넘긴다)", async () => {
    const seen: [InboxAccount, number][] = [];
    const units: ServerCardProvider = {
      id: "units",
      load: async (account, now) => {
        seen.push([account, now]);
        return { id: "units", status: "empty" };
      },
    };
    expect(await loadDashboardCards([units], ["units", "cyborg"], ACCOUNT, NOW)).toEqual({
      cards: [
        { id: "units", status: "empty" },
        { id: "cyborg", status: "not_ready" },
      ],
    });
    expect(seen).toEqual([[ACCOUNT, NOW]]);
  });

  it("제공 함수가 다른 카드의 상태를 주면 실패한다", async () => {
    const wrong: ServerCardProvider = { id: "units", load: async () => ({ id: "assets", status: "empty" }) };
    await expect(loadDashboardCards([wrong], ["units"], ACCOUNT, NOW)).rejects.toThrow(/returned a state of/);
  });
});

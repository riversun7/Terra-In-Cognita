// 외교 칸 시험 — 세력 화면(/faction) 외교 탭의 지도자끼리 조약(사용자 결정 D-588 — 질문 2497 가·나, docs/adr/2026-11-21-diplomacy-treaties.md).
// - 플레이어(실제 자료): 첫 접속에서 든 시험 NPC 국가 — 외교 칸이 서고, 지도자가 아니라 조약을 낼 수 없다는 안내와 빈 목록이 보인다.
// - 조약이 있는 장면: diplomacy.view 응답을 고쳐(helpers/trpc.ts rewriteTrpc) 보는 사람을 지도자로 두고 받은 조약(우리 차례)·우리 비준 투표 중·맺은 보호
//   조약·참전 요청을 넣는다. [받기]는 WebSocket dip_respond를 보낸다(서버는 지도자가 아니라 not_leader로 답하고 화면은 오류 문구를 보인다).
//   [조항 고치기]는 고치기 칸을 연다. 바뀜(fixes-1117c): 우리 세력 신뢰 줄·상대가 어긴 위반 조약(어긴 쪽 줄).
// - 사진: 390 × 파스텔·다크 × 한국어·영어(E2E_SHOTS_DIR). 가로 넘침 없음.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 세력 화면을 열고 외교 탭으로 */
async function openDiplomacy(page: Page, language: Language): Promise<void> {
  await page.goto("/faction");
  await expect(page.locator("section.faction .faction-side")).toBeVisible({ timeout: 20_000 });
  await page
    .locator("section.faction")
    .getByRole("tab", { name: new RegExp(`^${message(language, "faction_tab_diplomacy")}`) })
    .click();
  await expect(page.getByTestId("diplomacy")).toBeVisible({ timeout: 20_000 });
}

const north = {
  id: 2,
  name: { ko: "아주아주긴이름의북쪽바다연합왕국", en: "United Northern Sea Kingdom of Long Names" },
};
const east = { id: 3, name: { ko: "동쪽 나라", en: "Eastern Realm" } };

/** diplomacy.view → 보는 사람이 민주주의 나라 지도자, 조약 셋·참전 요청 하나 */
const withTreaties = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("diplomacy.view 응답 모양이 다릅니다");
  const base = {
    initiatedByUs: false,
    authoredByUs: false,
    revision: 0,
    days: 14,
    path: "vote",
    respondByMs: null,
    agendaId: null,
    createdAtMs: NOW - HOUR,
    activatedAtMs: null,
    expiresAtMs: null,
    endedAtMs: null,
    brokenBy: null,
    can: { accept: false, counter: false, decline: false },
  };
  Object.assign(data, {
    status: "ready",
    nation: { id: 1, name: { ko: "칼루누이", en: "Kalunui" }, regime: "democracy", trust: -30, breaches: 1 },
    leader: true,
    maxDays: 30,
    tributeMaxPm: 50,
    partners: [
      {
        ...north,
        atWar: false,
        truceUntilMs: null,
        playerLed: true,
        requestTreatyId: 703,
        requestable: [east],
        trust: 0,
        breaches: 0,
      },
      {
        ...east,
        atWar: true,
        truceUntilMs: null,
        playerLed: false,
        requestTreatyId: null,
        requestable: [],
        trust: -60,
        breaches: 2,
      },
    ],
    treaties: [
      {
        ...base,
        id: 701,
        other: north,
        state: "negotiating",
        revision: 2,
        clauses: [
          { kind: "alliance", weProtect: null, tributePm: null },
          { kind: "protection", weProtect: false, tributePm: 30 },
        ],
        waiting: "us",
        respondByMs: NOW + 2 * DAY,
        can: { accept: true, counter: true, decline: true },
      },
      {
        ...base,
        id: 702,
        other: east,
        initiatedByUs: true,
        authoredByUs: true,
        state: "proposed",
        path: "short_vote",
        clauses: [{ kind: "ceasefire", weProtect: null, tributePm: null }],
        waiting: "our_vote",
        agendaId: 55,
        can: { accept: false, counter: false, decline: true },
      },
      {
        ...base,
        id: 703,
        other: north,
        state: "active",
        clauses: [{ kind: "protection", weProtect: false, tributePm: 50 }],
        waiting: null,
        activatedAtMs: NOW - DAY,
        expiresAtMs: NOW + 13 * DAY,
      },
      {
        ...base,
        id: 704,
        other: east,
        state: "broken",
        clauses: [{ kind: "non_aggression", weProtect: null, tributePm: null }],
        waiting: null,
        activatedAtMs: NOW - 3 * DAY,
        expiresAtMs: NOW + 11 * DAY,
        endedAtMs: NOW - DAY,
        brokenBy: "them",
      },
    ],
    warJoins: [
      {
        id: 801,
        treatyId: 703,
        requester: north,
        joiner: { id: 1, name: { ko: "칼루누이", en: "Kalunui" } },
        enemy: east,
        state: "requested",
        auto: true,
        createdAtMs: NOW - HOUR,
        respondByMs: NOW + 20 * HOUR,
        canAnswer: true,
      },
    ],
  });
};

test.describe("플레이어(실제 자료)", () => {
  test.use({ account: "player" });

  test("외교 칸이 서고, 지도자가 아니면 조약을 낼 수 없다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openDiplomacy(page, "ko");
    const panel = page.getByTestId("diplomacy");
    await expect(panel.getByText(message("ko", "dip_leader_only"))).toBeVisible();
    await expect(panel.getByText(message("ko", "dip_propose_title"))).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("조약 셋·참전 요청: [받기]는 dip_respond를 보내고 답 오류를 보인다, [조항 고치기]는 고치기 칸을 연다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary, "diplomacy.view": withTreaties });
    const sent: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        const text = typeof payload === "string" ? payload : payload.toString("utf8");
        if (text.includes('"dip_')) sent.push(text);
      });
    });
    await openDiplomacy(page, "ko");
    const panel = page.getByTestId("diplomacy");
    await expect(panel.locator("article.faction-item")).toHaveCount(4);
    await expect(panel.getByText(message("ko", "dip_propose_title"))).toBeVisible();
    // 세력 신뢰·어긴 쪽(fixes-1117c — D-255)
    await expect(panel.locator('[data-part="dip-trust"]')).toHaveText(
      message("ko", "dip_trust_ours", { trust: "-30", breaches: "1" }),
    );
    await expect(panel.locator('[data-treaty-state="broken"] [data-part="dip-broken-by"]')).toHaveText(
      message("ko", "dip_broken_by_them"),
    );
    await expect(panel.locator('[data-treaty-state="active"]')).toBeVisible();
    await expect(panel.getByText(message("ko", "dip_vote_hint"))).toBeVisible();
    await expect(panel.locator('[data-join-state="requested"]')).toBeVisible();
    const first = panel.locator("article.faction-item").first();
    await first.getByRole("button", { name: message("ko", "dip_counter") }).click();
    await expect(first.getByText(message("ko", "dip_counter_title"))).toBeVisible();
    await first.getByRole("button", { name: message("ko", "dip_accept") }).click();
    await expect(panel.locator(".gov-status-error")).toHaveText(message("ko", "dip_err_not_leader"));
    expect(sent.some((text) => text.includes('"dip_respond"') && text.includes('"treatyId":701'))).toBe(true);
    expect(deviceErrors).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

test.describe("사진 390px", () => {
  test.use({ account: "player", ...VIEWPORTS.phone });
  for (const { theme, language } of LAYOUTS) {
    test.describe(`${theme}·${language}`, () => {
      test.use({ theme, language });
      test("조약 셋: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "diplomacy.view": withTreaties });
        await openDiplomacy(page, language);
        const panel = page.getByTestId("diplomacy");
        await expect(panel.locator("article.faction-item")).toHaveCount(4);
        await panel.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `diplomacy-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

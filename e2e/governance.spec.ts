// 나라 의결 칸 시험 — 세력 화면(/faction) 투표 탭의 나라 의결(docs/adr/2026-11-21-governance.md, 질문 2351~2365 답 D-580·D-581).
// - 플레이어(실제 자료): 첫 접속에서 든 시험 NPC 국가 — 지배 가문 칸이 서고, 가문이 없어 안건을 올릴 수 없다(2351 가 — 무소속은 발의권 없음).
// - 안건이 있는 장면: governance.view 응답을 고쳐(helpers/trpc.ts rewriteTrpc) 선출(후보 둘)·체제 전환(투표 중)·가결 기다림(직권)을 넣는다.
//   [찬성]은 WebSocket gov_vote를 보낸다(서버는 없는 안건이라 unknown_agenda로 답하고 화면은 오류 문구를 보인다).
// - 사진: 390 × 파스텔·다크 × 한국어·영어(E2E_SHOTS_DIR). 가로 넘침 없음.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const NOW = Date.now();
const HOUR = 3_600_000;

/** 세력 화면을 열고 투표 탭으로 */
async function openVotes(page: Page, language: Language): Promise<void> {
  await page.goto("/faction");
  await expect(page.locator("section.faction .faction-side")).toBeVisible({ timeout: 20_000 });
  await page
    .locator("section.faction")
    .getByRole("tab", { name: new RegExp(`^${message(language, "faction_tab_votes")}`) })
    .click();
  await expect(page.getByTestId("governance")).toBeVisible({ timeout: 20_000 });
}

/** governance.view → 안건 셋이 있는 민주주의 나라(보는 사람은 가문장, 표 무게 1) */
const withAgendas = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("governance.view 응답 모양이 다릅니다");
  const me = { canVote: true, choice: null, canRegister: false, weight: "1" };
  const base = {
    regime: "democracy",
    targetRegime: null,
    targetNation: null,
    monetary: null,
    byAuthority: false,
    registerUntilMs: null,
    effectAtMs: null,
    reason: null,
    quorumPm: 500,
    thresholdPm: 666,
    candidates: [],
    barred: null,
    winner: null,
    votes: [],
  };
  Object.assign(data, {
    status: "ready",
    nation: {
      id: 1,
      name: { ko: "칼루누이", en: "Kalunui" },
      regime: "democracy",
      rulingHouse: { key: "n:1", name: "켈레와이", npc: true },
      termEndsAtMs: NOW + 9 * 24 * HOUR,
      shareVotesSuspended: false,
      rulingSharePm: 1000,
    },
    canPropose: ["leader_election", "leader_removal", "regime_change", "war_declaration"],
    leader: false,
    warTargets: [{ id: 2, name: { ko: "시험 NPC 국가 2", en: "Test NPC nation 2" } }],
    agendas: [
      {
        ...base,
        id: 901,
        kind: "regime_change",
        status: "open",
        targetRegime: "capitalism",
        proposer: { key: "p:5", name: "아주아주긴가문이름의의결가문", npc: false },
        openedAtMs: NOW - HOUR,
        closesAtMs: NOW + 70 * HOUR,
        totals: { yes: "3", no: "1", abstain: "1" },
        electorate: "8",
        votes: [
          { voter: { key: "n:1", name: "켈레와이", npc: true }, choice: "no", weight: "1" },
          {
            voter: { key: "p:5", name: "아주아주긴가문이름의의결가문", npc: false },
            choice: "yes",
            weight: "1",
          },
        ],
        me,
      },
      {
        ...base,
        id: 902,
        kind: "leader_election",
        status: "open",
        proposer: null,
        openedAtMs: NOW - HOUR,
        registerUntilMs: NOW + 20 * HOUR,
        closesAtMs: NOW + 70 * HOUR,
        totals: null,
        electorate: "8",
        thresholdPm: 0,
        candidates: [
          { key: "n:1", name: "켈레와이", npc: true, votes: "2" },
          { key: "p:5", name: "아주아주긴가문이름의의결가문", npc: false, votes: "1" },
        ],
        me: { ...me, canRegister: true },
      },
      {
        ...base,
        id: 903,
        kind: "regime_change",
        status: "passed",
        targetRegime: "dictatorship",
        byAuthority: true,
        proposer: { key: "n:1", name: "켈레와이", npc: true },
        openedAtMs: NOW - 2 * HOUR,
        closesAtMs: NOW - 2 * HOUR,
        effectAtMs: NOW + 6 * 24 * HOUR,
        totals: { yes: "0", no: "0", abstain: "0" },
        electorate: "0",
        me: { ...me, canVote: false },
      },
    ],
  });
};

test.describe("플레이어(실제 자료)", () => {
  test.use({ account: "player" });

  test("지배 가문 칸이 서고, 무소속은 안건을 올릴 수 없다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openVotes(page, "ko");
    const panel = page.getByTestId("governance");
    await expect(panel.getByText(message("ko", "gov_ruling"))).toBeVisible();
    await expect(panel.getByText(message("ko", "gov_propose_none"))).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });

  test("안건 셋: 찬반 막대·후보·직권, [찬성]은 gov_vote를 보내고 답 오류를 보인다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withAgendas });
    const sent: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        const text = typeof payload === "string" ? payload : payload.toString("utf8");
        if (text.includes('"gov_')) sent.push(text);
      });
    });
    await openVotes(page, "ko");
    const panel = page.getByTestId("governance");
    await expect(panel.locator("article.faction-item")).toHaveCount(3);
    await expect(panel.locator('[data-candidate="p:5"]')).toBeVisible();
    await expect(panel.getByText(message("ko", "gov_authority"))).toBeVisible();
    await panel
      .locator("article.faction-item")
      .first()
      .getByRole("button", { name: message("ko", "gov_cast_yes") })
      .click();
    await expect(panel.locator(".gov-status-error")).toHaveText(message("ko", "gov_err_unknown_agenda"));
    expect(sent.some((text) => text.includes('"gov_vote"') && text.includes('"agendaId":901'))).toBe(true);
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
      test("안건 셋: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withAgendas });
        await openVotes(page, language);
        const panel = page.getByTestId("governance");
        await expect(panel.locator("article.faction-item")).toHaveCount(3);
        await panel.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `governance-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

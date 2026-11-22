// 나라 의결 칸 시험 — 세력 화면(/faction) 투표 탭의 나라 의결(docs/adr/2026-11-21-governance.md, 질문 2351~2365 답 D-580·D-581).
// - 플레이어(실제 자료): 첫 접속에서 든 시험 NPC 국가 — 지배 가문 칸이 서고, 가문이 없어 안건을 올릴 수 없다(2351 가 — 무소속은 발의권 없음).
// - 안건이 있는 장면: governance.view 응답을 고쳐(helpers/trpc.ts rewriteTrpc) 선출(후보 둘)·체제 전환(투표 중)·가결 기다림(직권)을 넣는다.
//   [찬성]은 WebSocket gov_vote를 보낸다(서버는 없는 안건이라 unknown_agenda로 답하고 화면은 오류 문구를 보인다).
// - 사진: 390 × 파스텔·다크 × 한국어·영어(E2E_SHOTS_DIR). 가로 넘침 없음.
// - 쿠데타 전투 중(줄기 no-teleport-a — D-591·2652): 끝 예정·닿으면 참전, 끝난 뒤 닿는 유닛만 "싸우지 못함", 전투 중에도 편 들기를 보낸다(사진 390 4장).
// - 쿠데타 병력 고르기(줄기 no-teleport — D-591): 참가 받는 쿠데타 하나(응답을 고쳐 넣음)의 내 병력 셋(그 도시에 있음·가는 중·보내면 전투 뒤 도착), 고른 유닛을 gov_coup_join unitIds로 보낸다.
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

/** governance.view → 안건 없이 참가 받는 쿠데타 하나(내 병력 셋: 그 도시에 있음·가는 중·보내면 전투 뒤 도착 — 줄기 no-teleport, D-591) */
const withCoup = (data: unknown): void => {
  withAgendas(data);
  if (typeof data !== "object" || data === null) return;
  Object.assign(data, {
    agendas: [],
    canCoup: false,
    coups: [
      {
        id: 77,
        house: { key: "p:5", name: "아주아주긴가문이름의의결가문", npc: false },
        status: "gathering",
        gatherUntilMs: NOW + HOUR,
        rebels: 1,
        government: 0,
        mySide: null,
        city: { id: 3, name: "칼루누이 항구" },
        troops: [
          { id: 101, type: "body", state: "here", arriveAt: null, sent: false },
          { id: 102, type: "human", state: "going", arriveAt: NOW + 20 * 60_000, sent: true },
          { id: 103, type: "cyborg", state: "away", arriveAt: NOW + 3 * HOUR, sent: false },
        ],
      },
    ],
  });
};

/** 같은 쿠데타가 전투 중(줄기 no-teleport-a — D-591·질문 2652: 세계 전투, 끝 예정 30분 뒤 — 103은 끝난 뒤 도착) */
const withCoupFighting = (data: unknown): void => {
  withCoup(data);
  if (typeof data !== "object" || data === null) return;
  const coups: unknown = Reflect.get(data, "coups");
  if (Array.isArray(coups) && typeof coups[0] === "object" && coups[0] !== null)
    Object.assign(coups[0], { gatherUntilMs: NOW - 10 * 60_000, battleEndsAtMs: NOW + 30 * 60_000 });
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

test.describe("쿠데타 병력(no-teleport)", () => {
  test.use({ account: "player" });
  test("보낼 병력: 그 도시에 있거나 보낸 유닛이 처음 골라지고, 고른 유닛을 gov_coup_join unitIds로 보낸다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withCoup });
    const sent: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        const text = typeof payload === "string" ? payload : payload.toString("utf8");
        if (text.includes('"gov_coup_join"')) sent.push(text);
      });
    });
    await openVotes(page, "ko");
    const troops = page.getByTestId("governance-coup-troops");
    await expect(troops).toBeVisible();
    const boxes = troops.getByRole("checkbox");
    await expect(boxes).toHaveCount(3);
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();
    await expect(boxes.nth(2)).not.toBeChecked();
    // 전투 전: 시작 뒤에 닿는 유닛은 닿으면 참전한다(줄기 no-teleport-a — 2652)
    await expect(
      troops.getByText(message("ko", "gov_coup_troop_joins_late"), { exact: false }),
    ).toBeVisible();
    await expect(troops.getByText(message("ko", "gov_coup_troop_late"), { exact: false })).toHaveCount(0);
    await boxes.nth(2).check();
    await page
      .getByTestId("governance-coups")
      .getByRole("button", { name: message("ko", "gov_coup_join_government") })
      .click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain('"unitIds":[101,102,103]');
    expect(sent[0]).toContain('"side":"government"');
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("쿠데타 전투 중(no-teleport-a)", () => {
  test.use({ account: "player" });
  test("전투 중이면 끝 예정과 '닿으면 참전'을 보이고, 끝난 뒤 닿는 유닛만 싸우지 못함, 편 들기는 그대로 보낸다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withCoupFighting });
    const sent: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        const text = typeof payload === "string" ? payload : payload.toString("utf8");
        if (text.includes('"gov_coup_join"')) sent.push(text);
      });
    });
    await openVotes(page, "ko");
    await expect(page.getByTestId("governance-coup-fighting")).toContainText(
      message("ko", "gov_coup_fighting_hint"),
    );
    const troops = page.getByTestId("governance-coup-troops");
    await expect(troops.getByText(message("ko", "gov_coup_troop_late"), { exact: false })).toHaveCount(1);
    await expect(troops.getByText(message("ko", "gov_coup_troop_joins_late"), { exact: false })).toHaveCount(
      0,
    );
    await page
      .getByTestId("governance-coups")
      .getByRole("button", { name: message("ko", "gov_coup_join_rebel") })
      .click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain('"side":"rebel"');
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
      test("쿠데타 병력: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withCoup });
        await openVotes(page, language);
        const troops = page.getByTestId("governance-coup-troops");
        await expect(troops.getByRole("checkbox")).toHaveCount(3);
        await troops.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `governance-coup-troops-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
      test("쿠데타 전투 중: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "governance.view": withCoupFighting });
        await openVotes(page, language);
        const fighting = page.getByTestId("governance-coup-fighting");
        await expect(fighting).toBeVisible();
        await fighting.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `governance-coup-fighting-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

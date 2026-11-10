// 세력 화면 시험 — /faction(D-439, 기획 46). 실제 자료만 보는 플레이어와 시안 자료를 켠 dev.
// - 플레이어: 첫 접속에서 든 시험 NPC 세력(실제 자료). 세력 없음(개인) 화면은 응답을 개인으로 고쳐 본다(여섯 칸은 "곧 열림", 시안 자료
//   스위치 없음). faction.overview를 preview 없이 묻는다.
// - dev + 시안 자료(test.use의 preview): 시안 장면(apps/server/src/factionScreen/preview.ts) — 나라 Solace(자본주의), 도시 4
//   (민심 네 단계), 외교 4 + 정원사(글 한 줄), 전쟁 2(공성 선포·공격 변), 투표 4(열린 3, 시장 임명 포함), 지분 4(민주주의 도시
//   하나는 배당 없음), 점령 처리 4(복원 모금 지분, 공성 결과 셋 D-520 — 약탈당함·점령 상태). 칸마다 "시험 자료". 곧 열림 단추는
//   WebSocket 명령을 보내지 않는다.
//   독재가 아니라 시장 임명·선전포고는 [안건 올리기]다(기획 세력 화면 검토 C4). 조약 제안은 카드마다 "투표 필요" 칸을 따른다
//   (D-444 167: 동맹·보호·속국·영토 이전·휴전·강화는 안건, 휴전·강화는 짧은 투표, 나머지는 지도자가 바로 제안). 독재로 고친
//   응답에서는 모든 카드가 바로 제안이다.
// - NPC 국가 시민(C8): 플레이어 응답을 도시 2개·독재·고정 NPC 국가로 고쳐 요약 판이 국가로 그려지는지 본다(서버 읽기는 DB 시험).
// - 긴 이름·큰 수는 faction.overview 응답을 고쳐 넣는다(helpers/trpc.ts rewriteTrpc).
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어, 탭 다섯(E2E_SHOTS_DIR).
// 자리는 화면 부품의 class·role로 찾는다(apps/game/src/faction/*.tsx, sections/screenParts.tsx). 문구는 메시지 원본.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc, watchTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const TABS = ["cities", "diplomacy", "wars", "votes", "shares"] as const;
type Tab = (typeof TABS)[number];

/**
 * 화면 전체 사진: 화면 높이를 문서 높이로 늘려 찍는다(fullPage는 고정된 위 띠·하단 탭을 스크롤 자리에 그려 가운데에 겹친다).
 * 찍은 뒤 원래 크기로 돌린다
 */
async function tallShot(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error("화면 크기를 모릅니다");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 12_000) });
  await shot(page, name);
  await page.setViewportSize(size);
}

/** 화면이 WebSocket으로 보낸 기능 메시지(연결 인사·시계 맞추기는 뺀다) */
function watchCommands(page: Page): string[] {
  const sent: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      let type: unknown = null;
      try {
        const value: unknown = JSON.parse(text);
        type = typeof value === "object" && value !== null ? Reflect.get(value, "t") : null;
      } catch {
        type = null;
      }
      if (type !== "hello" && type !== "ping") sent.push(text);
    });
  });
  return sent;
}

const tabOf = (page: Page, language: Language, tab: Tab) =>
  page
    .locator("section.faction")
    .getByRole("tab", { name: new RegExp(`^${message(language, `faction_tab_${tab}`)}`) });

/** /faction을 열고 본문(옆 판)이 그려질 때까지 */
async function openFaction(page: Page): Promise<void> {
  await page.goto("/faction");
  await expect(page.locator("section.faction .faction-side")).toBeVisible({ timeout: 20_000 });
}

/**
 * faction.overview → 세력 없는 개인. player는 첫 접속에서 시험 NPC 세력에 들었으므로(docs/adr/2026-11-01-first-login-cyborg.md)
 * "세력 없음" 화면은 응답을 바꿔 본다(세력을 떠나거나 잃은 사이보그의 화면)
 */
const asIndividual = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("faction.overview 응답 모양이 다릅니다");
  Reflect.set(data, "stage", "individual");
  Reflect.set(data, "faction", null);
};

test.describe("플레이어(실제 자료만)", () => {
  test.use({ account: "player" });

  test("첫 접속에서 고른 세력(시험 NPC 세력)에 들어 있다 — 나라·지도자 이름", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openFaction(page);
    const screen = page.locator("section.faction");
    // 나라 이름 = 팩 국가 프리셋(국가 1 = 16번째 프리셋), 지도자 = NPC 국가 지도자 사이보그 이름(docs/adr/2026-11-07-play-flow.md "WP-NPC")
    await expect(screen.locator(".faction-name-text")).toHaveText("칼루누이");
    await expect(screen.locator(".faction-card")).toContainText("말라니 켈레와이");
    await expect(screen.getByRole("heading", { name: message("ko", "faction_none_title") })).toHaveCount(0);
    await expect(screen.locator(".preview-notice")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("세력 없음(개인), 여섯 칸은 곧 열림, 시안 스위치 없음, 곧 열림 단추는 명령을 보내지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    const calls = watchTrpc(page);
    const commands = watchCommands(page);
    await rewriteTrpc(page, { "faction.overview": asIndividual });
    await openFaction(page);
    const screen = page.locator("section.faction");
    await expect(screen.locator("h1")).toHaveText(message("ko", "nav_faction"));
    await expect(screen.getByRole("heading", { name: message("ko", "faction_none_title") })).toBeVisible();
    await expect(screen.locator(".screen-switch")).toHaveCount(0);
    await expect(screen.locator(".preview-notice")).toHaveCount(0);
    for (const tab of TABS) {
      await tabOf(page, "ko", tab).click();
      await expect(screen.getByRole("tabpanel")).toContainText(message("ko", "screen_soon_section"));
    }
    // 요청은 preview 없이(플레이어는 시안 자료를 묻지 않는다)
    const inputs = calls.flatMap((call) =>
      call.procedures.flatMap((name, index) => (name === "faction.overview" ? [call.inputs[index]] : [])),
    );
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((input) => input === undefined)).toBe(true);

    // 곧 열림 단추는 aria-disabled라 Playwright가 누를 수 없는 것으로 본다 → force(사람은 누를 수 있다)
    await screen
      .getByRole("button", { name: new RegExp(message("ko", "faction_found_family")) })
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));
    expect(commands).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await tallShot(page, "faction-player-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev 시안 자료", () => {
  test.use({ account: "dev", preview: "dev" });

  test("시안 장면: 요약·잠긴 메뉴·탭 다섯의 내용, 칸마다 시험 자료, 곧 열림은 명령 없음, 탭은 화살표로 옮긴다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    const commands = watchCommands(page);
    await openFaction(page);
    const screen = page.locator("section.faction");
    await expect(screen.locator(".preview-notice")).toContainText(message("ko", "faction_preview_notice"));
    await expect(screen.locator(".faction-name-text")).toHaveText("Solace");
    await expect(screen.locator(".faction-card")).toContainText(message("ko", "faction_stage_nation"));
    await expect(screen.locator(".faction-card")).toContainText(message("ko", "faction_regime_capitalism"));
    // 잠긴 메뉴: 국가 채권은 도시 5개가 필요(지금 4)
    await expect(screen.locator(".faction-locks")).toContainText(
      message("ko", "faction_lock_need_cities", { need: 5, current: 4 }),
    );
    // 봉신 공물 = 주마다 국고의 5%(규칙 출발값, D-443 R4b ②)
    await expect(screen.locator(".faction-card")).toContainText(
      message("ko", "faction_tribute", { rate: "5%", period: "7일" }),
    );

    // 도시: 민심 네 단계(안정·태업 조짐·반란 예고·반란 중, D-443)
    const panel = screen.getByRole("tabpanel");
    await expect(panel.locator(".faction-city")).toHaveCount(4);
    for (const key of [
      "faction_unrest_stable",
      "faction_unrest_sabotage",
      "faction_unrest_warning",
      "faction_unrest_rebellion",
    ]) {
      await expect(panel.locator(".state-chip", { hasText: message("ko", key) }).first()).toBeVisible();
    }
    await expect(panel).toContainText(message("ko", "faction_city_threshold", { value: 40, warning: 50 }));
    await expect(panel.locator(".preview-tag")).toHaveCount(1);
    // 자본주의: 시장 임명은 안건으로 올린다(C4)
    await expect(
      panel.getByRole("button", { name: new RegExp(message("ko", "faction_city_appoint_vote")) }).first(),
    ).toBeVisible();
    // 발전도 숫자를 누르면 7요소 내역이 펼쳐진다(C12, D-254)
    const development = panel.locator(".faction-dev").first();
    await expect(development.locator(".faction-dev-list")).toBeHidden();
    await development.locator("summary").click();
    await expect(development.locator(".faction-dev-row")).toHaveCount(7);
    await expect(development).toContainText(message("ko", "faction_dev_culture_faith"));
    expect(await smallTapTargets(page)).toEqual([]);

    // 화살표로 다음 탭(외교) — 고르고 초점도 옮긴다
    await tabOf(page, "ko", "cities").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabOf(page, "ko", "diplomacy")).toBeFocused();
    await expect(tabOf(page, "ko", "diplomacy")).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator("tbody tr")).toHaveCount(5);
    // 정원사: 띠 칩 없이 "늘 적대 · 외교 없음" 글만(C9, D-321)
    await expect(panel.locator(".faction-gardener")).toContainText(message("ko", "faction_gardener_note"));
    await expect(panel.locator(".faction-gardener .state-chip")).toHaveCount(0);
    await expect(panel).toContainText(message("ko", "faction_treaty_tariff", { from: "10%", to: "3%" }));
    // 세력 신뢰(D-443 154)와 조약 이름(C10)
    await expect(panel.locator("thead")).toContainText(message("ko", "faction_dip_col_trust"));
    await expect(panel).toContainText(message("ko", "faction_dip_scores_hint"));
    // 조약 제안(D-444 167): 열 장, 투표 필요 카드만 안건 올리기(휴전·강화는 짧은 투표), 나머지는 바로 제안
    const offers = panel.locator(".faction-treaty-offer");
    await expect(offers).toHaveCount(10);
    await expect(panel.locator(".faction-treaty-offer[data-decision=vote]")).toHaveCount(3);
    await expect(panel.locator(".faction-treaty-offer[data-decision=short_vote]")).toHaveCount(1);
    await expect(panel.locator(".faction-treaty-offer[data-decision=leader]")).toHaveCount(6);
    await expect(panel).toContainText(message("ko", "faction_treaty_offers_hint_vote"));
    for (const [treaty, action] of [
      ["faction_treaty_alliance", "faction_treaty_offer_vote"],
      ["faction_treaty_protection", "faction_treaty_offer_vote"],
      ["faction_treaty_territory_transfer", "faction_treaty_offer_vote"],
      ["faction_treaty_ceasefire", "faction_treaty_offer_vote"],
      ["faction_treaty_trade", "faction_treaty_offer_direct"],
      ["faction_treaty_vision_share", "faction_treaty_offer_direct"],
    ] as const)
      await expect(
        panel.getByRole("button", {
          name: `${message("ko", treaty)} ${message("ko", action)}`,
          exact: false,
        }),
      ).toBeVisible();
    await expect(
      panel.locator(".faction-treaty-offer[data-decision=short_vote]", {
        hasText: message("ko", "faction_treaty_ceasefire"),
      }),
    ).toContainText(message("ko", "faction_treaty_offer_note_short"));
    await panel
      .locator(".faction-treaty-offer[data-decision=vote]")
      .first()
      .getByRole("button")
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));
    expect(await smallTapTargets(page)).toEqual([]);

    // 곧 열림 단추를 눌러 초점이 옮겨 갔으므로 탭으로 돌아와 End
    await tabOf(page, "ko", "diplomacy").focus();
    await page.keyboard.press("End");
    await expect(tabOf(page, "ko", "shares")).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".faction-step")).toHaveCount(25);
    // 공성 결과 셋(D-520·D-527): 우리 도시가 약탈당함(정부가 무너져 재건 전까지 꺼내 감)·우리가 점령 상태로 둠(거둔 세금·저절로 회복)·
    // 우리가 약탈한 도시는 상대가 정부를 재건해 끝(다시 전쟁)
    await expect(panel).toContainText(message("ko", "faction_occ_as_target", { name: "Kestrel League" }));
    const mossbrook = panel.locator(".faction-item", { hasText: "Mossbrook" });
    await expect(mossbrook).toContainText(
      message("ko", "faction_occ_amount_loot", { amount: "18,400", currency: "Sol" }),
    );
    await expect(mossbrook).toContainText(
      message("ko", "faction_occ_state_loot", { time: "" }).split("·")[0]?.trim() ?? "",
    );
    await expect(panel).toContainText(message("ko", "faction_occ_occupy"));
    const saltmere = panel.locator(".faction-item", { hasText: "Saltmere" });
    await expect(saltmere).toContainText("7,250 Sol");
    await expect(saltmere).toContainText(message("ko", "faction_occ_as_winner", { name: "Driftwood" }));
    await expect(saltmere).toContainText(
      message("ko", "faction_occ_state_occupy", { time: "" }).split("·")[0]?.trim() ?? "",
    );
    const brinehold = panel.locator(".faction-item", { hasText: "Brinehold" });
    await expect(brinehold).toContainText(message("ko", "faction_occ_end_rebuilt"));
    // 편입 거부 = 빼앗김·쫓겨남·적대(C6), 복원 모금 = 낸 만큼 지분(C5: 6,000 / 120,000 → 50주)
    await expect(panel).toContainText(message("ko", "faction_occ_offer_hint"));
    await expect(panel).toContainText(message("ko", "faction_occ_restoration_hint", { count: "1,000" }));
    await expect(panel).toContainText(
      message("ko", "faction_occ_restoration_mine", { amount: "6,000", currency: "Sol", shares: 50 }),
    );
    // 배당(C7·D-304): 나누는 순서 안내, 지분대로 나눈 최근 배당, 민주주의 도시는 배당 없음
    await expect(panel).toContainText(message("ko", "faction_dividend_rule", { period: "7일" }));
    await expect(panel).toContainText(message("ko", "faction_share_dividend_treasury"));
    await expect(panel.locator(".faction-item", { hasText: "Nova" }).first()).toContainText("6,480 Sol");

    await tabOf(page, "ko", "wars").click();
    await expect(panel).toContainText(message("ko", "faction_casus_none"));
    await expect(panel).toContainText(message("ko", "faction_war_stage_siege_scheduled"));
    // 공성 선포 시각·공격 변(C1·C2, D-200·D-233), 방어 시각 기한 규칙
    await expect(
      panel.locator(".fact-label", { hasText: message("ko", "faction_war_siege_declared") }),
    ).toHaveCount(2);
    await expect(panel).toContainText(message("ko", "faction_war_side_east"));
    await expect(panel).toContainText(message("ko", "faction_war_side_south"));
    await expect(panel).toContainText(message("ko", "faction_war_deadline_rule"));
    await expect(
      screen.getByRole("button", { name: new RegExp(message("ko", "faction_war_declare_vote")) }),
    ).toBeVisible();

    await tabOf(page, "ko", "votes").click();
    await expect(panel).toContainText(message("ko", "faction_rule_by_shares"));
    await expect(panel).toContainText(message("ko", "faction_vote_passed"));
    await expect(panel).toContainText(message("ko", "faction_agenda_mayor_appointment"));
    await expect(panel).toContainText(
      message("ko", "faction_vote_mayor_detail", { city: "Vega", name: "Pell" }),
    );
    await panel
      .getByRole("button", { name: new RegExp(message("ko", "faction_vote_cast_yes")) })
      .first()
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));
    expect(commands).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("시안 스위치를 끄면 실제 자료(첫 접속에서 든 시험 NPC 세력)로 다시 묻고, 켜면 시안 장면으로 돌아온다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openFaction(page);
    const screen = page.locator("section.faction");
    const toggle = screen.locator(".screen-switch input[role=switch]");
    await expect(toggle).toBeChecked();
    await screen.locator(".screen-switch").click();
    await expect(toggle).not.toBeChecked();
    await expect(screen.locator(".faction-name-text")).toHaveText("칼루누이");
    await expect(screen.locator(".preview-notice")).toHaveCount(0);
    await screen.locator(".screen-switch").click();
    await expect(screen.locator(".faction-name-text")).toHaveText("Solace");
    expect(deviceErrors).toEqual([]);
  });

  test("긴 이름·큰 수(390px): 가로 넘침·작은 누르는 곳 없음", async ({ page, deviceErrors }) => {
    const LONG = "Gloriously_Overlong_Faction_Name_Without_Spaces_Anywhere";
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "faction.overview": (data) => {
        if (typeof data !== "object" || data === null)
          throw new Error("faction.overview 응답 모양이 다릅니다");
        const faction: unknown = Reflect.get(data, "faction");
        if (typeof faction === "object" && faction !== null) {
          Reflect.set(faction, "name", LONG);
          Reflect.set(faction, "leader", LONG);
          Reflect.set(faction, "treasury", [
            { asset: "preview_sol_mark", name: LONG, amount: "999999999999999999999999" },
          ]);
        }
        const cities: unknown = Reflect.get(data, "cities");
        const rows: unknown =
          typeof cities === "object" && cities !== null ? Reflect.get(cities, "data") : null;
        if (Array.isArray(rows))
          for (const row of rows) {
            Reflect.set(row, "name", LONG);
            Reflect.set(row, "mayor", LONG);
            Reflect.set(row, "population", 123456789);
            Reflect.set(row, "dailyBudget", "999999999999999999");
          }
      },
    });
    await openFaction(page);
    for (const tab of TABS) {
      await tabOf(page, "ko", tab).click();
      expect(await horizontalOverflow(page), tab).toEqual([]);
      expect(await smallTapTargets(page), tab).toEqual([]);
    }
    expect(deviceErrors).toEqual([]);
  });
});

/** 시안 응답의 내 세력 체제를 독재로 고친다(조약 제안이 모두 지도자가 바로 맺는 길이 되는지) */
const asDictatorship = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("faction.overview 응답 모양이 다릅니다");
  const faction: unknown = Reflect.get(data, "faction");
  if (typeof faction !== "object" || faction === null) throw new Error("시안 응답에 세력이 없습니다");
  Reflect.set(faction, "regime", "dictatorship");
};

test.describe("조약 제안: 독재(D-444 167)", () => {
  test.use({ account: "dev", preview: "dev" });

  test("독재는 열 장 모두 지도자가 바로 제안, 안건 올리기 단추 없음", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary, "faction.overview": asDictatorship });
    await openFaction(page);
    await tabOf(page, "ko", "diplomacy").click();
    const panel = page.locator("section.faction").getByRole("tabpanel");
    await expect(panel.locator(".faction-treaty-offer[data-decision=leader]")).toHaveCount(10);
    await expect(panel).toContainText(message("ko", "faction_treaty_offers_hint_leader"));
    await expect(
      panel.locator(".faction-treaty-offer").getByRole("button", {
        name: new RegExp(message("ko", "faction_treaty_offer_vote")),
      }),
    ).toHaveCount(0);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

/** 플레이어 응답을 도시를 가진 고정 NPC 국가(독재)의 시민으로 고친다 — 서버가 DB(world_cities·factions)에서 읽는 모양(C8) */
const asCitizen = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("faction.overview 응답 모양이 다릅니다");
  Reflect.set(data, "stage", "nation");
  Reflect.set(data, "faction", {
    id: "faction_1",
    name: "s3_test_npc",
    tag: null,
    kind: "npc",
    stage: "nation",
    regime: "dictatorship",
    fixed: true,
    leader: null,
    memberCount: 12,
    cityCount: 2,
    joinedAt: Date.now() - 86_400_000,
    family: null,
    overlord: null,
    vassals: [],
    currency: null,
    treasury: [{ asset: "s3_test_credit", name: null, amount: "1000000000" }],
  });
  Reflect.set(data, "locks", [
    {
      feature: "currency_issue",
      open: true,
      requirements: [{ kind: "cities_min", need: 1, current: 2, met: true }],
    },
    {
      feature: "tax_rate",
      open: true,
      requirements: [{ kind: "cities_min", need: 1, current: 2, met: true }],
    },
    {
      feature: "national_bond",
      open: false,
      requirements: [{ kind: "cities_min", need: 5, current: 2, met: false }],
    },
  ]);
};

test.describe("NPC 국가 시민(실제 자료 모양, C8)", () => {
  test.use({ account: "player" });

  test("도시 2·독재·고정 NPC 국가: 국가 단계·체제·도시 수, 화폐는 '아직 보이지 않음'(도시가 있어야 발행 아님)", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "faction.overview": asCitizen });
    await openFaction(page);
    const card = page.locator("section.faction .faction-card");
    await expect(card).toContainText(message("ko", "faction_stage_nation"));
    await expect(card).toContainText(message("ko", "faction_fixed"));
    await expect(card).toContainText(message("ko", "faction_regime_dictatorship"));
    await expect(card).toContainText(message("ko", "faction_currency_unknown"));
    await expect(card).not.toContainText(message("ko", "faction_currency_none"));
    await expect(page.locator(".faction-lock[data-open=true]")).toHaveCount(2);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

for (const [size, preset] of [
  ["390", VIEWPORTS.phone],
  ["1440", VIEWPORTS.desktop],
] as const) {
  test.describe(`사진 ${size}px`, () => {
    test.use({ account: "dev", preview: "dev", ...preset });
    for (const { theme, language } of LAYOUTS) {
      test.describe(`${theme}·${language}`, () => {
        test.use({ theme, language });

        test("탭 다섯: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await openFaction(page);
          await expect(page.locator("section.faction .faction-name-text")).toHaveText("Solace");
          for (const tab of TABS) {
            await tabOf(page, language, tab).click();
            await expect(tabOf(page, language, tab)).toHaveAttribute("aria-selected", "true");
            expect(await horizontalOverflow(page), tab).toEqual([]);
            await tallShot(page, `faction-${tab}-${theme}-${language}-${size}`);
          }
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  });
}

test.describe("사진 390px: NPC 국가 시민 요약·조약 제안·발전도 내역", () => {
  for (const { theme, language } of LAYOUTS) {
    test.describe(`${theme}·${language}`, () => {
      test.use({ theme, language, ...VIEWPORTS.phone });

      test.describe("플레이어", () => {
        test.use({ account: "player" });
        test("NPC 국가 시민 요약, 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "faction.overview": asCitizen });
          await openFaction(page);
          await expect(page.locator("section.faction .faction-card")).toContainText(
            message(language, "faction_fixed"),
          );
          await shot(page, `faction-citizen-${theme}-${language}-390`);
          expect(deviceErrors).toEqual([]);
        });
      });

      test.describe("dev 시안", () => {
        test.use({ account: "dev", preview: "dev" });
        test("조약 제안(D-444 167), 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await openFaction(page);
          await tabOf(page, language, "diplomacy").click();
          const offers = page.locator("section.faction .faction-treaty-offers");
          await expect(offers.locator(".faction-treaty-offer")).toHaveCount(10);
          await page.locator("#faction-treaty-offers-title").scrollIntoViewIfNeeded();
          await page.evaluate(() => {
            const title = document.getElementById("faction-treaty-offers-title");
            if (title !== null) window.scrollBy(0, title.getBoundingClientRect().top - 72);
          });
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `faction-treaty-offers-${theme}-${language}-390`);
          expect(deviceErrors).toEqual([]);
        });

        test("발전도 내역 펼침, 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await openFaction(page);
          const development = page.locator("section.faction .faction-dev").first();
          await development.locator("summary").click();
          await expect(development.locator(".faction-dev-row")).toHaveCount(7);
          await development.scrollIntoViewIfNeeded();
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `faction-development-${theme}-${language}-390`);
          expect(deviceErrors).toEqual([]);
        });
      });
    });
  }
});

test.describe("사진 1440px 플레이어", () => {
  test.use({ account: "player", theme: "dark", language: "en", ...VIEWPORTS.desktop });

  test("실제 자료만: 곧 열림, 사진", async ({ page, deviceErrors }) => {
    await openFaction(page);
    await expect(page.locator("section.faction .soon-panel")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    await tallShot(page, "faction-player-dark-en-1440");
    expect(deviceErrors).toEqual([]);
  });
});

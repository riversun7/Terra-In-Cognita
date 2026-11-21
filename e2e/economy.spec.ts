// 경제·거래창 화면 시험 — /economy 아래 칸(한눈에·생산·거래·환전, 창고 자리는 인벤토리 [창고별] /inventory?tab=warehouses), 거래창 흐름(물건 → 도시 → 호가 + 주문표), 내 주문.
// ADR 2026-10-29-app-shell 끝 "구현하며 정한 것 (경제·거래창 화면)", 기획 60_UX §6(D-6032~D-6035).
// - 플레이어: 실제 자료(팩 목록·원장 잔고, 서버 도시 경제의 거래소·내 주문·기준 도시 생산 — docs/adr/2026-11-07-play-flow.md WP4). 환전은
//   나라 화폐 ↔ 기준 통화 실제 짝(WP6): 주문을 내고 거둔다. 시안 자료를 묻지 않는다. 실제 거래소의 [주문]은 명령을 보낸다(주문 넣기·체결·취소·
//   환전 회차 셈은 서버 DB 시험 market.db.test.ts가 본다).
// - admin + 시안 자료: 서버가 sim 거래소로 만든 시험 호가·체결(apps/server/src/economyView/). 앱을 켤 때 뜨는 복귀 요약은
//   summary.get 응답을 고쳐 띄우지 않는다(helpers/trpc.ts hideSummary).
// - 주문표: 호가 줄을 누르면 값이 들어가고, 거래세·묶이는 돈 미리 보기가 바뀌며, [주문]은 "곧 열림"으로 잠겨 있다(명령 없음).
// - 시세 색(D-442): 한국어 = 한국식(매수 빨강·매도 파랑), 영어 = 서양식(매수 초록·매도 빨강), 설정 "시세 색"이 바꾼다.
//   색은 지금 테마의 토큰(위험·성공·시세 파랑, styles/tokens.css)을 화면에서 읽어 계산된 글자 색과 견준다(값을 시험에 적지 않는다).
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어, 화면마다(E2E_SHOTS_DIR).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc, watchTrpc } from "./helpers/trpc.ts";

/** 호가 줄은 촘촘한 표라 32px다(market.css 머리 주석). 나머지 누르는 곳은 --tap-size */
const DENSE_TARGETS = ".eco-level";

/** 시안 자료를 켠 계정: 복귀 요약을 띄우지 않고(응답 고침) 경로를 연다 */
async function openPreview(
  page: Page,
  path: string,
  edits: Readonly<Record<string, (data: unknown) => void>> = {},
) {
  await rewriteTrpc(page, { "summary.get": hideSummary, ...edits });
  await page.goto(path);
}

const economy = (page: Page) => page.locator("section.economy");

/** 전체 사진 한 장의 기기 화소 상한(390px 거래소 목록 1170 × 39,321 ≈ 4,600만은 찍힌다) */
const MAX_SHOT_PIXELS = 60_000_000;

/**
 * 화면 전체 사진. 화면에 붙은 하단 탭(position: fixed)은 전체 사진에서 첫 화면 높이 자리에 겹쳐 찍혀서 사진 동안만 숨긴다
 * (하단 탭 자체는 shell.spec.ts가 본다)
 */
async function fullShot(page: Page, name: string): Promise<void> {
  const style = await page.addStyleTag({ content: ".tabbar { visibility: hidden !important; }" });
  // 1440px × 기기 배율 3에서 거래소 목록 전체(약 4320 × 34,000화소 ≈ 5.9억 바이트 비트맵)는 Chromium이 찍다 죽는다("Unable to capture
  // screenshot"·Target crashed — 묶음 1116j·1116k). 앱 화면 문제가 아니라 사진 크기라, 화소 수가 상한을 넘으면 위에서부터 상한만큼만 찍는다
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    ratio: window.devicePixelRatio,
  }));
  const maxHeight = Math.floor(MAX_SHOT_PIXELS / (size.width * size.ratio * size.ratio));
  await shot(
    page,
    name,
    size.height > maxHeight
      ? { fullPage: true, clip: { x: 0, y: 0, width: size.width, height: maxHeight } }
      : { fullPage: true },
  );
  await style.evaluate((element) => element.parentNode?.removeChild(element));
}

test.describe("플레이어(실제 자료)", () => {
  test.use({ account: "player" });

  test("한눈에·거래·환전: 실제 거래소(NPC 도시 매물)·내 주문·도시 생산, 환전 주문 내기·거두기, 시안 자료를 묻지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    const calls = watchTrpc(page);
    await page.goto("/economy");
    await expect(economy(page).locator(".eco-card")).toHaveCount(4);
    await expect(page.locator("#economy-title")).toHaveText(message("ko", "nav_economy"));
    await page.getByRole("link", { name: message("ko", "economy_tab_market"), exact: true }).click();
    await expect(page).toHaveURL(/\/economy\/market$/);
    // 서버 도시 경제가 돌아 거래소가 열려 있다. 팩의 호가창 물건(장비·유전자·문서 빼고): 켜진 아이템 179개 − 장비 12개 − 유전자 4개 = 163개
    // (core@32에서 옛 자원 129·괴 7·판자·벽돌을 켬, core@38에서 마이크로칩·유전자 4개를 더함, core@41에서 유전자는 인스턴스라 경매 매물 D-516,
    // 형식 확인용 dev_placeholder는 꺼짐, D-540에서 자연 채집물·고래 아이템 10개를 더함 — D-556에서 분류만 어류·작물·광석·음료로 옮겨 수는 그대로,
    // D-570 배 4에서 포획 장비 그물·주낙 장비 둘을 더함 — 묶음 1116k)
    await expect(economy(page).locator(".eco-row-link")).toHaveCount(163);
    await expect(economy(page).locator(".eco-not-ready")).toHaveCount(0);
    // 하위 화면에서도 하단 탭의 경제가 지금 화면이다(menuRoute)
    await expect(page.locator('nav.tabbar a[aria-current="page"]')).toHaveText(message("ko", "nav_economy"));
    // 도시 목록: NPC 도시마다 거래소, 기준 도시(내 시작 도시)가 맨 앞 "여기". 도시 이름 = 팩 도시 이름(이름 없는 도시만 "#ID" — 고정 나라
    // 도시는 모두 이름이 있다, docs/adr/2026-11-07-play-flow.md "WP12 특산·이름 마무리")
    await page.goto("/economy/market/ration");
    const cities = economy(page).locator(".eco-city");
    await expect(cities.first()).toBeVisible();
    await expect(cities.first()).toContainText(message("ko", "economy_here"));
    await expect(economy(page).locator(".eco-city-name", { hasText: /^#\d+$/ })).toHaveCount(0);
    await cities.first().click();
    await expect(page).toHaveURL(/\/economy\/market\/ration\/\d+$/);
    await expect(economy(page)).toHaveAttribute("data-density", "compact");
    // 거래소 건물(D-561): 세계 씨앗이 NPC 도시마다 물자 거래소를 세우고, 거래창은 그 건물을 알린다(팔 물건 = 그 건물 창고)
    await expect(economy(page).locator('[data-part="market-exchange"]')).toBeVisible();
    // 개인 창고·거래 직무(D-571 1943·1944): 쓰는 무게/크기와 넓히기. 바뀜 (질문 2081): 유닛마다 창고 — 넓힐 유닛 고르기에 내 사이보그 창고
    await expect(
      economy(page).getByRole("combobox", { name: message("ko", "market_locker_pick"), exact: true }),
    ).toContainText(message("ko", "market_locker_unit_cyborg", { steps: 0, max: 20 }));
    await expect(economy(page).locator('[data-part="market-locker-units"]')).toBeVisible();
    // 거래 직무(질문 2083): 자리 = 레벨 × 5. 바뀜(기획 대조 2204 나, 묶음 1116p): NPC 거래소도 적정 자리 값으로 자리를 낸다(labor/deskRent.ts)
    await expect(economy(page).locator('[data-part="market-desk"]')).toContainText(
      message("ko", "market_desk_seats", { taken: 0, slots: 5, count: 0 }),
    );
    const deskRent = economy(page).locator('[data-part="market-desk-rent"]');
    await expect(deskRent).toContainText(message("ko", "market_desk_rent", { rent: "" }).trim());
    await expect(deskRent).not.toHaveText(message("ko", "market_desk_closed"));
    await shot(page, "market-exchange-note", { fullPage: true });
    // 실제 거래소의 [주문]은 "곧 열림"이 아니라 쪽에 맞는 보내기 단추다. 조건 주문은 아직 서버에 없어 잠근다
    const submit = economy(page).locator(".eco-submit");
    await expect(submit).toHaveText(message("ko", "market_submit_buy"));
    await page.getByLabel(message("ko", "economy_kind_label")).selectOption("conditional");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(economy(page).getByText(message("ko", "market_conditional_soon"))).toBeVisible();
    await page.goto("/economy/orders");
    await expect(economy(page).locator(".eco-not-ready")).toHaveCount(0);
    await expect(economy(page).locator(".eco-limit-line")).toHaveText(
      message("ko", "economy_limit", { left: 10, max: 10 }),
    );
    // 환전(WP6): 고정 나라 넷의 화폐 ↔ 기준 통화(시험 화폐). 1로트를 값 1로 내고(다음 회차, 다른 시험이 잔고를 써도 묶을 수 있게), 회차 전에 거둔다
    await page.goto("/economy/exchange");
    await expect(economy(page).locator(".eco-not-ready")).toHaveCount(0);
    await expect(economy(page).locator(".eco-fx")).toHaveCount(4);
    // 환전 이용료(질문 2086): 주인이 정하지 않은 NPC 외환 거래소 = 적정 요율 0.5%
    await expect(economy(page).locator('[data-part="fx-fee"]').first()).toHaveText(
      message("ko", "fx_fee_line", { pct: "0.5" }),
    );
    await expect(economy(page).getByText(message("ko", "fx_intro_live"))).toBeVisible();
    await expect(economy(page).getByText(message("ko", "fx_open_empty"))).toBeVisible();
    await page.getByLabel(message("ko", "economy_exchange_lots"), { exact: true }).fill("1");
    await page.getByLabel(message("ko", "fx_price_buy"), { exact: true }).fill("1");
    await economy(page)
      .getByRole("button", { name: message("ko", "fx_submit") })
      .click();
    await expect(economy(page).locator(".eco-fx-form .eco-sent")).toHaveAttribute("data-tone", "ok");
    await expect(economy(page).locator(".eco-fx-form .eco-row-meta").last()).toHaveText(
      message("ko", "fx_limit", { used: 1, max: 10 }),
    );
    // [거두기]의 읽는 이름은 "<화폐> 환전 주문 거두기"(fx_cancel_label)
    const withdraw = economy(page).getByRole("button", {
      name: new RegExp(`${message("ko", "fx_cancel")}$`),
    });
    await expect(withdraw).toHaveCount(1);
    await withdraw.click();
    await expect(economy(page).getByText(message("ko", "fx_open_empty"))).toBeVisible();
    await expect(economy(page).getByText(message("ko", "fx_done_title"))).toBeVisible();
    await page.goto("/economy/production");
    // 기준 도시의 생산(NPC 시설·도시 직무)과 실제 팩 레시피 목록
    await expect(economy(page).getByText(message("ko", "market_city_production_note"))).toBeVisible();
    await expect(economy(page).getByText("철 제련", { exact: true })).toBeVisible();
    const economyCalls = calls.filter((call) => call.procedures.some((name) => name.startsWith("economy.")));
    expect(economyCalls.length).toBeGreaterThan(0);
    expect(economyCalls.some((call) => JSON.stringify(call.inputs).includes("preview"))).toBe(false);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("칸끼리는 바꾸기: 경제 안에서 칸을 옮겨도 뒤로는 경제 앞 화면", async ({ page }) => {
    await page.goto("/");
    await page.goto("/economy");
    await expect(economy(page).locator(".eco-card-metric").first()).toBeVisible();
    await page.getByRole("link", { name: message("ko", "economy_tab_production"), exact: true }).click();
    await expect(page).toHaveURL(/\/economy\/production$/);
    await page.getByRole("link", { name: message("ko", "economy_tab_exchange"), exact: true }).click();
    await expect(page).toHaveURL(/\/economy\/exchange$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});

/** 호가창 응답 고치기: 긴 도시 이름·12자리 값·9자리 잔량(넘침 확인) */
const huge = (data: unknown): void => {
  if (typeof data !== "object" || data === null) return;
  Reflect.set(data, "cityName", "Saint-Aurelien-des-Hautes-Collines-Orientales");
  Reflect.set(data, "last", "987654321012");
  for (const side of ["asks", "bids"]) {
    const levels: unknown = Reflect.get(data, side);
    if (!Array.isArray(levels)) continue;
    for (const level of levels) {
      if (typeof level !== "object" || level === null) continue;
      Reflect.set(level, "price", `98765432${String(Reflect.get(level, "price")).padStart(4, "0")}`);
      Reflect.set(level, "qty", "123456789");
    }
  }
};

test.describe("admin 시안 자료(시험 거래소)", () => {
  test.use({ account: "admin", preview: "admin" });

  test("묶음·채집 추첨(302·D-506): 광산 레시피는 묶음마다 티어 추첨, 철광석은 1 kg 묶음(레시피·호가창·창고)", async ({
    page,
    deviceErrors,
  }) => {
    await openPreview(page, "/economy/production");
    const rolled = economy(page).locator(".eco-row", {
      hasText: message("ko", "economy_recipe_gather", { stats: "STR+VIT" }),
    });
    await expect(rolled).toHaveCount(1);
    await expect(rolled.locator(".eco-tag")).toHaveText(message("ko", "economy_tier_rolled"));
    // 옛 1차 생산 규칙(D-507): 기준 유닛(스탯 10) STR → 속도 ×1, VIT → 한 번에 2개(1 + ⌊10 × 0.10⌋, 최대 10), 한 번 T0~T3 시간
    await expect(rolled.locator('[data-part="worker-effect"]')).toHaveText(
      message("ko", "economy_worker_effect", {
        stat: 10,
        primary: "STR",
        progress: 1,
        secondary: "VIT",
        count: 2,
      }),
    );
    await expect(rolled.locator('[data-part="worker-formula"]')).toHaveText(
      message("ko", "economy_worker_formula", {
        primary: "STR",
        secondary: "VIT",
        divisor: 20,
        base: 1,
        rate: "0.10",
        cap: 10,
      }),
    );
    await expect(rolled.locator('[data-part="worker-harvest"]')).toContainText("T3");
    // 벌목장 통나무 베기(소나무 T0~, DEX+STR)도 추첨, 원목 베기는 사다리 밖(한 번 시간 없음)
    await expect(
      economy(page).locator(".eco-row", {
        hasText: message("ko", "economy_recipe_gather", { stats: "DEX+STR" }),
      }),
    ).toHaveCount(1);
    await expect(
      economy(page).locator('.eco-row[data-recipe="cut_timber"] [data-part="worker-harvest"]'),
    ).toHaveCount(0);
    await expect(
      economy(page).locator('.eco-row[data-recipe="smelt_iron"] [data-part="worker-effect"]'),
    ).toHaveCount(0);
    await elementShot(rolled, "economy-recipe-worker-ko");
    // 캐기 산출·제련 재료가 "철광석 ×10 (묶음 1 kg)"
    const ore = message("ko", "economy_stack_lot", { name: "철광석", qty: "10", size: "1 kg" });
    await expect(economy(page).locator(".eco-row-meta", { hasText: ore })).toHaveCount(2);
    await page.goto("/economy/market/iron_ore/101");
    await expect(economy(page).locator('[data-part="lot-note"]')).toHaveText(
      message("ko", "economy_lot_note", { size: "1 kg" }),
    );
    // 창고 자리는 인벤토리 [창고별]로 옮겼다(docs/adr/2026-11-14-inventory-screen.md)
    await page.goto("/inventory?tab=warehouses");
    await expect(economy(page).locator(".eco-place").first()).toContainText(
      message("ko", "economy_hold_lots", { size: "1 kg", lots: "310" }),
    );
    expect(deviceErrors).toEqual([]);
  });

  test("물건 → 도시 → 호가창: 호가 줄을 누르면 값이 들어가고, 미리 보기가 바뀌고, [주문]은 잠겨 있다", async ({
    page,
    deviceErrors,
  }) => {
    await openPreview(page, "/economy/market");
    await expect(economy(page).locator(".eco-notice")).toHaveText(message("ko", "economy_preview_notice"));
    await economy(page).locator(".eco-market-row", { hasText: "철광석" }).click();
    await expect(page).toHaveURL(/\/economy\/market\/iron_ore$/);
    await expect(economy(page).locator(".eco-city")).toHaveCount(4);
    // 시야 밖 도시는 마지막 관측(점선 + 표)
    await expect(economy(page).locator('.eco-city[data-sight="out"]')).toContainText(
      message("ko", "economy_out_of_sight"),
    );
    await economy(page).locator(".eco-city", { hasText: "Nova" }).click();
    await expect(page).toHaveURL(/\/economy\/market\/iron_ore\/101$/);
    await expect(economy(page)).toHaveAttribute("data-density", "compact");

    const asks = economy(page).locator('.eco-level[data-side="sell"]');
    await expect(asks.first()).toBeVisible();
    // 가장 싼 매도(매도 줄의 맨 아래)를 누르면 주문표 값이 된다
    const bestAsk = asks.last();
    const bestAskPrice = (await bestAsk.locator(".eco-level-price").textContent())?.replaceAll(",", "") ?? "";
    await bestAsk.click();
    const price = page.getByLabel(message("ko", "economy_price"), { exact: true });
    await expect(price).toHaveValue(bestAskPrice);
    const qty = page.getByLabel(message("ko", "economy_qty"), { exact: true });
    await qty.fill("3");
    const summary = economy(page).locator(".eco-summary");
    await expect(summary).toContainText(message("ko", "economy_sum_escrow_cash"));
    await expect(summary).toContainText(new Intl.NumberFormat("ko").format(Number(bestAskPrice) * 3));
    // 매도로 바꾸면 거래세(판 쪽)와 받을 돈이 보인다
    await economy(page).locator('.eco-side[data-side="sell"]').click();
    await expect(summary).toContainText(message("ko", "economy_sum_tax", { pct: "2.00%" }));
    await expect(summary).toContainText(message("ko", "economy_sum_net"));
    // 가진 양보다 많이 팔면 문제를 알린다
    await qty.fill("999999");
    await expect(economy(page).locator(".eco-problems")).toContainText(message("ko", "economy_err_goods"));
    // 시장가: 안전망 칸(최저 가격)이 기본값으로 찬다
    await page.getByLabel(message("ko", "economy_kind_label")).selectOption("market");
    await expect(page.getByLabel(message("ko", "economy_guard_sell"))).not.toHaveValue("");
    // 칸 오류는 건드린 뒤에만
    await qty.fill("1.5");
    await qty.blur();
    await expect(economy(page).locator(".eco-field-error")).toHaveText(message("ko", "economy_err_integer"));
    const submit = economy(page).locator(".eco-submit");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(submit).toHaveText(message("ko", "economy_submit_soon"));
    // 남은 주문을 누르면 늘리는 법(D-6034)
    await economy(page).locator(".eco-limit").click();
    await expect(economy(page).getByText(message("ko", "economy_limit_help"))).toBeVisible();
    // 차트 접기
    await economy(page).locator(".eco-chart-toggle").click();
    await expect(economy(page).locator(".eco-chart-body")).toBeHidden();
    // 화면 안 [뒤로]는 쌓은 차례로(도시 목록)
    await economy(page).locator(".back-button").click();
    await expect(page).toHaveURL(/\/economy\/market\/iron_ore$/);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("내 주문·환전·생산·창고: 시안 자료가 칸마다 보인다", async ({ page, deviceErrors }) => {
    await openPreview(page, "/economy/orders");
    await expect(economy(page).locator(".eco-order").first()).toBeVisible();
    await expect(
      economy(page).getByText(message("ko", "economy_order_expired"), { exact: true }),
    ).toBeVisible();
    await page.goto("/economy/exchange");
    await expect(economy(page).locator(".eco-fx")).toHaveCount(3);
    await expect(economy(page).locator(".eco-fx-countdown")).toContainText(/\d\d:\d\d/);
    await page.goto("/economy/production");
    await expect(economy(page).locator(".eco-facility").first()).toBeVisible();
    await page.goto("/inventory?tab=warehouses");
    await expect(economy(page).getByText("Velmara Eastreach Free Port")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("큰 값·긴 이름: 호가창이 넘치지 않는다(390px)", async ({ page, deviceErrors }) => {
    await openPreview(page, "/economy/market/iron_ore/101", { "economy.marketBook": huge });
    await expect(economy(page).locator(".eco-level").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page, { ignore: DENSE_TARGETS })).toEqual([]);
    await fullShot(page, "economy-book-huge-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

/**
 * 디자인 토큰(styles/tokens.css)의 계산된 색 — 지금 테마에서 토큰 값을 읽는다.
 * 값을 시험에 적어 두면 토큰을 바꿀 때마다 시험이 깨진다(1116w에서 db1e404545의 색 바꿈을 못 따라감). 경제 화면 뿌리 안에
 * 잠깐 둔 글자에 `color: var(토큰)`을 주고 계산된 색을 읽어, 호가 글자 색과 같은 형식(rgb(…))으로 비교한다.
 */
async function tokenColors(page: Page): Promise<{ danger: string; success: string; marketBlue: string }> {
  const read = (token: string) =>
    economy(page).evaluate((root, name) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      root.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, token);
  const colors = {
    danger: await read("--color-danger"),
    success: await read("--color-success"),
    marketBlue: await read("--color-market-blue"),
  };
  // 세 토큰이 서로 달라야 쪽을 가를 수 있다(빈 토큰이면 모두 글자색이 된다)
  expect(new Set(Object.values(colors)).size).toBe(3);
  return colors;
}

/** 호가창의 가장 좋은 매수·매도 값 글자 색 */
async function bookColors(page: Page): Promise<{ buy: string; sell: string }> {
  const color = (side: "buy" | "sell") =>
    economy(page)
      .locator(`.eco-level[data-side="${side}"] .eco-level-price`)
      .first()
      .evaluate((element) => getComputedStyle(element).color);
  return { buy: await color("buy"), sell: await color("sell") };
}

test.describe("시세 색(D-442)", () => {
  test.use({ account: "admin", preview: "admin" });

  test("한국어 기본은 한국식(매수 빨강·매도 파랑), 설정에서 서양식을 고르면 매수 초록·매도 빨강", async ({
    page,
    deviceErrors,
  }) => {
    await openPreview(page, "/economy/market/iron_ore/101");
    await expect(economy(page).locator(".eco-level").first()).toBeVisible();
    await expect(economy(page)).toHaveAttribute("data-market-colors", "korean");
    const tokens = await tokenColors(page);
    expect(await bookColors(page)).toEqual({ buy: tokens.danger, sell: tokens.marketBlue });

    await page.goto("/settings");
    const select = page.getByLabel(message("ko", "settings_market_colors"));
    await expect(select).toHaveValue("language");
    await expect(select.locator("option").first()).toHaveText(
      message("ko", "settings_market_colors_language", {
        style: message("ko", "settings_market_colors_korean_short"),
      }),
    );
    await select.selectOption("western");
    await page.goto("/economy/market/iron_ore/101");
    await expect(economy(page).locator(".eco-level").first()).toBeVisible();
    await expect(economy(page)).toHaveAttribute("data-market-colors", "western");
    expect(await bookColors(page)).toEqual({ buy: tokens.success, sell: tokens.danger });
    // 새로고침해도 기기에 남는다
    await page.reload();
    await expect(economy(page)).toHaveAttribute("data-market-colors", "western");
    expect(deviceErrors).toEqual([]);
  });

  test.describe("영어", () => {
    test.use({ language: "en" });

    test("영어 기본은 서양식, 한국식을 고르면 한국식", async ({ page, deviceErrors }) => {
      await openPreview(page, "/economy/market/iron_ore/101");
      await expect(economy(page).locator(".eco-level").first()).toBeVisible();
      await expect(economy(page)).toHaveAttribute("data-market-colors", "western");
      const tokens = await tokenColors(page);
      expect(await bookColors(page)).toEqual({ buy: tokens.success, sell: tokens.danger });
      await page.goto("/settings");
      await page.getByLabel(message("en", "settings_market_colors")).selectOption("korean");
      await page.goto("/economy/market/iron_ore/101");
      await expect(economy(page)).toHaveAttribute("data-market-colors", "korean");
      expect(await bookColors(page)).toEqual({ buy: tokens.danger, sell: tokens.marketBlue });
      expect(deviceErrors).toEqual([]);
    });
  });
});

test.describe("창고 단위·보석 안내(D-443)", () => {
  test.use({ account: "admin", preview: "admin" });

  test("창고 용량은 지금 개수, 최종 단위는 무게(kg)라고 알린다. 보석은 호가창이라고 알린다", async ({
    page,
    deviceErrors,
  }) => {
    await openPreview(page, "/inventory?tab=warehouses");
    await expect(economy(page).locator(".eco-place").first()).toBeVisible();
    await expect(economy(page).getByText(message("ko", "economy_capacity_unit_note"))).toBeVisible();
    await page.goto("/economy/market");
    await expect(economy(page).getByText(message("ko", "economy_market_auction_note"))).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });
});

const SETTINGS_LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

test.describe("시세 색 사진(390)", () => {
  test.use({ account: "admin", preview: "admin" });
  for (const { theme, language } of SETTINGS_LAYOUTS) {
    test.describe(`${theme}·${language}`, () => {
      test.use({ theme, language, viewport: { width: 390, height: 844 } });

      test("설정 칸과 언어 기본 호가창, 사진", async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/settings");
        const select = page.getByLabel(message(language, "settings_market_colors"));
        await select.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `settings-market-colors-${theme}-${language}-390`);
        await page.goto("/economy/market/iron_ore/101");
        await expect(economy(page).locator(".eco-level").first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await shot(page, `economy-book-colors-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

const SCREENS: readonly { path: string; name: string; ready: string }[] = [
  { path: "/economy", name: "overview", ready: ".eco-card-metric" },
  { path: "/inventory?tab=warehouses", name: "inventory-warehouses", ready: ".eco-place" },
  { path: "/economy/production", name: "production", ready: ".eco-facility" },
  { path: "/economy/market", name: "market", ready: ".eco-market-row" },
  { path: "/economy/market/iron_ore", name: "cities", ready: ".eco-city" },
  { path: "/economy/market/iron_ore/101", name: "book", ready: ".eco-level" },
  { path: "/economy/orders", name: "orders", ready: ".eco-order" },
  { path: "/economy/exchange", name: "exchange", ready: ".eco-fx" },
];

const LAYOUTS: readonly { theme: Theme; language: Language; width: number; height: number }[] = [
  { theme: "pastel", language: "ko", width: 390, height: 844 },
  { theme: "pastel", language: "en", width: 390, height: 844 },
  { theme: "dark", language: "ko", width: 390, height: 844 },
  { theme: "dark", language: "en", width: 390, height: 844 },
  { theme: "pastel", language: "ko", width: 1440, height: 900 },
  { theme: "pastel", language: "en", width: 1440, height: 900 },
  { theme: "dark", language: "ko", width: 1440, height: 900 },
  { theme: "dark", language: "en", width: 1440, height: 900 },
];

test.describe("배치·사진", () => {
  test.use({ account: "admin", preview: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ theme, language, viewport: { width, height } });

      test("칸마다: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        for (const screen of SCREENS) {
          await page.goto(screen.path);
          await expect(economy(page).locator(screen.ready).first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page), screen.name).toEqual([]);
          expect(await smallTapTargets(page, { ignore: DENSE_TARGETS }), screen.name).toEqual([]);
          await fullShot(page, `economy-${screen.name}-${theme}-${language}-${width}`);
        }
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

/** 실제 거래소(서버 도시 경제, docs/adr/2026-11-07-play-flow.md WP4) 화면 사진: 기본 테마 둘 × 한국어·영어, 390px */
const LIVE_LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

test.describe("실제 거래소 사진", () => {
  test.use({ account: "player" });

  for (const { theme, language } of LIVE_LAYOUTS) {
    test.describe(`${theme}·${language}`, () => {
      test.use({ theme, language, viewport: { width: 390, height: 844 } });

      test("거래창·내 주문·도시 생산·환전: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/economy/market/ration");
        await economy(page).locator(".eco-city").first().click();
        await expect(economy(page).locator(".eco-submit")).toBeVisible();
        const screens = [
          { name: "live-book", ready: ".eco-submit", path: null },
          { name: "live-orders", ready: ".eco-limit-line", path: "/economy/orders" },
          { name: "live-production", ready: ".eco-facility", path: "/economy/production" },
          // 환전(WP6, 나라 화폐 ↔ 기준 통화 실제 짝)
          { name: "live-exchange", ready: ".eco-fx", path: "/economy/exchange" },
        ];
        for (const screen of screens) {
          if (screen.path !== null) await page.goto(screen.path);
          await expect(economy(page).locator(screen.ready).first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page), screen.name).toEqual([]);
          expect(await smallTapTargets(page, { ignore: DENSE_TARGETS }), screen.name).toEqual([]);
          await fullShot(page, `economy-${screen.name}-${theme}-${language}-390`);
        }
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

/** 도시 창고 자리 하나에 물류센터 둘(하나는 받지 않음)과 거래소 건물을 붙인다(기획 D-576 — 서버는 그 도시에 물류센터가 있을 때만 싣는다) */
function withHaulCenters(data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const places: unknown = Reflect.get(data, "places");
  const list = Array.isArray(places) ? places : [];
  const unit = { unitG: 100_000, unitCells: 10 };
  Reflect.set(data, "places", [
    {
      key: "city_9001",
      kind: "city",
      id: 9001,
      cityId: 9001,
      mapKey: null,
      storage: false,
      facilityId: null,
      sale: false,
      exchangeId: 9002,
      haulCenters: [
        { buildingId: 9003, mine: false, perUnit: "1250000", workers: 3, currency: "AAA", ...unit },
        { buildingId: 9004, mine: true, perUnit: "0", workers: 0, currency: "AAA", ...unit },
      ],
      lines: [
        {
          asset: "item:pine_log",
          item: "pine_log",
          name: { ko: "소나무 통나무", en: "Pine log" },
          qty: "40",
        },
      ],
    },
    ...list,
  ]);
}

test.describe("물류센터 고르기(D-576)", () => {
  test.use({ account: "player" });

  for (const { theme, language } of [
    { theme: "pastel", language: "ko" },
    { theme: "dark", language: "en" },
  ] as const) {
    test.describe(`${theme}·${language}`, () => {
      test.use({ theme, language, viewport: { width: 390, height: 844 } });

      test("거래소로 옮기기에 운반 고르기: 받지 않는 곳은 막고, 계정 자동 맡기기를 켜면 처음 칸이 '없으면 물류센터'", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary, "facilities.overview": withHaulCenters });
        await page.goto("/economy/production");
        const moves = economy(page).locator('[data-part="facility-exchange-moves"]').first();
        await expect(moves).toBeVisible({ timeout: 30_000 });
        const pick = moves.locator('[data-part="facility-haul-pick"]');
        await expect(pick.locator("option")).toHaveCount(4);
        await expect(pick.locator("option").first()).toHaveText(message(language, "facility_haul_own"));
        await expect(pick).toHaveValue("own");
        await expect(pick.locator('option[value="9004"]')).toHaveAttribute("disabled", "");
        // 단위당 값 뒤에 나라 화폐 코드(기획 대조 2277)
        await expect(pick.locator('option[value="9003"]')).toContainText("AAA");
        await pick.selectOption("9003");
        await expect(pick).toHaveValue("9003");
        await expect(moves.locator('[data-part="facility-haul-unit"]')).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(moves, `economy-haul-pick-${theme}-${language}-390`);
        // 설정의 자동 맡기기(계정 설정 — 기획 대조 2272): 서버에 쓰고, 경제 화면의 처음 칸이 바뀐다
        await page.goto("/settings");
        const toggle = page.locator('[data-part="settings-auto-haul"]');
        const input = toggle.locator('input[name="auto-haul"]');
        await expect(input).toBeEnabled({ timeout: 30_000 });
        await expect(input).not.toBeChecked();
        await toggle.click();
        await expect(input).toBeChecked();
        await expect(input).toBeEnabled();
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(toggle, `settings-auto-haul-${theme}-${language}-390`);
        // 새로 열어도(다른 기기와 같이) 계정 값이 남는다
        await page.reload();
        await expect(page.locator('[data-part="settings-auto-haul"] input[name="auto-haul"]')).toBeChecked({
          timeout: 30_000,
        });
        await page.goto("/economy/production");
        await expect(economy(page).locator('[data-part="facility-haul-pick"]').first()).toHaveValue("auto", {
          timeout: 30_000,
        });
        // 다음 시험을 위해 끈다
        await page.goto("/settings");
        const again = page.locator('[data-part="settings-auto-haul"]');
        await expect(again.locator('input[name="auto-haul"]')).toBeChecked({ timeout: 30_000 });
        await again.click();
        await expect(again.locator('input[name="auto-haul"]')).not.toBeChecked();
        await expect(again.locator('input[name="auto-haul"]')).toBeEnabled();
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

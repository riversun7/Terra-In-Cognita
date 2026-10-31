// 앱 뼈대 W3 화면 시험 — 처리할 일(처리함 /inbox, 위 띠 종 배지)과 홈 자료 요청 묶음(ADR 2026-10-29-app-shell 6·7·10절,
// W3 검토 지적 1~4·8·9·11, 작업 기록 docs/worklog/2026/10/30-0030-app-shell-w3-review.md). 복귀 요약(8절)은 summary.spec.ts.
// 저장소 밖 확인 스크립트(그 기록의 fix.cjs 35개·break.cjs 8개)를 시험 틀로 옮긴 것이다.
// - 실제 계정의 처리함은 지금 늘 비어 있다(제공 함수 0개). 그래서 시안 자료로 본다: dev 계정 + 기기 표시(test.use의 preview).
//   8종류·5분류, 묶음 줄(명령 없는 유닛 6 등), 바로 처리 0~2개(apps/server/src/inbox/preview.ts).
//   시안 자료를 켜면 앱을 켤 때마다 복귀 요약이 뜬다 → 처리함을 보는 시험은 먼저 닫는다(closeSummary).
// - 서버가 아직 보내지 않는 값(모르는 분류·긴 이름·마감 시각)은 inbox.list 응답을 고쳐 넣는다(helpers/trpc.ts rewriteTrpc).
// - 문구는 메시지 원본에서 읽고(helpers/messages.ts), 자리는 처리함 화면(section.inbox) 안의 class·aria로 찾는다(홈 대시보드 W4도
//   처리할 일을 그리지만 이 파일은 /inbox만 본다. 홈의 묶음은 home-inbox-group* 클래스다)
//   (apps/game/src/inbox/InboxList.tsx·InboxScreen.tsx, 위 띠 종은 shell/TopBar.tsx).
import type { Locator, Page, Route } from "@playwright/test";
import { login } from "./helpers/auth.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { rewriteTrpc, trpcProcedures, trpcQuiet, watchTrpc } from "./helpers/trpc.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 시안 자료의 항목 ID(apps/server/src/inbox/preview.ts) */
const ITEM = {
  wave: "wave_incoming:preview_wave_1",
  siege: "siege_declared:preview_siege_1",
  spoiling: "goods_spoiling:preview_store_1",
  injured: "unit_injured:preview_base_1",
  stopped: "building_stopped:preview_base_2",
  idle: "unit_idle:preview_base_1",
  contract: "contract_match:preview_contract_1",
  craft: "craft_done:preview_event_1",
} as const;

/** inbox.list 응답(@terra/shared/inbox InboxListResponse와 같은 모양). 시험은 이것을 고쳐 돌려준다 */
interface InboxItemData {
  id: string;
  kind: string;
  category: string;
  count: number;
  deadlineAt: number | null;
  firstSeenAt: number;
  params: Record<string, string | number>;
  target: unknown;
  actions: string[];
  preview?: true;
}
interface InboxListData {
  generatedAt: number;
  items: InboxItemData[];
  counts: Record<string, number>;
  badges: Record<string, number>;
}

function isInboxList(value: unknown): value is InboxListData {
  if (typeof value !== "object" || value === null) return false;
  const counts: unknown = Reflect.get(value, "counts");
  return (
    typeof Reflect.get(value, "generatedAt") === "number" &&
    Array.isArray(Reflect.get(value, "items")) &&
    typeof counts === "object" &&
    counts !== null
  );
}

/** inbox.list data를 고치는 함수(rewriteTrpc에 넘긴다). 모양이 다르면 시험을 멈춘다 */
const editInbox =
  (edit: (data: InboxListData) => void) =>
  (data: unknown): void => {
    if (!isInboxList(data)) throw new Error("inbox.list 응답 모양이 시험이 아는 것과 다릅니다");
    edit(data);
  };

function itemOf(data: InboxListData, id: string): InboxItemData {
  const found = data.items.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`시안 자료에 ${id}가 없습니다(apps/server/src/inbox/preview.ts)`);
  return found;
}

/** 시안 자료 줄 제목(그 언어). 수는 시안 자료의 묶음 개수 */
function titles(language: Language) {
  return {
    wave: message(language, "inbox_wave_incoming_title"),
    siege: message(language, "inbox_siege_declared_title"),
    spoiling: message(language, "inbox_goods_spoiling_title", { count: 2 }),
    injured: message(language, "inbox_unit_injured_title", { count: 2 }),
    stopped: message(language, "inbox_building_stopped_title", { count: 1 }),
    idle: message(language, "inbox_unit_idle_title", { count: 6 }),
    contract: message(language, "inbox_contract_match_title"),
    craft: message(language, "inbox_craft_done_title"),
  };
}

/** 제목으로 처리할 일 줄 찾기 */
const rowOf = (page: Page, title: string): Locator =>
  page
    .locator("section.inbox .inbox-item")
    .filter({ has: page.locator(".inbox-item-title", { hasText: title }) });

/** 위 띠의 종(→ /inbox). 이름이 "알림 3개"처럼 수를 읽는다 */
const bellOf = (page: Page): Locator => page.locator('header.frame-top a[href="/inbox"]');

/** 시안 자료를 켜면 앱을 켤 때마다 뜨는 복귀 요약을 닫는다(Esc: 요약만 닫히고 보던 화면에 남는다, summary.spec.ts) */
async function closeSummary(page: Page): Promise<void> {
  const dialog = page.locator("dialog.summary-dialog");
  // 처음 켜는 맥락은 조각을 받느라 부하가 크면 오래 걸린다
  await expect(dialog).toHaveAttribute("open", "", { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

/** 처리함을 열고(시안 자료) 복귀 요약을 닫은 뒤 줄이 보일 때까지 */
async function openInbox(page: Page, path = "/inbox"): Promise<void> {
  await page.goto(path);
  await closeSummary(page);
  await expect(page.locator("section.inbox .inbox-item").first()).toBeVisible();
}

/** WebSocket 메시지 종류(t). JSON이 아니면 null */
function messageType(payload: string | Buffer): string | null {
  try {
    const value: unknown = JSON.parse(typeof payload === "string" ? payload : payload.toString("utf8"));
    const type: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "t") : undefined;
    return typeof type === "string" ? type : null;
  } catch {
    return null;
  }
}

/** 화면이 WebSocket으로 보낸 기능 메시지(게임 명령 등). 연결 인사(hello)·시계 맞추기(ping)는 뺀다 */
function watchCommands(page: Page): string[] {
  const sent: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const type = messageType(payload);
      if (type !== "hello" && type !== "ping") sent.push(typeof payload === "string" ? payload : "(binary)");
    });
  });
  return sent;
}

/** 화면이 연 WebSocket 연결 수와, 인사(welcome)를 받은 연결의 차례(0부터) */
function watchSockets(page: Page): { opened: number; welcomed: number[] } {
  const welcomed: number[] = [];
  const seen = { opened: 0, welcomed };
  page.on("websocket", (socket) => {
    const index = seen.opened;
    seen.opened += 1;
    socket.on("framereceived", ({ payload }) => {
      if (messageType(payload) === "welcome") welcomed.push(index);
    });
  });
  return seen;
}

/** 요소의 위·아래와, 가려지지 않고 보이는 띠(위 띠 아래 ~ 하단 탭·솟은 지도 버튼 위) */
function bandOf(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.querySelector("header.frame-top")?.getBoundingClientRect().bottom ?? 0;
    const covers = [...document.querySelectorAll(".tabbar, .tab-map-button")]
      .map((cover) => cover.getBoundingClientRect())
      .filter((rect) => rect.height > 0);
    const bottom = Math.min(window.innerHeight, ...covers.map((rect) => rect.top));
    return { top: box.top, bottom: box.bottom, bandTop: top, bandBottom: bottom };
  });
}

/** 지금 초점 요소: body면 "body", 아니면 id(없으면 태그) */
const focusedOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    return element.id === "" ? element.tagName.toLowerCase() : element.id;
  });

/** 화면이 두 번 그릴 때까지(그린 뒤 초점·스크롤을 맞추는 효과가 있으면 그사이에 돈다) */
const nextFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

/** 브라우저 Intl로 만든 "n 단위 후"(앱 formatDue와 같은 형식, apps/game/src/inbox/inboxText.ts) */
const relativeTime = (
  page: Page,
  language: Language,
  value: number,
  unit: "minute" | "hour" | "day",
): Promise<string> =>
  page.evaluate(
    ([locale, amount, timeUnit]) =>
      new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(amount, timeUnit),
    [language, value, unit] as const,
  );

/** summary.get data → 보일 것 없음(show: false). 복귀 요약 대화상자를 띄우지 않을 시험용 */
function hideSummary(data: unknown): void {
  if (typeof data !== "object" || data === null) throw new Error("summary.get 응답 모양이 다릅니다");
  Reflect.set(data, "show", false);
  Reflect.set(data, "sections", []);
}

/** tRPC 입력이 시안 자료를 묻는지({ preview: true }) */
const isPreviewInput = (input: unknown): boolean =>
  typeof input === "object" && input !== null && Reflect.get(input, "preview") === true;

test.describe("시안 자료(dev)", () => {
  test.use({ account: "dev", preview: "dev" });

  test("390px 목록 끝: 마지막 바로 처리 줄의 결과는 그 줄 안, 위 띠 아래·하단 탭 위에 보이고 명령은 보내지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    const commands = watchCommands(page);
    await openInbox(page);
    // 긴 목록의 끝까지 내린 사람이 마지막 바로 처리 줄을 누른다(검토 지적 1: 결과가 화면 위쪽 알림 영역에 생겨 보이지 않았다)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const row = page
      .locator(".inbox-item")
      .filter({ has: page.locator(".inbox-item-buttons button") })
      .last();
    await expect(row.locator(".inbox-item-title")).toHaveText(titles("ko").contract);
    await row.locator(".inbox-item-buttons button").last().click();
    // 결과는 그 줄의 알림 영역(늘 그려 둔 role=status)이 보이고 읽는다
    const feedback = row.locator(".inbox-item-feedback");
    await expect(feedback).toHaveAttribute("role", "status");
    await expect(feedback.locator(".message")).toHaveText(message("ko", "inbox_action_preview_done"));
    const band = await bandOf(feedback.locator(".message"));
    expect(band.top, JSON.stringify(band)).toBeGreaterThanOrEqual(band.bandTop);
    expect(band.bottom, JSON.stringify(band)).toBeLessThanOrEqual(band.bandBottom);
    // 다른 줄에는 결과가 없다
    await expect(page.locator("section.inbox .inbox-item-feedback .message")).toHaveCount(1);
    // 시안 자료는 명령을 보내지 않는다(바로 처리는 WebSocket으로만 보낸다, ADR 37 7절)
    expect(commands).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  for (const language of ["ko", "en"] as const) {
    test.describe(`언어 ${language}`, () => {
      test.use({ language });

      test("모르는 분류의 줄은 끝의 '그 밖의 알림'에 보이고, 종 배지 = 완료를 뺀 줄 수(묶음은 한 줄)", async ({
        page,
        deviceErrors,
      }) => {
        await rewriteTrpc(page, {
          "inbox.list": editInbox((data) => {
            // 더 새 서버가 보낸 분류(이 기기가 모른다). 아는 종류의 묶음 줄(3개)이다
            data.items.push({
              id: "unit_idle:e2e_unknown_category",
              kind: "unit_idle",
              category: "urgent_new",
              count: 3,
              deadlineAt: null,
              firstSeenAt: data.generatedAt,
              params: { place: "Vega" },
              target: null,
              actions: [],
            });
            data.counts["urgent_new"] = 1;
          }),
        });
        await openInbox(page);
        const groups = page.locator("section.inbox .inbox-group");
        const other = groups.last();
        await expect(other).toHaveAttribute("data-category", "other");
        await expect(other.locator(".inbox-group-name")).toHaveText(message(language, "inbox_group_other"));
        await expect(other.locator(".inbox-item-title")).toHaveText(
          message(language, "inbox_unit_idle_title", { count: 3 }),
        );
        // 받은 줄이 모두 보인다(시안 자료 8줄 + 1)
        const rows = page.locator("section.inbox .inbox-item");
        await expect(rows).toHaveCount(9);
        // 분류마다 줄 수 칩 = 그 분류의 줄 수
        for (const group of await groups.all()) {
          const count = await group.locator(".inbox-item").count();
          await expect(group.locator(".inbox-group-count")).toHaveText(String(count));
        }
        // 종 배지: 보이는 줄에서 완료 줄을 뺀 수(묶음 줄은 개수와 상관없이 한 줄)
        const done = await page
          .locator('section.inbox .inbox-group[data-category="done"] .inbox-item')
          .count();
        const expected = (await rows.count()) - done;
        expect(done).toBe(1);
        await expect(bellOf(page)).toHaveAttribute(
          "aria-label",
          message(language, "shell_alerts_count", { count: expected }),
        );
        await expect(bellOf(page).locator(".count-badge")).toHaveText(String(expected));
        expect(deviceErrors).toEqual([]);
      });

      test("마감은 내림해서 보인다: 2.5일 → 2일, 47.9시간 → 47시간, 91분 → 1시간, 59.5분 → 59분, 30초 → 1분 안에, 지남", async ({
        page,
        deviceErrors,
      }) => {
        await rewriteTrpc(page, {
          "inbox.list": editInbox((data) => {
            const due = (id: string, left: number): void => {
              itemOf(data, id).deadlineAt = data.generatedAt + left;
            };
            due(ITEM.wave, 2.5 * DAY);
            due(ITEM.injured, 47.9 * HOUR);
            due(ITEM.siege, 91 * MINUTE);
            due(ITEM.spoiling, 59.5 * MINUTE);
            due(ITEM.contract, 30_000);
            due(ITEM.stopped, -1);
          }),
        });
        await openInbox(page);
        const title = titles(language);
        const dueOf = (name: string): Locator => rowOf(page, name).locator(".inbox-item-due");
        const deadline = async (value: number, unit: "minute" | "hour" | "day"): Promise<string> =>
          message(language, "inbox_deadline", { time: await relativeTime(page, language, value, unit) });
        await expect(dueOf(title.wave)).toHaveText(await deadline(2, "day"));
        await expect(dueOf(title.injured)).toHaveText(await deadline(47, "hour"));
        await expect(dueOf(title.siege)).toHaveText(await deadline(1, "hour"));
        await expect(dueOf(title.spoiling)).toHaveText(await deadline(59, "minute"));
        await expect(dueOf(title.contract)).toHaveText(message(language, "inbox_deadline_soon"));
        await expect(dueOf(title.stopped)).toHaveText(message(language, "inbox_overdue"));
        expect(deviceErrors).toEqual([]);
      });
    });
  }

  test("요청 조각 받기가 멈추면 10초쯤에 실패 + [다시 시도], 늦게 온 조각으로 복귀 요약을 띄우지 않고 [다시 시도]로 받는다", async ({
    page,
    deviceErrors,
  }) => {
    // 홈 자료 조회 조각(net/homeQueries.ts)에 답하지 않는다. 처리함 화면 조각은 그대로 온다
    const stalled: Route[] = [];
    await page.route(/\/assets\/homeQueries-[\w-]+\.js$/, (route) => {
      stalled.push(route);
    });
    const started = Date.now();
    await page.goto("/inbox");
    const screen = page.locator("section.inbox");
    await expect(screen.locator('p.status[role="status"]')).toHaveText(message("ko", "inbox_loading"));
    // 저장소가 10초에 끊는다(store.ts INBOX_REQUEST_TIMEOUT_MS). 부하를 생각해 15초까지 기다린다
    const alert = screen.locator('[role="alert"]');
    await expect(alert).toContainText(message("ko", "inbox_load_failed"), { timeout: 15_000 });
    const retry = screen.getByRole("button", { name: message("ko", "retry"), exact: true });
    await expect(retry).toBeVisible();
    // 잰 값(작업 기록용): goto부터 실패 문구까지
    console.log(`[e2e] 처리함 실패 + [다시 시도]까지 ${Date.now() - started}ms`);
    expect(stalled.length).toBeGreaterThan(0);
    await expect(page.locator("dialog.summary-dialog")).toHaveCount(0);
    // 이제 조각을 보낸다: 복귀 요약 문은 이미 그만뒀으므로 늦게 받은 요약(show: true)을 띄우지 않는다
    const lateSummary = page.waitForResponse(
      (response) => trpcProcedures(response.url())?.includes("summary.get") === true,
    );
    for (const route of stalled) await route.continue();
    await lateSummary;
    // 늦게 받은 요약이 떠서(고장) 화면을 덮으면 여기서 멈춘다
    await retry.click({ timeout: 10_000 });
    await expect(screen.locator(".inbox-item").first()).toBeVisible();
    await expect(alert).toBeEmpty();
    await expect(retry).toHaveCount(0);
    await expect(page.locator("dialog.summary-dialog")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("주소로 바로 연 ?item=: 그 줄만 aria-current와 숨은 글 '찾는 항목:', 초점은 그대로. 앱 안에서 다른 줄로 가면 그 줄 제목에 초점", async ({
    page,
    deviceErrors,
  }) => {
    const title = titles("ko");
    const opened = message("ko", "inbox_item_opened");
    await rewriteTrpc(page, {
      // 복귀 요약은 띄우지 않는다: 대화상자가 초점을 가져가면 처리함이 초점을 옮기지 않는지 볼 수 없다
      "summary.get": hideSummary,
      // 갈 화면이 없는 의뢰 줄이 처리함의 다른 줄(제작 완료)을 가리키게 한다(앱 안에서 ?item=으로 가는 길)
      "inbox.list": editInbox((data) => {
        itemOf(data, ITEM.contract).target = { route: "inbox", search: { item: ITEM.craft } };
      }),
    });
    const summaryAnswered = page.waitForResponse(
      (response) => trpcProcedures(response.url())?.includes("summary.get") === true,
    );
    await page.goto(`/inbox?${new URLSearchParams({ item: ITEM.idle }).toString()}`);
    await summaryAnswered;
    const current = page.locator('section.inbox .inbox-item[aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current.locator(".inbox-item-title")).toHaveId("inbox-highlight");
    await expect(current.locator(".inbox-item-title .visually-hidden")).toHaveText(opened);
    await expect(current.locator(".inbox-item-title")).toHaveAccessibleName(`${opened} ${title.idle}`);
    await expect(current).toHaveAttribute("data-highlight", "true");
    // 강조한 줄은 화면 가운데로 온다
    await expect(current).toBeInViewport();
    // 바로 연 주소는 초점을 옮기지 않는다(ADR 37 1절)
    await nextFrames(page);
    expect(await focusedOf(page)).toBe("body");

    await rowOf(page, title.contract).locator("a.inbox-item-link").click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/inbox" && url.searchParams.get("item") === ITEM.craft,
    );
    await expect.poll(() => focusedOf(page)).toBe("inbox-highlight");
    await expect(current).toHaveCount(1);
    await expect(current.locator(".inbox-item-title")).toHaveAccessibleName(`${opened} ${title.craft}`);
    await expect(page.locator(":focus")).toHaveAccessibleName(`${opened} ${title.craft}`);
    await expect(rowOf(page, title.idle)).not.toHaveAttribute("aria-current", "true");
    expect(deviceErrors).toEqual([]);
  });

  test("처리함 화면의 영역(region) 표지는 하나다: 분류 묶음은 표지가 아니라 h2 제목으로 나눈다", async ({
    page,
  }) => {
    await openInbox(page);
    const regions = page.locator("#main").getByRole("region");
    await expect(regions).toHaveCount(1);
    await expect(regions).toHaveAccessibleName(message("ko", "inbox_title"));
    const groups = await page.locator("section.inbox .inbox-group").count();
    expect(groups).toBe(5);
    await expect(page.locator("section.inbox .inbox-group > h2.inbox-group-title")).toHaveCount(groups);
  });
});

test.describe("요청 묶음", () => {
  test.describe("로그인 직후", () => {
    // 로그인할 dev 계정의 시안 자료 표시를 미리 넣는다(로그인 전 기기)
    test.use({ preview: "dev" });

    test("inbox.list와 summary.get이 한 HTTP 요청이고 inbox.list는 한 번이다(다시 맺은 연결이 또 받지 않는다)", async ({
      page,
      deviceErrors,
    }) => {
      const calls = watchTrpc(page);
      const sockets = watchSockets(page);
      await page.goto("/");
      // 로그인 화면의 연결이 인사를 마친 뒤 들어간다(그래야 로그인 뒤 다시 맺는 연결을 가려낼 수 있다)
      await expect.poll(() => sockets.welcomed.length, { timeout: 20_000 }).toBeGreaterThan(0);
      const openedBefore = sockets.opened;
      await login(page, "dev");
      await expect(page.locator("dialog.summary-dialog")).toHaveAttribute("open", "", { timeout: 20_000 });
      // 로그인한 계정으로 다시 맺은 연결이 인사를 마쳤다(그때 처리할 일을 또 받던 것이 검토 지적 4)
      await expect
        .poll(() => sockets.welcomed.some((index) => index >= openedBefore), { timeout: 20_000 })
        .toBe(true);
      await trpcQuiet(calls);
      const inbox = calls.filter((call) => call.procedures.includes("inbox.list"));
      expect(inbox.map((call) => call.procedures)).toEqual([
        expect.arrayContaining(["inbox.list", "summary.get"]),
      ]);
      expect(calls.filter((call) => call.procedures.includes("summary.get"))).toHaveLength(1);
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("저장한 세션으로 켤 때", () => {
    test.use({ account: "dev", preview: "dev" });

    test("inbox.list와 summary.get이 한 HTTP 요청이고 inbox.list는 한 번이다", async ({
      page,
      deviceErrors,
    }) => {
      const calls = watchTrpc(page);
      const sockets = watchSockets(page);
      await page.goto("/");
      await expect(page.locator("dialog.summary-dialog")).toHaveAttribute("open", "", { timeout: 20_000 });
      await expect.poll(() => sockets.welcomed.length, { timeout: 20_000 }).toBeGreaterThan(0);
      await trpcQuiet(calls);
      const inbox = calls.filter((call) => call.procedures.includes("inbox.list"));
      expect(inbox.map((call) => call.procedures)).toEqual([
        expect.arrayContaining(["inbox.list", "summary.get"]),
      ]);
      expect(calls.filter((call) => call.procedures.includes("summary.get"))).toHaveLength(1);
      expect(deviceErrors).toEqual([]);
    });
  });
});

test.describe("플레이어", () => {
  // 기기에 자기 계정의 시안 자료 표시가 남아 있어도(역할이 dev·admin이 아니면 꺼진 것으로 본다, inbox/preview.ts)
  test.use({ account: "player", preview: "player" });

  test("빈 처리함, 종 배지·메뉴 배지 없음, 복귀 요약 없음, 시안 자료 요청 없음", async ({
    page,
    deviceErrors,
  }) => {
    const calls = watchTrpc(page);
    const summaryAnswered = page.waitForResponse(
      (response) => trpcProcedures(response.url())?.includes("summary.get") === true,
    );
    await page.goto("/inbox");
    await expect(page.locator("section.inbox .inbox-empty-title")).toHaveText(message("ko", "inbox_empty"));
    await summaryAnswered;
    await expect(bellOf(page)).toHaveAttribute("aria-label", message("ko", "shell_alerts"));
    await expect(page.locator(".count-badge")).toHaveCount(0);
    await expect(page.locator("section.inbox .inbox-notice")).toHaveCount(0);
    await trpcQuiet(calls);
    await expect(page.locator("dialog.summary-dialog")).toHaveCount(0);
    expect(calls.filter((call) => call.inputs.some(isPreviewInput)).map((call) => call.procedures)).toEqual(
      [],
    );
    // 플레이어도 처리할 일·복귀 요약은 한 요청이다
    expect(
      calls.filter((call) => call.procedures.includes("inbox.list")).map((call) => call.procedures),
    ).toEqual([expect.arrayContaining(["inbox.list", "summary.get"])]);
    expect(deviceErrors).toEqual([]);
  });
});

/** 사람이 지은 긴 이름(번역하지 않는다, D-6046) — break-ui 값. 띄어쓰기 있는 것과 없는 것 */
const LONG_PLACE = "Aleksandra Wiśniewska-Kowalczyk의 북쪽 창고 (Northwind Industries Holdings)";
const LONG_WORD = "Aleksandra_Wisniewska_Kowalczyk_Northwind_Industries_Holdings_North_Warehouse";
/** 강조할 줄: 모르는 분류의 큰 묶음 */
const BIG_ITEM = "unit_idle:e2e_big";

/** 그럴듯한 최악의 자료: 긴 이름(띄어쓰기 없는 것 포함), 큰 수, 모르는 분류 2가지·모르는 종류·모르는 주소·모르는 동작, 30초·지난 마감 */
function worstCase(data: InboxListData): void {
  const now = data.generatedAt;
  const contract = itemOf(data, ITEM.contract);
  contract.params = { place: LONG_PLACE };
  contract.deadlineAt = now + 30_000;
  itemOf(data, ITEM.wave).params = { place: LONG_WORD };
  data.items.push(
    {
      id: BIG_ITEM,
      kind: "unit_idle",
      category: "urgent_new",
      count: 1284,
      deadlineAt: now + 59.5 * MINUTE,
      firstSeenAt: now,
      params: { place: LONG_PLACE },
      target: { route: "units" },
      actions: ["auto_assign"],
      preview: true,
    },
    {
      id: "brand_new_kind:e2e_unknown",
      kind: "brand_new_kind",
      category: "rumor",
      count: 3,
      deadlineAt: null,
      firstSeenAt: now,
      params: { place: "SECRET" },
      target: { route: "guild_hall" },
      actions: ["haggle"],
      preview: true,
    },
    {
      id: "craft_done:e2e_overdue",
      kind: "craft_done",
      category: "urgent_new",
      count: 1,
      deadlineAt: now - 1,
      firstSeenAt: now,
      params: {},
      target: null,
      actions: [],
    },
  );
  data.counts["urgent_new"] = 2;
  data.counts["rumor"] = 1;
}

/** 줄·분류 제목 밖으로 삐져나온 요소와 잘린 글(scrollWidth > clientWidth). 1px 이하로 숨긴 글은 뺀다 */
function textProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const box of document.querySelectorAll(
      "section.inbox .inbox-item, section.inbox .inbox-group-title",
    )) {
      const outer = box.getBoundingClientRect();
      for (const element of box.querySelectorAll("*")) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const outside = rect.left < outer.left - 0.5 || rect.right > outer.right + 0.5;
        const clipped = element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
        if (!outside && !clipped) continue;
        const text = (element.textContent ?? "").trim().slice(0, 24);
        const name = `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} "${text}"`;
        if (outside) problems.push(`${name} 줄 밖 ${Math.round(rect.left)}~${Math.round(rect.right)}px`);
        if (clipped) problems.push(`${name} 잘림 ${element.scrollWidth}>${element.clientWidth}px`);
      }
    }
    return problems;
  });
}

const LAYOUTS: readonly { theme: Theme; language: Language; width: number }[] = [
  { theme: "pastel", language: "ko", width: 390 },
  { theme: "pastel", language: "en", width: 390 },
  { theme: "dark", language: "ko", width: 390 },
  { theme: "dark", language: "en", width: 390 },
  { theme: "pastel", language: "ko", width: 320 },
  { theme: "dark", language: "en", width: 320 },
];

test.describe("배치(긴 글)", () => {
  test.use({ account: "dev", preview: "dev" });

  for (const { theme, language, width } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ theme, language, viewport: { width, height: 844 } });

      test("긴 이름·큰 수·모르는 분류·결과 상자: 가로 넘침·작은 누르는 곳·줄 밖 글 없음, 모르는 값은 쓰지 않는다, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await rewriteTrpc(page, { "inbox.list": editInbox(worstCase) });
        await openInbox(page, `/inbox?${new URLSearchParams({ item: BIG_ITEM }).toString()}`);
        const highlighted = page.locator('section.inbox .inbox-item[aria-current="true"]');
        await expect(highlighted.locator(".inbox-item-title")).toHaveText(
          `${message(language, "inbox_item_opened")} ${message(language, "inbox_unit_idle_title", {
            count: new Intl.NumberFormat(language).format(1284),
          })}`,
        );
        // 결과 상자: 강조한 줄(버튼 1개)과 긴 이름 줄(버튼 2개를 차례로)
        await highlighted.locator(".inbox-item-buttons button").click();
        const contract = rowOf(page, message(language, "inbox_contract_match_title"));
        await contract.locator(".inbox-item-buttons button").first().click();
        await contract.locator(".inbox-item-buttons button").last().click();
        const done = message(language, "inbox_action_preview_done");
        await expect(highlighted.locator(".inbox-item-feedback .message")).toHaveText(done);
        await expect(contract.locator(".inbox-item-feedback .message")).toHaveText(done);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));

        // 모르는 분류 2가지는 "그 밖의 알림" 한 묶음(3줄), 종 배지는 완료를 뺀 줄 수(11 − 1)
        await expect(
          page.locator('section.inbox .inbox-group[data-category="other"] .inbox-item'),
        ).toHaveCount(3);
        await expect(page.locator("section.inbox .inbox-item")).toHaveCount(11);
        await expect(bellOf(page)).toHaveAttribute(
          "aria-label",
          message(language, "shell_alerts_count", { count: 10 }),
        );
        expect(await horizontalOverflow(page)).toEqual([]);
        // 줄 제목 링크는 ::after가 줄 전체(최소 높이 --tap-size)를 덮는다 → 링크 글자 상자는 재지 않는다
        expect(await smallTapTargets(page, { ignore: ".inbox-item-link" })).toEqual([]);
        expect(await textProblems(page)).toEqual([]);
        // 모르는 종류의 값(SECRET)·모르는 주소(guild_hall)는 그리지 않는다
        const html = await page.locator("section.inbox").innerHTML();
        expect(html).not.toContain("SECRET");
        expect(html).not.toContain("guild_hall");

        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await shot(page, `inbox-${theme}-${language}-${width}`);
        await highlighted.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await shot(page, `inbox-${theme}-${language}-${width}-row`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

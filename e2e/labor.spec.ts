// 노동 계약 화면 시험 — 생산 칸 아래 "노동 계약"(docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48, 338~342).
// - admin: 시험 일꾼을 받고(dev_spawn_units, 일꾼마다 시험 화폐 24) 시험 건물을 놓은 뒤(place_building, 놓은 사람 것),
//   화면에서 임금형을 맺고(보증금 = 임금 × 30일, 첫 임금 선불) 보증금을 채우고 내 시설 임대료를 정하고 구인을 낸다.
// - player: 사이보그 본체로 admin 시설을 임대형으로 빌렸다가 해지한다 → 7일 유예(기획 341, 유예는 손으로 끝내지 않는다).
//   그다음 구인 게시판에서 admin 일자리를 본체로 받는다 → 임금형(고용주 = admin, 역할 "내 유닛").
//   dev에게는 일꾼을 주지 않는다(vision.spec.ts가 dev의 처음 유닛 수를 기준으로 본다).
// - 끝에 admin이 임금형 둘을 해지한다(남은 보증금은 돌아온다, 본체는 다시 쉰다). 유예 중인 임대는 돈이 오가지 않아 그대로 둔다.
//   넓은 화면 시험이 볼 수 있게 구인 하나를 열어 둔다.
// - 사진(E2E_SHOTS_DIR): 390 파스텔 한국어(admin·player), 390 다크 영어(admin·player), 1440 파스텔 한국어·다크 영어(admin·player).
import type { Browser, Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { type Language, type Theme, deviceOptions, expect, test, watchDeviceErrors } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 시험 2차맵 키(@terra/protocol S1_TEST_MAP_KEY = S2 시험 행성 F9 면 0 (282, 328)) */
const S1_TEST_MAP_KEY = 312_905_547_382_793;

/** 브라우저의 Intl 단위 글(앱 formatDuration과 같은 방법, helpers/messages.ts 머리 주석) */
function unitText(page: Page, value: number, unit: "day" | "hour", locale = "ko"): Promise<string> {
  return page.evaluate(
    ([amount, name, lang]) =>
      new Intl.NumberFormat(lang, { style: "unit", unit: name, unitDisplay: "short" }).format(amount),
    [value, unit, locale] as const,
  );
}

/** 브라우저에서 WebSocket 명령을 차례로 보낸다(같은 출처라 쿠키가 실린다). 결과 메시지들 */
async function sendCommands(page: Page, commands: readonly Record<string, unknown>[]): Promise<unknown[]> {
  await page.goto("/health");
  return page.evaluate(async (list) => {
    const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
    const replies: unknown[] = [];
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") replies.push(JSON.parse(event.data));
    });
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const wait = (predicate: (message: unknown) => boolean): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no reply")), 15_000);
        const check = (): void => {
          const found = replies.find(predicate);
          if (found === undefined) setTimeout(check, 20);
          else {
            clearTimeout(timer);
            resolve(found);
          }
        };
        check();
      });
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    socket.send(JSON.stringify({ t: "hello", protocolVersion: 8, clientBuild: "e2e-labor" }));
    await wait(
      (reply) => typeof reply === "object" && reply !== null && Reflect.get(reply, "t") === "welcome",
    );
    const out: unknown[] = [];
    for (const [index, command] of list.entries()) {
      const id = 9000 + index;
      socket.send(JSON.stringify({ ...command, id }));
      out.push(
        await wait(
          (reply) =>
            typeof reply === "object" &&
            reply !== null &&
            Reflect.get(reply, "t") === "result" &&
            Reflect.get(reply, "id") === id,
        ),
      );
    }
    socket.close();
    return out;
  }, commands);
}

/** 시험 건물을 빈 칸에 놓는다(지형·유닛에 막히면 다음 자리). 건물 ID */
async function placeBuilding(page: Page): Promise<number> {
  for (const cell of [24, 40, 56, 72, 180, 200, 220]) {
    const [reply] = await sendCommands(page, [
      { t: "place_building", mapKey: S1_TEST_MAP_KEY, x: cell, y: cell, width: 2, height: 2, rotation: 0 },
    ]);
    const id = typeof reply === "object" && reply !== null ? Reflect.get(reply, "buildingId") : undefined;
    if (typeof id === "number") return id;
  }
  throw new Error("no free cell for the test building");
}

const panel = (page: Page): Locator => page.locator('section[data-part="labor"]');

async function openLabor(page: Page): Promise<Locator> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  const labor = panel(page);
  await expect(labor.locator('[data-part="labor-balance"]')).toBeVisible({ timeout: 15_000 });
  return labor;
}

/** 다른 계정의 두 번째 기기(같은 크기·테마·언어) */
async function otherDevice(
  browser: Browser,
  options: { theme: Theme; language: Language; viewport: keyof typeof VIEWPORTS },
) {
  const context = await browser.newContext({
    ...VIEWPORTS[options.viewport],
    ...deviceOptions({ account: "player", theme: options.theme, language: options.language }),
  });
  return { context, errors: watchDeviceErrors(context), page: await context.newPage() };
}

test.describe("노동 계약", () => {
  test.use({ account: "admin" });

  test("admin 임금형·임대료·구인 → player 임대 해지(유예) → 구인 받기 → admin 해지", async ({
    page,
    browser,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    // 일꾼 60(시험 화폐 1,440: 내 임금형 보증금 480 + 채우기 10 + 구인 받힘 보증금 720) + 시험 건물
    const spawned = await sendCommands(page, [
      { t: "dev_spawn_units", mapKey: S1_TEST_MAP_KEY, count: 20 },
      { t: "dev_spawn_units", mapKey: S1_TEST_MAP_KEY, count: 20 },
      { t: "dev_spawn_units", mapKey: S1_TEST_MAP_KEY, count: 20 },
    ]);
    expect(spawned.every((reply) => Reflect.get(Object(reply), "ok") === true)).toBe(true);
    const buildingId = await placeBuilding(page);
    const day = await unitText(page, 1, "day");

    const labor = await openLabor(page);
    await expect(labor.getByRole("heading", { name: message("ko", "labor_title") })).toBeVisible();
    // 새 계약: 임금형(기본), 내 시설, 쉬는 유닛, 조정 800‰ → 임금 16/일, 보증금 480
    const form = labor.locator("form.labor-form").first();
    // 건물 시험(facilities.spec.ts)이 먼저 지은 admin 공방도 내 시설이라 시험 건물을 고른다
    await form.getByLabel(message("ko", "labor_field_building")).selectOption(String(buildingId));
    await form.getByLabel(message("ko", "labor_field_adjust", { min: 800, max: 1500 })).fill("800");
    await expect(form.locator('[data-part="labor-preview"]')).toHaveText(
      message("ko", "labor_preview_wage", { wage: "16", cycle: day, deposit: "480" }),
    );
    await form.getByRole("button", { name: message("ko", "labor_create") }).click();
    await expect(labor.locator('[role="status"]')).toContainText(message("ko", "labor_done"));
    const wageRow = labor.locator('li.labor-contract[data-state="active"]').first();
    await expect(wageRow).toContainText(message("ko", "labor_kind_wage"));
    // 첫 임금(16)을 선불로 내서 보증금 464, 29번 남음
    await expect(wageRow).toContainText(message("ko", "labor_deposit", { amount: "464", cycles: 29 }));

    // 보증금 채우기 10 → 474
    await wageRow.getByLabel(message("ko", "labor_amount_label")).fill("10");
    await wageRow.getByRole("button", { name: message("ko", "labor_top_up") }).click();
    await expect(wageRow).toContainText(message("ko", "labor_deposit", { amount: "474", cycles: 29 }));

    // 내 시설 임대료 5/시간
    // 건물 시험이 지은 admin 공방도 임대료 줄이 있어 시험 건물 줄만 고른다
    const rents = labor.locator(`.labor-rents li:has(#labor-rent-${buildingId})`);
    await rents.getByLabel(message("ko", "labor_option_building", { id: buildingId })).fill("5");
    await rents.getByRole("button", { name: message("ko", "labor_rent_save") }).click();
    await expect(rents).toContainText(message("ko", "labor_rent_now", { rent: "5" }));

    // 구인 내기: 조정 1200‰ → 기준 유닛 임금 24/일, 한 명에 보증금 720, 자리 1
    const myJobs = labor.locator('[data-part="labor-my-jobs"]');
    await expect(myJobs).toContainText(message("ko", "labor_my_jobs_empty"));
    const post = myJobs.locator('form[data-part="labor-post"]');
    await post.getByLabel(message("ko", "labor_field_building")).selectOption(String(buildingId));
    await post.getByLabel(message("ko", "labor_field_adjust", { min: 800, max: 1500 })).fill("1200");
    await expect(post.locator('[data-part="labor-post-preview"]')).toHaveText(
      message("ko", "labor_post_preview", { wage: "24", cycle: day, deposit: "720" }),
    );
    await post.getByRole("button", { name: message("ko", "labor_post_submit") }).click();
    const posted = myJobs.locator("li.labor-job");
    await expect(posted).toHaveCount(1);
    await expect(posted).toContainText(message("ko", "labor_job_slots", { filled: 0, slots: 1 }));
    await expect(posted).toContainText(message("ko", "labor_job_deposit", { amount: "720" }));
    // 내 구인은 내 게시판에 보이지 않는다
    await expect(labor.locator('[data-part="labor-board"]')).toContainText(message("ko", "labor_jobs_empty"));
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(labor, "labor-admin-pastel-ko-390");

    // player: 사이보그 본체로 admin 시설을 빌린 뒤 해지 → 유예(손으로 끝내지 않는다)
    const tenant = await otherDevice(browser, { theme: "pastel", language: "ko", viewport: "phone" });
    const leasePanel = await openLabor(tenant.page);
    const leaseForm = leasePanel.locator("form.labor-form").first();
    await leaseForm.getByLabel(message("ko", "labor_field_kind")).selectOption("lease");
    await expect(leaseForm.getByLabel(message("ko", "labor_field_building"))).toHaveValue(String(buildingId));
    await expect(leaseForm.locator('[data-part="labor-preview"]')).toHaveText(
      message("ko", "labor_preview_lease", { rent: "5", cycle: await unitText(tenant.page, 1, "hour") }),
    );
    await leaseForm.getByRole("button", { name: message("ko", "labor_create") }).click();
    const leaseRow = leasePanel.locator("li.labor-contract").first();
    await expect(leaseRow).toContainText(message("ko", "labor_kind_lease"));
    await expect(leaseRow).toContainText(message("ko", "labor_state_active"));
    await expect(leaseRow).toContainText(message("ko", "labor_role_worker"));
    await expect(leaseRow).toContainText(
      message("ko", "labor_terminate_grace_hint", { grace: await unitText(tenant.page, 7, "day") }),
    );
    await leaseRow.getByRole("button", { name: message("ko", "labor_terminate") }).click();
    await expect(leaseRow).toContainText(message("ko", "labor_state_grace"));
    await expect(leaseRow).toContainText(message("ko", "labor_end_worker"));
    await expect(leaseRow).toContainText(message("ko", "labor_grace_note"));
    await expect(leaseRow.getByRole("button", { name: message("ko", "labor_terminate") })).toHaveCount(0);

    // 구인 게시판: admin 일자리(임금 24/일, 자리 0/1)를 본체로 받는다(유예 중인 유닛은 묶이지 않는다)
    const board = leasePanel.locator('[data-part="labor-board"]');
    const job = board.locator("li.labor-job");
    await expect(job).toHaveCount(1);
    await expect(job).toContainText(message("ko", "labor_rate_wage", { amount: "24", cycle: day }));
    await expect(job).toContainText(message("ko", "labor_job_slots", { filled: 0, slots: 1 }));
    await elementShot(board, "labor-board-pastel-ko-390");
    await job.getByRole("button", { name: message("ko", "labor_job_accept") }).click();
    await expect(leasePanel.locator('[role="status"]')).toContainText(message("ko", "labor_done"));
    const hired = leasePanel.locator('li.labor-contract[data-state="active"]');
    await expect(hired).toHaveCount(1);
    await expect(hired).toContainText(message("ko", "labor_kind_wage"));
    await expect(hired).toContainText(message("ko", "labor_role_worker"));
    await expect(board).toContainText(message("ko", "labor_jobs_empty"));
    expect(await horizontalOverflow(tenant.page)).toEqual([]);
    await elementShot(leasePanel, "labor-player-pastel-ko-390");
    await tenant.context.close();
    expect(tenant.errors).toEqual([]);

    // admin: 내 시설 계약 셋(내 임금형, player 임대 유예, player 유닛을 고용한 임금형). 임금형 둘을 해지한다
    await page.reload();
    const adminPanel = panel(page);
    await expect(adminPanel.locator('li.labor-contract[data-state="grace"]')).toHaveCount(1);
    await expect(adminPanel.locator('[data-part="labor-my-jobs"]')).toContainText(
      message("ko", "labor_my_jobs_empty"),
    );
    const active = adminPanel.locator('li.labor-contract[data-state="active"]');
    await expect(active).toHaveCount(2);
    await active
      .first()
      .getByRole("button", { name: message("ko", "labor_terminate") })
      .click();
    await expect(active).toHaveCount(1);
    await active
      .first()
      .getByRole("button", { name: message("ko", "labor_terminate") })
      .click();
    await expect(active).toHaveCount(0);
    await expect(adminPanel.locator('li.labor-contract[data-state="ended"]')).toHaveCount(2);

    // 넓은 화면 시험이 볼 구인 하나를 열어 둔다(자리 2, 기간 72시간)
    const repost = adminPanel.locator('form[data-part="labor-post"]');
    await repost.getByLabel(message("ko", "labor_field_building")).selectOption(String(buildingId));
    await repost.getByLabel(message("ko", "labor_field_slots")).fill("2");
    await repost.getByLabel(message("ko", "labor_field_term")).fill("72");
    await repost.getByRole("button", { name: message("ko", "labor_post_submit") }).click();
    await expect(adminPanel.locator('[data-part="labor-my-jobs"] li.labor-job')).toHaveCount(1);
    expect(deviceErrors).toEqual([]);
  });

  for (const look of [
    { theme: "dark", language: "en", viewport: "phone", width: 390 },
    { theme: "pastel", language: "ko", viewport: "desktop", width: 1440 },
    { theme: "dark", language: "en", viewport: "desktop", width: 1440 },
  ] as const) {
    test.describe(`${look.theme}·${look.language}·${look.width}`, () => {
      test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS[look.viewport] });

      test("admin 계약·내 구인과 player 게시판이 넘치지 않는다(사진)", async ({
        page,
        browser,
        deviceErrors,
      }) => {
        const tag = `${look.theme}-${look.language}-${look.width}`;
        const labor = await openLabor(page);
        await expect(
          labor.getByRole("heading", { name: message(look.language, "labor_title") }),
        ).toBeVisible();
        await expect(labor.locator('li.labor-contract[data-state="grace"]')).toContainText(
          message(look.language, "labor_grace_note"),
        );
        await expect(labor.locator('[data-part="labor-my-jobs"] li.labor-job')).toHaveCount(1);
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(labor, `labor-admin-${tag}`);

        const worker = await otherDevice(browser, look);
        const board = (await openLabor(worker.page)).locator('[data-part="labor-board"]');
        await expect(board.locator("li.labor-job")).toHaveCount(1);
        await expect(board).toContainText(message(look.language, "labor_job_slots", { filled: 0, slots: 2 }));
        expect(await horizontalOverflow(worker.page)).toEqual([]);
        await elementShot(panel(worker.page), `labor-player-${tag}`);
        await worker.context.close();
        expect(worker.errors).toEqual([]);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

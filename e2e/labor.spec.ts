// 노동 계약 화면 시험 — 생산 칸 아래 "노동 계약"(docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48).
// - admin: 시험 일꾼을 받고(dev_spawn_units, 일꾼마다 시험 화폐 24) 시험 건물을 놓은 뒤(place_building, 놓은 사람 것),
//   화면에서 임금형을 맺고(보증금 = 임금 × 30일, 첫 임금 선불) 보증금을 채우고 내 시설 임대료를 정한다.
// - player: 사이보그 본체로 admin 시설을 임대형으로 빌린다(시간당 임대료, 첫 시간 선불). dev에게는 일꾼을 주지 않는다
//   (vision.spec.ts가 dev의 처음 유닛 수를 기준으로 본다).
// - 끝에 두 계약을 해지한다(뒤 시험의 잔고를 건드리지 않게: 임대료가 계속 나가지 않고, 남은 보증금은 돌아온다).
// - 사진: 390 × 파스텔 한국어(admin·player), 다크 영어(admin)(E2E_SHOTS_DIR).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { deviceOptions, expect, test, watchDeviceErrors } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 시험 2차맵 키(@terra/protocol S1_TEST_MAP_KEY = S2 시험 행성 F9 면 0 (282, 328)) */
const S1_TEST_MAP_KEY = 312_905_547_382_793;

/** 브라우저의 Intl 단위 글(앱 formatDuration과 같은 방법, helpers/messages.ts 머리 주석) */
function unitText(page: Page, value: number, unit: "day" | "hour"): Promise<string> {
  return page.evaluate(
    ([amount, name]) =>
      new Intl.NumberFormat("ko", { style: "unit", unit: name, unitDisplay: "short" }).format(amount),
    [value, unit] as const,
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
    socket.send(JSON.stringify({ t: "hello", protocolVersion: 7, clientBuild: "e2e-labor" }));
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

test.describe("노동 계약", () => {
  test.use({ account: "admin" });

  test("admin 임금형(맺기·보증금 채우기·임대료 정하기) → player 임대형 → 둘 다 해지", async ({
    page,
    browser,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    // 일꾼 40(시험 화폐 960) + 시험 건물
    const spawned = await sendCommands(page, [
      { t: "dev_spawn_units", mapKey: S1_TEST_MAP_KEY, count: 20 },
      { t: "dev_spawn_units", mapKey: S1_TEST_MAP_KEY, count: 20 },
    ]);
    expect(spawned.every((reply) => Reflect.get(Object(reply), "ok") === true)).toBe(true);
    const buildingId = await placeBuilding(page);

    const labor = await openLabor(page);
    await expect(labor.getByRole("heading", { name: message("ko", "labor_title") })).toBeVisible();
    // 새 계약: 임금형(기본), 내 시설, 쉬는 유닛, 조정 800‰ → 임금 16/일, 보증금 480
    const form = labor.locator("form.labor-form");
    await expect(form.getByLabel(message("ko", "labor_field_building"))).toHaveValue(String(buildingId));
    await form.getByLabel(message("ko", "labor_field_adjust", { min: 800, max: 1500 })).fill("800");
    await expect(form.locator('[data-part="labor-preview"]')).toHaveText(
      message("ko", "labor_preview_wage", {
        wage: "16",
        cycle: await unitText(page, 1, "day"),
        deposit: "480",
      }),
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
    const rents = labor.locator(".labor-rents");
    await rents.getByLabel(message("ko", "labor_option_building", { id: buildingId })).fill("5");
    await rents.getByRole("button", { name: message("ko", "labor_rent_save") }).click();
    await expect(rents).toContainText(message("ko", "labor_rent_now", { rent: "5" }));
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(labor, "labor-admin-pastel-ko-390");

    // player: 사이보그 본체로 admin 시설을 빌린다
    const other = await browser.newContext({ ...VIEWPORTS.phone, ...deviceOptions({ account: "player" }) });
    const otherErrors = watchDeviceErrors(other);
    const tenant = await other.newPage();
    const leasePanel = await openLabor(tenant);
    const leaseForm = leasePanel.locator("form.labor-form");
    await leaseForm.getByLabel(message("ko", "labor_field_kind")).selectOption("lease");
    await expect(leaseForm.getByLabel(message("ko", "labor_field_building"))).toHaveValue(String(buildingId));
    await expect(leaseForm.locator('[data-part="labor-preview"]')).toHaveText(
      message("ko", "labor_preview_lease", { rent: "5", cycle: await unitText(tenant, 1, "hour") }),
    );
    await leaseForm.getByRole("button", { name: message("ko", "labor_create") }).click();
    const leaseRow = leasePanel.locator("li.labor-contract").first();
    await expect(leaseRow).toContainText(message("ko", "labor_kind_lease"));
    await expect(leaseRow).toContainText(message("ko", "labor_state_active"));
    await expect(leaseRow).toContainText(message("ko", "labor_role_worker"));
    expect(await horizontalOverflow(tenant)).toEqual([]);
    await elementShot(leasePanel, "labor-player-pastel-ko-390");

    // 정리: player가 임대를 해지(유예 없이 끝), admin이 임금형 해지(남은 보증금 돌아옴)
    await leaseRow.getByRole("button", { name: message("ko", "labor_terminate") }).click();
    await expect(leaseRow).toContainText(message("ko", "labor_end_worker"));
    await other.close();
    expect(otherErrors).toEqual([]);

    await page.reload();
    const adminPanel = panel(page);
    const adminWage = adminPanel.locator('li.labor-contract[data-state="active"]').first();
    await expect(adminWage).toContainText(message("ko", "labor_kind_wage"));
    await adminWage.getByRole("button", { name: message("ko", "labor_terminate") }).click();
    await expect(adminPanel.locator('li.labor-contract[data-state="active"]')).toHaveCount(0);
    await expect(adminPanel.locator('li.labor-contract[data-state="ended"]')).toHaveCount(2);
    expect(deviceErrors).toEqual([]);
  });

  test.describe("다크·영어", () => {
    test.use({ account: "admin", theme: "dark", language: "en" });

    test("끝난 계약 목록과 새 계약 폼이 넘치지 않는다(사진)", async ({ page, deviceErrors }) => {
      const labor = await openLabor(page);
      await expect(labor.getByRole("heading", { name: message("en", "labor_title") })).toBeVisible();
      await expect(labor.locator('li.labor-contract[data-state="ended"]').first()).toContainText(
        message("en", "labor_state_ended"),
      );
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(labor, "labor-admin-dark-en-390");
      expect(deviceErrors).toEqual([]);
    });
  });
});

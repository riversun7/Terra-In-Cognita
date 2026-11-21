// 유닛 화면 [전투] 칸 시험 — 실제 세계 전투 명령(기획 D-558 1546 → D-571 답 1969, 프로토콜 49 battle_list·battle_order).
// - 플레이어(진짜 서버): 내 유닛이 낀 진행 중인 전투가 없으면 빈 안내.
// - 플레이어(가로챈 연결): 서버의 battle_list_result를 가짜 전투 하나(내가 지휘관, 내 분대 하나, 적 둘)로 바꾸고, battle_order는 서버로 보내지
//   않고 받은 모양을 적어 성공 답을 돌려준다 → 군단 전개 방식(측면 우회)·분대 목표 공격(적 목록에서)이 프로토콜 명령 모양으로 나가는지 본다.
//   판정·확인(내 파티·지휘관·거절)은 서버 시험(apps/server/src/world/legion3.test.ts·battles.db.test.ts)이 본다.
// - 바뀜(house-9, D-574 군단장 2순위 — 질문 2265 나): 정원 안 남의 분대(squad)도 "휘하 n분대" 탭으로 나오고 battle_order legion으로 나간다.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(E2E_SHOTS_DIR) — 명령 줄과 적 목록이 보이는 상태.
// 복귀 요약은 띄우지 않는다(hideSummary).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.beforeEach(async ({ page }) => {
  await rewriteTrpc(page, { "summary.get": hideSummary });
});

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

const tab = (page: Page, key: string, language: Language = "ko") =>
  page.getByRole("tab", { name: new RegExp(`^${message(language, key)}`) });

async function openBattles(page: Page, language: Language = "ko"): Promise<void> {
  await page.goto("/units");
  await expect(page.locator(".units-panel")).toBeVisible();
  await tab(page, "units_tab_battles", language).click();
  await expect(page.locator(".lb-panel")).toBeVisible();
}

/** 가짜 전투로 바꾸고 명령을 적는다(받은 battle_order 목록) */
async function fakeBattle(page: Page): Promise<unknown[]> {
  const orders: unknown[] = [];
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((data) => {
      if (typeof data === "string" && data.includes('"t":"battle_order"')) {
        const parsed: unknown = JSON.parse(data);
        orders.push(parsed);
        socket.send(
          JSON.stringify({
            t: "battle_order_result",
            id: field(parsed, "id"),
            ok: true,
            battle: 5,
            tick: 42,
            endsAtMs: Date.now() + 90_000,
          }),
        );
        return;
      }
      server.send(data);
    });
    server.onMessage((data) => {
      if (typeof data === "string" && data.includes('"t":"battle_list_result"')) {
        const parsed: unknown = JSON.parse(data);
        socket.send(
          JSON.stringify({
            t: "battle_list_result",
            id: field(parsed, "id"),
            ok: true,
            battles: [
              {
                battle: 5,
                kind: "siege",
                startedAtMs: Date.now() - 20_000,
                endsAtMs: Date.now() + 100_000,
                side: 2,
                mapSize: 64,
                commander: true,
                parties: [
                  { id: 7, units: [101, 102, 103], mine: true },
                  { id: 8, units: [201], mine: false },
                  // 군단장 분대 명령(55(줄기 88) — D-574 2순위): 정원 안 남의 분대, 소유주 명령이 서 있는 분대
                  { id: 9, units: [301, 302], mine: false, squad: true, owned: false },
                  { id: 10, units: [401], mine: false, squad: true, owned: true },
                ],
                enemies: [901, 902],
              },
            ],
          }),
        );
        return;
      }
      socket.send(data);
    });
  });
  return orders;
}

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("[전투] 칸: 진행 중인 전투가 없으면 빈 안내(진짜 서버 battle_list)", async ({
    page,
    deviceErrors,
  }) => {
    await openBattles(page);
    await expect(page.locator(".lb-empty")).toBeVisible({ timeout: 20_000 });
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("[전투] 칸: 군단 전개 방식·분대 목표 공격이 battle_order로 나가고 답의 틱을 보인다", async ({
    page,
    deviceErrors,
  }) => {
    const orders = await fakeBattle(page);
    await openBattles(page);
    const battle = page.locator('.lb-battle[data-battle="5"]');
    await expect(battle).toBeVisible({ timeout: 20_000 });
    // 군단(지휘관) → 전개 방식 → 측면 우회 → 내리기
    await battle.locator('.br-cmd-who[data-party="legion"]').click();
    await battle.locator('.br-cmd-order[data-kind="tactic"]').click();
    await battle.locator("select.br-cmd-tactic").selectOption("flank");
    await battle.locator(".br-cmd-issue").click();
    await expect(battle.locator(".lb-status")).toHaveText(message("ko", "live_battle_sent", { tick: 42 }));
    // 분대(내 것만 탭 — 분대 8은 남의 유닛이라 없다) → 목표 공격 → 적 목록에서 둘째
    await expect(battle.locator('.br-cmd-who[data-party="8"]')).toHaveCount(0);
    await battle.locator('.br-cmd-who[data-party="7"]').click();
    await battle.locator('.br-cmd-order[data-kind="attack"]').click();
    await expect(battle.locator(".lb-enemy")).toHaveCount(2);
    await battle.locator('.lb-enemy[data-unit="902"]').click();
    await expect.poll(() => orders.length).toBe(2);
    // 군단장 분대 명령(D-574 2순위 — 질문 2265 나): 정원 안 남의 분대 탭, 소유주 명령 중 표시, legion으로 나간다
    await expect(battle.locator(".lb-squad-hint")).toHaveText(message("ko", "live_battle_squad_hint"));
    await expect(battle.locator('.br-cmd-who[data-party="9"]')).toHaveText(
      message("ko", "battle_cmd_squad", { n: 1 }),
    );
    await expect(battle.locator('.br-cmd-who[data-party="10"]')).toHaveText(
      message("ko", "battle_cmd_squad_owned", { n: 2 }),
    );
    await battle.locator('.br-cmd-who[data-party="9"]').click();
    await battle.locator('.br-cmd-order[data-kind="hold"]').click();
    await expect.poll(() => orders.length).toBe(3);
    expect(
      orders.map((entry) => [
        field(entry, "battle"),
        field(entry, "party"),
        field(entry, "order"),
        field(entry, "legion"),
      ]),
    ).toEqual([
      [5, null, { kind: "tactic", tactic: "flank" }, undefined],
      [5, 7, { kind: "attack", target: 902 }, undefined],
      [5, 9, { kind: "hold" }, true],
    ]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진: 390·1440 × 파스텔·다크 × 한국어·영어(가짜 전투 — 명령 줄과 적 목록)
for (const viewport of ["phone", "desktop"] as const) {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    for (const language of ["ko", "en"] as const satisfies readonly Language[]) {
      const width = VIEWPORTS[viewport].viewport.width;
      test.describe(`사진 ${String(width)} ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "player", theme, language });

        test(`전투 칸 (${String(width)}·${theme}·${language})`, async ({ page, deviceErrors }) => {
          await fakeBattle(page);
          await openBattles(page, language);
          const battle = page.locator('.lb-battle[data-battle="5"]');
          await expect(battle).toBeVisible({ timeout: 20_000 });
          await battle.locator('.br-cmd-who[data-party="7"]').click();
          await battle.locator('.br-cmd-order[data-kind="attack"]').click();
          await expect(battle.locator(".lb-enemy")).toHaveCount(2);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `live-battles-${String(width)}-${theme}-${language}`, { fullPage: true });
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
}

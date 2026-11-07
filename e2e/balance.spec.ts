// 밸런스 화면 시험 — /dev/balance [가중치 표] 탭 (docs/adr/2026-11-01-balance-screen.md 7절). [전투 실험실] 탭은 e2e/battleLab.spec.ts.
// - 화면은 실험실 탭으로 열리고, [가중치 표] 탭을 누르면 이 표가 뜬다. 기준 유닛을 팀 A 유닛·유닛 프리셋에서 불러온다.
// - dev: 가중치 칸(HP의 VIT)을 고치면 담기고 기여 표가 "지금 → 고침"을 보인다. [승률 돌리기]는 1차 여섯 줄(지금·고침 막대).
//   [적용]하면 그 세계에 바로 든다(세계에서 바뀐 칸 1, 시안 유닛 HP가 오름, 설정 칸 패널 머리에 가중치 칸 수). 되돌리기 → 적용이면 팩 값.
//   모든 WIS 가중치를 0으로 담으면 담은 변경 막대가 "적용하면 받지 않음(가치 없는 1차)"을 미리 보이고, 적용은 거절된다.
// - player: 권한 없음 화면, tRPC balance.*는 403.
// - 배치·사진: 390·1440 × 네온·라이트 × 한국어·영어, 큰 숫자(1차 10,000·가중치 100,000). 가로 넘침(표는 안에서 민다)·작은 누르는 곳 없음.
//   세계 값 칸은 서버에 저장하지 않고 가중치 표 응답에 넣는다. 화면을 여는 조회는 처음 한 번만 서버에 묻는다(replayTrpc, 아래 LAYOUT_READS).
// - 대결 속도 제한: 서버 제한(사용자마다 순간 2·분당 4)을 다 쓰면 [승률 돌리기]가 "요청이 너무 잦습니다"를 보인다(실제 서버).
// - 기여 조회 거절: 기여 조회가 429로 두 번 막혀도(요청을 바꿔 본다) 문구·"잠시 뒤 다시 묻습니다"를 보인 뒤 저절로 다시 물어 표가 찬다.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(설정 칸 패널 시험과 같은 결).
// 사용자별 속도 제한도 같이 쓴다(서버를 켤 때마다 처음부터): 설정 칸 계열 조회(실험실 목록·미리 보기, 가중치 표·기여·대결,
// tuning.list 등)는 순간 30·분당 120, 대결은 순간 2·분당 4. 같은 계정으로 화면을 여러 번 여는 배치·사진 시험이 실제 서버에
// 다 물으면 조회 제한을 다 써서 뒤 시험의 기여 조회가 TOO_MANY_REQUESTS로 막혔다(2026-11-07 확인: 큰 숫자·en의 trace에서
// balance.contribution 429). 그래서 배치·사진 시험은 서버 상태를 바꾸지 않고 같은 입력의 조회를 다시 쓴다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { createTrpcReplay, replayTrpc } from "./helpers/trpc.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키, 묶지 않음 → replayTrpc를 거치지 않는다). 결과 data 또는 오류 코드·까닭 */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  kind: "query" | "mutation" = input === undefined ? "query" : "mutation",
): Promise<{ status: number; data: unknown; code: unknown; reason: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, kind: how }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const field = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const query =
        how === "query" && body !== undefined ? `?input=${encodeURIComponent(JSON.stringify(body))}` : "";
      const response = await fetch(
        `/api/trpc/${name}${query}`,
        how === "mutation"
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: field(field(json, "result"), "data"),
        code: field(field(field(json, "error"), "data"), "code"),
        reason: field(field(field(json, "error"), "data"), "reason"),
      };
    },
    { procedure, input, kind },
  );
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 덮어쓰기를 모두 지운다(설정 칸·가중치 칸) */
async function resetTuning(page: Page): Promise<void> {
  const list = await trpc(page, "tuning.list");
  const revision = field(list.data, "revision");
  if (typeof revision !== "number") throw new Error(`tuning.list ${list.status}`);
  const entries = field(list.data, "entries");
  const changed =
    (Array.isArray(entries) && entries.some((entry: unknown) => field(entry, "override") !== null)) ||
    field(list.data, "statOverrides") !== 0;
  if (!changed) return;
  const reverted = await trpc(page, "tuning.revertAll", { expectedRevision: revision });
  if (reverted.status !== 200) throw new Error(`tuning.revertAll ${reverted.status}`);
}

/** 시안 유닛 첫 줄의 HP(서버 화면 자료가 실효 가중치 표로 계산한다) */
async function previewHp(page: Page): Promise<number> {
  const list = await trpc(page, "units.list", { preview: true }, "query");
  const units = field(list.data, "units");
  const first: unknown = Array.isArray(units) ? units[0] : undefined;
  const secondary = field(field(first, "stats"), "secondary");
  const hp = Array.isArray(secondary)
    ? secondary.find((row: unknown) => field(row, "id") === "hp")
    : undefined;
  return Number(field(hp, "value"));
}

/** [가중치 표] 탭을 열고 표·기여가 뜰 때까지 */
async function weightsReady(page: Page): Promise<void> {
  await page.locator("#bp-tab-weights").click();
  await expect(page.locator(".bp-weights-tab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.locator(".bp-contrib tbody tr").first()).toBeVisible({ timeout: 20_000 });
}

async function screenReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bp-screen")).toBeVisible({ timeout: 20_000 });
  await weightsReady(page);
}

const cell = (page: Page, row: string, fieldName: string) =>
  page.locator(`.bp-weights tr[data-row="${row}"] td[data-field="${fieldName}"]`);

/** 칸 값을 고쳐 담는다(입력을 떠나면 담긴다) */
async function stageCell(page: Page, row: string, fieldName: string, value: string): Promise<void> {
  const input = cell(page, row, fieldName).locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(cell(page, row, fieldName)).toHaveAttribute("data-state", "staged");
}

/** 대결 설정을 작게(판 4, 60초) */
async function smallDuelSettings(page: Page): Promise<void> {
  await page.locator(".bp-settings select").nth(2).selectOption("4");
  await page.locator(".bp-settings select").nth(3).selectOption("60");
}

/** 작은 설정으로 [승률 돌리기]. 대결 속도 제한(사용자마다 순간 2·분당 4)에 걸리면 기다렸다 한 번 더 */
async function runDuels(page: Page): Promise<void> {
  await smallDuelSettings(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(".bp-run").click();
    await expect(page.locator(".bp-run")).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
    if ((await page.locator(".bp-duel").count()) > 0) return;
    await page.waitForTimeout(16_000);
  }
  throw new Error("duels did not finish");
}

/** 시험이 일부러 받는 거절(규칙 문제 400·권한 없음 403·대결 속도 제한 429)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (400|403|429)/.test(error.text) &&
        /\/api\/trpc\/(tuning|balance)\./.test(error.text)
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("칸을 담으면 기여가 '지금 → 고침', 승률 여섯 줄, 적용하면 세계에 바로 들고 되돌리기 적용이면 팩 값", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await screenReady(page);
    await resetTuning(page);
    await page.reload();
    await weightsReady(page);
    // 켜진 행 17개(D-502로 명중·크리·행동 속도 점수 행은 꺼짐, D-512 323 제작 직무 행 더함, D-514 HP 회복 행 더함 — core@38)
    await expect(page.locator(".bp-weights tbody tr")).toHaveCount(17);
    const hpBefore = await previewHp(page);

    await stageCell(page, "hp", "vit", "6000");
    await expect(page.locator(".bp-staged")).toHaveAttribute("data-count", "1");
    // 기여: HP 줄 VIT 열이 +30 → +60
    await expect(page.locator(".bp-contrib td[data-changed]").first()).toBeVisible();
    await expect(page.locator(".bp-contrib")).toContainText("+30 → +60");
    await expect(page.locator(".bp-flag").first()).toHaveAttribute("data-tone", "ok");

    await runDuels(page);
    await expect(page.locator(".bp-duel")).toHaveCount(6);
    // 담은 칸이 있어 고친 표 막대도 있다
    await expect(page.locator(".bp-duel").first().locator(".bp-score")).toHaveCount(2);

    await page.locator(".bp-note-input").fill("e2e 가중치 시험");
    await page.locator(".bp-apply").click();
    await expect(page.locator(".bp-pending")).toHaveCount(0);
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "override");
    await expect(page.locator(".bp-overrides")).toHaveAttribute("data-count", "1");
    // 다시 켜지 않아도 서버 화면 자료가 새 표를 쓴다(VIT 10 × 3 → × 6)
    expect(await previewHp(page)).toBeGreaterThan(hpBefore);
    // 설정 칸 패널 머리에도 보인다
    const list = await trpc(page, "tuning.list");
    expect(field(list.data, "statOverrides")).toBe(1);

    // 되돌리기(팩 값을 담음) → 적용
    await cell(page, "hp", "vit").locator(".bp-reset").click();
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "staged");
    await page.locator(".bp-apply").click();
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "pack");
    expect(await previewHp(page)).toBe(hpBefore);
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("모든 WIS 가중치를 0으로 담으면 가치 없는 1차: 미리 알리고 적용은 거절, 담은 칸은 남는다", async ({
    page,
    deviceErrors,
  }) => {
    await screenReady(page);
    await resetTuning(page);
    await page.reload();
    await weightsReady(page);
    const rows = await page
      .locator(".bp-weights tbody tr")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-row") ?? ""));
    for (const row of rows) {
      const input = cell(page, row, "wis").locator("input");
      if ((await input.inputValue()) !== "0") await stageCell(page, row, "wis", "0");
    }
    const problem = message("ko", "dev_tuning_problem_stat_primary_unused");
    await expect(page.locator(".bp-pending-reject")).toContainText(problem);
    await expect(page.locator(".bp-flag[data-tone='bad']").first()).toBeVisible();
    await page.locator(".bp-apply").click();
    await expect(page.locator(".bp-screen [role='alert']").last()).toContainText(problem);
    await expect(page.locator(".bp-pending")).toBeVisible();
    await page.locator(".bp-pending-actions .button-small").first().click();
    await expect(page.locator(".bp-pending")).toHaveCount(0);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("기준 유닛 불러오기", () => {
  test.use({ account: "dev" });

  test("팀 A 유닛·유닛 프리셋을 고르면 서버 미리 보기의 1차 합과 무기가 기준 유닛에 든다", async ({
    page,
    deviceErrors,
  }) => {
    await screenReady(page);
    const source = page.locator(".bp-source select");
    // 샘플 Lv 30 전사(처음 STR 14, K 1100, Lv 30 → 14 × (1000 + 100 × 1100 × 29 ÷ 1000) ÷ 1000 = 58, 반지(500‰) +2)
    await source.selectOption("sample_lv30_warrior");
    await expect(page.locator(".bp-primary-input").first()).toHaveValue("60");
    await expect(page.locator(".bp-settings select").first()).toHaveValue("test_sword");
    // 팀 A 첫 유닛(샘플 혼성 파티의 탱커)
    await source.selectOption("team:0");
    await expect(page.locator(".bp-primary-input").first()).not.toHaveValue("60");
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC balance.table·balance.duels는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/balance");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".bp-screen")).toHaveCount(0);
    expect((await trpc(page, "balance.table")).status).toBe(403);
    const duels = await trpc(
      page,
      "balance.duels",
      {
        primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
        weapon: "unarmed",
        count: 1,
        runs: 2,
        seed: 1,
        limitSec: 30,
        edits: [],
      },
      "query",
    );
    expect([duels.status, duels.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 게임 테마와 상관없이 개발 화면 테마 둘(네온 다크·라이트)로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = (
  ["neon", "light"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

async function fullShot(page: Page, name: string): Promise<void> {
  // 고정된 위 띠·하단 탭·건너뛰기 링크가 사진 가운데에 끼지 않게 숨긴다(설정 칸 패널 사진과 같은 결)
  await shot(page, name);
}

/** 배치·사진·속도 제한 시험(admin)이 함께 쓰는 서버 답. 이 시험들은 서버 상태(덮어쓰기)를 바꾸지 않는다 */
const layoutReplay = createTrpcReplay();
/** 화면을 열 때 부르는 조회: 실험실 목록·프리셋·미리 보기(기본 탭), 가중치 표·기여 */
const LAYOUT_READS = [
  "battleLab.catalog",
  "battleLab.presets",
  "battleLab.preview",
  "balance.table",
  "balance.contribution",
] as const;

/** 세계 값 칸으로 보일 칸(회피 행 AGI) — 서버에 저장하지 않고 가중치 표 응답의 그 칸에 덮어쓰기를 넣는다 */
const WORLD_CELL = { row: "evade", field: "agi" } as const;

/** balance.table data → WORLD_CELL 칸이 세계 값(팩과 다른 실효 값 + 덮어쓰기 기록)이다. 모양이 바뀌었으면 시험이 멈춘다 */
function withWorldCell(data: unknown): void {
  const rows = field(data, "rows");
  const row: unknown = Array.isArray(rows)
    ? rows.find((entry: unknown) => field(entry, "id") === WORLD_CELL.row)
    : undefined;
  const cells = field(row, "cells");
  const target: unknown = Array.isArray(cells)
    ? cells.find((entry: unknown) => field(entry, "field") === WORLD_CELL.field)
    : undefined;
  const pack = field(target, "pack");
  const contentVersion = field(data, "contentVersion");
  if (typeof target !== "object" || target === null || typeof pack !== "number")
    throw new Error("balance.table 응답에 회피 행 AGI 칸이 없습니다");
  const value = pack + 200;
  Reflect.set(target, "value", value);
  Reflect.set(target, "override", {
    value,
    packValueAtSave: pack,
    contentVersionAtSave: contentVersion,
    note: "e2e",
    updatedBy: "admin",
    updatedAt: Date.UTC(2026, 10, 1),
  });
}

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ devTheme: theme, language, viewport: { width, height } });

      test("세계 값 칸·담은 칸·기여·승률: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        // 대결도 다시 쓴다: 실제 대결은 이 묶음 처음 한 번만 돈다(대결 속도 제한을 쓰지 않는다)
        await replayTrpc(page, layoutReplay, [...LAYOUT_READS, "balance.duels"], {
          "balance.table": withWorldCell,
        });
        await screenReady(page);
        await expect(cell(page, WORLD_CELL.row, WORLD_CELL.field)).toHaveAttribute("data-state", "override");
        await expect(page.locator(".bp-overrides")).toHaveAttribute("data-count", "1");
        await stageCell(page, "hp", "vit", "4500");
        await stageCell(page, "physical_attack", "str", "2600");
        // 승률은 네온에서만 채운다, 라이트는 비어 있는 상태를 찍는다
        if (theme === "neon") {
          await runDuels(page);
          await expect(page.locator(".bp-duel")).toHaveCount(6);
        }
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `balance-${theme}-${language}-${width}`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }

  for (const language of ["ko", "en"] as const) {
    test.describe(`큰 숫자·${language}·390px`, () => {
      test.use({ theme: "pastel", language, viewport: { width: 390, height: 844 } });

      test("1차 10,000·가중치 100,000에서도 쪽이 가로로 밀리지 않는다", async ({ page, deviceErrors }) => {
        await replayTrpc(page, layoutReplay, LAYOUT_READS);
        await screenReady(page);
        const inputs = page.locator(".bp-primary-input");
        for (let index = 0; index < 6; index++) await inputs.nth(index).fill("10000");
        await stageCell(page, "hp", "str", "100000");
        await stageCell(page, "evade", "half", "10000000");
        // HP = STR 1,000,000 + DEX 10,000 + AGI 15,000 + VIT 30,000 + INT 10,000 + WIS 12,000
        await expect(page.locator(".bp-contrib")).toContainText("1,077,000");
        expect(await horizontalOverflow(page)).toEqual([]);
        await fullShot(page, `balance-big-${language}-390`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }
});

test.describe("대결 속도 제한", () => {
  test.use({ account: "admin" });

  test("대결을 사용자 제한(순간 2·분당 4)만큼 쓰면 서버는 rate_limited, [승률 돌리기]는 '요청이 너무 잦습니다'", async ({
    page,
    deviceErrors,
  }) => {
    // 화면을 여는 조회만 다시 쓴다. 대결은 실제 서버로 간다
    await replayTrpc(page, layoutReplay, LAYOUT_READS);
    await screenReady(page);
    await smallDuelSettings(page);
    // 가장 작은 대결을 거절될 때까지 차례로 부른다(한 번에 하나라 서버 바쁨 busy는 없다)
    const input = {
      primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
      weapon: "unarmed",
      count: 1,
      runs: 2,
      seed: 1,
      limitSec: 30,
      edits: [],
    };
    const statuses: number[] = [];
    let refused: Awaited<ReturnType<typeof trpc>> | undefined;
    for (let attempt = 0; attempt < 4 && refused === undefined; attempt++) {
      const duels = await trpc(page, "balance.duels", input, "query");
      statuses.push(duels.status);
      if (duels.status !== 200) refused = duels;
    }
    // 순간 2개까지 받는다: 세 번째 안에 거절된다
    expect(statuses.length).toBeLessThanOrEqual(3);
    expect([refused?.status, refused?.code, refused?.reason]).toEqual([
      429,
      "TOO_MANY_REQUESTS",
      "rate_limited",
    ]);
    // 거절은 대결 제한이다: 같은 계정의 조회(설정 칸 계열 조회 제한)는 아직 받는다
    expect((await trpc(page, "balance.table")).status).toBe(200);
    // 한 개가 다시 차기까지 15초 — 그 안에 화면에서 누르면 거절 문구가 뜨고 결과는 비어 있다
    await page.locator(".bp-run").click();
    const duelPanel = page.locator("section[aria-labelledby='bp-duels-title']");
    await expect(duelPanel.locator("[role='alert']")).toContainText(
      message("ko", "dev_balance_err_rate_limited"),
    );
    await expect(page.locator(".bp-run")).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".bp-duel")).toHaveCount(0);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("기여 조회 거절", () => {
  test.use({ account: "admin" });

  test("기여 조회가 속도 제한(429)으로 거절되면 문구·'잠시 뒤 다시 묻습니다'를 보이고, 손대지 않아도 다시 물어 표를 채운다", async ({
    page,
    deviceErrors,
  }) => {
    // 화면을 여는 조회는 다시 쓴다(서버 상태를 바꾸지 않는다). 기여 조회 처음 두 번만 429로 막는다(서버 사용자별 조회 제한과 같은 답)
    await replayTrpc(page, layoutReplay, LAYOUT_READS);
    let refused = 0;
    await page.route(
      (url) => url.pathname.startsWith("/api/trpc/"),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        const names = decodeURIComponent(path.slice("/api/trpc/".length)).split(",");
        if (refused >= 2 || names.length !== 1 || names[0] !== "balance.contribution") {
          await route.fallback();
          return;
        }
        refused += 1;
        await route.fulfill({
          status: 429,
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            {
              error: {
                message: "RATE_LIMITED",
                code: -32029,
                data: {
                  code: "TOO_MANY_REQUESTS",
                  httpStatus: 429,
                  path: "balance.contribution",
                  reason: "rate_limited",
                },
              },
            },
          ]),
        });
      },
    );
    await page.goto("/dev/balance");
    await expect(page.locator(".bp-screen")).toBeVisible({ timeout: 20_000 });
    await page.locator("#bp-tab-weights").click();
    await expect(page.locator(".bp-weights-tab")).toHaveAttribute("data-status", "ready", {
      timeout: 20_000,
    });
    const panel = page.locator("section[aria-labelledby='bp-contrib-title']");
    // 거절 문구와 다시 묻는다는 안내(2초 → 4초 뒤 다시 묻는 동안 보인다)
    await expect(panel.locator("[role='alert']")).toContainText(
      message("ko", "dev_balance_err_rate_limited"),
    );
    await expect(panel.locator("[role='alert']")).toContainText(
      message("ko", "dev_balance_contrib_retrying"),
    );
    // 아무것도 담지 않아도 다시 물어 기여 표가 찬다(두 번 거절 뒤 세 번째)
    await expect(page.locator(".bp-contrib tbody tr").first()).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator("[role='alert']")).toHaveCount(0);
    expect(refused).toBe(2);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

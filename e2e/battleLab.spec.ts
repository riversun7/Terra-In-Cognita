// 전투 실험실 시험 — /dev/balance [전투 실험실] 탭 (docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)").
// - dev: 처음 열면 샘플 파티 둘(팀 A Lv 30 혼성 4명, 팀 B 크리쳐 무리 4명). 유닛을 고르고 레벨을 바꾸면 서버 미리 보기의 성장이 바뀐다.
//   [한 판]은 이긴 팀·유닛 8줄·사건 기록, [몬테카를로]는 팀 승률 막대 둘·유닛 8줄. [3D 관람]은 같은 시드의 한 판을 리플레이로 받아
//   전투 다시보기 화면(.br-view)을 화면 전체 창에 띄우고, [닫기]로 닫는다.
//   유닛 프리셋: 새로 저장(이름 ko·en 창) → 이름 바꾸기 → 복제 → 지우기(확인 창). 샘플을 고르면 덮어쓰기·이름 바꾸기·지우기는 꺼진다.
//   새로 고치면 팀이 이 기기에 남아 있다(localStorage).
// - player: 권한 없음, tRPC battleLab.*는 403.
// - 배치·사진: 390·1440 × 파스텔·다크 × 한국어·영어. 가로 넘침·작은 누르는 곳 없음. 3D 관람 창은 테마 둘 × 390·1440(언어 섞어 넷).
// 팀 프리셋은 시험끼리 DB를 같이 쓴다: 만든 프리셋은 시험 안에서 지운다.
// 사용자별 속도 제한도 같이 쓴다(설정 칸 계열 조회 순간 30·분당 120, 전투 순간 4·분당 8, 서버를 켤 때마다 처음부터. 앞 파일
// balance.spec.ts의 admin 시험과도 같다). 배치·사진 시험은 서버 상태를 바꾸지 않으므로 같은 입력의 조회·전투를 처음 한 번만
// 서버에 묻는다(replayTrpc). 실제 서버 경로(전투·몬테카를로·3D 관람·프리셋)는 "개발자" 시험이 본다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { createTrpcReplay, replayTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키) */
async function trpcStatus(page: Page, procedure: string, input?: unknown): Promise<number> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(`/api/trpc/${name}${query}`);
      return response.status;
    },
    { procedure, input },
  );
}

/** 화면 안에서 tRPC 조회를 부르고 결과 자료(result.data)를 돌려준다 */
async function trpcData(page: Page, procedure: string, input: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      const response = await fetch(`/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify(body))}`);
      const json: unknown = await response.json();
      const result: unknown =
        typeof json === "object" && json !== null ? Reflect.get(json, "result") : undefined;
      return typeof result === "object" && result !== null ? Reflect.get(result, "data") : undefined;
    },
    { procedure, input },
  );
}

const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>(
    (current, key) =>
      typeof current === "object" && current !== null ? Reflect.get(current, key) : undefined,
    value,
  );

/** 1차 6개가 모두 v */
const flat = (v: number) => ({ str: v, vit: v, int: v, wis: v, dex: v, agi: v });

/** 실험 유닛(새 유닛 기본값과 같은 모양: 1차 모두 10, Lv 1) */
const labUnit = (weapon: unknown, level = 1, value = 10) => {
  return {
    label: "",
    kind: "cyborg",
    level,
    rebirths: 0,
    initial: flat(value),
    kPm: flat(0),
    elements: Array.from({ length: 12 }, () => 0),
    weapon,
    equipment: [],
    gear: {
      rows: [],
      defenseFlat: 0,
      penetrationPm: 0,
      resistPm: Array.from({ length: 12 }, () => 0),
      primaries: flat(0),
    },
    skills: [],
    row: "front",
  };
};

async function labReady(page: Page): Promise<void> {
  // 첫 탭은 [분포 상성](2026-11-08 완전 개편) → 주소로 실험실 탭을 연다
  await page.goto("/dev/balance?tab=lab");
  await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.locator(".bl-preview .bl-secondary li").first()).toBeVisible({ timeout: 20_000 });
}

/** 시험이 일부러 받는 거절(권한 없음 403·속도 제한 429)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (403|429)/.test(error.text) &&
        /\/api\/trpc\/(battleLab|balance|tuning)\./.test(error.text)
      ),
  );

/** 단추를 누르고 결과가 뜰 때까지. 서버 전체 하나·사용자 속도 제한에 걸리면 기다렸다 한 번 더 */
async function runUntil(page: Page, button: string, result: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(button).click();
    await expect(page.locator(button)).not.toHaveAttribute("aria-disabled", "true", { timeout: 90_000 });
    if ((await page.locator(result).count()) > 0) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error(`${button} did not finish`);
}

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("샘플 파티 둘, 레벨을 바꾸면 미리 보기 성장이 바뀌고, 한 판·몬테카를로 결과가 뜬다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await labReady(page);
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit")).toHaveCount(4);
    await expect(page.locator(".bl-team[data-team='b'] .bl-unit")).toHaveCount(4);
    // 3D 관람은 켜져 있고 같은 시드의 한 판을 다시 본다는 설명이 붙는다
    await expect(page.locator(".bl-watch")).toHaveAttribute("aria-disabled", "false");
    await expect(page.locator(".bl-watch-hint")).toHaveText(message("ko", "dev_lab_watch_hint"));

    // 팀 A 둘째 유닛(전사)을 고르고 레벨 30 → 10
    await page.locator(".bl-team[data-team='a'] .bl-unit-pick").nth(1).click();
    await expect(page.locator(".bl-editor")).toHaveAttribute("data-unit", "A2");
    const str = page.locator(".bl-primary-view tr[data-field='str'] td").nth(1);
    await expect(str).toHaveText("58");
    const level = page.locator(".bl-level input");
    await level.fill("10");
    await level.press("Enter");
    // 14 × (1000 + 100 × 1100 × 9 ÷ 1000) ÷ 1000 = 27
    await expect(str).toHaveText("27");
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit-name").nth(1)).toContainText("Lv 10");

    await runUntil(page, ".bl-battle", ".bl-result");
    await expect(page.locator(".bl-result .bl-summary-table tbody tr")).toHaveCount(8);
    await expect(page.locator(".bl-log li").first()).toBeVisible();
    await expect(page.locator(".bl-result")).toHaveAttribute("data-winner", /^(a|b|even)$/);

    // 3D 관람: 리플레이·지형·엔진 준비 → 보기 화면이 창 안에 뜬다 → [닫기]
    await runUntil(page, ".bl-watch", ".bl-watch-dialog[open]");
    const watch = page.locator(".bl-watch-dialog[open]");
    await expect(watch.locator(".br-view")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    await expect(watch.locator(".bl-watch-title")).toHaveText(message("ko", "dev_lab_watch_title"));
    await watch.locator(".bl-watch-close").click();
    await expect(page.locator(".bl-watch-dialog[open]")).toHaveCount(0);
    await expect(page.locator(".bl-watch")).toBeFocused();

    await page.locator(".bl-runs").selectOption("10");
    await runUntil(page, ".bl-monte-run", ".bl-monte");
    await expect(page.locator(".bl-monte .bl-score")).toHaveCount(2);
    await expect(page.locator(".bl-monte .bl-summary-table tbody tr")).toHaveCount(8);

    // 팀을 고치면 결과는 "지난 입력"
    await level.fill("11");
    await level.press("Enter");
    await expect(page.locator(".bl-result-block[data-stale]").first()).toBeVisible();

    // 새로 고쳐도 팀이 이 기기에 남는다
    await page.reload();
    await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit-name").nth(1)).toContainText("Lv 11");
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("공격력 = 스탯 공격력 + 무기 몫(D-502): 새 사이보그 맨손 10·명중 73.8%, 검 10 + 8 = 18, 미리 보기 공격 표", async ({
    page,
    deviceErrors,
  }) => {
    await labReady(page);
    // 맨손(Lv 1, 1차 모두 10): 무기 몫 0, 적정 DEX = 1 × 1.5 + 10 = 11.5 → 850‰ × 10 ÷ 11.5 = 738‰
    const bare = at(await trpcData(page, "battleLab.preview", labUnit({ kind: "natural" })), "combat");
    expect([at(bare, "realAttack"), at(bare, "hitPm")]).toEqual([10, 738]);
    expect(at(bare, "appropriate", "hit")).toEqual({ stat: 10, appropriateMilli: 11_500, ratioPm: 869 });
    // 검(공격력 20·적정 STR 25): 10 + 20 × 10 ÷ 25 = 18, Lv 30 균형형(39) → 39 + 20 = 59
    const sword = { kind: "item", id: "test_sword", pm: 0 };
    const lv1 = at(await trpcData(page, "battleLab.preview", labUnit(sword)), "combat");
    expect(at(lv1, "realAttack")).toBe(18);
    const lv30 = at(await trpcData(page, "battleLab.preview", labUnit(sword, 30, 39)), "combat");
    expect(at(lv30, "realAttack")).toBe(59);
    // 화면: 편집 유닛의 공격 표에 스탯 공격력·무기 공격력·1차 ÷ 적정·비율 칸이 있다
    await page.locator(".bl-team[data-team='a'] .bl-unit-pick").nth(1).click();
    const basic = page.locator(".bl-attacks tr[data-attack='basic'] td");
    await expect(basic).toHaveCount(6);
    await expect(page.locator(".bl-attacks tr[data-appropriate='speed'] td").nth(4)).toContainText("÷");
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("유닛 프리셋: 새로 저장 → 이름 바꾸기 → 복제 → 지우기, 샘플은 읽기 전용", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await labReady(page);
    const bar = page.locator(".bl-editor .bl-presets");
    const select = bar.locator(".bl-preset-select");
    // 샘플을 고르면 고치는 단추는 꺼진다
    await select.selectOption("sample_lv30_tank");
    await expect(bar.locator(".bl-preset-overwrite")).toHaveAttribute("aria-disabled", "true");
    await expect(bar.locator(".bl-preset-delete")).toHaveAttribute("aria-disabled", "true");
    await bar.locator(".bl-preset-load").click();
    await expect(page.locator(".bl-kind-select")).toHaveValue("cyborg");

    // 새로 저장(이름 창)
    await select.selectOption("");
    await bar.locator(".bl-preset-new").click();
    const dialog = page.locator(".bl-dialog[open]");
    await dialog.locator("input").nth(0).fill("시험 탱커");
    await dialog.locator("input").nth(1).fill("E2E tank");
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator(".bl-lab [role='status']").first()).toContainText("시험 탱커");
    await expect(select).not.toHaveValue("");
    // 이름 바꾸기
    await bar.locator(".bl-preset-rename").click();
    await dialog.locator("input").nth(0).fill("시험 탱커 2");
    await dialog.locator("button[type='submit']").click();
    await expect(select.locator("option:checked")).toHaveText("시험 탱커 2");
    // 복제
    await bar.locator(".bl-preset-copy").click();
    await expect(select.locator("option", { hasText: "시험 탱커 2 복사" })).toHaveCount(1);
    // 지우기 둘(확인 창)
    for (const name of ["시험 탱커 2 복사", "시험 탱커 2"]) {
      const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
      await select.selectOption(value ?? "");
      await bar.locator(".bl-preset-delete").click();
      await page.locator(".bl-dialog[open] .bl-confirm").click();
      await expect(select.locator("option", { hasText: name })).toHaveCount(0);
    }
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC battleLab.catalog·presets는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/balance");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    expect(await trpcStatus(page, "battleLab.catalog")).toBe(403);
    expect(await trpcStatus(page, "battleLab.presets")).toBe(403);
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

/** 배치·사진 시험(admin)이 함께 쓰는 서버 답 */
const layoutReplay = createTrpcReplay();
/** 화면을 열고 전투장을 돌릴 때 부르는 것: 목록·프리셋·미리 보기, 한 판·3D 관람 리플레이(계산만 하고 상태를 바꾸지 않는다) */
const LAYOUT_CALLS = [
  "battleLab.catalog",
  "battleLab.presets",
  "battleLab.preview",
  "battleLab.battle",
  "battleLab.replay",
] as const;

test.describe("배치·사진", () => {
  test.use({ account: "admin" });
  test.beforeEach(async ({ page }) => {
    await replayTrpc(page, layoutReplay, LAYOUT_CALLS);
  });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      // 1440은 실제 데스크톱(마우스·터치 없음, 아이템 편집기 사진과 같다)
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("팀·유닛 편집·미리 보기·전투장(결과 포함): 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(150_000);
        await labReady(page);
        // 펼칠 수 있는 칸을 모두 펼친다(넘침·누르는 곳을 다 본다)
        await page.locator(".bl-lab details:not([open]) > summary").evaluateAll((elements) => {
          for (const element of elements) element.parentElement?.setAttribute("open", "");
        });
        // 공격·적정 스탯 표(D-502: 스탯 공격력·무기 공격력·1차 ÷ 적정·비율·실제) — 샘플 유닛의 팩 무기로 먼저 찍는다
        await expect(page.locator(".bl-attacks tr[data-attack='basic']")).toBeVisible();
        await elementShot(
          page.locator(".bl-scroll").filter({ has: page.locator(".bl-attacks") }),
          `battle-lab-attacks-${theme}-${language}-${width}`,
        );
        await page.locator(".bl-weapon-select").selectOption("custom");
        await runUntil(page, ".bl-battle", ".bl-result");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `battle-lab-${theme}-${language}-${width}`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }

  // 3D 관람 창: 개발 화면 테마 둘 × 390·1440(한국어·영어 한 번씩). 창 안 보기 화면이 가로로 넘치지 않는다
  for (const { theme, language, width, height } of [
    { theme: "neon", language: "ko", width: 390, height: 844 },
    { theme: "light", language: "en", width: 390, height: 844 },
    { theme: "neon", language: "en", width: 1440, height: 900 },
    { theme: "light", language: "ko", width: 1440, height: 900 },
  ] as const) {
    test.describe(`3D 관람·${theme}·${language}·${width}px`, () => {
      test.use({ devTheme: theme, language, viewport: { width, height } });

      test("3D 관람 창: 보기 화면 준비, 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await labReady(page);
        await runUntil(page, ".bl-watch", ".bl-watch-dialog[open]");
        const watch = page.locator(".bl-watch-dialog[open]");
        await expect(watch.locator(".br-view")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `battle-lab-watch-${theme}-${language}-${width}`);
        await page.keyboard.press("Escape");
        await expect(page.locator(".bl-watch-dialog[open]")).toHaveCount(0);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }

  for (const language of ["ko", "en"] as const) {
    test.describe(`나쁜 값·${language}·390px`, () => {
      test.use({ theme: "pastel", language, viewport: { width: 390, height: 844 } });

      test("6 대 6, 이름 40자, Lv 999, 1차 10,000, 스킬 칸 넘침에서도 쪽이 가로로 밀리지 않는다", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(150_000);
        // 기기 저장 팀(화면이 읽는 자료 입구)에 가장 나쁜 실제 값을 넣는다: 이름 상한 40자, 레벨·1차·K 상한, 속성 모두 10
        await page.addInitScript(
          (teams) => localStorage.setItem("terra.battleLab.teams.v1", JSON.stringify(teams)),
          worstTeams(),
        );
        await labReady(page);
        await expect(page.locator(".bl-team[data-team='a'] .bl-unit")).toHaveCount(6);
        await page.locator(".bl-lab details:not([open]) > summary").evaluateAll((elements) => {
          for (const element of elements) element.parentElement?.setAttribute("open", "");
        });
        await page.locator(".bl-limit").selectOption("60");
        await runUntil(page, ".bl-battle", ".bl-result");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `battle-lab-worst-${language}-390`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }
});

/** 가장 나쁜 실제 값의 팀(이름 40자·Lv 999·1차 10,000·K 10,000·속성 10·스킬 칸 넘침·직접 값 무기 큰 수) */
function worstTeams() {
  const zeros = Array.from({ length: 12 }, () => 0);
  const tens = Array.from({ length: 12 }, () => 10);
  const max = { str: 10_000, vit: 10_000, int: 10_000, wis: 10_000, dex: 10_000, agi: 10_000 };
  const labels = [
    "Aleksandra Wiśniewska-Kowalczyk 근위대장",
    "북부 산악 연합 제3 기계화 정찰대 선임 조종사",
    "Jo",
    "",
    "Bartholomew Fitzgerald-Northwind III",
    "ㅇ",
  ];
  const unit = (index: number) => ({
    label: labels[index] ?? "",
    kind: index % 2 === 0 ? "cyborg" : "creature",
    level: 999,
    rebirths: 0,
    initial: max,
    kPm: max,
    elements: index === 2 ? zeros : tens,
    weapon:
      index % 2 === 0
        ? {
            kind: "custom",
            spec: {
              physical: { attack: 1_000_000 },
              elemental: { attack: 999_999 },
              basic: "elemental",
              appropriate: { str: 1, int: 1, dex: 1, agi: 1_000_000 },
              hitPm: 1_000_000,
              critPm: 1_000_000,
              intervalMs: 60_000,
              range: 32,
              arc: true,
              staminaCost: 1_000_000,
              mpCost: 1_000_000,
              elementsPm: tens.map(() => 1_000_000),
            },
          }
        : { kind: "natural" },
    equipment: [],
    gear: {
      rows: [{ id: "hp", value: 1_000_000 }],
      defenseFlat: 1_000_000,
      penetrationPm: 1000,
      resistPm: tens.map(() => -1000),
      primaries: { str: -10_000, vit: 0, int: 0, wis: 0, dex: 0, agi: 10_000 },
    },
    skills: ["power_strike", "fire_bolt", "shock_bash", "war_cry", "first_aid", "iron_skin"].map((id) => ({
      id,
      grade: 10,
    })),
    row: (["front", "middle", "back"] as const)[index % 3],
  });
  const party = { units: Array.from({ length: 6 }, (_, index) => unit(index)), retreatHpPct: 99 };
  return { a: party, b: party };
}

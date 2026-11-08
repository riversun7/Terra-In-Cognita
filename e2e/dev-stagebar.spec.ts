// 개발 편집기의 담은 변경 막대가 휴대폰 폭(390px)에서 하단 탭에 가리지 않는지 — 아이템·스킬·설정 칸·건물 편집기·밸런스 가중치.
// 막대는 화면 아래에 붙고(sticky) 하단 탭이 있으면 그 위로 띄운다(styles/dev.css --dev-dock-bottom, ADR 2026-11-02-dev-ui).
// - 막대를 담은 상자 위 끝을 위 띠 아래에 두어 막대가 아래에 붙게 한 뒤, 막대 아래 끝이 하단 탭(배치 C의 솟은 지도 버튼 포함)
//   위 끝보다 위인지 본다. 붙어 있지 않으면(상자가 짧으면) 시험이 뜻이 없으므로 붙었는지도 본다.
// - 바꾼 값은 담기만 하고 적용하지 않는다(서버 값은 그대로, 다른 시험을 흔들지 않는다).
// - 사진: 개발 화면 테마 네온 다크·라이트 × 390px(E2E_SHOTS_DIR).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";

interface Editor {
  readonly name: string;
  readonly path: string;
  /** 준비되면 data-status="ready"가 붙는 화면 */
  readonly screen: string;
  /** 화면을 연 뒤 먼저 누를 것(탭 고르기 등) */
  readonly before?: string;
  readonly bar: string;
  /** 막대가 뜨게 값을 하나 담는다 */
  readonly stage: (page: Page) => Promise<void>;
}

const EDITORS: readonly Editor[] = [
  {
    name: "items",
    path: "/dev/items",
    screen: ".ie-screen",
    bar: ".ie-stagebar",
    stage: async (page) => {
      await page.locator('.ie-item[data-item="test_sword"]').click();
      await expect(page.locator(".ie-editing")).toBeVisible();
      await page.locator(".ie-editing .ie-duplicate").click();
      await expect(page.locator(".ie-stagebar")).toHaveAttribute("data-count", "1");
    },
  },
  {
    name: "skills",
    path: "/dev/skills",
    screen: ".sk-screen",
    bar: ".sk-stagebar",
    stage: async (page) => {
      await page.locator('.sk-item[data-skill="power_strike"]').click();
      await expect(page.locator(".sk-editing")).toHaveAttribute("data-skill", "power_strike");
      await page
        .locator(".sk-editing")
        .getByLabel(message("ko", "dev_skills_field_cost"), { exact: true })
        .fill("12");
      await expect(page.locator(".sk-editing")).toHaveAttribute("data-dirty", "");
    },
  },
  {
    name: "tuning",
    path: "/dev/tuning",
    screen: ".tp-screen",
    bar: ".tp-pending",
    stage: async (page) => {
      const row = page.locator('.tp-row[data-id="n39_grant_base"]');
      await row.locator(".tp-input").fill("90");
      await row.locator(".tp-stage").click();
      await expect(row).toHaveAttribute("data-staged", "");
    },
  },
  {
    name: "buildings",
    path: "/dev/buildings",
    screen: ".be-screen",
    bar: ".be-stagebar",
    stage: async (page) => {
      await page.locator('.be-row-button[data-facility="farm"]').click();
      await expect(page.locator(".be-detail")).toHaveAttribute("data-facility", "farm");
      await page
        .locator(
          '.be-detail .be-band[data-band="0"] .be-material[data-item="pine_log"] .be-material-qty input',
        )
        .fill("10");
      await expect(page.locator(".be-stagebar")).toHaveAttribute("data-count", "1");
    },
  },
  {
    name: "balance",
    path: "/dev/balance",
    before: "#bp-tab-weights",
    screen: ".bp-weights-tab",
    bar: ".bp-pending",
    stage: async (page) => {
      const cell = page.locator(".bp-weights tbody tr").first().locator('td[data-field="str"]');
      const input = cell.locator("input");
      await input.fill(String(Number(await input.inputValue()) + 1));
      await input.press("Enter");
      await expect(cell).toHaveAttribute("data-state", "staged");
    },
  },
];

/** 막대·하단 탭 자리(화면 좌표, CSS px). 막대를 담은 상자 위 끝을 위 띠 아래에 두고 잰다 */
async function dockGeometry(page: Page, bar: string) {
  return page.locator(bar).evaluate((element) => {
    if (!(element instanceof HTMLElement) || element.parentElement === null) throw new Error("막대가 없다");
    const top = document.querySelector(".frame-top")?.getBoundingClientRect().bottom ?? 0;
    const container = element.parentElement.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, container - top), behavior: "instant" });
    const placed = element.getBoundingClientRect();
    // 붙지 않았다면 놓일 자리: sticky를 잠깐 끄고 잰다
    element.style.position = "static";
    const natural = element.getBoundingClientRect();
    element.style.position = "";
    const tabTops = [...document.querySelectorAll(".tabbar, .tab-map-button")].map(
      (tab) => tab.getBoundingClientRect().top,
    );
    return {
      barTop: placed.top,
      barBottom: placed.bottom,
      naturalTop: natural.top,
      tabTop: Math.min(...tabTops),
      tabCount: tabTops.length,
    };
  });
}

for (const devTheme of ["neon", "light"] as const satisfies readonly DevTheme[]) {
  test.describe(`390px ${devTheme}`, () => {
    test.use({ account: "dev", devTheme });

    for (const editor of EDITORS) {
      test(`${editor.name}: 담은 변경 막대가 하단 탭 위에 붙는다 (${devTheme})`, async ({
        page,
        deviceErrors,
      }) => {
        await page.goto(editor.path);
        if (editor.before !== undefined) await page.locator(editor.before).click();
        await expect(page.locator(editor.screen)).toHaveAttribute("data-status", "ready", {
          timeout: 20_000,
        });
        await expect(page.locator("html")).toHaveAttribute("data-tabbar", "c");
        await editor.stage(page);
        await expect(page.locator(editor.bar)).toBeVisible();
        const geometry = await dockGeometry(page, editor.bar);
        expect(geometry.tabCount, "하단 탭").toBeGreaterThan(0);
        // 막대가 아래에 붙었다(제자리보다 위로 올라와 있다)
        expect(geometry.naturalTop, "막대가 화면 아래에 붙음").toBeGreaterThan(geometry.barTop + 1);
        expect(geometry.barBottom, "막대 아래 끝 ≤ 하단 탭 위 끝").toBeLessThanOrEqual(geometry.tabTop);
        await shot(page, `dev-stagebar-${editor.name}-${devTheme}-390`);
        expect(deviceErrors).toEqual([]);
      });
    }
  });
}

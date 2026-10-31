// 앱 뼈대 W3 화면 시험 — 복귀 요약(ADR 2026-10-29-app-shell 2·8·13절, D-266·D-6014, W3 검토 지적 6).
// 시안 자료(dev 계정 + 기기 표시, test.use의 preview)를 켜면 summary.get이 늘 show: true다(8시간 동안의 칸 4종,
// apps/server/src/summary/summary.ts) → 앱을 켤 때마다 뜬다. 실제 계정은 사건 출처가 없어 늘 show: false다(inbox.spec.ts 플레이어).
// - 대화상자는 기록 칸을 쌓지 않는다. [확인]·Esc는 요약만 닫는다: /로 켰으면 홈, 주소로 바로 연 화면이면 그 화면에 남는다(D-266).
// - 숫자를 누르면 요약을 닫고 앱 안에서 그 화면으로 간다(쌓기). 문서를 다시 받지 않고, 요약을 다시 묻지 않는다.
// 자리는 대화상자 부품의 class로 찾는다(apps/game/src/summary/SummaryDialog.tsx). 문구는 메시지 원본(helpers/messages.ts).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { watchTrpc } from "./helpers/trpc.ts";

interface Entry {
  /** history.length */
  length: number;
  /** 라우터가 history.state에 둔 순번(없으면 -1)·겹침 */
  index: number;
  overlay: string | null;
  /** 주소(경로 + 검색어) */
  path: string;
}

/** 지금 기록 칸 */
const entryOf = (page: Page): Promise<Entry> =>
  page.evaluate(() => {
    const state: unknown = history.state;
    const index: unknown = typeof state === "object" && state !== null ? Reflect.get(state, "index") : null;
    const overlay: unknown =
      typeof state === "object" && state !== null ? Reflect.get(state, "overlay") : null;
    return {
      length: history.length,
      index: typeof index === "number" ? index : -1,
      overlay: typeof overlay === "string" ? overlay : null,
      path: `${location.pathname}${location.search}`,
    };
  });

/** 복귀 요약이 열릴 때까지(처음 켜는 맥락은 조각을 받느라 부하가 크면 오래 걸린다) */
async function openedSummary(page: Page): Promise<Locator> {
  const dialog = page.locator("dialog.summary-dialog");
  await expect(dialog).toHaveAttribute("open", "", { timeout: 20_000 });
  return dialog;
}

/** 틀 안 화면이 그려졌다(본문 제목) */
async function framed(page: Page): Promise<void> {
  await expect(page.locator(".frame #main h1")).toBeVisible();
}

test.describe("시안 자료(dev)", () => {
  test.use({ account: "dev", preview: "dev" });

  test("숫자를 누르면 요약을 닫고 앱 안에서 그 화면으로 간다(쌓기, 문서·요약을 다시 받지 않는다). 뒤로 → 홈, 요약은 다시 뜨지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    const calls = watchTrpc(page);
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents.push(request.url());
    });
    await page.goto("/");
    const dialog = await openedSummary(page);
    await expect(dialog.locator("h2.summary-title")).toHaveText(message("ko", "summary_title"));
    // 덮는 길이: 시안 자료는 8시간(단위 이름은 앱처럼 브라우저 Intl이 붙인다)
    const span = await page.evaluate(() =>
      new Intl.NumberFormat("ko", { style: "unit", unit: "hour", unitDisplay: "long" }).format(8),
    );
    await expect(dialog.locator(".summary-head .lead")).toHaveText(
      message("ko", "summary_period", { duration: span }),
    );
    // 칸 4개 모두 "시험 자료"
    await expect(dialog.locator(".summary-tag")).toHaveCount(4);
    // 뜰 때 기록 칸을 쌓지 않는다(서랍과 달리 겹침 칸이 없다)
    expect(await entryOf(page)).toMatchObject({ index: 0, overlay: null, path: "/" });
    expect(await smallTapTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await shot(page, "summary-pastel-ko-390");

    await page.evaluate(() => {
      Reflect.set(window, "terraE2eSameDocument", true);
    });
    const before = await entryOf(page);
    const loaded = documents.length;
    const link = dialog.locator("a.summary-link").first();
    const href = await link.getAttribute("href");
    if (href === null) throw new Error("숫자 링크에 href가 없습니다");
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === href);
    await expect(dialog).toHaveCount(0);
    await framed(page);
    expect(await entryOf(page)).toEqual({
      length: before.length + 1,
      index: before.index + 1,
      overlay: null,
      path: href,
    });
    // 같은 문서다(새로 읽지 않았다), 요약은 한 번만 물었다
    expect(await page.evaluate(() => Reflect.get(window, "terraE2eSameDocument"))).toBe(true);
    expect(documents).toHaveLength(loaded);
    expect(calls.filter((call) => call.procedures.includes("summary.get"))).toHaveLength(1);

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await framed(page);
    expect(await entryOf(page)).toMatchObject({ index: before.index, overlay: null, path: "/" });
    await expect(dialog).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("[확인]은 요약만 닫는다: 주소로 바로 연 화면(/units)에 남고 기록 칸도 그대로다(D-266)", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/units");
    const dialog = await openedSummary(page);
    const before = await entryOf(page);
    expect(before).toMatchObject({ index: 0, overlay: null, path: "/units" });
    await dialog.getByRole("button", { name: message("ko", "summary_confirm"), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await entryOf(page)).toEqual(before);
    await framed(page);
    expect(deviceErrors).toEqual([]);
  });

  test.describe("다크·영어", () => {
    test.use({ theme: "dark", language: "en" });

    test("Esc로 닫으면 요약만 닫히고 홈에 남는다: 주소·기록 칸 그대로", async ({ page, deviceErrors }) => {
      await page.goto("/");
      const dialog = await openedSummary(page);
      await expect(dialog.locator("h2.summary-title")).toHaveText(message("en", "summary_title"));
      await expect(dialog.locator(".summary-hint")).toHaveText(message("en", "summary_hint"));
      expect(await smallTapTargets(page)).toEqual([]);
      expect(await horizontalOverflow(page)).toEqual([]);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, "summary-dark-en-390");
      const before = await entryOf(page);
      expect(before).toMatchObject({ index: 0, overlay: null, path: "/" });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(await entryOf(page)).toEqual(before);
      await framed(page);
      expect(deviceErrors).toEqual([]);
    });
  });
});

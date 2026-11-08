// 생명 수치 회복 화면 시험 — 기획 D-514(HP·아머도 분마다 차고, 쓰러진 유닛도 차되 부상 단계만큼 느리며 불이익, 병원 치료),
// docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-07, D-514·287)".
// - 다친 본체(응답을 고쳐 본다: HP 0, 중상, 나을 때까지 HP 회복 ¼ 구간): 머리 판에 HP·아머·쉴드 분당 회복 안내와 "부상(중상)" 안내,
//   다음 분 경계에 기기가 구간 회복(느린 HP)만큼 더한다(서버에 다시 묻지 않음).
// - admin(개발 받기 권한): 보유 물건 개발 판의 [병원 치료] → 서버가 치료하고(dev_treat_unit, 프로토콜 9) 알림, 생명 수치를 다시 받는다.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(사이보그 머리 판 — 다친 본체, 개발 판 병원 치료 줄). 폴더는 E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const record = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error("응답 모양이 다릅니다");
  return value;
};

/** 정규식 특수 문자를 글자 그대로 */
const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 본체 HP 회복(분당, 옛 문서 식 초당 2.2 × 60)과 중상 ‰(250) — 시험이 정한 값 */
const HP_REGEN = 132;
const SLOW_HP = 33;

/** vitals.list data → 본체: HP 0(쓰러짐)·아머 0·쉴드 절반, 중상 4시간, 나을 때까지 HP 회복 ¼. 다음 분 경계까지 약 2초 */
function injureCyborg(data: unknown): void {
  const response = record(data);
  const units = response.units;
  if (!Array.isArray(units)) throw new Error("units");
  const cyborg = units.map(record).find((unit) => unit.cyborg === true);
  if (!cyborg) throw new Error("사이보그 생명 수치가 없습니다");
  const max = record(cyborg.max);
  const now = Number(response.generatedAt);
  const until = now + 4 * 3_600_000;
  cyborg.values = { hp: 0, armor: 0, shield: Math.floor(Number(max.shield) / 2) };
  cyborg.regen = { hp: HP_REGEN, armor: 2, shield: 10 };
  cyborg.at = now - 58_000;
  cyborg.phases = [{ until, regen: { hp: SLOW_HP, armor: 2, shield: 10 } }];
  cyborg.injury = { stage: 2, until };
}

async function cyborgVitals(page: Page) {
  const vitals = page.locator(".cyborg-profile [data-vitals]");
  await expect(vitals).toBeVisible({ timeout: 15_000 });
  return vitals;
}

async function hpValue(page: Page): Promise<number> {
  const text =
    (await page.locator('.cyborg-profile .roster-meter[data-kind="hp"] .roster-meter-value').textContent()) ??
    "";
  return Number(text.split("/")[0]?.replace(/[^\d]/g, ""));
}

async function openDev(page: Page) {
  const dev = page.locator(".holdings-dev");
  await expect(dev).toBeVisible({ timeout: 15_000 });
  if ((await dev.getAttribute("open")) === null) await dev.locator("summary").click();
  return dev;
}

test.describe("플레이어: 다친 본체의 회복 안내(D-514)", () => {
  test.use({ account: "player" });

  test("HP·아머·쉴드 분당 회복과 부상 안내, 다음 분 경계에 느린 HP만큼 찬다(기기 셈)", async ({
    page,
    deviceErrors,
  }) => {
    let vitalsCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("vitals.list")) vitalsCalls += 1;
    });
    await rewriteTrpc(page, { "summary.get": hideSummary, "vitals.list": injureCyborg });
    await page.goto("/cyborg");
    const vitals = await cyborgVitals(page);
    await expect(vitals.locator('[data-regen="hp"]')).toHaveText(
      message("ko", "vitals_regen_hp_note", { amount: String(SLOW_HP) }),
    );
    await expect(vitals.locator('[data-regen="armor"]')).toHaveText(
      message("ko", "vitals_regen_armor_note", { amount: "2" }),
    );
    await expect(vitals.locator('[data-regen="shield"]')).toBeVisible();
    // 부상 안내 = 단계 이름(D-525 중상) + 한 단계 나을 때까지 남은 시간·분(나을 시각 = 응답 + 4시간, 분은 올림)
    const [before, after] = message("ko", "vitals_injury_note", {
      stage: message("ko", "roster_injury_2"),
      time: "@",
    }).split("@");
    await expect(vitals.locator('[data-injury="2"]')).toHaveText(
      new RegExp(`^${escapeRegExp(before ?? "")}4시간 [01]분${escapeRegExp(after ?? "")}$`),
    );
    // 회복이 있으니 "저절로 차지 않음"은 없다
    await expect(vitals.getByText(message("ko", "vitals_no_regen_note"))).toHaveCount(0);
    expect(await hpValue(page)).toBe(0);
    await expect.poll(() => hpValue(page), { timeout: 10_000 }).toBe(SLOW_HP);
    expect(vitalsCalls).toBe(1);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("admin: 개발 시험 병원 치료(D-514)", () => {
  test.use({ account: "admin" });

  test("[병원 치료] → 서버가 치료하고 알림, 생명 수치를 다시 받는다", async ({ page, deviceErrors }) => {
    let vitalsCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("vitals.list")) vitalsCalls += 1;
    });
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgVitals(page);
    const dev = await openDev(page);
    await expect(dev.locator(".holdings-dev-treat .roster-note")).toHaveText(
      message("ko", "holdings_dev_treat_note"),
    );
    const before = vitalsCalls;
    await dev.getByRole("button", { name: message("ko", "holdings_dev_treat"), exact: true }).click();
    await expect(page.locator(".holdings .holding-notice")).toContainText(
      message("ko", "holdings_done_treat"),
    );
    await expect.poll(() => vitalsCalls, { timeout: 10_000 }).toBeGreaterThan(before);
    expect(deviceErrors).toEqual([]);
  });
});

for (const viewport of ["phone", "desktop"] as const) {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    for (const language of ["ko", "en"] as const satisfies readonly Language[]) {
      const width = VIEWPORTS[viewport].viewport.width;
      const suffix = `${theme}-${language}-${String(width)}`;
      test.describe(`사진 ${String(width)} ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "admin", theme, language });

        test("다친 본체 머리 판과 개발 판 병원 치료 줄", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary, "vitals.list": injureCyborg });
          await page.goto("/cyborg");
          const vitals = await cyborgVitals(page);
          await expect(vitals.locator("[data-injury]")).toBeVisible();
          await elementShot(page.locator(".cyborg-profile"), `life-cyborg-${suffix}`);
          const dev = await openDev(page);
          await expect(dev.locator("[data-dev-treat]")).toBeVisible();
          await elementShot(dev, `life-dev-${suffix}`);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
}

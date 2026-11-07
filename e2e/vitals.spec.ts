// 생명 수치(HP·아머·쉴드) 화면 시험 — 기획 D-512, docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)".
// - 플레이어(전역 준비가 만든 사이보그): 서버 vitals.list가 본체를 가득으로 보낸다 → 머리 판에 막대 셋(값 = 최대), 안내 없음.
// - 다친 본체(응답을 고쳐 본다): HP·아머가 모자라면 "저절로 차지 않음" 안내, 쉴드는 다음 분 경계에 기기가 쉴드 재생만큼 더한다
//   (서버에 다시 묻지 않음 — 기기 셈).
// - 유닛 목록·상세(dev 시안 자료 한 줄을 세계 유닛으로 고쳐 본다): 목록 줄의 "HP 값/최대" 표, 상세의 막대.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(사이보그 머리 판, 유닛 상세). 폴더는 E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 시험이 세계 유닛으로 바꾸는 시안 유닛 ID */
const FAKE_UNIT = 424_242;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const record = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error("응답 모양이 다릅니다");
  return value;
};

const pools = (value: unknown) => {
  const entry = record(value);
  return { hp: Number(entry.hp), armor: Number(entry.armor), shield: Number(entry.shield) };
};

/** vitals.list data → 본체를 다치게 한다: HP ⅓, 아머 0, 쉴드 최대 − 25(분당 10), 다음 분 경계까지 약 2초 */
function hurtCyborg(data: unknown): void {
  const response = record(data);
  const units = response.units;
  if (!Array.isArray(units)) throw new Error("units");
  const cyborg = units.map(record).find((unit) => unit.cyborg === true);
  if (!cyborg) throw new Error("사이보그 생명 수치가 없습니다");
  const max = pools(cyborg.max);
  cyborg.values = { hp: Math.floor(max.hp / 3), armor: 0, shield: Math.max(0, max.shield - 25) };
  cyborg.regen = { hp: 0, armor: 0, shield: 10 };
  cyborg.at = Number(response.generatedAt) - 58_000;
}

/** vitals.list data → 세계 유닛 하나(시안 유닛을 고친 것)의 생명 수치를 더한다 */
function addUnitVitals(data: unknown): void {
  const response = record(data);
  const units = Array.isArray(response.units) ? response.units : [];
  response.units = [
    ...units,
    {
      unit: FAKE_UNIT,
      cyborg: false,
      values: { hp: 12, armor: 0, shield: 5 },
      max: { hp: 40, armor: 10, shield: 20 },
      regen: { hp: 0, armor: 0, shield: 4 },
      at: Number(response.generatedAt),
    },
  ];
}

/** units.list data(dev 시안) → 첫 유닛을 세계 유닛(w…)으로 */
function realizeFirstUnit(data: unknown): void {
  const response = record(data);
  const units = response.units;
  if (!Array.isArray(units) || units.length === 0) throw new Error("시안 유닛이 없습니다");
  const first = record(units[0]);
  first.id = `w${String(FAKE_UNIT)}`;
  first.name = "Vitals Test";
  first.preview = false;
}

async function cyborgVitals(page: Page) {
  const vitals = page.locator(".cyborg-profile [data-vitals]");
  await expect(vitals).toBeVisible({ timeout: 15_000 });
  return vitals;
}

/** 막대 값 글 "값 / 최대" → [값, 최대] */
async function meterValues(
  page: Page,
  kind: string,
  scope = page.locator("body"),
): Promise<[number, number]> {
  const text =
    (await scope.locator(`.roster-meter[data-kind="${kind}"] .roster-meter-value`).textContent()) ?? "";
  const [value = Number.NaN, max = Number.NaN] = text
    .split("/")
    .map((part) => Number(part.replace(/[^\d]/g, "")));
  return [value, max];
}

test.describe("플레이어: 사이보그 생명 수치", () => {
  test.use({ account: "player" });

  test("서버 값: 다치지 않은 본체는 막대 셋이 가득이고 안내가 없다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    const vitals = await cyborgVitals(page);
    await expect(vitals.locator(".roster-meter")).toHaveCount(3);
    for (const kind of ["hp", "armor", "shield"]) {
      const [value, max] = await meterValues(page, kind, vitals);
      expect(max).toBeGreaterThan(0);
      expect(value).toBe(max);
    }
    await expect(vitals.locator(".roster-note")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("다친 본체: 안내 둘, 쉴드는 다음 분 경계에 기기가 분당 회복만큼 더한다(서버에 다시 묻지 않음)", async ({
    page,
    deviceErrors,
  }) => {
    let vitalsCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("vitals.list")) vitalsCalls += 1;
    });
    await rewriteTrpc(page, { "summary.get": hideSummary, "vitals.list": hurtCyborg });
    await page.goto("/cyborg");
    const vitals = await cyborgVitals(page);
    await expect(vitals.getByText(message("ko", "vitals_no_regen_note"))).toBeVisible();
    await expect(vitals.getByText(message("ko", "vitals_regen_note", { amount: "10" }))).toBeVisible();
    const [hp, hpMax] = await meterValues(page, "hp", vitals);
    expect(hp).toBe(Math.floor(hpMax / 3));
    // HP가 ⅓이면 40% 문턱 아래라 경고 색
    await expect(vitals.locator('.roster-meter[data-kind="hp"] .roster-meter-track')).toHaveAttribute(
      "data-warn",
      "true",
    );
    const [shield, shieldMax] = await meterValues(page, "shield", vitals);
    expect(shield).toBe(Math.max(0, shieldMax - 25));
    await expect
      .poll(async () => (await meterValues(page, "shield", vitals))[0], { timeout: 10_000 })
      .toBe(Math.min(shieldMax, shield + 10));
    expect(vitalsCalls).toBe(1);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev: 유닛 목록·상세 생명 수치", () => {
  test.use({ account: "dev", preview: "dev" });

  test("목록 줄에 HP 값/최대, 상세에 막대와 안내", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "units.list": realizeFirstUnit,
      "vitals.list": addUnitVitals,
    });
    await page.goto("/units");
    const chip = page.locator('.units-row [data-vitals="hp"]');
    await expect(chip).toHaveText(message("ko", "vitals_hp_short", { value: "12", max: "40" }), {
      timeout: 15_000,
    });
    await expect(chip).toHaveAttribute("data-tone", "injured");
    // 시안 유닛(p…)에는 생명 수치가 없다
    await expect(page.locator('.units-row [data-vitals="hp"]')).toHaveCount(1);
    await page.locator(".units-row", { has: chip }).locator(".units-row-main").click();
    const detail = page.locator(".units-detail [data-vitals]");
    await expect(detail).toBeVisible();
    expect(await meterValues(page, "hp", detail)).toEqual([12, 40]);
    expect(await meterValues(page, "armor", detail)).toEqual([0, 10]);
    expect(await meterValues(page, "shield", detail)).toEqual([5, 20]);
    await expect(detail.getByText(message("ko", "vitals_regen_note", { amount: "4" }))).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });
});

for (const viewport of ["phone", "desktop"] as const) {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    for (const language of ["ko", "en"] as const satisfies readonly Language[]) {
      const width = VIEWPORTS[viewport].viewport.width;
      const suffix = `${theme}-${language}-${String(width)}`;
      test.describe(`사진 ${String(width)} ${theme} ${language} 사이보그`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "player", theme, language });

        test("사이보그 머리 판(다친 본체)", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, {
            "summary.get": hideSummary,
            "vitals.list": hurtCyborg,
          });
          await page.goto("/cyborg");
          const vitals = await cyborgVitals(page);
          await expect(vitals.locator(".roster-note")).toHaveCount(2);
          await elementShot(page.locator(".cyborg-profile"), `vitals-cyborg-${suffix}`);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(deviceErrors).toEqual([]);
        });
      });

      test.describe(`사진 ${String(width)} ${theme} ${language} 유닛`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "dev", preview: "dev", theme, language });

        test("유닛 상세(세계 유닛으로 고친 시안 한 줄)", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, {
            "summary.get": hideSummary,
            "units.list": realizeFirstUnit,
            "vitals.list": addUnitVitals,
          });
          await page.goto("/units");
          const chip = page.locator('.units-row [data-vitals="hp"]');
          await expect(chip).toBeVisible({ timeout: 15_000 });
          await page.locator(".units-row", { has: chip }).locator(".units-row-main").click();
          await expect(page.locator(".units-detail [data-vitals]")).toBeVisible();
          await shot(page, `vitals-units-${suffix}`);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
}

// 시작 국가 설정 화면 시험 — /dev/nations (docs/adr/2026-11-10-nation-editor.md).
// - dev: 개발자 홈의 줄로 들어간다. 이름을 고치고(이름 만들기 후보도), 국가 마크를 다시 만들고, 시작 수(주거)를 바꾸면 담기고 [적용]하면 그
//   세계에 바로 든다(nations.list). 그림을 올려 자르면(끌기·키·확대) 미리 보기에 그 그림이 보이고 그림 길이 PNG를 준다. [생성 마크로 되돌리기].
//   [이 세계의 NPC 국가에 반영]은 미리 보기(바꾸지 않음)를 보인다. [팩 값으로]를 적용하면 팩 값.
// - player: 권한 없음 화면.
// - 사진 6장: 1440 × 개발 화면 테마 네온·라이트 × 한국어·영어, 390 × 네온 한국어·라이트 영어(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 세계에 서지 않는 국가(5번째 프리셋)만 고치고, 처음과 끝에 덮어쓰기·올린 마크를 모두 지운다
// (세력 화면 시험은 국가 1 = 16번째 프리셋의 이름을 본다).
import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const NATION = "placeholder_nation_05";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). input이 있으면 POST(쓰기), 없으면 GET */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const mutation = body !== undefined;
      const response = await fetch(
        `/api/trpc/${name}`,
        mutation
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return { status: response.status, data: get(get(json, "result"), "data") };
    },
    { procedure, input },
  );
}

const nationRow = (data: unknown, id: string): unknown =>
  list(field(data, "nations")).find((row) => field(field(row, "entry"), "id") === id);

/** 덮어쓰기와 올린 마크를 모두 지운다(팩 값으로) */
async function resetNations(page: Page): Promise<void> {
  const current = await trpc(page, "nations.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`nations.list ${current.status}`);
  for (const row of list(field(current.data, "nations")))
    if (field(row, "uploaded") !== null) {
      const removed = await trpc(page, "nations.removeEmblem", { id: field(field(row, "entry"), "id") });
      if (removed.status !== 200) throw new Error(`nations.removeEmblem ${removed.status}`);
    }
  const changes = list(field(current.data, "nations")).flatMap((row) =>
    field(row, "origin") === "edited"
      ? [{ op: "revert", id: field(field(row, "entry"), "id"), baseHash: field(row, "hash") }]
      : [],
  );
  if (changes.length === 0) return;
  const reverted = await trpc(page, "nations.save", { expectedRevision: revision, changes });
  if (reverted.status !== 200) throw new Error(`nations.save revert ${reverted.status}`);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

/** 시험 그림(가로로 긴 PNG): 왼쪽 반은 붉은색, 오른쪽 반은 푸른색 — 자르는 자리에 따라 색이 달라진다 */
function testImage(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = 1 + width * 4;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * row + 1 + x * 4;
      const left = x < width / 2;
      raw[at] = left ? 200 : 30;
      raw[at + 1] = 50;
      raw[at + 2] = left ? 40 : 190;
      raw[at + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

const screen = (page: Page) => page.locator(".ne-screen");
const stagebar = (page: Page) => page.locator(".ne-stagebar");
const item = (page: Page, id: string) => page.locator(`.ne-item[data-nation="${id}"]`);
const detail = (page: Page) => page.locator(".ne-detail");

async function ready(page: Page, path = "/dev/nations"): Promise<void> {
  await page.goto(path);
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}
async function fresh(page: Page, path = "/dev/nations"): Promise<void> {
  await ready(page, path);
  await resetNations(page);
  await page.reload();
  await expect(screen(page)).toHaveAttribute("data-status", "ready");
}

test.describe("개발자", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("이름·국가 마크·시작 수를 고쳐 담고 [적용]하면 바로 든다. 그림을 올려 자르고, 이 세계에 반영을 미리 보고, 팩 값으로 되돌린다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/nations"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/nations");
    await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await resetNations(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");

    // 목록: 국가 16줄, 임시 이름이 없다
    await expect(page.locator(".ne-item")).toHaveCount(16);
    await expect(page.locator(".ne-list")).not.toContainText("임시");
    await expect(item(page, "placeholder_nation_01")).toContainText("메리데일");
    await item(page, NATION).click();
    await expect(detail(page)).toHaveAttribute("data-nation", NATION);
    await expect(detail(page).locator(".ne-preview")).toContainText("윈미어");
    await expect(detail(page).getByTestId("ne-money")).toContainText("1,234 EDL");

    // [국가 이름 만들기]: 후보 다섯에서 하나를 고르면 두 언어 이름이 들고 담긴다
    const nameKo = detail(page).getByLabel(message("ko", "dev_nations_field_name_ko"), { exact: true });
    const nameEn = detail(page).getByLabel(message("ko", "dev_nations_field_name_en"), { exact: true });
    const generator = detail(page).locator('.ne-namegen[data-kind="nation"]');
    await generator.locator(".ne-namegen-open").click();
    await expect(generator.locator(".ne-namegen-pick")).toHaveCount(5);
    const candidate = (await generator.locator(".ne-namegen-pick").first().innerText()).split(" · ");
    await generator.locator(".ne-namegen-pick").first().click();
    await expect(nameKo).toHaveValue(candidate[0] ?? "");
    await expect(nameEn).toHaveValue(candidate[1] ?? "");
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");

    // 이름을 손으로 고친다
    await nameKo.fill("시험 나라");
    await nameEn.fill("Testland");
    await expect(detail(page).locator(".ne-preview-name")).toContainText("시험 나라");
    await expect(item(page, NATION)).toContainText("시험 나라");

    // [다시 만들기]: 마크 사양이 바뀐다
    const spec = () =>
      detail(page)
        .locator(".ne-emblem-fields select")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node instanceof HTMLSelectElement ? node.value : "")).join("/"),
        );
    const before = await spec();
    await detail(page).locator(".ne-emblem-reroll").click();
    await expect.poll(spec).not.toBe(before);
    const rerolled = await spec();

    // 시작 수: 새 시작 도시의 주거 60 → 처음 인구 45명(60 × 750‰)
    const housing = detail(page).getByLabel(message("ko", "dev_nations_field_housing"), { exact: true });
    await housing.fill("60");
    await expect(detail(page).getByTestId("ne-population")).toContainText("45");

    // 검사 통과 → [적용]
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".ne-note").fill("e2e 시작 국가");
    await stagebar(page).locator(".ne-apply-batch").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(item(page, NATION)).toHaveAttribute("data-changed", "");
    const saved = nationRow((await trpc(page, "nations.list")).data, NATION);
    expect(field(saved, "origin")).toBe("edited");
    expect(field(field(saved, "entry"), "name")).toEqual({ ko: "시험 나라", en: "Testland" });
    expect(field(field(field(saved, "entry"), "personality"), "startHousing")).toBe(60);
    const emblem = field(field(saved, "entry"), "emblem");
    expect(
      [
        field(emblem, "shape"),
        field(emblem, "division"),
        field(emblem, "charge"),
        field(emblem, "scheme"),
      ].join("/"),
    ).toBe(rerolled);

    // 그림 올리기 → 자르기(화살표 키·확대) → 미리 보기에 올린 그림
    await detail(page)
      .locator(".ne-emblem-input")
      .setInputFiles({
        name: "emblem.png",
        mimeType: "image/png",
        buffer: testImage(600, 400),
      });
    const view = detail(page).locator(".ne-cropper-view");
    await expect(view).toBeVisible();
    await expect(view).toHaveAttribute("data-zoom", "1.00");
    await expect(view).toHaveAttribute("data-cx", "300");
    await view.focus();
    await page.keyboard.press("Equal");
    await expect(view).not.toHaveAttribute("data-zoom", "1.00");
    // → 키: 자를 자리가 오른쪽(푸른 쪽)으로 간다
    for (let n = 0; n < 6; n++) await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => Number(await view.getAttribute("data-cx"))).toBeGreaterThan(300);
    await expect(detail(page).locator(".ne-cropper-small")).toHaveCount(3);
    await detail(page).locator(".ne-cropper-done").click();
    await expect(view).toHaveCount(0, { timeout: 15_000 });
    const uploadedImage = detail(page).locator(".ne-emblem-up");
    await expect(uploadedImage).toBeVisible();
    await expect(detail(page).locator(".ne-preview img.nation-emblem-image").first()).toBeVisible();
    await expect(item(page, NATION).locator("img.nation-emblem-image")).toBeVisible();
    const src = await uploadedImage.getAttribute("src");
    expect(src).toMatch(/^\/api\/nation-emblems\/[0-9a-f]{64}\.png$/);
    const image = await page.request.get(src ?? "");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");
    const bytes = await image.body();
    // 256 × 256 PNG(IHDR)
    expect(bytes.readUInt32BE(16)).toBe(256);
    expect(bytes.readUInt32BE(20)).toBe(256);
    // [생성 마크로 되돌리기]
    await detail(page).locator(".ne-emblem-remove").click();
    await expect(uploadedImage).toHaveCount(0);
    await expect(item(page, NATION).locator("img.nation-emblem-image")).toHaveCount(0);

    // [이 세계의 NPC 국가에 반영]: 미리 보기만(세계에 서지 않는 국가만 고쳤으므로 바뀔 줄이 없다)
    await page.locator(".ne-apply-open").click();
    const panel = page.locator(".ne-apply");
    await expect(panel).toHaveAttribute("data-dry", "yes", { timeout: 15_000 });
    await expect(panel).toHaveAttribute("data-updated", "0");
    await expect(panel.locator(".ne-apply-run")).toHaveAttribute("aria-disabled", "true");
    await expect(panel.locator('tr[data-action="update"]')).toHaveCount(0);
    await panel.locator(".ne-apply-close").click();
    await expect(panel).toHaveCount(0);

    // [팩 값으로] → 적용하면 팩 값
    await detail(page).locator(".ne-revert").click();
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".ne-apply-batch").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(item(page, NATION)).not.toHaveAttribute("data-changed", "");
    await expect(item(page, NATION)).toContainText("윈미어");
    await resetNations(page);
    expect(deviceErrors).toEqual([]);
  });

  test("겹치는 화폐 약어는 검사가 막는다", async ({ page }) => {
    await fresh(page, `/dev/nations?nation=${NATION}`);
    await expect(detail(page)).toHaveAttribute("data-nation", NATION);
    // 국가 1의 화폐 약어(ALD)를 넣는다
    await detail(page).getByLabel(message("ko", "dev_nations_field_ticker"), { exact: true }).fill("ALD");
    await expect(stagebar(page)).toHaveAttribute("data-check", "blocked", { timeout: 10_000 });
    await expect(detail(page).locator(".ne-issues")).toContainText("placeholder_nation_01");
    await expect(stagebar(page).locator(".ne-apply-batch")).toHaveAttribute("aria-disabled", "true");
    await detail(page).locator(".ne-unstage").click();
    await expect(stagebar(page)).toHaveCount(0);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page }) => {
    await page.goto("/dev/nations");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(screen(page)).toHaveCount(0);
    // 그림 올리기도 받지 않는다
    const refused = await trpc(page, "nations.uploadEmblem", { id: NATION, pngBase64: "AAAA" });
    expect(refused.status).toBe(403);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 개발 화면 테마 둘(네온 다크·라이트)로, 보이는 화면 크기로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = [
  { theme: "neon", language: "ko", width: 1440, height: 900 },
  { theme: "light", language: "ko", width: 1440, height: 900 },
  { theme: "neon", language: "en", width: 1440, height: 900 },
  { theme: "light", language: "en", width: 1440, height: 900 },
  { theme: "neon", language: "ko", width: 390, height: 844 },
  { theme: "light", language: "en", width: 390, height: 844 },
];

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("목록·편집 판·담은 변경 막대: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await fresh(page, `/dev/nations?nation=${NATION}`);
        await expect(detail(page)).toHaveAttribute("data-nation", NATION);
        // 칸 하나를 고쳐 담은 모양도 찍는다
        await detail(page)
          .getByLabel(message(language, "dev_nations_field_housing"), { exact: true })
          .fill("60");
        await expect(stagebar(page)).toHaveAttribute("data-count", "1");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `nations-${theme}-${language}-${width}`);
        if (width < 1000) {
          // 휴대폰: 목록으로 돌아가 목록도 본다
          await detail(page).locator(".ne-back").click();
          await expect(page.locator(".ne-item").first()).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
        }
        await stagebar(page)
          .getByRole("button", { name: message(language, "dev_content_discard_all"), exact: true })
          .click();
        await stagebar(page).locator(".ce-confirm-yes").click();
        await expect(stagebar(page)).toHaveCount(0);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

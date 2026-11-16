// 세력 정체성 화면 시험 — /faction/identity·세력 화면의 "내 세력 이름과 마크" 칸·운영자 콘솔 마크 관리 탭
// (docs/adr/2026-11-11-faction-identity.md). 차례대로 도는 한 묶음이다(같은 서버·DB — 앞 시험이 남긴 값을 뒤 시험이 본다).
// 1. player: 세력 화면 "내 가문" 칸 → [가문 창설] → 이름 만들기·약어 후보·색·자동 생성 마크([다시 만들기]·틀 고르기) → [가문 창설]
//    (정체성 저장 tRPC + 창설 WebSocket house_found — 질문 926 나) → 칸에 이름·약어·마크, 가문이 생겼다. 빈 칸으로는 끝나지 않는다.
// 2. player: [그림 올리기] → 600 × 400 그림을 고르고 자르기(화살표 키·확대, 24·48·128 미리 보기) → 저장. 보낸 요청의 그림은 자른 256 × 256 PNG다
//    (원본이 아니다 — 서명·IHDR·바이트 상한·허용 청크만). 세력 화면에 올린 그림이 보이고 그림 길이 image/png를 준다.
// 3. dev(다른 플레이어): 그 이름·약어를 쓸 수 없고(확인 문구·저장 거절), player의 정체성은 그대로다. player 가문을 신고한다(질문 930 나).
// 4. admin: 운영자 콘솔 [마크 관리] 탭에 그 세력이 올린 그림·신고 수 1과 함께 보인다([신고 많은 차례]) → [마크 내리기](사유) → 내림(신고 0).
// 5. player: 세력 화면에 자동 생성 마크 + 알림(사유) → [확인]하면 알림이 사라진다.
// 6~10(질문 985 다·986 가): player가 dev(같은 나라)를 사이보그 이름으로 초대 → dev가 처리할 일·세력 화면에서 받음(가문원) → player가 소식 확인·
//    내보냄 → dev가 소식을 보고 가문 이름 신고 → admin이 [이름 되돌리기] → player 칸에 "가문 #ID"·사유 소식·이름 대기 없음.
// 사진 6장(E2E_SHOTS_DIR): 단계 390 파스텔·한국어(1), 단계 390 다크·영어, 자르기 390 파스텔·영어, 자르기 390 다크·한국어,
// 세력 화면 칸 390 파스텔·한국어(2), 마크 관리 1440 네온(4). 소속 도시 공고 칸(D-570 — house 조회에 공고를 얹음) 390 파스텔·한국어·다크·영어.
// 계정마다 속도 제한(저장 순간 10번, 그림 순간 5번)이 있어 저장은 player 2번·dev 1번(거절)만 한다. 사진 시험은 저장하지 않는다.
import { crc32, deflateSync } from "node:zlib";
import type { Locator, Page } from "@playwright/test";
import { FACTION_EMBLEM_CHUNKS, FACTION_EMBLEM_UPLOAD } from "../packages/shared/src/factionIdentity.ts";
import { readPngHeader, walkPng } from "../packages/shared/src/pngChunks.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc, watchTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";
import { ensureHouse } from "./helpers/wsCommands.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, tail]);
}

/** 시험 그림(가로 × 세로 RGBA): 왼쪽 절반 주황, 오른쪽 절반 파랑, 가운데 흰 띠 — 자른 자리가 달라지면 그림이 달라진다 */
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
      const band = Math.abs(y - height / 2) < height / 10;
      const color = band ? [245, 245, 245] : x < width / 2 ? [224, 122, 40] : [40, 90, 200];
      raw[at] = color[0] ?? 0;
      raw[at + 1] = color[1] ?? 0;
      raw[at + 2] = color[2] ?? 0;
      raw[at + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}
const ORIGINAL = testImage(600, 400);

/**
 * 화면 전체 사진: 화면 높이를 문서 높이로 늘려 찍는다(fullPage는 고정된 위 띠·하단 탭을 스크롤 자리에 그려 가운데에 겹친다 —
 * e2e/faction.spec.ts와 같은 방법). 찍은 뒤 원래 크기로 돌린다
 */
async function tallShot(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error("화면 크기를 모릅니다");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 12_000) });
  await shot(page, name);
  await page.setViewportSize(size);
}

const step = (page: Page): Locator => page.locator("form.fid-step");
const card = (page: Page): Locator => page.locator("section.faction .fid-card");
/** "내 가문" 칸의 가입 부분(질문 985 다) */
const house = (page: Page): Locator => card(page).locator('[data-testid="house-section"]');

/** /faction을 열고 정체성 칸이 그려질 때까지 */
async function openFaction(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/faction");
  await expect(card(page)).toBeVisible({ timeout: 20_000 });
}

async function openStep(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/faction/identity");
  await expect(step(page)).toBeVisible({ timeout: 20_000 });
}

/** 이름·약어를 후보에서 고른다(이름 만들기 첫 후보, 약어 첫 후보). 고른 값을 돌려준다 */
async function pickSuggestions(page: Page): Promise<{ name: string; short: string }> {
  const form = step(page);
  await form.locator(".fid-namegen-open").click();
  const first = form.locator(".fid-namegen-pick").first();
  await expect(first).toBeVisible();
  await first.click();
  const name = await form.locator(".fid-name-input").inputValue();
  expect(name.length).toBeGreaterThan(1);
  const shortPick = form.locator(".fid-short-pick").first();
  await expect(shortPick).toBeVisible();
  await shortPick.click();
  const short = await form.locator(".fid-short-input").inputValue();
  expect(short.length).toBeGreaterThanOrEqual(2);
  return { name, short };
}

/** 그림을 고르고 자르기 도구가 뜰 때까지(지연 로딩 조각) */
async function pickImage(page: Page): Promise<Locator> {
  const form = step(page);
  await form.locator('.fid-mode-input[value="upload"]').check();
  await form
    .locator(".fid-file-input")
    .setInputFiles({ name: "emblem.png", mimeType: "image/png", buffer: ORIGINAL });
  const view = form.locator(".fid-cropper-view");
  await expect(view).toBeVisible({ timeout: 15_000 });
  await expect(view).toHaveAttribute("data-zoom", "1.00");
  await expect(view).toHaveAttribute("data-cx", "300");
  return view;
}

/** 시험 사이에 넘기는 값(player가 정한 이름·약어·창설한 가문) */
const made: { name: string; short: string; houseId: number } = { name: "", short: "", houseId: 0 };

/** 화면 안에서 tRPC 조회·쓰기(같은 출처 — 브라우저가 출처 머리글을 붙인다). 결과 data */
async function trpcInPage(page: Page, path: string, input?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ procedure, body }) => {
      const response =
        body === undefined
          ? await fetch(`/api/trpc/${procedure}`)
          : await fetch(`/api/trpc/${procedure}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
      const json: unknown = await response.json();
      return typeof json === "object" && json !== null
        ? Reflect.get(Reflect.get(json, "result") ?? {}, "data")
        : null;
    },
    { procedure: path, body: input },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("세력 정체성 — 정하기·올리기·검수", () => {
  test.describe("1. player: 자동 생성 마크로 정한다", () => {
    test.use({ account: "player" });

    test("세력 화면 칸 → 단계: 빈 칸으로는 못 끝내고, 후보·색·마크를 골라 저장하면 칸에 보인다", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      await expect(card(page)).not.toHaveAttribute("data-set", "");
      await expect(card(page)).toContainText(message("ko", "faction_identity_unset"));
      await card(page).locator(".fid-card-link").click();
      await expect(page).toHaveURL(/\/faction\/identity$/);
      const form = step(page);
      await expect(form).toHaveAttribute("data-mode", "create");
      await expect(page.locator("#fid-title")).toHaveText(message("ko", "fid_title_create"));
      // 창설은 무료(D-565)이고 나라 시민으로 남는다는 안내, 소속 도시 고르기(기본 = 내 도시), 마지막 단추는 [가문 창설]
      await expect(form.locator('[data-testid="fid-found-cost"]')).toContainText(
        message("ko", "fid_found_cost_free"),
      );
      const homeSelect = form.locator('[data-testid="fid-found-home"]');
      await expect(homeSelect).toBeVisible();
      const myCity = Number(field(await trpcInPage(page, "factionIdentity.mine"), "homeCityId"));
      expect(Number(await homeSelect.inputValue())).toBe(myCity);
      await expect(form.locator(".fid-submit")).toHaveText(message("ko", "fid_submit_found"));

      // 빈 칸으로 누르면 이름 칸으로 가고 저장하지 않는다
      const calls = watchTrpc(page);
      await form.locator(".fid-submit").click();
      await expect(form.locator(".fid-name-input")).toBeFocused();
      await expect(form.locator(".fid-name-input")).toHaveAttribute("aria-invalid", "true");
      await expect(form).toContainText(message("ko", "fid_name_empty"));
      // 실제 도시 이름·기호는 바로 알린다
      await form.locator(".fid-name-input").fill("서울");
      await expect(form).toContainText(message("ko", "fid_name_real_place"));
      await form.locator(".fid-name-input").fill("하늘 세력!");
      await expect(form).toContainText(message("ko", "fid_name_invalid_chars"));
      expect(calls.some((call) => call.procedures.includes("factionIdentity.save"))).toBe(false);

      // 이름 만들기(NPC 국가와 같은 만들기) → 약어 후보
      const picked = await pickSuggestions(page);
      made.name = picked.name;
      made.short = picked.short;
      await expect(form.locator(".fid-availability")).toHaveText(message("ko", "fid_available"));
      // 색(20개) 가운데 여섯째
      await expect(form.locator(".fid-swatch-input")).toHaveCount(20);
      await form.locator(".fid-swatch-input").nth(5).check();
      // 자동 생성 마크: [다시 만들기]로 바뀌고, 틀을 고르면 그 틀
      const before = await form.locator('[data-pick="charge"]').inputValue();
      const specOf = async (): Promise<string> =>
        (
          await Promise.all(
            ["shape", "division", "charge", "scheme"].map((name) =>
              form.locator(`[data-pick="${name}"]`).inputValue(),
            ),
          )
        ).join("/");
      const first = await specOf();
      await form.locator(".fid-reroll").click();
      await expect.poll(specOf).not.toBe(first);
      await form.locator('[data-pick="shape"]').selectOption("hexagon");
      expect(before.length).toBeGreaterThan(0);
      // 미리 보기: 마크 크기 셋 + 세력 카드 줄 + 지도 이름표 둘
      const preview = form.locator('[data-testid="fid-preview"]');
      await expect(preview.locator(".fid-preview-sizes svg.nation-emblem")).toHaveCount(3);
      await expect(preview.locator(".fid-preview-name")).toHaveText(made.name);
      await expect(preview.locator(".fid-preview-short")).toHaveText(made.short);
      await expect(preview.locator(".fid-map-label")).toHaveCount(2);

      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page, { ignore: ".fid-file-input" })).toEqual([]);
      await tallShot(page, "fid-step-pastel-ko-390");

      await form.locator(".fid-submit").click();
      // 저장 + 창설하면 세력 화면으로 돌아가고 칸에 이름·약어·만든 마크, 가문이 생겼다
      await expect(page).toHaveURL(/\/faction$/);
      await expect(card(page)).toHaveAttribute("data-set", "");
      await expect(card(page)).toHaveAttribute("data-house", "");
      made.houseId = Number(
        field(field(await trpcInPage(page, "factionIdentity.mine"), "house"), "factionId"),
      );
      expect(made.houseId).toBeGreaterThan(0);
      await expect(card(page).locator(".fid-card-name")).toHaveText(made.name);
      await expect(card(page).locator(".fid-card-short")).toHaveText(made.short);
      await expect(card(page).locator("svg.nation-emblem")).toBeVisible();
      const saves = calls.filter((call) => call.procedures.includes("factionIdentity.save"));
      expect(saves).toHaveLength(1);
      expect(field(field(saves[0]?.inputs[0], "upload"), "mode")).toBe("none");
      expect(field(field(saves[0]?.inputs[0], "emblem"), "shape")).toBe("hexagon");
      // 소속 도시 칸(D-565): 가문장에게 지금 소속 도시와 [소속 도시 바꾸기]
      const home = house(page).locator('[data-testid="house-home"]');
      await expect(home).toContainText(message("ko", "fid_home_title"));
      await expect(home.locator("select")).toHaveValue(String(myCity));
      await tallShot(page, "fid-house-home-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("2. player: 그림을 올려 자른다", () => {
    test.use({ account: "player" });

    test("자른 256 × 256 PNG만 올라가고(원본 아님) 세력 화면에 그 그림이 보인다", async ({
      page,
      deviceErrors,
    }) => {
      await openStep(page);
      const form = step(page);
      await expect(form).toHaveAttribute("data-mode", "edit");
      // 이름·약어는 정한 뒤 바로 못 바꾼다(기다리는 날짜 안내, 칸은 읽기 전용)
      await expect(form.locator(".fid-name-input")).toHaveValue(made.name);
      await expect(form.locator(".fid-name-input")).toHaveAttribute("readonly", "");
      await expect(form.locator(".fid-availability")).toContainText(/\d/);

      const view = await pickImage(page);
      await view.focus();
      await page.keyboard.press("Equal");
      await expect(view).not.toHaveAttribute("data-zoom", "1.00");
      // → 키: 자를 자리가 오른쪽(파란 쪽)으로 간다
      for (let n = 0; n < 6; n++) await page.keyboard.press("Shift+ArrowRight");
      await expect.poll(async () => Number(await view.getAttribute("data-cx"))).toBeGreaterThan(300);
      await expect(form.locator(".fid-cropper-small")).toHaveCount(3);
      await form.locator(".fid-cropper-done").click();
      await expect(view).toHaveCount(0, { timeout: 15_000 });
      // 아직 올리지 않았다: 미리 보기는 기기 안의 그림(data:)
      await expect(form.locator(".fid-upload-state")).toHaveAttribute("data-upload", "new");
      const previewImage = form.locator('[data-testid="fid-preview"] img.nation-emblem-image').first();
      await expect(previewImage).toHaveAttribute("src", /^data:image\/png;base64,/);

      const calls = watchTrpc(page);
      await form.locator(".fid-submit").click();
      await expect(page).toHaveURL(/\/faction$/);

      // 보낸 그림 = 자른 256 × 256 PNG(원본 600 × 400이 아니다), 상한 이하, 허용 청크만
      const save = calls.find((call) => call.procedures.includes("factionIdentity.save"));
      const upload = field(save?.inputs[0], "upload");
      expect(field(upload, "mode")).toBe("new");
      const sent = Buffer.from(String(field(upload, "pngBase64")), "base64");
      expect(sent.equals(ORIGINAL)).toBe(false);
      expect(sent.length).toBeLessThanOrEqual(FACTION_EMBLEM_UPLOAD.maxBytes);
      const walked = walkPng(sent);
      expect(walked.ok).toBe(true);
      const chunks = walked.ok ? walked.chunks : [];
      const header = chunks[0] ? readPngHeader(sent, chunks[0]) : null;
      expect(header).toMatchObject({ width: 256, height: 256, bitDepth: 8 });
      expect(chunks.every((chunk) => FACTION_EMBLEM_CHUNKS.has(chunk.type))).toBe(true);
      // 요청 어디에도 원본 파일이 실리지 않았다(그림 칸 하나뿐)
      expect(JSON.stringify(save?.inputs[0]).length).toBeLessThan(sent.length * 2);

      // 세력 화면 칸: 올린 그림(해시 주소), 그림 길은 image/png·nosniff이고 보낸 바이트 그대로
      const image = card(page).locator("img.nation-emblem-image");
      await expect(image).toBeVisible();
      const src = await image.getAttribute("src");
      expect(src).toMatch(/^\/api\/nation-emblems\/[0-9a-f]{64}\.png$/);
      const got = await page.request.get(src ?? "");
      expect(got.status()).toBe(200);
      expect(got.headers()["content-type"]).toBe("image/png");
      expect(got.headers()["x-content-type-options"]).toBe("nosniff");
      expect((await got.body()).equals(sent)).toBe(true);
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(256);
      expect(await horizontalOverflow(page)).toEqual([]);
      await card(page).scrollIntoViewIfNeeded();
      await shot(page, "fid-card-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("3. dev(다른 플레이어): 남의 이름·약어를 못 쓴다", () => {
    test.use({ account: "dev" });

    test("확인 문구가 뜨고 저장은 거절된다", async ({ page, deviceErrors }) => {
      await openStep(page);
      const form = step(page);
      await expect(form).toHaveAttribute("data-mode", "create");
      await form.locator(".fid-name-input").fill(made.name.toUpperCase());
      await form.locator(".fid-short-input").fill(made.short.toLowerCase());
      await expect(form).toContainText(message("ko", "fid_name_taken"));
      await expect(form).toContainText(message("ko", "fid_short_taken"));
      const answered = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/factionIdentity.save"),
      );
      await form.locator(".fid-submit").click();
      expect((await answered).status()).toBe(400);
      await expect(page).toHaveURL(/\/faction\/identity$/);
      await expect(form.locator(".fid-name-input")).toHaveAttribute("aria-invalid", "true");
      // dev에게는 정체성이 생기지 않았다
      await openFaction(page);
      await expect(card(page)).not.toHaveAttribute("data-set", "");
      // player 가문 신고(질문 930 나): 받음 → 같은 가문 다시는 세지 않음
      const report = (factionId: number) =>
        trpcInPage(page, "factionIdentity.report", { factionId }).then((data) => field(data, "status"));
      expect(await report(made.houseId)).toBe("reported");
      expect(await report(made.houseId)).toBe("already");
      // 서버가 400을 준 요청은 브라우저가 콘솔 오류로 적는다 — 그 한 줄만 있다
      expect(deviceErrors.filter((entry) => !/factionIdentity\.save/.test(entry.text))).toEqual([]);
    });
  });

  test.describe("4. admin: 운영자 콘솔 마크 관리", () => {
    test.use({ account: "admin", devTheme: "neon", ...VIEWPORTS.desktop });

    test("올린 마크가 목록에 보이고, [마크 내리기]로 내린다", async ({ page, deviceErrors }) => {
      await page.goto("/ops?tab=emblems");
      await expect(page.locator("#ops-title")).toBeVisible();
      const tab = page.locator(".ops-emblems");
      await expect(tab).toBeVisible();
      await expect(page.locator(".ops-tabs [role='tab'][aria-selected='true']")).toHaveText(
        message("ko", "ops_tab_emblems"),
      );
      // 세계 스위치: 기본 허용, 관리자는 바꿀 수 있다
      const toggle = tab.locator(".ops-emblem-switch input");
      await expect(toggle).toBeChecked();
      await expect(toggle).toBeEnabled();
      const row = tab.locator("tbody tr", { hasText: made.name });
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-uploaded", "");
      await expect(row.locator("img.ops-emblem-up")).toBeVisible();
      await expect(row).toContainText(made.short);
      await expect(row).toContainText(message("ko", "ops_emblems_state_ok"));
      // 신고 수(dev가 한 번)·신고 많은 차례로 봐도 첫 줄
      await expect(row.locator(".ops-emblem-reports")).toHaveAttribute("data-reports", "1");
      await tab.locator(".ops-emblem-sort select").selectOption("reports");
      await expect(tab.locator("tbody tr").first()).toContainText(made.name);
      expect(await horizontalOverflow(page)).toEqual([]);

      await row.locator(".ops-emblem-takedown-open").click();
      await row.getByLabel(message("ko", "ops_emblems_reason")).fill("시험 사유: 규칙에 맞지 않는 그림");
      await shot(page, "fid-ops-neon-ko-1440");
      await row.locator(".ops-emblem-confirm").click();
      await expect(tab).toContainText(message("ko", "ops_emblems_done"));
      await expect(row).not.toHaveAttribute("data-uploaded", "");
      await expect(row.locator("img.ops-emblem-up")).toHaveCount(0);
      await expect(row).toContainText(message("ko", "ops_emblems_state_removed"));
      // 내리면 신고도 처리된 것으로 지운다
      await expect(row.locator(".ops-emblem-reports")).toHaveAttribute("data-reports", "0");
      expect(deviceErrors).toEqual([]);
    });

    test("세력 목록에 가문이 플레이어 세력으로 보인다(이름 = 정한 이름, 구성원 1)", async ({
      page,
      deviceErrors,
    }) => {
      await page.goto("/ops?tab=npcs");
      const toolbar = page.locator(".ops-main .ops-toolbar").first();
      await toolbar.locator("select").first().selectOption("player");
      const row = page.locator(".ops-main .dev-table tbody tr", { hasText: made.name });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(message("ko", "ops_kind_player"));
      await row.locator("button.button-text").click();
      await expect(page.locator(".ops-side")).toContainText(message("ko", "ops_src_player"));
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("5. player: 내린 뒤", () => {
    test.use({ account: "player" });

    test("자동 생성 마크와 알림(사유)이 보이고, [확인]하면 알림이 사라진다", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      await expect(card(page).locator(".fid-card-name")).toHaveText(made.name);
      await expect(card(page).locator("img.nation-emblem-image")).toHaveCount(0);
      await expect(card(page).locator("svg.nation-emblem")).toBeVisible();
      const notice = card(page).locator('[data-testid="fid-notice"]');
      await expect(notice).toContainText(message("ko", "faction_identity_notice_removed"));
      await expect(notice).toContainText("시험 사유: 규칙에 맞지 않는 그림");
      expect(await horizontalOverflow(page)).toEqual([]);
      await notice.locator(".fid-notice-ok").click();
      await expect(notice).toHaveCount(0);
      await page.reload();
      await expect(card(page)).toBeVisible({ timeout: 20_000 });
      await expect(card(page).locator('[data-testid="fid-notice"]')).toHaveCount(0);
      expect(deviceErrors).toEqual([]);
    });
  });
});

// 가문 가입·이름 되돌리기(질문 985 다·986 가, docs/adr/2026-11-11-faction-identity.md "바뀜 (981~986 답)") — 위 묶음에 이어서 같은 서버·DB.
// 시험 계정 player·dev는 같은 나라 시민이다(global-setup이 첫 나라로 사이보그를 만든다).
test.describe("가문 가입·이름 되돌리기", () => {
  test.describe("6. player: 같은 나라 시민을 초대한다", () => {
    test.use({ account: "player" });

    test("가문원 목록(가문장 1명) → 사이보그 이름으로 초대 → 대기 줄", async ({ page, deviceErrors }) => {
      await openFaction(page);
      const members = house(page).locator('[data-testid="house-members"]');
      await expect(members.locator('[data-role="leader"]')).toContainText("E2EPlayer");
      await expect(members.locator(".fid-house-row")).toHaveCount(1);
      // 가문 금고(국고와 따로 — D-338·D-213): 새 가문은 0
      await expect(house(page).locator('[data-part="house-vault"]')).toHaveText(
        message("ko", "fid_house_vault", { amount: "0" }),
      );
      // 가문세(D-574 2150): 새 가문은 0%, 가문장이 정하면 줄이 바뀐다. 기부는 서버까지 가서 답을 받는다(시험 계정 잔고에 따라 기부·모자람)
      await expect(house(page).locator('[data-part="house-tax"]')).toHaveText(
        message("ko", "fid_house_tax_line", { rate: "0" }),
      );
      const taxForm = house(page).locator('[data-part="house-tax-form"]');
      await taxForm.locator("input").fill("31");
      await taxForm.locator("button[type='submit']").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_tax_invalid", { max: "30" }),
      );
      await taxForm.locator("input").fill("2.5");
      await taxForm.locator("button[type='submit']").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_done_tax_set"),
      );
      await expect(house(page).locator('[data-part="house-tax"]')).toHaveText(
        message("ko", "fid_house_tax_line", { rate: "2.5" }),
      );
      const donate = house(page).locator('[data-part="house-donate"]');
      await donate.locator("input").fill("1");
      await donate.locator("button[type='submit']").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        new RegExp(
          `^(${message("ko", "fid_house_done_donated")}|${message("ko", "fid_house_error_insufficient_funds")})$`,
        ),
      );
      // 꺼내기·금고 장부(D-576): 가문장만 꺼내고, 장부는 가문원 모두에게 보인다(기부가 됐으면 그 줄)
      const take = house(page).locator('[data-part="house-take"]');
      await take.locator("input").fill("1");
      await take.locator("button[type='submit']").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        new RegExp(
          `^(${message("ko", "fid_house_done_vault_taken")}|${message("ko", "fid_house_error_insufficient_funds")})$`,
        ),
      );
      await expect(house(page).locator('[data-part="house-vault-log"]')).toBeVisible();
      await house(page).locator("#fid-house-invite-name").fill("e2edev");
      await house(page).locator(".fid-house-invite button[type='submit']").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_done_invited"),
      );
      const requests = house(page).locator('[data-testid="house-requests"]');
      await expect(requests.locator('[data-kind="invite"]')).toContainText("E2EDev");
      expect(await horizontalOverflow(page)).toEqual([]);
      await card(page).scrollIntoViewIfNeeded();
      await shot(page, "house-leader-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("7. dev: 초대를 받는다", () => {
    test.use({ account: "dev" });

    test("처리할 일에 초대 → 세력 화면에서 [받기] → 가문원(그 가문 이름이 보이고 [가문 창설]은 없다)", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      const inbox = await trpcInPage(page, "inbox.list");
      const items = field(inbox, "items");
      expect(Array.isArray(items) ? items.map((item) => field(item, "kind")) : []).toContain("house_invite");
      const offer = house(page).locator('[data-testid="house-offers"] [data-kind="invite"]');
      await expect(offer).toContainText(made.name);
      await offer.locator(".button-primary").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_done_joined"),
      );
      await expect(card(page).locator(".fid-card-name")).toHaveText(made.name);
      await expect(card(page).locator(".fid-card-link")).toHaveCount(0);
      const members = house(page).locator('[data-testid="house-members"] .fid-house-row');
      await expect(members).toHaveCount(2);
      await expect(house(page)).toContainText(message("ko", "fid_house_leave"));
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await card(page).scrollIntoViewIfNeeded();
      await shot(page, "house-member-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("8. player: 소식을 보고 내보낸다", () => {
    test.use({ account: "player" });

    test("초대를 받았다는 소식 [확인] → dev [내보내기] 확인 줄 → 가문원 1명", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      const notices = house(page).locator('[data-testid="house-notices"]');
      await expect(notices.locator('[data-notice="invite_accepted"]')).toContainText("E2EDev");
      await notices.locator('[data-notice="invite_accepted"] button').click();
      await expect(house(page).locator('[data-testid="house-notices"]')).toHaveCount(0);
      const row = house(page).locator('[data-testid="house-members"] [data-role="member"]');
      await expect(row).toContainText("E2EDev");
      await row.getByRole("button", { name: message("ko", "fid_house_kick") }).click();
      await row.locator(".fid-house-confirm .button-primary").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_done_kicked"),
      );
      await expect(house(page).locator('[data-testid="house-members"] .fid-house-row')).toHaveCount(1);
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("8b. dev: 내보내진 뒤", () => {
    test.use({ account: "dev" });

    test("내보냈다는 소식이 보이고, 그 가문 이름을 신고한다(마크 관리 목록에 다시 선다)", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      await expect(house(page).locator('[data-notice="kicked"]')).toContainText(made.name);
      await expect(house(page).locator('[data-testid="house-joinable"]')).toContainText(made.name);
      const status = field(
        await trpcInPage(page, "factionIdentity.report", { factionId: made.houseId }),
        "status",
      );
      expect(status).toBe("reported");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("9. admin: 신고된 가문 이름을 되돌린다", () => {
    test.use({ account: "admin", devTheme: "neon", ...VIEWPORTS.desktop });

    test("[마크 관리] [이름 되돌리기](사유) → 되돌리고 신고가 지워져 목록에서 빠진다", async ({
      page,
      deviceErrors,
    }) => {
      await page.goto("/ops?tab=emblems");
      const tab = page.locator(".ops-emblems");
      await expect(tab).toBeVisible();
      const row = tab.locator("tbody tr", { hasText: made.name });
      await expect(row).toHaveCount(1);
      await row.locator(".ops-emblem-reset-open").click();
      await row.getByLabel(message("ko", "ops_emblems_reason")).fill("시험 사유: 신고된 이름");
      await row.locator(".ops-emblem-reset-confirm").click();
      await expect(tab).toContainText(message("ko", "ops_emblems_reset_done"));
      // 되돌리면 신고를 처리한 것으로 지운다 — 그림·막힘·알림이 없는 가문은 목록에서 빠진다([신고 넘기기]와 같다)
      await expect(tab.locator("tbody tr", { hasText: made.name })).toHaveCount(0);
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("10. player: 되돌린 뒤", () => {
    test.use({ account: "player" });

    test("소식(사유)이 보이고 이름 대기 없이 다시 정할 수 있다", async ({ page, deviceErrors }) => {
      await openFaction(page);
      await expect(card(page).locator(".fid-card-name")).toHaveText(`가문 #${made.houseId}`);
      const notice = house(page).locator('[data-notice="name_reset"]');
      await expect(notice).toContainText("시험 사유: 신고된 이름");
      expect(field(await trpcInPage(page, "factionIdentity.mine"), "renameAt")).toBeNull();
      expect(deviceErrors).toEqual([]);
    });
  });

  // 가문 도시·해산(질문 1005 가·1003 가, docs/adr/2026-11-11-house-village.md) — player는 혼자 남은 가문장이다
  test.describe("11. player: 가문 도시 칸", () => {
    test.use({ account: "player" });

    test("상태(아직)·처음 고르기·제안 자리·값이 보이고 [마을 세우기]가 서버까지 가서 답을 받는다(시험 계정 잔고는 값보다 적다)", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      const city = house(page).locator('[data-testid="house-city"]');
      await expect(city).toBeVisible();
      await expect(city).toHaveAttribute("data-status", "none");
      await expect(city).toContainText(message("ko", "fid_city_status_none"));
      await expect(city.locator(".fid-city-choice")).toBeVisible();
      // 독립을 고르면 체제 고르기가 보인다
      await city.locator('input[name="fid-city-mode"]').nth(1).check();
      await expect(city.locator("select")).toBeVisible();
      await city.locator('input[name="fid-city-mode"]').first().check();
      const found = city.locator('[data-testid="house-village-found"]');
      await expect(found).toBeVisible();
      await found.click();
      await expect(city.locator(".fid-house-status-error")).toHaveText(
        message("ko", "fid_city_error_insufficient_funds"),
      );
      await expect(city).toHaveAttribute("data-status", "none");
      expect(await horizontalOverflow(page)).toEqual([]);
      await city.scrollIntoViewIfNeeded();
      await shot(page, "house-city-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("12. player: 혼자 남은 가문장의 해산", () => {
    test.use({ account: "player" });

    test("[가문 해산] 확인 줄 → 해산 → 정체성은 초안(가문 창설 마치기)으로 남는다", async ({
      page,
      deviceErrors,
    }) => {
      await openFaction(page);
      const button = house(page).getByRole("button", { name: message("ko", "fid_house_dissolve") });
      await expect(button).toBeVisible();
      await button.click();
      await house(page).locator(".fid-house-confirm .button-primary").click();
      await expect(house(page).locator(".fid-house-status")).toHaveText(
        message("ko", "fid_house_done_dissolved"),
      );
      await expect(house(page).locator('[data-testid="house-members"]')).toHaveCount(0);
      expect(field(await trpcInPage(page, "factionIdentity.mine"), "house")).toBeNull();
      expect(deviceErrors).toEqual([]);
    });
  });
});

// 사진(저장하지 않는다): dev는 정체성을 정하지 않은 계정이라 늘 "정하기" 모습이다
test.describe("사진 390px", () => {
  // 무소속 칸(D-565): dev는 가문에서 내보내져 가문이 없다 — 소속 도시(내 도시)·개인 세금·고용하려면 가문 안내
  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`무소속 칸 ${theme}·한국어`, () => {
      test.use({ account: "dev", theme, language: "ko" });

      test("무소속·소속 도시 안내, 가로 넘침 없음", async ({ page, deviceErrors }) => {
        await openFaction(page);
        const home = house(page).locator('[data-testid="house-home"][data-unaffiliated]');
        await expect(home).toContainText(message("ko", "fid_home_unaffiliated_title"));
        expect(await horizontalOverflow(page)).toEqual([]);
        await tallShot(page, `fid-house-unaffiliated-${theme}-ko-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }

  // 소속 도시 공고(D-570): player(가문장)의 house 조회에 공고를 얹어 공고 칸(새 도시·옮기는 시각·나라 정책·[공고 거두기])을 본다
  for (const [theme, language] of [
    ["pastel", "ko"],
    ["dark", "en"],
  ] as const) {
    test.describe(`소속 도시 공고 ${theme}·${language}`, () => {
      test.use({ account: "player", theme, language });

      test("공고 중: 새 도시·시각·지원금 안내·[공고 거두기], 가로 넘침 없음", async ({
        page,
        deviceErrors,
      }) => {
        // 12에서 해산했으므로 남은 정체성으로 다시 창설한다(이미 있으면 그대로)
        await ensureHouse(page);
        await rewriteTrpc(page, {
          "summary.get": hideSummary,
          "factionIdentity.house": (data) => {
            const home = field(data, "home");
            if (typeof home !== "object" || home === null) throw new Error("house.home 응답 모양이 다릅니다");
            Reflect.set(home, "pending", {
              city: field(home, "city"),
              at: Date.now() + 86_400_000,
              terms: "-500",
            });
            Reflect.set(home, "noticeMs", 86_400_000);
            // 가문 금고 잔고(큰 수 — 자리 나눔)
            const mine = field(data, "house");
            if (typeof mine === "object" && mine !== null) Reflect.set(mine, "vault", "1234567");
          },
        });
        await page.goto("/faction");
        await expect(card(page)).toBeVisible({ timeout: 20_000 });
        const pending = house(page).locator('[data-part="house-home-pending"]');
        await expect(pending).toContainText(message(language, "fid_home_pending_cancel"));
        await expect(pending).toContainText(message(language, "fid_home_pending_grant", { amount: "500" }));
        await expect(house(page).locator('[data-part="house-vault"]')).toHaveText(
          message(language, "fid_house_vault", { amount: "1,234,567" }),
        );
        await expect(house(page).locator('[data-testid="house-home"]')).toContainText(
          message(language, "fid_home_announce"),
        );
        expect(await horizontalOverflow(page)).toEqual([]);
        await pending.scrollIntoViewIfNeeded();
        await tallShot(page, `fid-house-home-notice-${theme}-${language}-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }

  test.describe("단계 다크·영어", () => {
    test.use({ account: "dev", theme: "dark", language: "en" });

    test("후보를 골라 채운 모습, 가로 넘침·작은 누르는 곳 없음", async ({ page, deviceErrors }) => {
      await openStep(page);
      await expect(page.locator("#fid-title")).toHaveText(message("en", "fid_title_create"));
      const picked = await pickSuggestions(page);
      // 영어 화면의 후보는 로마자 이름이다
      expect(picked.name).toMatch(/^[A-Za-z]+$/);
      await step(page).locator(".fid-swatch-input").nth(11).check();
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page, { ignore: ".fid-file-input" })).toEqual([]);
      await tallShot(page, "fid-step-dark-en-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  for (const [theme, language] of [
    ["pastel", "en"],
    ["dark", "ko"],
  ] as const) {
    test.describe(`자르기 ${theme}·${language}`, () => {
      test.use({ account: "dev", theme, language });

      test("그림을 고르면 자르기 도구가 뜬다(확대·미리 보기 셋), 넘침 없음", async ({
        page,
        deviceErrors,
      }) => {
        await openStep(page);
        const view = await pickImage(page);
        await view.focus();
        await page.keyboard.press("Equal");
        await page.keyboard.press("Equal");
        await expect(step(page).locator(".fid-cropper-small")).toHaveCount(3);
        await expect(step(page).locator(".fid-cropper")).toContainText(message(language, "fid_crop_done"));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page, { ignore: ".fid-file-input" })).toEqual([]);
        await step(page).locator(".fid-cropper").scrollIntoViewIfNeeded();
        await shot(page, `fid-crop-${theme}-${language}-390`);
        // [취소]하면 도구가 닫히고 그림은 고르지 않은 채다
        await step(page).locator(".fid-cropper-cancel").click();
        await expect(view).toHaveCount(0);
        await expect(step(page).locator(".fid-upload-state")).toHaveAttribute("data-upload", "none");
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

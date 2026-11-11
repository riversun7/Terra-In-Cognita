// 2차맵 캐릭터 3D 모델 화면 시험 — docs/adr/2026-11-11-character-3d.md 4절(사용자 요청 2026-11-11 "캐릭터 … 폴리곤 3d로 … 2차맵에서도 사용가능하게").
// - player: 2차맵에 들어오면(내 사이보그가 골라져 있고 가장 가까운 확대) 내 사이보그는 캡슐이 아니라 3D 모델로 그려진다
//   (data-selected-draw = character0·character1, data-characters ≥ 1). 멀리 줄이면 캡슐·점으로 돌아간다(모델 0).
//   넓은 화면(1440)은 가까운 단계(character0), 좁은 화면(390)은 키가 작아 먼 단계(character1)다.
// - 서버: world.unitLooks가 내 사이보그의 외형을 준다(맞는 외형 모양).
// - 측정(E2E_MEASURE=1, 작업 기록용): 도시 2차맵에서 가까이·멀리 그리기 호출·삼각형·엔진 p95·JS 메모리(헤드리스 SwiftShader라 휴대폰 값 아님).
// - 사진: 가까이 본 2차맵 390·1440 × 파스텔.
// 바뀜 (2026-11-11, 961·963 — ADR "바뀜 (2026-11-11, 961·963)"):
// - 발밑 나라 색 고리(963 나): 내 사이보그(나라 있음)는 가까이(모델)·중간(캡슐) 모두 고리를 그리고(data-nation-rings ≥ 1, data-selected-ring =
//   국가 색 번호), 점 표현이면 0. 서버는 world.unitLooks의 nations에 내 사이보그를 싣는다.
// - 한 번 외형 고르기(961 나, relook 계정 = 3D 외형 없이 만든 사이보그): 사이보그 화면 [외형 고르기] → 창(만들기 외형 단계, 처음 값 = 옛 외형에서
//   옮긴 외형) → 프리셋 → 확인 → 저장. 그 뒤 단추가 사라지고(cyborg.get lookPick false) 서버가 다시 보내도 look_locked. 사진 390 파스텔.
import type { Page } from "@playwright/test";
import { PROTOCOL_VERSION } from "../packages/protocol/src/version.ts";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 2차맵을 열고 자료·지형이 서고 내 사이보그가 골라질 때까지 기다린다 */
async function openMap(page: Page, search = ""): Promise<string> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto(`/map${search}`);
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
  const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
  await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5", { timeout: 15_000 });
  return cyborg;
}

const stat = async (page: Page, name: string): Promise<number> =>
  Number(await page.locator(".map-screen").getAttribute(name));

/** 확대 사다리의 [−]를 눌러 단계 stage까지 줄인다 */
async function zoomOutTo(page: Page, stage: number): Promise<void> {
  const ladder = page.locator(".zoom-ladder");
  for (let i = 0; i < 6; i++) {
    if (Number(await ladder.getAttribute("data-stage")) <= stage) break;
    await ladder.locator(".zoom-ladder-out").click();
    await page.waitForTimeout(600);
  }
  await expect(ladder).toHaveAttribute("data-stage", String(stage));
}

/** 끌어서 이어 그리게 한 뒤 1초 요약(유닛·모델 수, 그리기 호출, 삼각형, 엔진 p95, JS 힙)을 적는다 */
async function readStats(page: Page, label: string): Promise<void> {
  const screen = page.locator(".map-screen");
  const box = await page.locator(".map-screen canvas").first().boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(cx + ((i % 10) - 5) * 3, cy + ((i % 6) - 3) * 2);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(1_200);
  const names = [
    "data-units",
    "data-drawn-units",
    "data-characters",
    "data-character-lod0",
    "data-draw-calls",
    "data-triangles",
    "data-engine-p95",
    "data-view-level",
    "data-unit-mode",
    "data-props",
  ];
  const values: string[] = [];
  for (const name of names) values.push(`${name.slice(5)}=${String(await screen.getAttribute(name))}`);
  const heapMb = await page.evaluate(() => {
    const memory: unknown = Reflect.get(performance, "memory");
    const used: unknown =
      typeof memory === "object" && memory !== null ? Reflect.get(memory, "usedJSHeapSize") : null;
    return typeof used === "number" ? Math.round(used / 1024 / 1024) : null;
  });
  console.log(`[character-3d] ${label} ${values.join(" ")} jsHeapMB=${String(heapMb)}`);
}

/** 측정: 모델 켬(기본)·끔(?unit-models=0)으로 2차맵을 열어 5/5·3/5·1/5에서 잰다 */
async function measure(page: Page, models: boolean): Promise<void> {
  await openMap(page, models ? "" : "?unit-models=0");
  const label = models ? "models on" : "models off";
  await readStats(page, `${label} 5/5`);
  await zoomOutTo(page, 3);
  await readStats(page, `${label} 3/5`);
  await zoomOutTo(page, 1);
  await readStats(page, `${label} 1/5`);
}

test.describe("2차맵 캐릭터 모델: 넓은 화면", () => {
  test.use({ account: "player", ...VIEWPORTS.desktop });

  test("내 사이보그는 가까이서 3D 모델(가까운 단계), 멀리 줄이면 캡슐·점으로 돌아간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    const cyborg = await openMap(page);
    const screen = page.locator(".map-screen");
    // 가까이(5/5): 고른 유닛(내 사이보그)이 가까운 단계 모델이다. 모델 수 ≥ 1, 가까운 단계 수 ≥ 1
    await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 15_000 });
    expect(await stat(page, "data-characters")).toBeGreaterThanOrEqual(1);
    expect(await stat(page, "data-character-lod0")).toBeGreaterThanOrEqual(1);
    // 모델로 그린 유닛도 그린 유닛 수에 든다
    expect(await stat(page, "data-drawn-units")).toBeGreaterThanOrEqual(await stat(page, "data-characters"));

    // 서버가 내 사이보그의 외형을 준다(world.unitLooks)
    const mapKey = (await screen.getAttribute("data-map-key")) ?? "";
    const looks = await page.evaluate(async (key) => {
      const input = encodeURIComponent(JSON.stringify({ mapKey: Number(key) }));
      const response: unknown = await fetch(`/api/trpc/world.unitLooks?input=${input}`).then((reply) =>
        reply.json(),
      );
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const pick = (value: unknown, name: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
      return pick(pick(pick(response, "result"), "data"), "units");
    }, mapKey);
    expect(looks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unitId: Number(cyborg),
          kind: "cyborg_body",
          look: expect.objectContaining({ v: 2 }),
        }),
      ]),
    );

    // 발밑 나라 색 고리(963 나): 내 사이보그는 나라가 있다 — 모델로 그려도 고리, 고른 유닛의 국가 색 번호(0~5)
    await expect(screen).toHaveAttribute("data-selected-ring", /^[0-5]$/, { timeout: 15_000 });
    expect(await stat(page, "data-nation-rings")).toBeGreaterThanOrEqual(1);
    // 사진은 고리가 선 뒤에(나라 조회가 온 뒤)
    await shot(page, "character-3d-map-close-1440-pastel");
    const nations = await page.evaluate(async (key) => {
      const input = encodeURIComponent(JSON.stringify({ mapKey: Number(key) }));
      const response: unknown = await fetch(`/api/trpc/world.unitLooks?input=${input}`).then((reply) =>
        reply.json(),
      );
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const pick = (value: unknown, name: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
      return pick(pick(pick(response, "result"), "data"), "nations");
    }, mapKey);
    expect(nations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitIds: expect.arrayContaining([Number(cyborg)]) }),
      ]),
    );
    // 중간(3/5): 캡슐로 그려도 같은 고리
    await zoomOutTo(page, 3);
    await expect(screen).toHaveAttribute("data-selected-draw", /^(capsule|icon)$/, { timeout: 15_000 });
    if ((await screen.getAttribute("data-selected-draw")) === "capsule")
      expect(await stat(page, "data-nation-rings")).toBeGreaterThanOrEqual(1);

    // 멀리(1/5): 모델을 그리지 않는다 — 내 사이보그는 캡슐이나 점
    await zoomOutTo(page, 1);
    await expect(screen).toHaveAttribute("data-selected-draw", /^(capsule|icon)$/, { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-characters", "0");
    if ((await screen.getAttribute("data-unit-mode")) === "icon")
      await expect(screen).toHaveAttribute("data-nation-rings", "0");
    expect(deviceErrors).toEqual([]);
  });

  for (const models of ["off", "on"] as const) {
    test(`측정(모델 ${models}): 가까이·중간·멀리 그리기 호출·삼각형·엔진 p95(E2E_MEASURE=1)`, async ({
      page,
    }) => {
      test.skip(process.env["E2E_MEASURE"] !== "1", "E2E_MEASURE=1일 때만 돈다");
      // 여러 줄기가 함께 쓰는 기계라 느리다: 넉넉히 기다린다
      test.setTimeout(360_000);
      await measure(page, models === "on");
    });
  }
});

test.describe("2차맵 캐릭터 모델: 좁은 화면", () => {
  test.use({ account: "player", ...VIEWPORTS.phone });

  test("390에서는 키가 작아 먼 단계 모델로 그린다", async ({ page, deviceErrors }) => {
    test.setTimeout(90_000);
    await openMap(page);
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-selected-draw", /^character[01]$/, { timeout: 15_000 });
    expect(await stat(page, "data-characters")).toBeGreaterThanOrEqual(1);
    await shot(page, "character-3d-map-close-390-pastel");
    expect(deviceErrors).toEqual([]);
  });
});

/** 외형 표지(data-look)의 칸 차례 = @terra/shared/characterLook CHARACTER_LOOK_KEYS(e2e/first-login.spec.ts와 같다) */
const LOOK_KEYS = [
  "build",
  "head",
  "face",
  "top",
  "torso",
  "arms",
  "legs",
  "back",
  "extra",
  "height",
  "plating",
  "skin",
  "primary",
  "secondary",
  "accent",
  "glow",
] as const;

/** 외형 → 표지(data-look) */
function keyOf(look: unknown): string {
  return LOOK_KEYS.map((name) =>
    typeof look === "object" && look !== null ? String(Reflect.get(look, name)) : "",
  ).join(".");
}

/** cyborg.get의 3D 외형·한 번 고르기 */
async function cyborgLook(page: Page): Promise<{ look: unknown; lookPick: unknown }> {
  return page.evaluate(async () => {
    const response: unknown = await fetch("/api/trpc/cyborg.get").then((reply) => reply.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const data = pick(pick(response, "result"), "data");
    return { look: pick(data, "look"), lookPick: pick(data, "lookPick") };
  });
}

/** WebSocket으로 cyborg_look을 직접 보내 결과 코드를 받는다(서버가 두 번째를 막는지) */
async function sendLookDirect(page: Page, look: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ protocol, chosen }) => {
      const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
      const replies: unknown[] = [];
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") replies.push(JSON.parse(event.data));
      });
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const field = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const wait = (t: string): Promise<unknown> =>
        new Promise((resolve, reject) => {
          const started = Date.now();
          const check = (): void => {
            const found = replies.find((reply) => field(reply, "t") === t);
            if (found !== undefined) resolve(found);
            else if (Date.now() - started > 15_000) reject(new Error(`no ${t}`));
            else setTimeout(check, 20);
          };
          check();
        });
      await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
      socket.send(JSON.stringify({ t: "hello", protocolVersion: protocol, clientBuild: "e2e-relook" }));
      await wait("welcome");
      socket.send(JSON.stringify({ t: "cyborg_look", id: 61, look: chosen }));
      const result = await wait("cyborg_result");
      socket.close();
      return field(result, "ok") === true ? "ok" : field(result, "code");
    },
    { protocol: PROTOCOL_VERSION, chosen: look },
  );
}

test.describe("3D 외형 한 번 고르기(질문 961 나)", () => {
  test.use({ account: "relook", ...VIEWPORTS.phone });

  test("3D 외형 없이 만든 사이보그는 사이보그 화면에서 한 번 고르고, 그 뒤로는 단추가 사라지고 서버도 막는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    const open = page.locator(".cyborg-look-pick-open");
    await expect(open).toBeVisible({ timeout: 20_000 });
    const before = await cyborgLook(page);
    expect(before.lookPick).toBe(true);
    await open.click();
    const dialog = page.locator("dialog.cyborg-look-pick");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // 처음 값 = 옛 외형에서 옮긴 3D 외형(서버가 보이는 것과 같다)
    const avatar = dialog.locator(".start-avatar");
    await expect(avatar).toHaveAttribute("data-look", keyOf(before.look));
    await expect(avatar).toHaveAttribute("data-preview", /^(ready|unsupported)$/, { timeout: 30_000 });
    const knight = dialog.locator(".start-preset[data-preset='knight']");
    await knight.click();
    await expect(knight).toHaveAttribute("aria-pressed", "true");
    const chosen = (await avatar.getAttribute("data-look")) ?? "";
    expect(chosen).not.toBe(keyOf(before.look));
    // 정하기 → 한 번 더 묻는다 → [더 고르기]면 돌아간다 → 다시 정하기 → [정하기]
    await dialog.locator(".cyborg-look-pick-save").click();
    const status = dialog.locator(".cyborg-look-pick-status");
    await expect(status).toHaveAttribute("data-state", "confirm");
    await shot(page, "character-3d-relook-390-pastel");
    await dialog.locator(".cyborg-look-pick-actions button").first().click();
    await expect(status).toHaveAttribute("data-state", "editing");
    await dialog.locator(".cyborg-look-pick-save").click();
    await dialog.locator(".cyborg-look-pick-confirm").click();
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });
    await expect(open).toHaveCount(0, { timeout: 15_000 });
    const after = await cyborgLook(page);
    expect(after.lookPick).toBe(false);
    expect(keyOf(after.look)).toBe(chosen);
    // 다시 열어도 단추가 없다. 서버에 직접 보내도 look_locked
    await page.reload();
    await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 20_000 });
    await expect(open).toHaveCount(0);
    expect(await sendLookDirect(page, before.look)).toBe("look_locked");
    expect(keyOf((await cyborgLook(page)).look)).toBe(chosen);
    expect(deviceErrors).toEqual([]);
  });
});

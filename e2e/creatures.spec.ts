// 크리처 편집기 초상화 선택기 시험 — /dev/creatures (사용자 보고 2026-11-10 "초상화 선택범위가 오차가 심하다").
// 보는 것: 고른 자리 = 선택기에 보이는 원 = 저장된 원(cxPm·cyPm·radiusPm) = 배지가 그리는 곳. 오차는 그림 화소로 잰다.
// - 누른 화면 점 밑의 그림 화소를 그림 요소의 지금 자리에서 구하고(@terra/shared/portraitCrop — 화면과 같은 계산),
//   저장된 원이 그 점에서 1화소 안인지 본다. 포인터는 정수 화면 좌표로 보낸다(브라우저가 소수 좌표를 버려도 같게).
// - 배지(미리보기 96·48·32, 상세 머리 56, 목록 38)의 <img> 인라인 값이 portraitImageStyle과 같고, 실제 놓인 자리가
//   portraitImageRect와 0.1px 안으로 맞는지 본다.
// - 마우스(1440, 확대 150%), 터치(390: 두드리기·끌기·두 손가락), 키·휠·수치 칸·되돌리기, 정사각이 아닌 그림(가짜 300×200).
// - 사진: 1440 × 개발 화면 테마 네온·라이트 + 390 네온(E2E_SHOTS_DIR).
// 시험끼리 서버·DB를 같이 쓴다: 적용하는 시험은 처음과 끝에 크리처 덮어쓰기를 모두 지운다.
import type { Locator, Page } from "@playwright/test";
import {
  type PortraitCrop,
  type PortraitPoint,
  type PortraitRect,
  type PortraitSize,
  boxPointToImage,
  imagePointToBox,
  portraitCircle,
  portraitImageRect,
  portraitImageStyle,
} from "../packages/shared/src/portraitCrop.ts";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). mutation이면 POST, 아니면 GET(?input=) */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  mutation = false,
): Promise<{ status: number; data: unknown; reason: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, mutation: post }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(
        post ? `/api/trpc/${name}` : `/api/trpc/${name}${query}`,
        post
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: get(get(json, "result"), "data"),
        reason: get(get(get(json, "error"), "data"), "reason"),
      };
    },
    { procedure, input, mutation },
  );
}

/** 크리처 덮어쓰기를 모두 지운다(팩 값으로) */
async function resetCreatures(page: Page): Promise<void> {
  const current = await trpc(page, "creatures.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`creatures.list ${current.status}`);
  const changes = list(field(current.data, "creatures")).flatMap((row) => {
    const id = field(field(row, "entry"), "id");
    if (field(row, "origin") === "pack" || typeof id !== "string") return [];
    return [{ op: "revert", id, baseHash: field(row, "hash") }];
  });
  if (changes.length === 0) return;
  const reverted = await trpc(page, "creatures.save", { expectedRevision: revision, changes }, true);
  if (reverted.status !== 200)
    throw new Error(`creatures.save revert ${reverted.status} ${String(reverted.reason)}`);
}

/** 그 세계에 적용된 크리처의 초상화 원 */
async function appliedCrop(page: Page, id: string): Promise<unknown> {
  const current = await trpc(page, "creatures.list");
  const row = list(field(current.data, "creatures")).find((r) => field(field(r, "entry"), "id") === id);
  return field(field(row, "entry"), "portraitCrop");
}

const screen = (page: Page) => page.locator(".ce-screen");
const stage = (page: Page) => page.locator(".ce-crop-stage");

async function openCreature(page: Page, id: string): Promise<void> {
  await page.goto(`/dev/creatures?creature=${id}`);
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
}

interface Geometry {
  readonly natural: PortraitSize;
  readonly crop: PortraitCrop;
  /** 그림 요소·원·손잡이의 지금 화면 자리(clientX·Y 좌표) */
  readonly img: PortraitRect;
  readonly ring: PortraitRect;
  readonly handle: PortraitRect;
}

async function geometry(page: Page): Promise<Geometry> {
  return stage(page).evaluate((el) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const rect = (node: Element | null) => {
      if (!node) throw new Error("선택기 요소가 없습니다");
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const [cxPm = Number.NaN, cyPm = Number.NaN, radiusPm = Number.NaN] = (el.getAttribute("data-crop") ?? "")
      .split(",")
      .map(Number);
    const [width = Number.NaN, height = Number.NaN] = (el.getAttribute("data-natural") ?? "")
      .split("x")
      .map(Number);
    return {
      natural: { width, height },
      crop: { cxPm, cyPm, radiusPm },
      img: rect(el.querySelector(".ce-crop-source-img")),
      ring: rect(el.querySelector(".ce-crop-circle")),
      handle: rect(el.querySelector(".ce-crop-handle")),
    };
  });
}

/** 그림 화소 점을 가리키는 정수 화면 좌표와, 그 좌표 밑의 진짜 그림 화소 */
function aim(g: Geometry, imagePoint: PortraitPoint): { client: PortraitPoint; image: PortraitPoint } {
  const exact = imagePointToBox(imagePoint, g.img, g.natural);
  const client = { x: Math.round(exact.x), y: Math.round(exact.y) };
  return { client, image: boxPointToImage(client, g.img, g.natural) };
}

const centreOf = (rect: PortraitRect): PortraitPoint => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/** 그림 상자를 화면 가운데로 옮긴다(위 띠·아래 막대에 가리지 않게) */
async function centreStage(page: Page): Promise<void> {
  await stage(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
}

/** 그림 상자를 담은 스크롤 상자(없으면 쪽)를 dy만큼 민다. 더 못 가면 반대로 민다 */
async function scrollBy(page: Page, dy: number): Promise<void> {
  await stage(page).evaluate((el, amount) => {
    let box: Element | null = el.parentElement;
    while (
      box &&
      !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)
    ) {
      box = box.parentElement;
    }
    const target = box ?? document.scrollingElement;
    if (!target) return;
    const before = target.scrollTop;
    target.scrollTop = before + amount;
    if (target.scrollTop === before) target.scrollTop = before - amount;
  }, dy);
}

/** 그 화면 점을 누르면 선택기가 받는지(다른 것이 덮고 있지 않은지) */
async function expectOnStage(page: Page, point: PortraitPoint): Promise<void> {
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".ce-crop-stage") !== null,
    point,
  );
  expect(hit, `(${point.x}, ${point.y})는 선택기 안이어야 한다`).toBe(true);
}

/** 선택기에 보이는 원이 저장 값(data-crop)의 원과 같은 그림 화소 원인지: 가운데·반지름 오차(그림 화소) */
function ringError(g: Geometry): { centre: number; radius: number; round: number } {
  const want = portraitCircle(g.crop, g.natural);
  const centre = boxPointToImage(centreOf(g.ring), g.img, g.natural);
  const radius = (g.ring.width / 2 / g.img.width) * g.natural.width;
  return {
    centre: Math.hypot(centre.x - want.cx, centre.y - want.cy),
    radius: Math.abs(radius - want.r),
    // 화면에서 정원인지(CSS px)
    round: Math.abs(g.ring.width - g.ring.height),
  };
}

function expectRing(g: Geometry): void {
  const error = ringError(g);
  expect(error.centre, "보이는 원의 가운데 = 저장 값의 가운데(그림 화소)").toBeLessThan(0.5);
  expect(error.radius, "보이는 원의 반지름 = 저장 값의 반지름(그림 화소)").toBeLessThan(0.5);
  expect(error.round, "원은 화면에서 정원").toBeLessThan(0.1);
}

/** CSS 값 글자 안의 수들("translate(-50%, -34%)" → [-50, -34]) */
const numbersIn = (text: string): number[] => (text.match(/-?[\d.]+/g) ?? []).map(Number);

/** 배지가 그리는 곳: <img> 인라인 값 = portraitImageStyle, 놓인 자리 = portraitImageRect(배지 안쪽 상자 기준) */
async function expectBadges(tokens: Locator, crop: PortraitCrop, count: number): Promise<void> {
  await expect(tokens).toHaveCount(count);
  // 목록·상세 머리의 그림은 늦게 읽는다(loading="lazy") → 보이게 옮기고 읽을 때까지 기다린다
  for (const token of await tokens.all()) await token.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      tokens.evaluateAll((nodes) =>
        nodes.every((node) => {
          const img = node.querySelector("img");
          return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
  const measured = await tokens.evaluateAll((nodes) =>
    nodes.map((node) => {
      const img = node.querySelector("img");
      if (!(node instanceof HTMLElement) || !img) throw new Error("배지에 그림이 없습니다");
      const box = node.getBoundingClientRect();
      const placed = img.getBoundingClientRect();
      return {
        inner: node.clientWidth,
        innerHeight: node.clientHeight,
        // 그림 자리(배지 안쪽 상자 = 테두리 안 기준)
        left: placed.left - box.left - node.clientLeft,
        top: placed.top - box.top - node.clientTop,
        width: placed.width,
        height: placed.height,
        natural: { width: img.naturalWidth, height: img.naturalHeight },
        style: {
          left: img.style.left,
          top: img.style.top,
          width: img.style.width,
          transform: img.style.transform,
        },
        fit: getComputedStyle(img).objectFit,
      };
    }),
  );
  const style = portraitImageStyle(crop);
  for (const badge of measured) {
    // 브라우저는 인라인 값을 유효 숫자 6자리로 돌려준다(166.6667% → 166.667%) → 수로 견준다
    for (const key of ["left", "top", "width", "transform"] as const) {
      const got = numbersIn(badge.style[key]);
      const wanted = numbersIn(style[key]);
      expect(badge.style[key].replace(/-?[\d.]+/g, "#"), `배지 그림 ${key}의 모양`).toBe(
        style[key].replace(/-?[\d.]+/g, "#"),
      );
      expect(got.length).toBe(wanted.length);
      for (const [index, number] of got.entries()) {
        expect(Math.abs(number - (wanted[index] ?? Number.NaN)), `배지 그림 ${key} = 공용 함수`).toBeLessThan(
          0.001,
        );
      }
    }
    expect(badge.innerHeight).toBe(badge.inner);
    expect(badge.natural.width, "배지 그림을 읽었다").toBeGreaterThan(0);
    const want = portraitImageRect(crop, badge.natural, badge.inner);
    for (const side of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(badge[side] - want[side]), `배지 ${badge.inner}px 그림 ${side}`).toBeLessThan(0.1);
    }
  }
}

/** 그 세계에 담은 변경을 적용하고 판이 바뀔 때까지 기다린다 */
async function apply(page: Page): Promise<void> {
  const before = await screen(page).getAttribute("data-revision");
  await expect(page.locator(".be-apply")).toBeEnabled({ timeout: 15_000 });
  await page.locator(".be-apply").click();
  await expect(screen(page)).not.toHaveAttribute("data-revision", before ?? "", { timeout: 15_000 });
}

/** 터치: CDP로 손가락을 보낸다(Playwright touchscreen은 두드리기만 한다). 좌표는 화면 CSS px */
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", points: readonly PortraitPoint[]) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id })),
    });
  return {
    /** 한 손가락으로 끈다 */
    async drag(from: PortraitPoint, to: PortraitPoint): Promise<void> {
      await send("touchStart", [from]);
      for (let i = 1; i <= 5; i += 1) {
        await send("touchMove", [
          {
            x: Math.round(from.x + ((to.x - from.x) * i) / 5),
            y: Math.round(from.y + ((to.y - from.y) * i) / 5),
          },
        ]);
      }
      await send("touchEnd", []);
    },
    /** 두 손가락을 차례로 대고 벌리거나 오므린다 */
    async pinch(
      start: readonly [PortraitPoint, PortraitPoint],
      end: readonly [PortraitPoint, PortraitPoint],
    ): Promise<void> {
      await send("touchStart", [start[0]]);
      await send("touchStart", [start[0], start[1]]);
      for (let i = 1; i <= 5; i += 1) {
        await send("touchMove", [
          {
            x: start[0].x + ((end[0].x - start[0].x) * i) / 5,
            y: start[0].y + ((end[0].y - start[0].y) * i) / 5,
          },
          {
            x: start[1].x + ((end[1].x - start[1].x) * i) / 5,
            y: start[1].y + ((end[1].y - start[1].y) * i) / 5,
          },
        ]);
      }
      await send("touchEnd", []);
    },
  };
}

const offset = (a: PortraitPoint, b: PortraitPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const centrePx = (g: Geometry): PortraitPoint => {
  const circle = portraitCircle(g.crop, g.natural);
  return { x: circle.cx, y: circle.cy };
};
/** 측정 값을 시험 기록에 남긴다(작업 기록에 옮긴다) */
const note = (label: string, value: unknown): void => {
  console.log(`[creatures] ${label} ${JSON.stringify(value)}`);
};

test.describe("넓은 화면 — 마우스·키·휠", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("고른 자리가 원이 되고, 저장되고, 그 자리가 그려진다", async ({ page, deviceErrors }) => {
    await page.goto("/dev");
    await resetCreatures(page);
    try {
      await openCreature(page, "wolf");
      // 고치기 전: 미리보기 셋 + 상세 머리 + 목록 줄이 모두 같은 계산
      const packCrop = { cxPm: 500, cyPm: 340, radiusPm: 300 };
      await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), packCrop, 3);
      await expectBadges(page.locator(".ce-detail-identity .ce-creature-token"), packCrop, 1);
      await expectBadges(page.locator('.ce-table-row[data-selected="true"] .ce-creature-token'), packCrop, 1);
      await centreStage(page);
      const start = await geometry(page);
      expect(start.natural).toEqual({ width: 512, height: 512 });
      expect(start.crop).toEqual(packCrop);
      expectRing(start);

      // 1) 원 밖을 누르면 그 자리가 가운데가 된다
      const outside = aim(start, { x: 460, y: 440 });
      await expectOnStage(page, outside.client);
      await page.mouse.click(outside.client.x, outside.client.y);
      const picked = await geometry(page);
      expect(offset(centrePx(picked), outside.image), "누른 자리 = 저장 값 가운데").toBeLessThan(1);
      expect(picked.crop.radiusPm).toBe(300);
      expectRing(picked);
      note("1440 원 밖 누르기(512) 오차(그림 화소)", offset(centrePx(picked), outside.image));

      // 2) 원의 가운데를 잡아 끌면 놓은 자리가 가운데다
      const grab = centreOf(picked.ring);
      const target = aim(picked, { x: 150, y: 200 });
      await page.mouse.move(Math.round(grab.x), Math.round(grab.y));
      await page.mouse.down();
      await page.mouse.move((grab.x + target.client.x) / 2, (grab.y + target.client.y) / 2, { steps: 4 });
      await page.mouse.move(target.client.x, target.client.y, { steps: 4 });
      // 끄는 동안: 원·미리보기는 따라오고(상세 머리는 손을 뗄 때 바뀐다)
      const dragging = await geometry(page);
      await expect(stage(page)).toHaveAttribute("data-dragging", "true");
      expectRing(dragging);
      await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), dragging.crop, 3);
      await page.mouse.up();
      const dropped = await geometry(page);
      await expect(stage(page)).not.toHaveAttribute("data-dragging", "true");
      // 잡은 자리(반올림한 화면 좌표)와 원 가운데 사이 어긋남은 그대로 간다 → 1화소 + 잡을 때 반올림(0.5 CSS px)
      const grabSlack = (0.75 / dropped.img.width) * dropped.natural.width;
      expect(offset(centrePx(dropped), target.image)).toBeLessThan(1 + grabSlack);
      expectRing(dropped);
      await expectBadges(page.locator(".ce-detail-identity .ce-creature-token"), dropped.crop, 1);

      // 3) 원 안 다른 곳을 잡으면 원이 튀지 않고 잡은 만큼만 움직인다. 누르기만 하면 그대로다
      const inside = aim(dropped, { x: centrePx(dropped).x + 40, y: centrePx(dropped).y + 25 });
      await page.mouse.click(inside.client.x, inside.client.y);
      expect((await geometry(page)).crop).toEqual(dropped.crop);
      const moveTo = aim(dropped, { x: inside.image.x + 60, y: inside.image.y - 35 });
      await page.mouse.move(inside.client.x, inside.client.y);
      await page.mouse.down();
      await page.mouse.move(moveTo.client.x, moveTo.client.y, { steps: 5 });
      await page.mouse.up();
      const shifted = await geometry(page);
      const want = {
        x: centrePx(dropped).x + (moveTo.image.x - inside.image.x),
        y: centrePx(dropped).y + (moveTo.image.y - inside.image.y),
      };
      expect(offset(centrePx(shifted), want), "잡은 만큼만 옮겨진다").toBeLessThan(1);

      // 4) 손잡이를 끌면 가운데에서 놓은 곳까지가 반지름이다
      const centre = centreOf(shifted.ring);
      const handle = centreOf(shifted.handle);
      const handleRadius = (offset(handle, centre) / shifted.img.width) * shifted.natural.width;
      expect(
        Math.abs(handleRadius - portraitCircle(shifted.crop, shifted.natural).r),
        "손잡이는 원 테두리 위에 있다",
      ).toBeLessThan(0.5);
      const direction = {
        x: (handle.x - centre.x) / offset(handle, centre),
        y: (handle.y - centre.y) / offset(handle, centre),
      };
      const pull = { x: Math.round(centre.x + direction.x * 70), y: Math.round(centre.y + direction.y * 70) };
      await expectOnStage(page, pull);
      await page.mouse.move(Math.round(handle.x), Math.round(handle.y));
      await page.mouse.down();
      await page.mouse.move(pull.x, pull.y, { steps: 5 });
      await page.mouse.up();
      const sized = await geometry(page);
      const pulledRadius = offset(boxPointToImage(pull, sized.img, sized.natural), centrePx(sized));
      // 손잡이를 잡을 때 반올림(0.5 CSS px)만큼의 어긋남은 그대로 간다
      expect(Math.abs(portraitCircle(sized.crop, sized.natural).r - pulledRadius)).toBeLessThan(
        1 + grabSlack,
      );
      expect(centrePx(sized)).toEqual(centrePx(shifted));
      expectRing(sized);

      // 5) 화살표 = 1화소, Shift = 10화소, + − = 반지름
      await expect(stage(page)).toBeFocused();
      const before = portraitCircle(sized.crop, sized.natural);
      await page.keyboard.press("ArrowRight");
      const right = portraitCircle((await geometry(page)).crop, sized.natural);
      expect(right.cx - before.cx).toBeGreaterThanOrEqual(0.5);
      expect(right.cx - before.cx).toBeLessThanOrEqual(1.5);
      expect(right.cy).toBe(before.cy);
      await page.keyboard.press("Shift+ArrowDown");
      const down = portraitCircle((await geometry(page)).crop, sized.natural);
      expect(Math.abs(down.cy - before.cy - 10)).toBeLessThanOrEqual(0.5);
      await page.keyboard.press("-");
      const smaller = portraitCircle((await geometry(page)).crop, sized.natural);
      expect(before.r - smaller.r).toBeGreaterThanOrEqual(0.5);
      expect(before.r - smaller.r).toBeLessThanOrEqual(1.5);

      // 6) 휠: 그림을 누른 뒤(초점)에는 크기를 바꾸고 쪽은 그대로다
      const wheelAt = centreOf((await geometry(page)).ring);
      await page.mouse.move(Math.round(wheelAt.x), Math.round(wheelAt.y));
      const beforeWheel = await geometry(page);
      await page.mouse.wheel(0, 100);
      await expect
        .poll(async () => (await geometry(page)).crop.radiusPm)
        .toBeGreaterThan(beforeWheel.crop.radiusPm);
      const afterWheel = await geometry(page);
      expect(afterWheel.img.top, "휠로 크기를 바꾸는 동안 쪽은 스크롤되지 않는다").toBe(beforeWheel.img.top);
      expect(
        portraitCircle(afterWheel.crop, afterWheel.natural).r -
          portraitCircle(beforeWheel.crop, beforeWheel.natural).r,
      ).toBeCloseTo(5, 0);

      // 7) 수치 칸 ↔ 원, [되돌리기]
      const cx = page.getByLabel(message("ko", "dev_creature_crop_cx"), { exact: true });
      await expect(cx).toHaveValue(String(afterWheel.crop.cxPm));
      await cx.fill("613");
      await expect(stage(page)).toHaveAttribute(
        "data-crop",
        `613,${afterWheel.crop.cyPm},${afterWheel.crop.radiusPm}`,
      );
      expectRing(await geometry(page));
      await page.locator(".ce-crop-undo").click();
      await expect(stage(page)).toHaveAttribute(
        "data-crop",
        `${afterWheel.crop.cxPm},${afterWheel.crop.cyPm},${afterWheel.crop.radiusPm}`,
      );
      await expect(cx).toHaveValue(String(afterWheel.crop.cxPm));

      // 8) 쪽을 스크롤한 뒤에도 누른 자리가 가운데다(그림 자리를 누를 때마다 새로 잰다)
      await scrollBy(page, 57);
      const scrolled = await geometry(page);
      expect(scrolled.img.top, "쪽이 스크롤되어 그림 자리가 바뀌었다").not.toBe(afterWheel.img.top);
      note("1440 스크롤로 그림이 옮겨진 거리(CSS px)", scrolled.img.top - afterWheel.img.top);
      // 지금 원 밖인 모서리 쪽 한 점
      const last = aim(scrolled, { x: 470, y: 470 });
      await expectOnStage(page, last.client);
      await page.mouse.click(last.client.x, last.client.y);
      const final = await geometry(page);
      expect(offset(centrePx(final), last.image), "스크롤 뒤 누른 자리 = 저장 값 가운데").toBeLessThan(1);
      expectRing(final);
      await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), final.crop, 3);

      // 9) 적용 → 서버에 든 값 = 고른 값, 다시 열어도 같은 곳을 그린다
      await apply(page);
      const saved = await appliedCrop(page, "wolf");
      expect(saved).toEqual(final.crop);
      const savedCircle = portraitCircle(final.crop, final.natural);
      expect(
        offset({ x: savedCircle.cx, y: savedCircle.cy }, last.image),
        "서버 값이 고른 자리에서 1화소 안",
      ).toBeLessThan(1);
      note(
        "1440 적용된 값이 고른 자리에서 벗어난 거리(그림 화소)",
        offset({ x: savedCircle.cx, y: savedCircle.cy }, last.image),
      );
      await openCreature(page, "wolf");
      const reopened = await geometry(page);
      expect(reopened.crop).toEqual(final.crop);
      expectRing(reopened);
      await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), final.crop, 3);
      await expectBadges(page.locator(".ce-detail-identity .ce-creature-token"), final.crop, 1);
      await expectBadges(
        page.locator('.ce-table-row[data-selected="true"] .ce-creature-token'),
        final.crop,
        1,
      );
      await expect(page.locator(".ce-crop-to-applied")).toBeDisabled();
      // [적용된 값으로]: 고친 뒤 누르면 서버 값으로 돌아간다
      await stage(page).focus();
      await page.keyboard.press("Shift+ArrowLeft");
      await expect(page.locator(".ce-crop-to-applied")).toBeEnabled();
      await page.locator(".ce-crop-to-applied").click();
      expect((await geometry(page)).crop).toEqual(final.crop);
      expect(deviceErrors).toEqual([]);
    } finally {
      await resetCreatures(page);
    }
  });

  test("1,024화소 그림: 누른 자리에서 1화소 안, 원 전체가 같은 계산", async ({ page }) => {
    await openCreature(page, "king_cobra");
    await centreStage(page);
    const start = await geometry(page);
    expect(start.natural).toEqual({ width: 1024, height: 1024 });
    expectRing(start);
    const outside = aim(start, { x: 900, y: 880 });
    await expectOnStage(page, outside.client);
    await page.mouse.click(outside.client.x, outside.client.y);
    const picked = await geometry(page);
    expect(offset(centrePx(picked), outside.image)).toBeLessThan(1);
    note("1440 원 밖 누르기(1024) 오차(그림 화소)", offset(centrePx(picked), outside.image));
    expectRing(picked);
    await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), picked.crop, 3);
  });

  test("정사각이 아닌 그림(300×200): 원은 정원이고 배지는 비율 그대로 그린다", async ({ page }) => {
    await page.route("**/creatures/e2e_wide.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#345"/><circle cx="210" cy="60" r="40" fill="#fc6"/><circle cx="60" cy="150" r="20" fill="#6cf"/></svg>',
      }),
    );
    await openCreature(page, "wolf");
    await page.locator("#ce-creature-img-file").fill("e2e_wide.svg");
    await expect(stage(page)).toHaveAttribute("data-natural", "300x200");
    await centreStage(page);
    // 반지름을 작게 해 두고(너비의 15% = 45화소) 노란 원(210, 60)을 고른다
    await page.getByLabel(message("ko", "dev_creature_crop_radius"), { exact: true }).fill("150");
    await page.getByLabel(message("ko", "dev_creature_crop_cx"), { exact: true }).fill("200");
    await page.getByLabel(message("ko", "dev_creature_crop_cy"), { exact: true }).fill("750");
    const start = await geometry(page);
    expect(start.crop).toEqual({ cxPm: 200, cyPm: 750, radiusPm: 150 });
    // 그림 상자는 그림 비율 그대로다(여백 없음)
    expect(Math.abs(start.img.width / start.img.height - 1.5)).toBeLessThan(0.01);
    expectRing(start);
    const yellow = aim(start, { x: 210, y: 60 });
    await expectOnStage(page, yellow.client);
    await page.mouse.click(yellow.client.x, yellow.client.y);
    const picked = await geometry(page);
    expect(offset(centrePx(picked), yellow.image)).toBeLessThan(1);
    expectRing(picked);
    await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), picked.crop, 3);
    await expectBadges(page.locator(".ce-detail-identity .ce-creature-token"), picked.crop, 1);
    note("300×200 그림 누르기 오차(그림 화소)", offset(centrePx(picked), yellow.image));
  });
});

test.describe("브라우저 확대 150%(960 × 기기 화소 비율 1.5)", () => {
  test.use({
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1.5,
    isMobile: false,
    hasTouch: false,
    account: "dev",
    devTheme: "neon",
  });

  test("누른 자리 = 원 가운데, 끌어도 같다", async ({ page }) => {
    await openCreature(page, "wolf");
    await centreStage(page);
    const start = await geometry(page);
    expectRing(start);
    const outside = aim(start, { x: 455, y: 450 });
    await expectOnStage(page, outside.client);
    await page.mouse.click(outside.client.x, outside.client.y);
    const picked = await geometry(page);
    expect(offset(centrePx(picked), outside.image)).toBeLessThan(1);
    note("960@1.5 원 밖 누르기 오차(그림 화소)", offset(centrePx(picked), outside.image));
    expectRing(picked);
    const grab = centreOf(picked.ring);
    const target = aim(picked, { x: 200, y: 260 });
    await page.mouse.move(Math.round(grab.x), Math.round(grab.y));
    await page.mouse.down();
    await page.mouse.move(target.client.x, target.client.y, { steps: 6 });
    await page.mouse.up();
    const dropped = await geometry(page);
    const grabSlack = (0.75 / dropped.img.width) * dropped.natural.width;
    expect(offset(centrePx(dropped), target.image)).toBeLessThan(1 + grabSlack);
    expectRing(dropped);
    await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), dropped.crop, 3);
  });
});

test.describe("휴대폰 390 — 터치", () => {
  test.use({ ...VIEWPORTS.phone, account: "dev", devTheme: "neon" });

  test("두드리기·끌기·두 손가락으로 고른 자리가 그대로 원이 된다", async ({ page, deviceErrors }) => {
    await openCreature(page, "wolf");
    await centreStage(page);
    const start = await geometry(page);
    expectRing(start);
    const fingers = await touch(page);

    // 두드리기(원 밖) → 그 자리가 가운데
    const outside = aim(start, { x: 450, y: 430 });
    await expectOnStage(page, outside.client);
    await page.touchscreen.tap(outside.client.x, outside.client.y);
    const tapped = await geometry(page);
    expect(offset(centrePx(tapped), outside.image), "두드린 자리 = 저장 값 가운데").toBeLessThan(1);
    note("390 두드리기 오차(그림 화소)", offset(centrePx(tapped), outside.image));
    expectRing(tapped);

    // 첫 고침으로 위쪽 표지·담은 변경 막대가 생겨 쪽이 밀려도, 다음 손짓은 그때의 그림 자리로 잰다
    await centreStage(page);
    const settled = await geometry(page);
    const grab = centreOf(settled.ring);
    const from = { x: Math.round(grab.x), y: Math.round(grab.y) };
    const target = aim(settled, { x: 170, y: 190 });
    await expectOnStage(page, target.client);
    await fingers.drag(from, target.client);
    const dropped = await geometry(page);
    const grabSlack = (0.75 / dropped.img.width) * dropped.natural.width;
    expect(offset(centrePx(dropped), target.image), "끌어 놓은 자리 = 저장 값 가운데").toBeLessThan(
      1 + grabSlack,
    );
    note("390 끌기 오차(그림 화소)", offset(centrePx(dropped), target.image));
    // 끄는 동안 그림이 손가락 밑에서 밀리지 않았다(끝날 때 한 번 올린다)
    expect(dropped.img.top).toBe(settled.img.top);
    expectRing(dropped);
    await expectBadges(page.locator(".ce-token-preview-item .ce-creature-token"), dropped.crop, 3);

    // 두 손가락 사이를 1.5배로 벌리면 반지름이 1.5배(가운데는 그대로)
    const mid = centreOf(dropped.ring);
    const before = portraitCircle(dropped.crop, dropped.natural);
    await fingers.pinch(
      [
        { x: mid.x - 20, y: mid.y },
        { x: mid.x + 20, y: mid.y },
      ],
      [
        { x: mid.x - 30, y: mid.y },
        { x: mid.x + 30, y: mid.y },
      ],
    );
    const pinched = await geometry(page);
    expect(portraitCircle(pinched.crop, pinched.natural).r / before.r).toBeCloseTo(1.5, 1);
    expect(centrePx(pinched)).toEqual(centrePx(dropped));
    expectRing(pinched);

    // [되돌리기] 세 번 = 처음 값
    const undo = page.locator(".ce-crop-undo");
    await undo.click();
    expect((await geometry(page)).crop).toEqual(dropped.crop);
    await undo.click();
    await undo.click();
    expect((await geometry(page)).crop).toEqual(start.crop);
    await expect(undo).toBeDisabled();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page, { ignore: ":not(.ce-portrait-card *)" })).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("사진", () => {
  for (const devTheme of ["neon", "light"] as const satisfies readonly DevTheme[]) {
    test.describe(`1440 ${devTheme}`, () => {
      test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme });
      test(`초상화 선택기 ${devTheme}`, async ({ page }) => {
        await openCreature(page, "griffon");
        await centreStage(page);
        expectRing(await geometry(page));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `creatures-portrait-1440-${devTheme}`);
        await elementShot(page.locator(".ce-portrait-card"), `creatures-portrait-card-1440-${devTheme}`);
      });
    });
  }

  test.describe("390 neon", () => {
    test.use({ ...VIEWPORTS.phone, account: "dev", devTheme: "neon" });
    test("초상화 선택기 390", async ({ page }) => {
      await openCreature(page, "griffon");
      await centreStage(page);
      expectRing(await geometry(page));
      await shot(page, "creatures-portrait-390-neon");
      await elementShot(page.locator(".ce-portrait-card"), "creatures-portrait-card-390-neon");
    });
  });
});

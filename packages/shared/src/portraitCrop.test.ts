// 원형 초상화 좌표 계산 시험 — 고르는 쪽(선택기 원)과 그리는 쪽(배지 그림 자리)이 같은 그림 화소 원을 가리키는지 본다.
import { describe, expect, it } from "vitest";
import { CREATURE_DEFAULT_PORTRAIT_CROP, CREATURE_LIMITS } from "./creatureEditor.ts";
import {
  PORTRAIT_CROP_LIMITS,
  type PortraitCrop,
  type PortraitRect,
  type PortraitSize,
  boxPointToImage,
  clampPortraitCrop,
  imagePointToBox,
  nudgePortraitCrop,
  portraitCircle,
  portraitCropFromCircle,
  portraitImageRect,
  portraitImageStyle,
  portraitRingRect,
} from "./portraitCrop.ts";

const SQUARE: PortraitSize = { width: 512, height: 512 };
const BIG: PortraitSize = { width: 1024, height: 1024 };
const WIDE: PortraitSize = { width: 300, height: 200 };
const TALL: PortraitSize = { width: 240, height: 400 };
const SIZES = [SQUARE, BIG, WIDE, TALL] as const;
const BOXES = [1, 7, 32, 38, 48, 56, 96, 333.5] as const;
const CROPS: readonly PortraitCrop[] = [
  CREATURE_DEFAULT_PORTRAIT_CROP,
  { cxPm: 500, cyPm: 500, radiusPm: 500 },
  { cxPm: 0, cyPm: 0, radiusPm: 50 },
  { cxPm: 1000, cyPm: 1000, radiusPm: 500 },
  { cxPm: 0, cyPm: 1000, radiusPm: 333 },
  { cxPm: 613, cyPm: 207, radiusPm: 181 },
];

/** "12.5%" → 0.125 */
const ratio = (text: string): number => Number.parseFloat(text) / 100;

/** 브라우저가 portraitImageStyle을 그리는 방식: 상자 가운데에서 그림 자기 크기의 %만큼 당긴다(height: auto) */
function layoutLikeCss(crop: PortraitCrop, natural: PortraitSize, boxSize: number): PortraitRect {
  const style = portraitImageStyle(crop);
  const match = /^translate\((-?[\d.]+)%, (-?[\d.]+)%\)$/.exec(style.transform);
  if (!match) throw new Error(`transform 모양이 다릅니다: ${style.transform}`);
  const width = ratio(style.width) * boxSize;
  const height = (width * natural.height) / natural.width;
  return {
    left: ratio(style.left) * boxSize + (Number(match[1]) / 100) * width,
    top: ratio(style.top) * boxSize + (Number(match[2]) / 100) * height,
    width,
    height,
  };
}

describe("저장 범위", () => {
  it("크리처 편집기 한계·기본 원과 같다", () => {
    expect(PORTRAIT_CROP_LIMITS.coordPm).toEqual(CREATURE_LIMITS.portraitCoordPm);
    expect(PORTRAIT_CROP_LIMITS.radiusPm).toEqual(CREATURE_LIMITS.portraitRadiusPm);
    expect(clampPortraitCrop(CREATURE_DEFAULT_PORTRAIT_CROP)).toEqual(CREATURE_DEFAULT_PORTRAIT_CROP);
  });

  it("정수로 반올림하고 범위 안으로 넣는다. 숫자가 아니면 가장 작은 값", () => {
    expect(clampPortraitCrop({ cxPm: -3.2, cyPm: 1000.6, radiusPm: 12 })).toEqual({
      cxPm: 0,
      cyPm: 1000,
      radiusPm: 50,
    });
    expect(clampPortraitCrop({ cxPm: 499.5, cyPm: 340.49, radiusPm: 9999 })).toEqual({
      cxPm: 500,
      cyPm: 340,
      radiusPm: 500,
    });
    expect(
      clampPortraitCrop({ cxPm: Number.NaN, cyPm: Number.POSITIVE_INFINITY, radiusPm: Number.NaN }),
    ).toEqual({ cxPm: 0, cyPm: 0, radiusPm: 50 });
  });
});

describe("‰ ↔ 그림 화소 원", () => {
  it("가로·세로는 각 변의 ‰, 반지름은 너비의 ‰", () => {
    expect(portraitCircle({ cxPm: 500, cyPm: 340, radiusPm: 300 }, SQUARE)).toEqual({
      cx: 256,
      cy: 174.08,
      r: 153.6,
    });
    expect(portraitCircle({ cxPm: 500, cyPm: 500, radiusPm: 250 }, WIDE)).toEqual({
      cx: 150,
      cy: 100,
      r: 75,
    });
    expect(portraitCircle({ cxPm: 250, cyPm: 250, radiusPm: 500 }, TALL)).toEqual({
      cx: 60,
      cy: 100,
      r: 120,
    });
  });

  it("그림 화소로 고른 점은 저장한 뒤에도 0.5‰(1,024화소 그림에서 0.52화소) 안이다", () => {
    for (const natural of SIZES) {
      for (let i = 0; i <= 40; i += 1) {
        const point = { x: (natural.width * i) / 40, y: (natural.height * ((i * 7) % 41)) / 40 };
        const r = natural.width * (0.05 + (0.45 * i) / 40);
        const saved = portraitCropFromCircle({ cx: point.x, cy: point.y, r }, natural);
        const back = portraitCircle(saved, natural);
        expect(Math.abs(back.cx - point.x)).toBeLessThanOrEqual(natural.width * 0.0005 + 1e-9);
        expect(Math.abs(back.cy - point.y)).toBeLessThanOrEqual(natural.height * 0.0005 + 1e-9);
        expect(Math.abs(back.r - r)).toBeLessThanOrEqual(natural.width * 0.0005 + 1e-9);
        expect(Math.abs(back.cx - point.x)).toBeLessThan(1);
        expect(Math.abs(back.cy - point.y)).toBeLessThan(1);
      }
    }
  });

  it("그림 밖 점·너무 큰 원은 범위 끝으로 온다", () => {
    expect(portraitCropFromCircle({ cx: -40, cy: 9999, r: 9999 }, SQUARE)).toEqual({
      cxPm: 0,
      cyPm: 1000,
      radiusPm: 500,
    });
    expect(portraitCropFromCircle({ cx: 10, cy: 10, r: 0 }, SQUARE).radiusPm).toBe(50);
  });

  it("크기를 모르는 그림(0·NaN)은 1×1로 보고 터지지 않는다", () => {
    const circle = portraitCircle(CREATURE_DEFAULT_PORTRAIT_CROP, { width: 0, height: Number.NaN });
    expect(circle).toEqual({ cx: 0.5, cy: 0.36, r: 0.32 });
    const rect = portraitImageRect(CREATURE_DEFAULT_PORTRAIT_CROP, { width: 0, height: 0 }, 48);
    expect(Object.values(rect).every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("상자 좌표 ↔ 그림 화소", () => {
  const shown: PortraitRect = { left: 13, top: 40.5, width: 286, height: 286 };

  it("그림이 차지한 네모의 모서리가 그림 모서리다(어긋난 위치·스크롤은 shown이 든다)", () => {
    expect(boxPointToImage({ x: 13, y: 40.5 }, shown, SQUARE)).toEqual({ x: 0, y: 0 });
    expect(boxPointToImage({ x: 299, y: 326.5 }, shown, SQUARE)).toEqual({ x: 512, y: 512 });
    expect(boxPointToImage({ x: 156, y: 183.5 }, shown, BIG)).toEqual({ x: 512, y: 512 });
  });

  it("갔다 오면 같은 점이다(정사각이 아닌 그림·여백 있는 상자)", () => {
    const letterboxed: PortraitRect = { left: 0, top: 48, width: 288, height: 192 };
    for (const point of [
      { x: 0, y: 0 },
      { x: 300, y: 200 },
      { x: 123.4, y: 56.7 },
    ]) {
      const back = boxPointToImage(imagePointToBox(point, letterboxed, WIDE), letterboxed, WIDE);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });
});

describe("선택기 원 테두리", () => {
  it("네모는 왼쪽 위 기준이고 가운데가 원 가운데다(가운데 좌표를 왼쪽 위로 쓰면 반지름만큼 어긋난다)", () => {
    const shown: PortraitRect = { left: 0, top: 0, width: 286, height: 286 };
    const crop = { cxPm: 500, cyPm: 340, radiusPm: 300 };
    const ring = portraitRingRect(crop, SQUARE, shown);
    expect(ring.left).toBeCloseTo(0.2 * 286, 9);
    expect(ring.top).toBeCloseTo(0.04 * 286, 9);
    expect(ring.width).toBeCloseTo(0.6 * 286, 9);
    expect(ring.height).toBeCloseTo(0.6 * 286, 9);
    // 원 가운데를 그림 화소로 되돌리면 저장한 가운데다
    const centre = boxPointToImage(
      { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 },
      shown,
      SQUARE,
    );
    expect(centre.x).toBeCloseTo(256, 9);
    expect(centre.y).toBeCloseTo(174.08, 9);
  });

  it("100×100 상자로 부르면 그림 상자에 대한 %다. 정사각이 아니면 세로 %가 다르다(화면에서는 같은 길이)", () => {
    const percent: PortraitRect = { left: 0, top: 0, width: 100, height: 100 };
    const ring = portraitRingRect({ cxPm: 500, cyPm: 500, radiusPm: 250 }, WIDE, percent);
    expect(ring).toEqual({ left: 25, top: 12.5, width: 50, height: 75 });
    // 300×200 그림을 300×200으로 보이면 원은 150×150 정원이다
    expect((ring.width / 100) * 300).toBe(150);
    expect((ring.height / 100) * 200).toBe(150);
  });

  it("그림 끝에 닿거나 밖으로 나간 원도 그대로 그린다", () => {
    const percent: PortraitRect = { left: 0, top: 0, width: 100, height: 100 };
    expect(portraitRingRect({ cxPm: 0, cyPm: 0, radiusPm: 50 }, SQUARE, percent)).toEqual({
      left: -5,
      top: -5,
      width: 10,
      height: 10,
    });
    expect(portraitRingRect({ cxPm: 1000, cyPm: 1000, radiusPm: 500 }, SQUARE, percent)).toEqual({
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    });
  });
});

describe("그리는 쪽 그림 자리", () => {
  it("상자 가운데는 원 가운데, 상자 한 변은 원 지름이다(모든 그림·원·상자 크기)", () => {
    for (const natural of SIZES) {
      for (const crop of CROPS) {
        const circle = portraitCircle(crop, natural);
        for (const box of BOXES) {
          const rect = portraitImageRect(crop, natural, box);
          const centre = boxPointToImage({ x: box / 2, y: box / 2 }, rect, natural);
          expect(centre.x).toBeCloseTo(circle.cx, 6);
          expect(centre.y).toBeCloseTo(circle.cy, 6);
          // 상자 왼쪽 끝·위 끝은 원의 왼쪽 끝·위 끝
          const edge = boxPointToImage({ x: 0, y: 0 }, rect, natural);
          expect(edge.x).toBeCloseTo(circle.cx - circle.r, 6);
          expect(edge.y).toBeCloseTo(circle.cy - circle.r, 6);
          // 그림 비율은 그대로
          expect(rect.width / rect.height).toBeCloseTo(natural.width / natural.height, 9);
        }
      }
    }
  });

  it("그림 전체 원(가운데, 반지름 500‰)이면 정사각 그림이 상자를 꼭 채운다", () => {
    expect(portraitImageRect({ cxPm: 500, cyPm: 500, radiusPm: 500 }, SQUARE, 48)).toEqual({
      left: 0,
      top: 0,
      width: 48,
      height: 48,
    });
  });

  it("모서리에 닿은 원: 그림 모서리가 상자 가운데에 온다", () => {
    const rect = portraitImageRect({ cxPm: 0, cyPm: 0, radiusPm: 250 }, SQUARE, 32);
    expect(rect).toEqual({ left: 16, top: 16, width: 64, height: 64 });
    const far = portraitImageRect({ cxPm: 1000, cyPm: 1000, radiusPm: 250 }, SQUARE, 32);
    expect(far).toEqual({ left: -48, top: -48, width: 64, height: 64 });
  });

  it("선택기 원 안의 그림과 배지 안의 그림이 같다: 원 위의 점이 배지 테두리에 온다", () => {
    for (const natural of SIZES) {
      const shown: PortraitRect = {
        left: 5,
        top: 9,
        width: natural.width * 0.6,
        height: natural.height * 0.6,
      };
      for (const crop of CROPS) {
        const ring = portraitRingRect(crop, natural, shown);
        const box = 96;
        const rect = portraitImageRect(crop, natural, box);
        for (const [fx, fy] of [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
          [0.5, 0.5],
        ] as const) {
          const fromPicker = boxPointToImage(
            { x: ring.left + ring.width * fx, y: ring.top + ring.height * fy },
            shown,
            natural,
          );
          const fromBadge = boxPointToImage({ x: box * fx, y: box * fy }, rect, natural);
          expect(fromBadge.x).toBeCloseTo(fromPicker.x, 6);
          expect(fromBadge.y).toBeCloseTo(fromPicker.y, 6);
        }
      }
    }
  });

  it("CSS 값은 같은 네모를 만든다(상자 크기·그림 비율을 몰라도)", () => {
    for (const natural of SIZES) {
      for (const crop of CROPS) {
        for (const box of BOXES) {
          const want = portraitImageRect(crop, natural, box);
          const got = layoutLikeCss(crop, natural, box);
          // CSS 값을 소수 넷째 자리(%)까지 적는다 → 가장 큰 그림(상자의 10배)에서도 0.001화소 안
          const slack = box * 2e-5 + 1e-9;
          expect(Math.abs(got.left - want.left)).toBeLessThanOrEqual(slack);
          expect(Math.abs(got.top - want.top)).toBeLessThanOrEqual(slack);
          expect(Math.abs(got.width - want.width)).toBeLessThanOrEqual(slack);
          expect(Math.abs(got.height - want.height)).toBeLessThanOrEqual(slack);
        }
      }
    }
  });

  it("CSS 값의 모양", () => {
    expect(portraitImageStyle({ cxPm: 500, cyPm: 340, radiusPm: 300 })).toEqual({
      left: "50%",
      top: "50%",
      width: "166.6667%",
      transform: "translate(-50%, -34%)",
    });
    expect(portraitImageStyle({ cxPm: 0, cyPm: 1000, radiusPm: 500 })).toEqual({
      left: "50%",
      top: "50%",
      width: "100%",
      transform: "translate(0%, -100%)",
    });
  });
});

describe("그림 화소만큼 옮기기", () => {
  it("512화소 그림에서 1화소씩 옮기면 저장한 원이 1화소쯤(0.5~1.5) 움직인다", () => {
    let crop: PortraitCrop = { cxPm: 500, cyPm: 340, radiusPm: 300 };
    for (let i = 0; i < 20; i += 1) {
      const before = portraitCircle(crop, SQUARE);
      crop = nudgePortraitCrop(crop, SQUARE, { dx: 1, dy: -1, dr: 1 });
      const after = portraitCircle(crop, SQUARE);
      for (const moved of [after.cx - before.cx, before.cy - after.cy, after.r - before.r]) {
        expect(moved).toBeGreaterThanOrEqual(0.5);
        expect(moved).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("10화소(Shift)는 10화소쯤, 갔다 오면 제자리", () => {
    const start: PortraitCrop = { cxPm: 500, cyPm: 340, radiusPm: 300 };
    const right = nudgePortraitCrop(start, BIG, { dx: 10 });
    expect(portraitCircle(right, BIG).cx - portraitCircle(start, BIG).cx).toBeCloseTo(10, 0);
    expect(right.cyPm).toBe(340);
    expect(right.radiusPm).toBe(300);
    expect(nudgePortraitCrop(right, BIG, { dx: -10 })).toEqual(start);
  });

  it("1화소가 1‰보다 작은 큰 그림도 한 번에 1‰는 움직인다", () => {
    const huge: PortraitSize = { width: 4000, height: 3000 };
    const start: PortraitCrop = { cxPm: 500, cyPm: 500, radiusPm: 200 };
    expect(nudgePortraitCrop(start, huge, { dx: 1 })).toEqual({ ...start, cxPm: 501 });
    expect(nudgePortraitCrop(start, huge, { dy: -1 })).toEqual({ ...start, cyPm: 499 });
    expect(nudgePortraitCrop(start, huge, { dr: -1 })).toEqual({ ...start, radiusPm: 199 });
  });

  it("범위 끝에서는 멈춘다", () => {
    expect(
      nudgePortraitCrop({ cxPm: 1000, cyPm: 0, radiusPm: 500 }, SQUARE, { dx: 10, dy: -10, dr: 10 }),
    ).toEqual({ cxPm: 1000, cyPm: 0, radiusPm: 500 });
    expect(nudgePortraitCrop({ cxPm: 500, cyPm: 500, radiusPm: 50 }, SQUARE, { dr: -1 }).radiusPm).toBe(50);
  });
});

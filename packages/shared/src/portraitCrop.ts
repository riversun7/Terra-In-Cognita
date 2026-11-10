// 원형 초상화 좌표 계산 — 원본 그림 위 원(cxPm·cyPm·radiusPm, ‰)을 고르는 쪽(선택기)과 그리는 쪽(배지·맵 토큰)이 같이 쓰는 순수 함수.
// 단위(저장 형식은 그대로, 뜻만 못 박는다):
// - cxPm = 그림 너비의 ‰(0 = 왼쪽 끝, 1000 = 오른쪽 끝), cyPm = 그림 높이의 ‰(0 = 위 끝)
// - radiusPm = 그림 **너비**의 ‰(정사각 그림이면 높이의 ‰와 같다). 320 = 지름이 너비의 64%
// - 원의 기준점은 늘 가운데다(왼쪽 위 모서리가 아니다). 원이 그림 밖으로 나가도 된다(나간 곳은 빈 바탕).
// 계산은 모두 그림 화소(원본 크기) 좌표를 거친다: ‰ → 그림 화소 원(portraitCircle) → 상자 좌표.
// 화면 화소(CSS px)·기기 화소 비율·스크롤은 여기서 다루지 않는다. 부르는 쪽이 "지금 보이는 그림 상자"를 재서 넘긴다.

export interface PortraitCrop {
  /** 원 가운데 X — 그림 너비의 ‰ */
  readonly cxPm: number;
  /** 원 가운데 Y — 그림 높이의 ‰ */
  readonly cyPm: number;
  /** 원 반지름 — 그림 너비의 ‰ */
  readonly radiusPm: number;
}

/** 그림 원본 크기(화소) 또는 상자 크기 */
export interface PortraitSize {
  readonly width: number;
  readonly height: number;
}

export interface PortraitPoint {
  readonly x: number;
  readonly y: number;
}

/** 상자 좌표의 네모(왼쪽 위 기준) */
export interface PortraitRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 그림 화소 좌표의 원(가운데 기준) */
export interface PortraitCircle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** 저장 범위 — 팩 스키마(packages/content creaturePortraitCropSchema)와 같아야 한다 */
export const PORTRAIT_CROP_LIMITS = {
  coordPm: { min: 0, max: 1000 },
  radiusPm: { min: 50, max: 500 },
} as const;

const clampInt = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min;

/** 크기가 없거나 틀린 그림(아직 못 읽음)은 1×1로 본다(0으로 나누지 않게) */
const safeSize = (size: PortraitSize): PortraitSize => ({
  width: Number.isFinite(size.width) && size.width > 0 ? size.width : 1,
  height: Number.isFinite(size.height) && size.height > 0 ? size.height : 1,
});

/** 정수 ‰로 반올림하고 저장 범위 안으로 넣는다 */
export function clampPortraitCrop(crop: PortraitCrop): PortraitCrop {
  const { coordPm, radiusPm } = PORTRAIT_CROP_LIMITS;
  return {
    cxPm: clampInt(crop.cxPm, coordPm.min, coordPm.max),
    cyPm: clampInt(crop.cyPm, coordPm.min, coordPm.max),
    radiusPm: clampInt(crop.radiusPm, radiusPm.min, radiusPm.max),
  };
}

/** ‰ → 그림 화소 원. 범위 밖 값은 먼저 저장 범위로 넣는다(그리는 쪽과 고르는 쪽이 같은 원을 보게) */
export function portraitCircle(crop: PortraitCrop, natural: PortraitSize): PortraitCircle {
  const { width, height } = safeSize(natural);
  const safe = clampPortraitCrop(crop);
  return {
    cx: (safe.cxPm / 1000) * width,
    cy: (safe.cyPm / 1000) * height,
    r: (safe.radiusPm / 1000) * width,
  };
}

/** 그림 화소 원 → ‰(정수, 저장 범위). 반올림 오차는 0.5‰(너비 1,000화소 그림에서 0.5화소) 이하 */
export function portraitCropFromCircle(circle: PortraitCircle, natural: PortraitSize): PortraitCrop {
  const { width, height } = safeSize(natural);
  return clampPortraitCrop({
    cxPm: (circle.cx / width) * 1000,
    cyPm: (circle.cy / height) * 1000,
    radiusPm: (circle.r / width) * 1000,
  });
}

/**
 * 상자 좌표의 점 → 그림 화소. shown = 그림이 지금 차지한 네모(상자 좌표, object-fit 여백을 뺀 실제 그림 자리).
 * 선택기는 포인터 위치에서 그림 요소의 지금 getBoundingClientRect()를 뺀 값을 point로 넘긴다.
 */
export function boxPointToImage(
  point: PortraitPoint,
  shown: PortraitRect,
  natural: PortraitSize,
): PortraitPoint {
  const { width, height } = safeSize(natural);
  const box = safeSize(shown);
  return {
    x: ((point.x - shown.left) / box.width) * width,
    y: ((point.y - shown.top) / box.height) * height,
  };
}

/** 그림 화소 → 상자 좌표의 점(boxPointToImage의 거꾸로) */
export function imagePointToBox(
  point: PortraitPoint,
  shown: PortraitRect,
  natural: PortraitSize,
): PortraitPoint {
  const { width, height } = safeSize(natural);
  return {
    x: shown.left + (point.x / width) * shown.width,
    y: shown.top + (point.y / height) * shown.height,
  };
}

/**
 * 선택기의 원 테두리 자리(상자 좌표, **왼쪽 위** 기준 네모) — shown 위에 그린 원본 그림 위의 원.
 * shown을 { left: 0, top: 0, width: 100, height: 100 }으로 주면 그림 상자에 대한 %가 나온다.
 */
export function portraitRingRect(
  crop: PortraitCrop,
  natural: PortraitSize,
  shown: PortraitRect,
): PortraitRect {
  const size = safeSize(natural);
  const circle = portraitCircle(crop, size);
  const topLeft = imagePointToBox({ x: circle.cx - circle.r, y: circle.cy - circle.r }, shown, size);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: ((2 * circle.r) / size.width) * shown.width,
    height: ((2 * circle.r) / size.height) * shown.height,
  };
}

/**
 * 그리는 쪽: 한 변이 boxSize인 정사각 상자(원형으로 자르는 배지의 안쪽)에 원이 꼭 차게 원본 그림을 놓을 네모.
 * 원 가운데가 상자 가운데에 오고, 원 지름이 상자 한 변이 된다. 그림 비율은 그대로다.
 */
export function portraitImageRect(crop: PortraitCrop, natural: PortraitSize, boxSize: number): PortraitRect {
  const size = safeSize(natural);
  const circle = portraitCircle(crop, size);
  const scale = boxSize / (2 * circle.r);
  return {
    left: boxSize / 2 - circle.cx * scale,
    top: boxSize / 2 - circle.cy * scale,
    width: size.width * scale,
    height: size.height * scale,
  };
}

/** CSS 값 글자(소수 넷째 자리까지, -0 없음) */
const pct = (value: number): string => `${Number(value.toFixed(4)) || 0}%`;

export interface PortraitImageStyle {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly transform: string;
}

/**
 * portraitImageRect를 상자 크기·그림 비율을 몰라도 되는 CSS로 옮긴 것 — `position: absolute; height: auto`인 <img>에 준다.
 * 너비는 상자 너비의 %, 자리는 상자 가운데(50%)에서 그림 **자기 크기**의 %만큼 당긴다(translate의 %는 자기 크기 기준이라
 * 높이를 몰라도 세로가 맞는다). background-position의 %는 이렇게 쓰면 안 된다(상자와 그림의 같은 % 점을 맞추는 값이다).
 */
export function portraitImageStyle(crop: PortraitCrop): PortraitImageStyle {
  // 1×1 그림을 한 변 1인 상자에 놓으면 네모의 값이 곧 비율이다
  const rect = portraitImageRect(crop, { width: 1, height: 1 }, 1);
  return {
    left: "50%",
    top: "50%",
    width: pct(rect.width * 100),
    transform: `translate(${pct(((rect.left - 0.5) / rect.width) * 100)}, ${pct(((rect.top - 0.5) / rect.height) * 100)})`,
  };
}

/** 반올림해서 제자리(to === from)면 움직이려던 쪽으로 1‰ */
const stepAtLeastOne = (from: number, to: number, by: number): number =>
  by !== 0 && to === from ? from + Math.sign(by) : to;

/**
 * 원을 그림 화소만큼 옮기거나 키운다(화살표 키 1화소·Shift 10화소). 결과는 정수 ‰다.
 * 너비가 1,000화소를 넘는 그림은 1화소가 1‰보다 작아 반올림하면 제자리일 수 있다 → 그때는 그 방향으로 1‰ 움직인다.
 */
export function nudgePortraitCrop(
  crop: PortraitCrop,
  natural: PortraitSize,
  delta: { readonly dx?: number; readonly dy?: number; readonly dr?: number },
): PortraitCrop {
  const before = clampPortraitCrop(crop);
  const circle = portraitCircle(before, natural);
  const dx = delta.dx ?? 0;
  const dy = delta.dy ?? 0;
  const dr = delta.dr ?? 0;
  const moved = portraitCropFromCircle({ cx: circle.cx + dx, cy: circle.cy + dy, r: circle.r + dr }, natural);
  return clampPortraitCrop({
    cxPm: stepAtLeastOne(before.cxPm, moved.cxPm, dx),
    cyPm: stepAtLeastOne(before.cyPm, moved.cyPm, dy),
    radiusPm: stepAtLeastOne(before.radiusPm, moved.radiusPm, dr),
  });
}

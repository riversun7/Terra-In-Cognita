// 크리처 머리·얼굴 자리 어림(detectCreatureHeadCrop) — 초상화 선택기가 그림을 새로 고르면 원을 대강 맞춰 준다.
// 128×128 캔버스에 그림을 늘려 그려 전경(알파 또는 배경색 차이)의 위쪽 대역과 윤곽 대비를 본다.
// 결과는 저장 형식 그대로다(가로·세로는 각 변의 ‰, 반지름은 너비의 ‰ — @terra/shared/portraitCrop). 늘려 그려도
// 가로·세로를 따로 ‰로 재므로 정사각이 아닌 그림에서도 가운데는 맞는다.
import { CREATURE_DEFAULT_PORTRAIT_CROP, type CreaturePortraitCrop } from "@terra/shared/creatureEditor";

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(v)));

/**
 * 캔버스 실루엣 + 위쪽 윤곽 대비 밀도(눈·얼굴·뿔 등 대비가 큰 곳)로 머리·얼굴 가운데와 반지름을 어림한다.
 * 그림을 읽을 수 없으면(다른 출처 그림이라 캔버스가 막힘 등) 기본 원을 돌려준다.
 */
export function detectCreatureHeadCrop(img: HTMLImageElement): CreaturePortraitCrop {
  try {
    return detectFromPixels(img);
  } catch {
    return CREATURE_DEFAULT_PORTRAIT_CROP;
  }
}

function detectFromPixels(img: HTMLImageElement): CreaturePortraitCrop {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (naturalW <= 0 || naturalH <= 0) return CREATURE_DEFAULT_PORTRAIT_CROP;

  // 1) 128x128 캔버스에서 전경(알파 또는 배경색 차이)과 상단 윤곽 대비를 분석
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return CREATURE_DEFAULT_PORTRAIT_CROP;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // 네 모서리 평균 배경색(불투명 이미지 대비용)
  const corners = [0, (size - 1) * 4, (size - 1) * size * 4, (size * size - 1) * 4];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgA = 0;
  for (const idx of corners) {
    bgR += data[idx] ?? 0;
    bgG += data[idx + 1] ?? 0;
    bgB += data[idx + 2] ?? 0;
    bgA += data[idx + 3] ?? 0;
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;
  bgA /= 4;
  const hasTransparency = bgA < 220;

  const isForeground = (x: number, y: number): number => {
    const idx = (y * size + x) * 4;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    const a = data[idx + 3] ?? 0;
    if (hasTransparency) return a > 36 ? a / 255 : 0;
    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    return diff > 42 ? Math.min(1, diff / 180) : 0;
  };

  let minX = size;
  let maxX = 0;
  let minY = size;
  let maxY = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isForeground(x, y) > 0.15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return CREATURE_DEFAULT_PORTRAIT_CROP;

  const boxH = maxY - minY;
  // 크리처 일러스트에서 머리·얼굴이 놓이는 상단 8%~44% 대역
  const headY0 = Math.max(1, Math.floor(minY + boxH * 0.08));
  const headY1 = Math.min(size - 2, Math.ceil(minY + boxH * 0.44));

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  let headMinX = size;
  let headMaxX = 0;

  for (let y = headY0; y <= headY1; y++) {
    for (let x = Math.max(1, minX); x <= Math.min(size - 2, maxX); x++) {
      const fg = isForeground(x, y);
      if (fg <= 0.15) continue;
      if (x < headMinX) headMinX = x;
      if (x > headMaxX) headMaxX = x;
      const idx = (y * size + x) * 4;
      const rightIdx = (y * size + (x + 1)) * 4;
      const downIdx = ((y + 1) * size + x) * 4;
      const lum = (data[idx] ?? 0) * 0.299 + (data[idx + 1] ?? 0) * 0.587 + (data[idx + 2] ?? 0) * 0.114;
      const lumR =
        (data[rightIdx] ?? 0) * 0.299 + (data[rightIdx + 1] ?? 0) * 0.587 + (data[rightIdx + 2] ?? 0) * 0.114;
      const lumD =
        (data[downIdx] ?? 0) * 0.299 + (data[downIdx + 1] ?? 0) * 0.587 + (data[downIdx + 2] ?? 0) * 0.114;
      const edge = Math.abs(lum - lumR) + Math.abs(lum - lumD);
      // 얼굴 이목구비(고대비)와 실루엣 중심쪽에 가중치를 준다
      const weight = fg * (1 + edge / 45);
      sumW += weight;
      sumX += x * weight;
      sumY += y * weight;
    }
  }

  if (sumW <= 0) return CREATURE_DEFAULT_PORTRAIT_CROP;
  const cxPm = clamp((sumX / sumW / size) * 1000, 120, 880);
  const cyPm = clamp((sumY / sumW / size) * 1000, 120, 880);
  const headSpanPm =
    headMaxX > headMinX ? ((headMaxX - headMinX) / size) * 1000 : ((maxX - minX) / size) * 600;
  const radiusPm = clamp(headSpanPm * 0.56, 200, 420);
  return { cxPm, cyPm, radiusPm };
}

// 마크 자르기 셈 — 고른 그림에서 정사각을 골라(끌기·확대) 256 × 256으로 줄이는 계산. 순수 함수(시험: editor/nations/nationModel.test.ts).
// 시작 국가 설정 편집기(/dev/nations)와 플레이어 세력 정체성 정하기(/faction/identity)가 같이 쓴다. 개발 도구 폴더 밖에 둔다: 플레이어 화면
// 조각이 개발 도구 소스를 끌어오지 않게(scripts/pwa-build.mjs DEV_ONLY_SOURCE). docs/adr/2026-11-10-nation-editor.md 4절,
// docs/adr/2026-11-11-faction-identity.md 2절.
import { NATION_EMBLEM_UPLOAD } from "@terra/shared/nationEditor";

/** 자르기 상태: 확대(1 = 짧은 변 전체), 자를 정사각의 가운데(원본 px) */
export interface CropState {
  readonly zoom: number;
  readonly cx: number;
  readonly cy: number;
}

export const CROP_ZOOM = { min: 1, max: 8, step: 0.1 } as const;

/** 처음 상태: 가운데, 짧은 변 전체 */
export const initialCrop = (width: number, height: number): CropState => ({
  zoom: 1,
  cx: width / 2,
  cy: height / 2,
});

/** 자를 정사각(원본 px): 한 변 = 짧은 변 ÷ 확대. 그림 밖으로 나가지 않게 가운데를 자른다 */
export function cropRect(
  width: number,
  height: number,
  state: CropState,
): { sx: number; sy: number; size: number } {
  const zoom = Math.max(CROP_ZOOM.min, Math.min(CROP_ZOOM.max, state.zoom));
  const size = Math.max(1, Math.min(width, height) / zoom);
  const half = size / 2;
  const cx = Math.max(half, Math.min(width - half, state.cx));
  const cy = Math.max(half, Math.min(height - half, state.cy));
  return { sx: cx - half, sy: cy - half, size };
}

/** 가운데·확대를 범위 안으로 맞춘 상태 */
export function clampCrop(width: number, height: number, state: CropState): CropState {
  const zoom = Math.max(CROP_ZOOM.min, Math.min(CROP_ZOOM.max, state.zoom));
  const rect = cropRect(width, height, { ...state, zoom });
  return { zoom, cx: rect.sx + rect.size / 2, cy: rect.sy + rect.size / 2 };
}

/** 보기 칸(한 변 view px)에서 dx·dy px 끌었을 때: 그림이 손가락을 따라가게 가운데를 반대로 옮긴다 */
export function dragCrop(
  width: number,
  height: number,
  state: CropState,
  dx: number,
  dy: number,
  view: number,
): CropState {
  const { size } = cropRect(width, height, state);
  const scale = size / Math.max(1, view);
  return clampCrop(width, height, { ...state, cx: state.cx - dx * scale, cy: state.cy - dy * scale });
}

/** 확대를 바꾼다(가운데는 그대로, 범위 안으로) */
export const zoomCrop = (width: number, height: number, state: CropState, zoom: number): CropState =>
  clampCrop(width, height, { ...state, zoom });

/**
 * RGBA 화소의 색 단계를 줄인다(채널마다 levels 단계 — PNG가 잘 줄게). 올릴 그림이 바이트 상한을 넘을 때만 쓴다. 알파는 그대로
 */
export function posterize(data: Uint8ClampedArray, levels: number): void {
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.round((data[i + c] ?? 0) / step) * step);
}

/** 색 단계를 줄여 보는 차례(처음은 그대로) */
export const POSTERIZE_STEPS = [0, 64, 32, 16, 8] as const;

export const EMBLEM_SIZE = NATION_EMBLEM_UPLOAD.size;
export const EMBLEM_MAX_BYTES = NATION_EMBLEM_UPLOAD.maxBytes;

// [시험용] 지도 픽셀 비율 상한 바꾸기 — 주소에 ?pixel-ratio=<1~4>를 붙이면 1차맵·2차맵 엔진에 상한(maxPixelRatio)으로 넘긴다.
// 새 빌드 없이 휴대폰에서 2·2.5·3·3.5를 잰다(ADR 2026-10-28-s1-second-map "2차맵 선명도"). 실제 값은 min(기기 픽셀 비율, 상한)이고
// HUD에 보인다. 숫자가 아니거나 범위 밖이면 무시한다(엔진 기본 상한).

export const PIXEL_RATIO_PARAM = "pixel-ratio";
export const MIN_PIXEL_RATIO_OVERRIDE = 1;
export const MAX_PIXEL_RATIO_OVERRIDE = 4;

/** 주소 검색 문자열(location.search)에서 상한을 읽는다. 없거나 틀리면 undefined */
export function pixelRatioOverride(search: string): number | undefined {
  const raw = new URLSearchParams(search).get(PIXEL_RATIO_PARAM);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_PIXEL_RATIO_OVERRIDE || value > MAX_PIXEL_RATIO_OVERRIDE) {
    return undefined;
  }
  return value;
}

/** 엔진 옵션에 펼쳐 넣는다(값이 없으면 넣지 않는다 — exactOptionalPropertyTypes) */
export function pixelRatioOption(search: string): { maxPixelRatio?: number } {
  const value = pixelRatioOverride(search);
  return value === undefined ? {} : { maxPixelRatio: value };
}

/** HUD 표시용 픽셀 비율(소수 둘째 자리까지, 끝의 0은 뺀다: 2, 1.5, 2.63) */
export function formatPixelRatio(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// 1차맵 낮밤 음영 값과 그 식의 JS판 — ADR 2026-10-29-primary-map-sky 4절(시제품 3판 출발값, 휴대폰에서 다듬는다).
// - 셰이더(planetMaterials.ts의 dayNightLight·nightFinish)의 uniform 값은 여기서 온다. 값을 한곳에 둔다.
// - shadeColor는 셰이더와 같은 식의 JS판이다. 밤 바닥 시험(인접 바이옴 대비가 밤에도 낮의 80% 이상)이 이 식으로 본다.
//   셰이더 식을 바꾸면 이 함수도 함께 바꾼다(skyShade.test.ts가 밤 바닥을 지킨다).
// - 색 관리를 끈 렌더러라(sharedRenderer.ts) sRGB 값에 그대로 곱한다.
import { DAY_NIGHT_BAND } from "./sky.ts";

export type Rgb = readonly [number, number, number];

export const DAY_NIGHT_SHADE = {
  /** 밤 빛 곱(라벤더 색 곱과 곱한다). 흰 땅 휘도 약 32%, 눈으로 느끼는 밝기(L*) 약 63% */
  nightLight: 0.7,
  nightTint: [0.72, 0.76, 1.0] as Rgb,
  /** 밤에 어두운 색을 조금 들어 올리는 더하기 색(라벤더) */
  nightLift: [0.02, 0.02, 0.05] as Rgb,
  /** 깊은 밤의 채도 빼기(밤 정도의 제곱으로 준다) */
  nightDesaturate: 0.06,
  /** 박명(해 뜨기 전·진 뒤 어스름): 따뜻한 파스텔 색 곱, 띠 가운데에서의 양 */
  twilightTint: [1.0, 0.9, 0.86] as Rgb,
  twilightAmount: 0.5,
  /** 낮 밝기와 램버트 비중: 낮 빛 = dayLight × (1 − dayLambert × (1 − √max(sunCos, 0))) */
  dayLight: 0.94,
  dayLambert: 0.18,
  /** 기복 이득(카메라 빛 경사): 지금 카메라 빛 셰이더의 0.62와 같아 항성이 머리 위면 기복이 지금과 같다 */
  reliefGain: 0.62,
} as const;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function smoothstep(low: number, high: number, x: number): number {
  const u = clamp01((x - low) / (high - low));
  return u * u * (3 - 2 * u);
}

/** 낮 정도(0 밤 ~ 1 낮) = smoothstep(띠 아래, 띠 위, 항성 고도 sin) */
export function dayAmount(sunCos: number): number {
  return smoothstep(DAY_NIGHT_BAND.low, DAY_NIGHT_BAND.high, sunCos);
}

/**
 * 셰이더와 같은 식으로 지형색 하나를 칠한다(JS판). sunCos = 매끈한 구 위쪽 · 항성 방향, strength = 낮밤 세기(0 ~ 1),
 * relief = 기복(카메라 빛 경사, 평지 0). 셰이더 순서: 빛 곱 → 기복 → 깊은 밤 채도 빼기 → 들어 올리기 → [0, 1]로 자르기.
 */
export function shadeColor(base: Rgb, sunCos: number, strength: number, relief = 0): Rgb {
  const s = DAY_NIGHT_SHADE;
  const day = dayAmount(sunCos);
  const dayLight = s.dayLight * (1 - s.dayLambert * (1 - Math.sqrt(clamp01(sunCos))));
  const twilight = s.twilightAmount * 4 * day * (1 - day);
  const light = s.nightTint.map((tint, i) => {
    const raw = tint * s.nightLight + (dayLight - tint * s.nightLight) * day;
    const warmed = raw * (1 + ((s.twilightTint[i] ?? 1) - 1) * twilight);
    return s.dayLight + (warmed - s.dayLight) * strength;
  });
  const reliefFactor = 1 + (s.reliefGain * relief) / s.dayLight;
  const lit = base.map((value, i) => value * (light[i] ?? 0) * reliefFactor);
  const night = (1 - day) * strength;
  const luminance = 0.299 * (lit[0] ?? 0) + 0.587 * (lit[1] ?? 0) + 0.114 * (lit[2] ?? 0);
  const desaturate = s.nightDesaturate * (1 - day) * night;
  const out = lit.map((value, i) =>
    clamp01(value + (luminance - value) * desaturate + (s.nightLift[i] ?? 0) * night),
  );
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

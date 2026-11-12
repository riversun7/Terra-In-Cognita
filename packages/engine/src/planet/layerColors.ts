// 1차맵 자료 레이어(고도·자원 분포·영토) 색 — 셰이더와 화면 범례가 같은 값을 쓴다(값을 두 곳에 적지 않는다).
// 세계 색은 화면 테마와 상관없다(D-070). 범례는 이 값으로 그라데이션을 만든다(화면 CSS에 직접 쓴 색이 아니다 — 자료 색).
// 사용자 요청(2026-11-12, 원문) "1차맵 레이아웃선택에 지형,기후만 있는데. 고도, 자원별 분포, 세력영토 레이아웃도 추가해달라."
import { CATCHMENT_MATERIALS, type CatchmentMaterial } from "@terra/shared/catchment";

/** 색 띠 한 점: at = 0 ~ 1 자리, color = 0xRRGGBB */
export interface RampStop {
  readonly at: number;
  readonly color: number;
}

/**
 * 땅 고도 색 띠(가장 높은 땅에 대한 몫 0 ~ 1): 낮은 풀빛 → 노란 들 → 갈색 언덕 → 회색 바위 → 흰 눈.
 * 몫을 쓰는 까닭: 행성마다 가장 높은 땅이 달라도(목록 정보 maxElevationM) 띠 전체를 쓴다. 범례가 m 값을 함께 적는다.
 */
export const ELEVATION_LAND_RAMP: readonly RampStop[] = [
  { at: 0, color: 0x7fbf7a },
  { at: 0.08, color: 0xb5d68a },
  { at: 0.2, color: 0xe8dd92 },
  { at: 0.4, color: 0xd9a86c },
  { at: 0.62, color: 0xa8785a },
  { at: 0.82, color: 0x9a9298 },
  { at: 1, color: 0xf4f4f6 },
];

/** 바다 수심 색 띠(수심 ÷ 바다 눈금 깊이, 0 ~ 1): 얕은 하늘색 → 깊은 남색 */
export const ELEVATION_SEA_RAMP: readonly RampStop[] = [
  { at: 0, color: 0xa6dcef },
  { at: 0.35, color: 0x6fb0dc },
  { at: 1, color: 0x2f5f9e },
];

/** 바다 눈금 깊이 = 가장 높은 땅 × 이 값(이보다 깊으면 가장 진한 색). 지구 바다 평균 수심 ÷ 에베레스트 ≈ 0.42에서 [임시] */
export const ELEVATION_SEA_SCALE = 0.5;

/** 고도 레이어 호수 색(바다와 다른 청록) */
export const ELEVATION_LAKE_COLOR = 0x5cc8bf;

/** 자원·영토 레이어 바탕(흐린 땅·물) — 덧칠한 색이 잘 보이게 */
export const MUTED_LAND_COLOR = 0xe6e1d6;
export const MUTED_WATER_COLOR = 0xcbd9e2;

/** 원자재 색(자원 분포 레이어) — 몫이 클수록 진하게 덧칠한다 */
export const RESOURCE_COLORS: Readonly<Record<CatchmentMaterial, number>> = {
  ore: 0xc8643a,
  wood: 0x2f8f4e,
  herb: 0x2fae96,
  crop: 0xd9a514,
  livestock: 0xa86b3c,
  fish: 0x2f74c8,
};

/** 높은 티어 광석이 나오는 칸(산지, highOrePm) 덧칠 색 */
export const RESOURCE_HIGH_COLOR = 0x6e3aa0;

/** 몫 0보다 큰 칸의 덧칠 세기: 가장 옅게(몫 → 0) ~ 가장 진하게(몫 1000‰) */
export const RESOURCE_MIX_MIN = 0.22;
export const RESOURCE_MIX_MAX = 0.92;

/** 원자재 차례(서버 자원 분포 지도 머리의 원자재 번호 = 이 차례) */
export const RESOURCE_MATERIALS: readonly CatchmentMaterial[] = CATCHMENT_MATERIALS;

/** 0xRRGGBB → CSS 색(범례 그라데이션) */
export function cssColor(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** 두 색을 t(0 ~ 1)로 섞는다(셰이더 mix와 같은 직선 섞기, 채널마다 반올림) */
export function mixColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    out |= Math.round(x + (y - x) * k) << shift;
  }
  return out;
}

/** 색 띠의 자리 t 색(셰이더 rampColor와 같은 직선 섞기). 띠 밖은 끝 색 */
export function rampColor(ramp: readonly RampStop[], t: number): number {
  const first = ramp[0];
  if (!first) return 0;
  let color = first.color;
  for (let k = 1; k < ramp.length; k++) {
    const from = ramp[k - 1];
    const to = ramp[k];
    if (!from || !to) continue;
    const span = to.at - from.at;
    const local = span <= 0 ? (t >= to.at ? 1 : 0) : (t - from.at) / span;
    color = mixColor(color, to.color, local);
  }
  return color;
}

/** 범례 그라데이션(CSS linear-gradient 값, 왼쪽 → 오른쪽) */
export function rampGradient(ramp: readonly RampStop[]): string {
  const stops = ramp.map((stop) => `${cssColor(stop.color)} ${(stop.at * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** 자원 레이어 범례 띠: 바탕(몫 0) → 가장 옅은 덧칠 → 가장 진한 덧칠 */
export function resourceRamp(material: CatchmentMaterial): RampStop[] {
  const color = RESOURCE_COLORS[material];
  return [
    { at: 0, color: MUTED_LAND_COLOR },
    { at: 0.001, color: mixColor(MUTED_LAND_COLOR, color, RESOURCE_MIX_MIN) },
    { at: 1, color: mixColor(MUTED_LAND_COLOR, color, RESOURCE_MIX_MAX) },
  ];
}

/** 0xRRGGBB → GLSL vec3(색 관리를 끈 렌더러라 적은 값이 그대로 보인다) */
export function glslVec3(hex: number): string {
  const channel = (shift: number) => (((hex >> shift) & 0xff) / 255).toFixed(4);
  return `vec3(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** 색 띠 → GLSL 함수(이름 name, 입력 0 ~ 1, 마디 사이 직선 섞기 — rampColor와 같은 식) */
export function glslRamp(name: string, ramp: readonly RampStop[]): string {
  const first = ramp[0];
  if (!first) throw new RangeError("color ramp needs at least one stop");
  const lines = [`vec3 ${name}(float t) {`, `  vec3 c = ${glslVec3(first.color)};`];
  for (let k = 1; k < ramp.length; k++) {
    const from = ramp[k - 1];
    const to = ramp[k];
    if (!from || !to) continue;
    const span = Math.max(1e-6, to.at - from.at);
    lines.push(
      `  c = mix(c, ${glslVec3(to.color)}, clamp((t - ${from.at.toFixed(4)}) / ${span.toFixed(4)}, 0.0, 1.0));`,
    );
  }
  lines.push("  return c;", "}");
  return lines.join("\n");
}

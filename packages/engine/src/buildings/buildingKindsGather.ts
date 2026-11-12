// 1차 생산 채집소 전용 모델 — 약초원·목장·낚시터(사용자 지적 2026-11-12 "창고나 광산등 채집소도 제대로 구분되게 꾸미고").
// 그 전에는 약초원·목장이 농장 모델, 낚시터가 벌목장 모델을 색만 바꿔 썼다(docs/adr/2026-11-11-production-six.md "건물 그림 후속").
// 순수 코드(three를 쓰지 않는다). 좌표·조각 규칙은 buildingParts.ts, 종류 표는 buildingKinds.ts KIND_MODELS가 이 함수들을 가리킨다.
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 약초원: 이끼 지붕 오두막 + 앞쪽 돋운 화단 줄(잎·꽃 둥근 덤불) + 말리는 시렁(매단 다발) */
export function herb(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3 + ctx.extraH,
    roofH: 2.2,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofMoss),
    style: "hip",
    ridge: ctx.ridge,
  });
  // 돋운 화단: 나무 틀 상자 + 덤불(잎과 꽃 번갈아). 레벨 2부터 한 줄 더
  const beds = level >= 2 ? 3 : 2;
  const bedW = W - MARGIN_M * 2 - 0.6;
  const z0 = D * 0.08;
  const pitch = Math.max(1.6, (D / 2 - MARGIN_M - z0) / beds);
  for (let b = 0; b < beds; b++) {
    const z = z0 + pitch * (b + 0.5);
    list.add("box", 0, FLOOR_M, z, bedW, 0.45, pitch * 0.62, C.plank);
    const bushes = Math.max(3, Math.floor(bedW / 1.4));
    for (let i = 0; i < bushes; i++) {
      const x = -bedW / 2 + (bedW / bushes) * (i + 0.5);
      const bloom = (i + b + Math.floor(random() * 2)) % 3 === 0;
      const size = 0.8 + random() * 0.3;
      list.add("dome", x, FLOOR_M + 0.45, z, size, size * 0.7, size, bloom ? C.herbBloom : C.herbLeaf);
    }
  }
  // 말리는 시렁: 기둥 둘 + 가로대 + 매단 다발(눕히지 않은 원뿔)
  const rx = W * 0.3;
  const rz = -D * 0.2;
  const span = Math.min(3.4, W * 0.3);
  for (const px of [-span / 2, span / 2]) list.add("box", rx + px, FLOOR_M, rz, 0.22, 2.4, 0.22, C.log);
  list.add("box", rx, FLOOR_M + 2.3, rz, span + 0.3, 0.16, 0.16, C.log);
  for (let i = 0; i < 4; i++)
    list.add("cone", rx - span / 2 + (span / 4) * (i + 0.5), FLOOR_M + 1.5, rz, 0.4, 0.8, 0.4, C.herbDry);
}

/** 목장: 붉은 헛간 + 울타리 친 풀밭(가축 몇 마리) + 물통 + 건초 묶음 */
export function ranch(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 4 + ctx.extraH,
    roofH: 2.8,
    wall: ctx.wall(C.wallBarn),
    roof: ctx.roof(C.roofSlate),
    style: "gable-z",
    doorW: Math.min(2.6, m.w * 0.42),
    doorH: 2.8,
    ridge: ctx.ridge,
  });
  // 울타리: 앞쪽 풀밭 둘레 말뚝 + 가로 널 두 줄(흰 울타리 — 멀리서도 목장으로 읽힌다)
  const fx0 = -W / 2 + MARGIN_M + 0.2;
  const fx1 = W / 2 - MARGIN_M - 0.2;
  const fz0 = D * 0.02;
  const fz1 = D / 2 - MARGIN_M - 0.2;
  const postGap = 1.8;
  const posts = (a: number, b: number, fixed: number, alongX: boolean): void => {
    const count = Math.max(2, Math.round((b - a) / postGap) + 1);
    for (let i = 0; i < count; i++) {
      const t = a + ((b - a) * i) / (count - 1);
      if (alongX) list.add("box", t, FLOOR_M, fixed, 0.2, 1.3, 0.2, C.fence);
      else list.add("box", fixed, FLOOR_M, t, 0.2, 1.3, 0.2, C.fence);
    }
    for (const h of [0.5, 1.05]) {
      if (alongX) list.add("box", (a + b) / 2, FLOOR_M + h, fixed, b - a, 0.12, 0.1, C.fence);
      else list.add("box", fixed, FLOOR_M + h, (a + b) / 2, 0.1, 0.12, b - a, C.fence);
    }
  };
  posts(fx0, fx1, fz1, true);
  posts(fz0, fz1, fx0, false);
  posts(fz0, fz1, fx1, false);
  // 가축: 몸통(상자) + 머리(작은 상자) + 다리 넷. 털 색은 씨앗으로, 레벨 2면 한 마리 더
  const herd = level >= 2 ? 4 : 3;
  for (let i = 0; i < herd; i++) {
    const ax = fx0 + 1.4 + ((fx1 - fx0 - 2.8) * (i + 0.5)) / herd;
    const az = fz0 + 1.2 + random() * Math.max(0.2, fz1 - fz0 - 2.6);
    const hide = random() < 0.5 ? C.hideLight : C.hideDark;
    const turn = (random() - 0.5) * 1.2;
    for (const lx of [-0.45, 0.45])
      for (const lz of [-0.22, 0.22])
        list.add("box", ax + lx, FLOOR_M, az + lz, 0.16, 0.55, 0.16, C.hideDark);
    list.add("box", ax, FLOOR_M + 0.55, az, 1.3, 0.7, 0.7, hide, { turn });
    list.add("box", ax + 0.75, FLOOR_M + 0.9, az, 0.45, 0.45, 0.42, hide, { turn });
  }
  // 물통(나무 틀 + 물) + 건초 묶음(눕힌 원기둥)
  list.add("box", W * 0.3, FLOOR_M, -D * 0.12, 2.2, 0.6, 0.8, C.plank);
  list.add("box", W * 0.3, FLOOR_M + 0.45, -D * 0.12, 1.9, 0.12, 0.55, C.water);
  for (let i = 0; i < (level >= 2 ? 3 : 2); i++)
    list.add("cylinder", -W * 0.36, FLOOR_M, -D * 0.3 + i * 1.4, 1.1, 1.1, 1.1, C.roofThatch, {
      lay: true,
    });
}

/** 낚시터: 물가 오두막(청록 지붕) + 앞쪽 널판 부두(기둥) + 뒤집힌 배 한 척 + 그물 말리는 틀 + 통 */
export function fishing(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3 + ctx.extraH,
    roofH: 2,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofTeal),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 부두: 앞쪽 끝까지 이어진 널판 길 + 기둥(물가 쪽이 앞이라 생각한다)
  const dockW = Math.min(2.4, W * 0.22);
  const dz0 = m.z + m.d / 2;
  const dz1 = D / 2 - MARGIN_M;
  const dx = m.x;
  list.add("box", dx, FLOOR_M + 0.5, (dz0 + dz1) / 2, dockW, 0.18, dz1 - dz0, C.plank);
  for (let z = dz0 + 0.6; z < dz1; z += 1.8)
    for (const px of [-dockW / 2 + 0.15, dockW / 2 - 0.15])
      list.add("cylinder", dx + px, FLOOR_M, z, 0.22, 0.7, 0.22, C.log);
  // 뒤집힌 배(길쭉한 반구 + 용골)
  const bx = W * 0.3;
  const bz = D * 0.24;
  list.add("dome", bx, FLOOR_M, bz, 1.4, 0.7, 3.6, C.hull, { turn: 0.25 });
  list.add("box", bx, FLOOR_M + 0.62, bz, 0.12, 0.14, 3.3, C.trim, { turn: 0.25 });
  // 그물 틀(기둥 둘 + 늘어진 그물 판)
  const nx = -W * 0.3;
  const nz = D * 0.22;
  for (const pz of [-1.2, 1.2]) list.add("box", nx, FLOOR_M, nz + pz, 0.2, 2.2, 0.2, C.log);
  list.add("box", nx, FLOOR_M + 0.8, nz, 0.08, 1.3, 2.3, C.net);
  // 통·상자(레벨 2면 하나 더)
  list.barrel(-W * 0.36, -D * 0.3);
  if (level >= 2) list.crates(W * 0.34, -D * 0.32, 2, random, 0.9);
}

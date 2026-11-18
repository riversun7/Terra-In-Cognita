// 저장·물류 시설 모델 5종 — 야적장·창고·중앙창고·대규모 창고·물류센터(전체 개편 2026-11-19).
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 야적장: 팔레트 갑판 + 기둥 넷 + 천막 지붕 + 상자·통·원목 더미 */
export function stockpile(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 팔레트 바닥
  list.add("box", m.x, FLOOR_M, m.z, m.w + 0.3, 0.22, m.d + 0.3, C.plank);
  // 기둥 넷 + 천막 지붕(wall/roof 반영)
  const postH = 2.7 + ctx.extraH * 0.4;
  for (const px of [-m.w / 2 + 0.22, m.w / 2 - 0.22])
    for (const pz of [-m.d / 2 + 0.22, m.d / 2 - 0.22])
      list.add("box", m.x + px, FLOOR_M + 0.22, m.z + pz, 0.26, postH, 0.26, ctx.wall(C.log));
  list.add(
    "gable",
    m.x,
    FLOOR_M + 0.22 + postH,
    m.z,
    m.w + 0.45,
    1.25,
    m.d + 0.45,
    ctx.ridge ?? ctx.roof(C.sail),
  );
  list.crates(m.x, m.z, 3 + level, random, 0.92);
  list.barrel(-W * 0.34, D * 0.34);
  list.barrel(-W * 0.34 + 0.9, D * 0.34);
  list.logPile(W * 0.2, D * 0.34, Math.min(3, W * 0.38), 2);
}

/** 창고: 튼튼한 나무 창고 + 들보 호이스트 + 앞 경사로 + 상자·통 */
export function storehouse(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wallH = 4.4 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.9,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofBrown),
    style: "gable-z",
    doorW: Math.min(3.2, m.w * 0.38),
    doorH: 3.3,
    ridge: ctx.ridge,
  });
  // 박공 끝 들보 호이스트
  list.add("box", m.x, FLOOR_M + wallH + 1.3, m.z + m.d / 2 + 0.55, 0.35, 0.35, 1.3, C.trim);
  list.add("cylinder", m.x, FLOOR_M + wallH + 0.7, m.z + m.d / 2 + 1.0, 0.1, 0.65, 0.1, C.metal);
  // 하역 경사로
  list.add("box", m.x, FLOOR_M, m.z + m.d / 2 + 0.55, Math.min(3.8, m.w * 0.5), 0.28, 1.1, C.plank);
  list.crates(-W * 0.3, D * 0.36, 3 + Math.min(2, level - 1), random, 1.0);
  list.barrel(W * 0.32, D * 0.36);
}

/** 중앙창고: 석조 물류 홀 + 채광창 지붕 + 이중 큰 문 + 하역대 + 지브 크레인 */
export function warehouse(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wallH = 5.5 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.6,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorX: -m.w * 0.22,
    doorW: 3.2,
    doorH: 3.9,
    ridge: ctx.ridge,
  });
  // 지붕 채광창
  list.add("box", m.x, FLOOR_M + wallH + 1.4, m.z, m.w * 0.58, 0.85, m.d * 0.28, C.metalDark);
  list.add("glow", m.x, FLOOR_M + wallH + 1.5, m.z + m.d * 0.145, m.w * 0.48, 0.45, 0.1, list.windowColor);
  // 둘째 큰 문 + 앞 하역대
  list.add("box", m.x + m.w * 0.22, FLOOR_M, m.z + m.d / 2, 3.2, 3.9, 0.22, C.trim);
  list.add("box", m.x, FLOOR_M, m.z + m.d / 2 + 1.0, m.w * 0.86, 0.9, 2.0, C.plank);
  list.crane(W * 0.38, FLOOR_M, D * 0.12, 4.6 + level * 0.3, 2.8, Math.PI * 0.85, C.ironRed);
  list.crates(W * 0.26, D * 0.38, 4, random, 1.1);
  list.crates(-W * 0.3, D * 0.38, 3, random, 1.1);
}

/** 대규모 창고(5×5): 쌍둥이 대형 홀 + 중앙 연결 통로 + 감시 탑 + 삼중 하역 도크 + 사무동 */
export function grand_warehouse(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wall = ctx.wall(C.wallStone);
  const roof = ctx.roof(C.roofSlate);
  const wallH = 6.2 + ctx.extraH;
  const hallW = Math.min(W * 0.38, m.w * 0.46);
  const hallD = m.d;
  const gap = Math.max(1.8, W * 0.08);
  for (const side of [-1, 1]) {
    const hx = side * (hallW / 2 + gap / 2);
    list.house({
      x: hx,
      z: m.z,
      w: hallW,
      d: hallD,
      wallH,
      roofH: 2.5,
      wall,
      roof,
      style: "gable-z",
      doorW: Math.min(3.2, hallW * 0.42),
      doorH: 4.0,
      ridge: ctx.ridge,
    });
    list.add("box", hx, FLOOR_M + wallH + 1.4, m.z, hallW * 0.44, 0.8, hallD * 0.52, C.metalDark);
  }
  // 중앙 연결 홀(사무·분류동)
  list.house({
    x: 0,
    z: m.z,
    w: gap + 0.8,
    d: hallD * 0.65,
    wallH: 4.4 + ctx.extraH * 0.6,
    roofH: 1.6,
    wall: C.wallCream,
    roof: C.roofTerracotta,
    style: "gable-x",
    doorW: 1.8,
  });
  // 감시·관리 탑(뒤 모서리)
  const tx = W * 0.38;
  const tz = -D * 0.34;
  list.add("box", tx, FLOOR_M, tz, 2.8, 8.2 + level * 0.6, 2.8, wall);
  list.add("glow", tx, FLOOR_M + 7.2 + level * 0.6, tz + 1.42, 1.4, 0.7, 0.14, list.windowColor);
  list.add("pyramid", tx, FLOOR_M + 8.2 + level * 0.6, tz, 3.2, 2.0, 3.2, roof);
  // 앞 전체 하역 도크 + 크레인 + 화물 더미
  list.add("box", 0, FLOOR_M, m.z + hallD / 2 + 1.2, hallW * 2 + gap, 0.9, 2.4, C.plank);
  list.crane(-W * 0.38, FLOOR_M, D * 0.25, 5.2, 3.2, 0.35, C.ironRed);
  list.crates(W * 0.3, D * 0.38, 5, random, 1.15);
  list.crates(-W * 0.28, D * 0.38, 4, random, 1.15);
  list.crates(0, D * 0.36, 3, random, 1.05);
}

/** 물류센터: 포장 마당 + 대형 분류 캐노피 + 배차 관제실 + 화물 수레 + 상자 팔레트 */
export function logistics(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 아스팔트·석재 포장 마당
  list.add("box", 0, FLOOR_M, 0, W - MARGIN_M * 1.4, 0.14, D - MARGIN_M * 1.4, C.padDark);
  // 배차 사무동(뒤 한쪽)
  list.house({
    ...m,
    wallH: 3.6 + ctx.extraH,
    roofH: 0.4,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofTeal),
    style: "flat",
    doorW: 1.8,
  });
  // 개방형 철골 분류 캐노피(앞·오른쪽 마당)
  const cx = W * 0.1;
  const cz = D * 0.16;
  const cw = Math.min(W * 0.68, W - MARGIN_M * 2.4);
  const cd = Math.min(D * 0.42, D * 0.46);
  const postH = 3.2;
  for (const px of [-cw / 2 + 0.25, cw / 2 - 0.25])
    for (const pz of [-cd / 2 + 0.25, cd / 2 - 0.25])
      list.add("box", cx + px, FLOOR_M + 0.14, cz + pz, 0.28, postH, 0.28, C.metalDark);
  list.add("box", cx, FLOOR_M + 0.14 + postH, cz, cw + 0.4, 0.24, cd + 0.4, ctx.roof(C.roofTeal));
  list.add("box", cx, FLOOR_M + 0.38 + postH, cz, cw * 0.9, 0.22, cd * 0.75, ctx.ridge ?? C.roofSlate);
  // 화물 수레 둘(앞 마당)
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
    const vx = -W * 0.22 + i * 3.2;
    const vz = D * 0.22;
    list.add("box", vx, FLOOR_M + 0.45, vz, 2.2, 0.24, 1.3, C.plank);
    list.add("box", vx, FLOOR_M + 0.69, vz, 1.7, 0.95, 1.0, C.crate);
    for (const wx of [-0.75, 0.75])
      for (const wz of [-0.68, 0.68])
        list.add("cylinder", vx + wx, FLOOR_M + 0.14, vz + wz, 0.14, 0.55, 0.55, C.metalDark, { lay: true });
  }
  list.crates(W * 0.24, D * 0.2, 4, random, 0.95);
  list.lantern(-W * 0.38, FLOOR_M + 0.14, D * 0.36, 2.8);
}

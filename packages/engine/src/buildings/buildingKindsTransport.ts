// 교통·항만 시설 모델 3종 — 정박장·조선소·교역 부두(전체 개편 2026-11-19).
// 물가 쪽이 앞(+z)이다(낚시터와 같은 약속).
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 정박장: 널판 갑판 + 둘레 말뚝 + 선착장 관리소 + 밧줄 기둥 + 등불 + 돛단배 */
export function dock(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const w = W - MARGIN_M * 2;
  const d = D - MARGIN_M * 2;
  // 널판 갑판 + 테두리
  list.add("box", 0, FLOOR_M + 0.35, 0, w, 0.2, d, C.plank);
  list.add("box", 0, FLOOR_M + 0.5, -d / 2 + 0.12, w, 0.12, 0.24, C.trim);
  for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3 + 1e-6; x += Math.max(1.2, w / 6))
    for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) list.add("cylinder", x, FLOOR_M, z, 0.3, 1.1, 0.3, C.log);
  // 선착장 관리소
  list.house({
    ...m,
    baseY: FLOOR_M + 0.55,
    wallH: 2.7 + ctx.extraH,
    roofH: 1.6,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofTeal),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 밧줄 기둥 + 부두 등불
  for (const x of [-w * 0.32, w * 0.32])
    list.add("cylinder", x, FLOOR_M + 0.55, d / 2 - 0.7, 0.34, 0.8, 0.34, C.trim);
  list.lantern(-w * 0.36, FLOOR_M + 0.55, d / 2 - 0.9, 2.3);
  // 돛을 올린 작은 배(앞 물가 쪽)
  const bz = d / 2 - 1.05;
  const bx = w * 0.12;
  list.add("dome", bx, FLOOR_M + 0.3, bz, 3.6, 0.65, 1.5, C.hull);
  list.add("box", bx, FLOOR_M + 0.9, bz, 3.2, 0.12, 0.14, C.trim);
  list.add("cylinder", bx, FLOOR_M + 0.9, bz, 0.14, 3.4, 0.14, C.log);
  list.add("box", bx + 0.65, FLOOR_M + 1.65, bz, 1.25, 2.2, 0.08, C.sail);
  list.barrel(-w * 0.36, -d * 0.1);
  if (level >= 2) list.crates(w * 0.32, -d * 0.12, 2, random, 0.9);
}

/** 조선소: 선대 경사로 + 대형 철제 갠트리 크레인 + 건조 중인 선체 뼈대 + 조선 공방 */
export function shipyard(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const w = W - MARGIN_M * 1.8;
  const d = D - MARGIN_M * 1.8;
  // 선대 바닥(어두운 석재) + 앞 물길
  list.add("box", 0, FLOOR_M, 0, w, 0.25, d, C.padDark);
  list.add("box", W * 0.14, FLOOR_M + 0.14, d * 0.24, w * 0.54, 0.14, d * 0.48, C.water);
  // 조선 공방(왼쪽 뒤)
  list.house({
    ...m,
    baseY: FLOOR_M + 0.25,
    wallH: 3.4 + ctx.extraH,
    roofH: 2.0,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofSlate),
    style: "gable-z",
    doorW: Math.min(2.6, m.w * 0.45),
    ridge: ctx.ridge,
  });
  // 대형 철제 갠트리 크레인(건조 선대 위를 가로지름)
  const gx = W * 0.14;
  const gz = D * 0.06;
  const gw = Math.min(w * 0.54, 9.6);
  const gd = Math.min(d * 0.68, 12.2);
  const gantryH = 7.6 + ctx.extraH * 0.6 + level * 0.5;
  for (const px of [-gw / 2 + 0.3, gw / 2 - 0.3]) {
    for (const pz of [-gd / 2 + 0.6, gd / 2 - 0.6]) {
      list.add("box", gx + px, FLOOR_M + 0.25, gz + pz, 0.42, gantryH, 0.42, C.ironRed);
    }
    list.add("box", gx + px, FLOOR_M + 0.25 + gantryH, gz, 0.44, 0.45, gd, C.ironRed);
  }
  // 상단 횡단 보 + 호이스트 트롤리
  list.add("box", gx, FLOOR_M + 0.25 + gantryH + 0.35, gz - gd * 0.12, gw + 0.6, 0.55, 0.65, C.metalDark);
  list.add("cylinder", gx, FLOOR_M + 0.25 + gantryH - 2.1, gz - gd * 0.12, 0.12, 2.2, 0.12, C.metal);
  // 건조 중인 선체(용골 + 선체 갈비대 5쌍)
  const hullLen = gd * 0.72;
  list.add("box", gx, FLOOR_M + 0.45, gz + 0.3, 0.55, 0.4, hullLen, C.trim);
  list.add("dome", gx, FLOOR_M + 0.65, gz + 0.3, 3.2, 1.35, hullLen, C.hull);
  for (let i = -2; i <= 2; i++) {
    list.add("box", gx, FLOOR_M + 1.15, gz + 0.3 + i * (hullLen * 0.18), 3.3, 1.35, 0.24, C.plank);
  }
  // 목재 적재
  list.logPile(-W * 0.28, D * 0.32, Math.min(4.2, W * 0.26), 2, Math.PI / 2);
  if (level >= 2) list.crates(-W * 0.3, D * 0.12, 3, random, 0.95);
}

/** 교역 부두: 석조·널판 부두 + 세관 정자 + 회전 크레인 + 교역 화물 + 상선 선미 */
export function trade_dock(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const w = W - MARGIN_M * 2;
  const d = D - MARGIN_M * 2;
  // 부두 갑판(석조 기단 + 앞쪽 널판)
  list.add("box", 0, FLOOR_M, -d * 0.18, w, 0.6, d * 0.6, C.padStone);
  list.add("box", 0, FLOOR_M + 0.42, d * 0.24, w, 0.22, d * 0.46, C.plank);
  // 세관·교역 관리실
  list.house({
    ...m,
    baseY: FLOOR_M + 0.6,
    wallH: 3.1 + ctx.extraH,
    roofH: 2.0,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofTeal),
    style: "hip",
    doorW: Math.min(2.2, m.w * 0.4),
    ridge: ctx.ridge,
  });
  // 회전 지브 크레인(상선 하역용)
  list.crane(w * 0.28, FLOOR_M + 0.64, d * 0.12, 4.8 + level * 0.4, 3.2, -0.55, C.copper);
  // 상선(부두 앞쪽)
  const bx = -w * 0.08;
  const bz = d / 2 - 0.95;
  list.add("dome", bx, FLOOR_M + 0.3, bz, 4.8, 0.85, 1.85, C.hull);
  list.add("box", bx - 1.1, FLOOR_M + 1.1, bz, 1.6, 0.75, 1.2, C.crate);
  list.add("cylinder", bx + 0.9, FLOOR_M + 1.1, bz, 0.16, 3.8, 0.16, C.log);
  list.add("box", bx + 1.5, FLOOR_M + 2.0, bz, 1.1, 2.1, 0.08, C.sail);
  // 교역 상자 더미
  list.crates(-w * 0.32, d * 0.08, 4, random, 0.95);
  list.barrel(w * 0.32, -d * 0.22);
  list.lantern(w * 0.36, FLOOR_M + 0.64, d * 0.36, 2.3);
}

// 상업·거래소 시설 모델 4종 — 물자 거래소·외환 거래소·유닛 거래소·증권 거래소(전체 개편 2026-11-19).
// HTS급 거래소 컨셉에 맞춰 시세 전광판(glow)·아케이드 회랑·금빛 돔·원형 로툰다 등으로 각각 뚜렷하게 구분한다.
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M } from "./buildingParts.ts";

/** 물자 거래소: 아케이드 회랑 본동 + 유리 아트리움 지붕 + 시세 전광판 + 견본 화물 마당 */
export function goods_exchange(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wallH = 5.0 + ctx.extraH;
  list.add("box", m.x, FLOOR_M, m.z, m.w + 1.2, 0.36, m.d + 1.6, C.cobble);
  list.house({
    ...m,
    baseY: FLOOR_M + 0.36,
    wallH,
    roofH: 2.4,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofTerracotta),
    style: "hip",
    doorW: Math.min(2.6, m.w * 0.28),
    doorH: 3.1,
  });
  // 유리 아트리움 채광 지붕
  list.add("box", m.x, FLOOR_M + 0.36 + wallH + 1.2, m.z, m.w * 0.56, 1.0, m.d * 0.42, C.glassDome);
  // 앞 아케이드 기둥 + 시세 전광판(glow)
  const az = m.z + m.d / 2 + 0.85;
  const aw = m.w * 0.84;
  for (let i = 0; i < 5; i++) {
    const px = m.x - aw / 2 + (aw * i) / 4;
    list.add("cylinder", px, FLOOR_M + 0.36, az, 0.44, 3.3, 0.44, C.marble);
  }
  list.add("box", m.x, FLOOR_M + 3.66, az - 0.35, aw + 0.5, 0.45, 1.1, C.padStone);
  list.add("glow", m.x, FLOOR_M + 3.74, az + 0.22, aw * 0.86, 0.3, 0.08, list.windowColor);
  list.steps(m.x, az + 0.65, aw * 0.48, 0.9, 2, 0.36, C.marble, 1);
  // 앞쪽 견본 화물 전시(상자·통)
  list.crates(-W * 0.3, D * 0.34, 3 + Math.min(2, level), random, 0.95);
  list.barrel(W * 0.32, D * 0.34);
  list.lantern(W * 0.36, FLOOR_M, D * 0.2, 2.6);
}

/** 외환 거래소: 석조 금고 은행 본부 + 열주 현관 + 금빛 돔 + 24시 환율 전광판 */
export function fx_exchange(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 5.0 + ctx.extraH;
  list.add("box", m.x, FLOOR_M, m.z, m.w + 1.0, 0.42, m.d + 1.4, C.marble);
  const top = list.house({
    ...m,
    baseY: FLOOR_M + 0.42,
    wallH,
    roofH: 0.45,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofSlate),
    style: "flat",
    doorW: Math.min(2.2, m.w * 0.28),
    doorH: 3.0,
    ridge: null,
  });
  // 정면 대리석 기둥 + 환율 전광판 띠
  const pz = m.z + m.d / 2 + 0.8;
  const pw = m.w * 0.72;
  for (let i = 0; i < 4; i++) {
    const cx = m.x - pw / 2 + (pw * i) / 3;
    list.add("cylinder", cx, FLOOR_M + 0.42, pz, 0.5, wallH - 0.5, 0.5, C.marble);
  }
  list.add("box", m.x, FLOOR_M + 0.42 + wallH - 0.5, pz - 0.35, pw + 0.8, 0.55, 1.3, C.padStone);
  list.add("glow", m.x, FLOOR_M + 0.42 + wallH - 0.38, pz + 0.32, pw * 0.88, 0.34, 0.08, list.windowColor);
  list.steps(m.x, pz + 0.55, pw * 0.65, 1.0, 2, 0.42, C.marble, 1);
  // 옥상 금고 돔 + 금빛 끝
  const domeW = Math.min(m.w, m.d) * 0.54;
  list.add("cylinder", m.x, top, m.z, domeW * 1.08, 0.9, domeW * 1.08, C.padStone);
  list.add("dome", m.x, top + 0.9, m.z, domeW, domeW * 0.58 + level * 0.15, domeW, C.gold);
  list.lantern(-W * 0.35, FLOOR_M, D * 0.34, 2.5);
  list.lantern(W * 0.35, FLOOR_M, D * 0.34, 2.5);
}

/** 유닛 거래소: 용병·사이보그 길드 홀 + 지휘 발코니 + 연병장 마당 + 무기 거치대·훈련 표적 */
export function unit_exchange(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wallH = 4.6 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.3,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorW: Math.min(2.4, m.w * 0.32),
    doorH: 2.9,
    ridge: ctx.ridge,
  });
  // 2층 지휘 발코니(앞면 돌출) + 깃발 띠
  list.add("box", m.x, FLOOR_M + 2.8, m.z + m.d / 2 + 0.55, m.w * 0.65, 0.25, 1.1, C.trim);
  list.add("box", m.x, FLOOR_M + 3.05, m.z + m.d / 2 + 1.05, m.w * 0.65, 0.6, 0.14, C.metalDark);
  list.add("box", m.x, FLOOR_M + 3.05, m.z + m.d / 2 + 1.14, m.w * 0.52, 0.42, 0.08, ctx.ridge ?? C.ironRed);
  // 연병장 포장 바닥(앞쪽) + 훈련 표적·보급 상자
  list.add("box", 0, FLOOR_M, D * 0.28, W * 0.72, 0.12, D * 0.32, C.cobble);
  const tx = W * 0.28;
  const tz = D * 0.3;
  list.add("cylinder", tx, FLOOR_M + 0.12, tz, 0.24, 1.65, 0.24, C.log);
  list.add("cylinder", tx, FLOOR_M + 1.25, tz, 0.22, 1.0, 1.0, C.wallBarn, { lay: true, turn: Math.PI / 2 });
  list.crates(-W * 0.28, D * 0.32, 2 + Math.min(2, level - 1), random, 0.9);
  list.lantern(W * 0.36, FLOOR_M, D * 0.18, 2.5);
}

/** 증권 거래소: 8각 원형 로툰다 본당 + 둘레 열주 + 시세 전광 띠 + 청록 돔·금빛 첨탑 */
export function stock_exchange(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const dia = Math.min(m.w, m.d) * 0.92;
  const wallH = 5.0 + ctx.extraH;
  const wall = ctx.wall(C.wallWhite);
  const roof = ctx.roof(C.roofTeal);
  // 2단 원형 기단 + 앞 계단
  list.add("cylinder", m.x, FLOOR_M, m.z, dia * 1.24, 0.48, dia * 1.24, C.marble);
  list.steps(m.x, m.z + dia * 0.62, dia * 0.48, 1.15, 2, 0.48, C.marble, 1);
  // 원형(8각) 로툰다 몸체 + 둘레 기둥 8개
  list.add("cylinder", m.x, FLOOR_M + 0.48, m.z, dia * 0.86, wallH, dia * 0.86, wall);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
    const r = dia * 0.54;
    list.add(
      "cylinder",
      m.x + Math.cos(a) * r,
      FLOOR_M + 0.48,
      m.z + Math.sin(a) * r,
      0.42,
      wallH,
      0.42,
      C.marble,
    );
  }
  // 앞면 큰 문 + 상단 360° 시세 전광 띠(glow)
  list.add("box", m.x, FLOOR_M + 0.48, m.z + dia * 0.43, Math.min(2.0, dia * 0.26), 2.8, 0.22, C.trim);
  list.add("cylinder", m.x, FLOOR_M + 0.48 + wallH - 0.72, m.z, dia * 0.92, 0.44, dia * 0.92, C.metalDark);
  list.add(
    "glow",
    m.x,
    FLOOR_M + 0.48 + wallH - 0.66,
    m.z + dia * 0.47,
    dia * 0.34,
    0.32,
    0.1,
    list.windowColor,
  );
  list.add(
    "glow",
    m.x,
    FLOOR_M + 0.48 + wallH - 0.66,
    m.z - dia * 0.47,
    dia * 0.34,
    0.32,
    0.1,
    list.windowColor,
  );
  // 처마 판 + 돔 지붕 + 금빛 첨탑
  const roofY = FLOOR_M + 0.48 + wallH;
  list.add("cylinder", m.x, roofY, m.z, dia * 1.18, 0.42, dia * 1.18, C.marble);
  list.add("dome", m.x, roofY + 0.42, m.z, dia * 0.92, 2.8 + level * 0.25, dia * 0.92, roof);
  list.add("cone", m.x, roofY + 3.2 + level * 0.25, m.z, 0.6, 1.4, 0.6, C.gold);
  if (W >= 15) {
    list.lantern(-W * 0.36, FLOOR_M, D * 0.34, 2.6);
    list.lantern(W * 0.36, FLOOR_M, D * 0.34, 2.6);
  }
}

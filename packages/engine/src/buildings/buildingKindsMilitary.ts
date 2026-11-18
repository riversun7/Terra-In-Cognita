// 군사·방어·영토 시설 모델 2종 — 영토 비콘·성벽(전체 개편 2026-11-19).
// 영토 비콘에는 국가 시그니처 컬러·4면 깃발 문양 배너·국기 게양대가 함께 들어간다.
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 영토 비콘: 돌 기단 + 경계 표지석 + 목조 보강 8각 탑신 + 국가 문양 배너·국기 + 발광 랜턴 + 신호 첨탑 */
export function beacon(ctx: KindContext): void {
  const { list, W, D, level } = ctx;
  const span = Math.min(W, D);
  const scaleH = Math.min(1.25, Math.max(0.84, span / 17.58));
  const baseW = Math.min(7.2, span * 0.44);

  // 네 귀 경계 표지석(영토 경계 기둥 — 국가 시그니처 컬러가 있으면 꼭대기에 입힌다)
  const bx = Math.min(6.4, W * 0.34, W / 2 - MARGIN_M - 0.8);
  const bz = Math.min(6.4, D * 0.34, D / 2 - MARGIN_M - 0.8);
  for (const sx of [-bx, bx]) {
    for (const sz of [-bz, bz]) {
      list.add("box", sx, FLOOR_M, sz, 1.05, 0.5, 1.05, C.padStone);
      list.add("box", sx, FLOOR_M + 0.5, sz, 0.5, 1.25, 0.5, C.log);
      list.add("pyramid", sx, FLOOR_M + 1.75, sz, 0.66, 0.42, 0.66, ctx.ridge ?? C.metalDark);
      if (level >= 2) list.add("glow", sx, FLOOR_M + 2.17, sz, 0.24, 0.34, 0.24, list.windowColor);
    }
  }

  // 2단 돌 기단 + 앞쪽(+z) 계단·디딤돌 길
  list.add("box", 0, FLOOR_M, 0, baseW, 0.65, baseW, C.padStone);
  list.add("box", 0, FLOOR_M, baseW / 2 + 0.55, baseW * 0.48, 0.32, 1.1, C.padStone);
  list.add("box", 0, FLOOR_M + 0.32, baseW / 2 + 0.26, baseW * 0.4, 0.33, 0.52, C.padStone);
  const walkLen = Math.max(0.8, D / 2 - MARGIN_M - (baseW / 2 + 1.15));
  list.add("box", 0, FLOOR_M, baseW / 2 + 1.1 + walkLen / 2, baseW * 0.28, 0.1, walkLen, C.padStone);

  const tier2W = baseW * 0.72;
  list.add("box", 0, FLOOR_M + 0.65, 0, tier2W, 0.75, tier2W, ctx.wall(C.wallStone));
  for (const sx of [-tier2W * 0.46, tier2W * 0.46]) {
    for (const sz of [-tier2W * 0.46, tier2W * 0.46]) {
      list.add("box", sx, FLOOR_M + 0.65, sz, 0.58, 1.15, 0.58, C.log);
    }
  }

  // 아래 탑신: 8각 돌 몸체 + 네 귀 소나무 기둥 + 허리 띠 + 앞 점검 문
  const baseY = FLOOR_M + 1.4;
  const shaftW = baseW * 0.45;
  const shaftH1 = (2.6 + ctx.extraH * 0.45) * scaleH;
  list.add("cylinder", 0, baseY, 0, shaftW, shaftH1, shaftW, ctx.wall(C.wallStone));
  for (const sx of [-shaftW * 0.41, shaftW * 0.41]) {
    for (const sz of [-shaftW * 0.41, shaftW * 0.41]) {
      list.add("box", sx, baseY - 0.1, sz, 0.44, shaftH1 + 0.35, 0.44, C.log);
    }
  }
  list.add("cylinder", 0, baseY + shaftH1 - 0.15, 0, shaftW * 1.1, 0.32, shaftW * 1.1, C.trim);
  const doorH = Math.min(1.45, shaftH1 * 0.62);
  list.add("box", 0, baseY, shaftW * 0.47, Math.min(1.05, shaftW * 0.34), doorH, 0.24, C.trim);
  list.add("box", 0, baseY + doorH, shaftW * 0.48, Math.min(1.25, shaftW * 0.4), 0.18, 0.26, C.metalDark);

  // 위 탑신: 좁아진 돌 몸체 + 시그니처 컬러 띠 + 4면 국가 깃발 문양 배너
  const upperY = baseY + shaftH1;
  const shaftH2 = (2.2 + ctx.extraH * 0.45) * scaleH;
  const upperW = shaftW * 0.78;
  list.add("cylinder", 0, upperY, 0, upperW, shaftH2, upperW, ctx.wall(C.wallStone));
  list.add(
    "cylinder",
    0,
    upperY + shaftH2 - 0.48,
    0,
    upperW * 1.12,
    0.36,
    upperW * 1.12,
    ctx.ridge ?? C.metalDark,
  );
  if (ctx.ridge) {
    const bw = Math.min(1.35, upperW * 0.56);
    const bh = Math.min(1.65, shaftH2 * 0.78);
    const r = upperW * 0.52;
    const by = upperY + shaftH2 * 0.12;
    list.banner(0, by, r, bw, bh, 0, ctx.ridge);
    list.banner(0, by, -r, bw, bh, Math.PI, ctx.ridge);
    list.banner(r, by, 0, bw, bh, Math.PI / 2, ctx.ridge);
    list.banner(-r, by, 0, bw, bh, -Math.PI / 2, ctx.ridge);
    // 비콘 앞 왼쪽 전용 국기 게양대
    list.flag(-W / 2 + MARGIN_M + 0.35, D / 2 - MARGIN_M - 0.35, 7.2 + level * 0.7, ctx.ridge, {
      width: 2.1,
      height: 1.35,
    });
  }

  // 발광 갤러리: 내민 받침대 + 난간 기둥 + 4기둥 철제 랜턴실 + 8각 발광 결정
  const deckY = upperY + shaftH2;
  const deckW = shaftW * 1.16;
  list.add("cylinder", 0, deckY, 0, deckW * 0.88, 0.26, deckW * 0.88, C.padStone);
  list.add("cylinder", 0, deckY + 0.26, 0, deckW, 0.28, deckW, C.padStone);
  list.add("box", 0, deckY + 0.54, 0, deckW * 0.84, 0.18, deckW * 0.84, C.metalDark);
  for (const sx of [-deckW * 0.36, deckW * 0.36]) {
    for (const sz of [-deckW * 0.36, deckW * 0.36]) {
      list.add("box", sx, deckY + 0.54, sz, 0.24, 0.6, 0.24, C.trim);
    }
  }
  list.add("cylinder", 0, deckY + 0.72, 0, deckW * 0.48, 0.22, deckW * 0.48, C.metalDark);

  const lanternY = deckY + 0.94;
  const lanternH = 2.2 * scaleH;
  const strutOffset = deckW * 0.25;
  for (const sx of [-strutOffset, strutOffset]) {
    for (const sz of [-strutOffset, strutOffset]) {
      list.add("box", sx, lanternY, sz, 0.22, lanternH, 0.22, C.metalDark);
    }
  }
  const coreW = deckW * 0.32;
  list.add("glow", 0, lanternY + 0.08, 0, coreW, lanternH - 0.16, coreW, list.windowColor);
  list.add("glow", 0, lanternY + 0.12, 0, coreW, lanternH - 0.24, coreW, list.windowColor, {
    turn: Math.PI / 4,
  });

  // 지붕 + 신호 첨탑(사각 처마 판으로 사각뿔 지붕 네 모서리를 맞춘다)
  const roofY = lanternY + lanternH;
  const roofH = 2.0 * scaleH;
  list.add("box", 0, roofY, 0, deckW * 0.94, 0.22, deckW * 0.94, C.metalDark);
  list.add("pyramid", 0, roofY + 0.22, 0, deckW * 0.9, roofH, deckW * 0.9, ctx.roof(C.roofSlate));

  const spireY = roofY + 0.22 + roofH;
  const mastH = 1.45 * scaleH;
  list.add("cylinder", 0, spireY, 0, 0.48, 0.32, 0.48, C.metal);
  list.add("cylinder", 0, spireY + 0.32, 0, 0.18, mastH, 0.18, C.metal);
  list.add("cone", 0, spireY + 0.32 + mastH, 0, 0.46, 0.85 * scaleH, 0.46, C.gold);
}

/** 성벽(4×1 등 긴 방어벽): 돌 성벽 + 성가퀴 흉벽 + 방어 보루 망루 + 나무 통로 + 경비 횃불 */
export function wall(ctx: KindContext): void {
  const { list, W, D, level } = ctx;
  const alongX = W >= D;
  const len = (alongX ? W : D) - MARGIN_M * 1.4;
  const thick = Math.min(alongX ? D : W, 3.6) * 0.72;
  const wallH = 4.2 + ctx.extraH;
  const stone = ctx.wall(C.wallStone);
  const cap = ctx.roof(C.roofSlate);

  const addSpan = (
    u: number,
    y: number,
    v: number,
    su: number,
    sy: number,
    sv: number,
    color: (typeof C)[keyof typeof C] | readonly [number, number, number],
    shape: "box" | "pyramid" | "glow" = "box",
  ): void => {
    if (alongX) list.add(shape, u, y, v, su, sy, sv, color);
    else list.add(shape, v, y, u, sv, sy, su, color);
  };

  // 성벽 몸체 + 상단 목조 보행로
  addSpan(0, FLOOR_M, 0, len, wallH, thick, stone);
  addSpan(0, FLOOR_M + wallH, 0, len - 0.3, 0.22, thick * 0.82, C.plank);
  // 바깥·안쪽 부벽 기둥(4개)
  const buttressCount = Math.max(2, Math.floor(len / 5));
  for (let i = 0; i < buttressCount; i++) {
    const u = -len * 0.42 + (len * 0.84 * i) / Math.max(1, buttressCount - 1);
    addSpan(u, FLOOR_M, thick * 0.48, 0.75, wallH * 0.85, 0.45, C.padStone);
  }
  // 성가퀴(앞뒤 양쪽 흉벽 치형 돌출)
  const merlonCount = Math.max(3, Math.floor(len / 2.3));
  for (let i = 0; i < merlonCount; i++) {
    const u = -len * 0.46 + (len * 0.92 * i) / Math.max(1, merlonCount - 1);
    for (const side of [-1, 1]) {
      const v = side * (thick / 2 - 0.22);
      addSpan(u, FLOOR_M + wallH, v, 1.1, 0.85, 0.44, C.padStone);
      addSpan(u, FLOOR_M + wallH + 0.85, v, 1.22, 0.2, 0.52, cap);
    }
  }
  // 중앙 방어 보루 망루 + 초소 지붕 + 횃불
  const towerW = Math.min(len * 0.28, thick * 1.28);
  const towerH = wallH + 1.8 + level * 0.3;
  addSpan(0, FLOOR_M, 0, towerW, towerH, thick * 1.14, stone);
  addSpan(0, FLOOR_M + towerH, 0, towerW + 0.4, 1.35, thick * 1.14 + 0.4, cap, "pyramid");
  addSpan(0, FLOOR_M + wallH + 0.4, thick * 0.6, 0.5, 0.55, 0.2, list.windowColor, "glow");
  if (ctx.ridge) {
    addSpan(0, FLOOR_M + wallH - 0.5, thick * 0.59, towerW * 0.72, 0.45, 0.14, ctx.ridge);
  }
}

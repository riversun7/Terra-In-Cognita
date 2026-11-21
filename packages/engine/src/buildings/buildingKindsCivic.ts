// 공공·행정·주거 시설 모델 6종 — 신전·연구소·행정 건물·병원·숙소·일반 집(전체 개편 2026-11-19).
// 행정 건물(government)에는 국가 시그니처 컬러·깃발 문양 배너·정면 문장판·국기 게양대가 함께 들어간다.
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 신전: 돌 성소 마당 + 계단 + 열주 본당 + 성화대 + 높은 첨탑·금 끝 + 조경 나무 */
export function temple(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wall = ctx.wall(C.wallStone);
  const roof = ctx.roof(C.roofTeal);
  const wallH = 5.2 + ctx.extraH;
  // 성소 기단
  list.add("box", m.x, FLOOR_M, m.z, m.w + 1.4, 0.5, m.d + 1.4, C.marble);
  list.house({
    ...m,
    baseY: FLOOR_M + 0.5,
    wallH,
    roofH: 3.1,
    wall,
    roof,
    style: "gable-z",
    doorH: 3.1,
    ridge: ctx.ridge,
  });
  // 앞 다단 계단
  list.steps(m.x, m.z + m.d / 2 + 1.25, m.w * 0.62, 1.5, 3, 0.5, C.marble, 1);
  // 앞 열주 네 개
  for (let i = 0; i < 4; i++) {
    const cx = m.x - m.w * 0.36 + (m.w * 0.72 * i) / 3;
    list.add("cylinder", cx, FLOOR_M + 0.5, m.z + m.d / 2 + 0.45, 0.42, wallH * 0.85, 0.42, C.marble);
  }
  // 뒤쪽 첨탑 + 성화 창문 + 금 끝
  const tz = m.z - m.d / 2 + 1.6;
  const towerH = 9.4 + level + ctx.extraH;
  list.add("box", m.x, FLOOR_M + 0.5, tz, 3.1, towerH, 3.1, wall);
  list.add("glow", m.x, FLOOR_M + 0.5 + towerH - 2.4, tz + 1.56, 0.9, 1.5, 0.14, list.windowColor);
  list.add("pyramid", m.x, FLOOR_M + 0.5 + towerH, tz, 3.6, 6.2, 3.6, roof);
  list.add("cone", m.x, FLOOR_M + 6.7 + towerH, tz, 0.55, 1.5, 0.55, C.gold);
  // 앞 양쪽 성화대(불빛)
  for (const side of [-1, 1]) {
    const bx = m.x + side * (m.w * 0.42);
    const bz = m.z + m.d / 2 + 1.6;
    list.add("box", bx, FLOOR_M, bz, 0.75, 1.25, 0.75, C.padStone);
    list.add("glow", bx, FLOOR_M + 1.25, bz, 0.42, 0.45, 0.42, list.windowColor);
  }
  // 레벨 2부터 앞 양쪽 작은 탑
  if (level >= 2) {
    for (const side of [-1, 1]) {
      const sx = m.x + side * (m.w / 2 + 0.95);
      list.add("box", sx, FLOOR_M + 0.5, m.z + m.d * 0.28, 1.6, 6.2, 1.6, wall);
      list.add("pyramid", sx, FLOOR_M + 6.7, m.z + m.d * 0.28, 1.9, 2.7, 1.9, roof);
    }
  }
  if (W >= 15) {
    list.tree(-W * 0.38, -D * 0.32, 1.0);
    list.tree(W * 0.38, -D * 0.32, 1.0);
  }
}

/** 생명과학 연구소: 백색 클린룸 + 중앙 유리 배양 돔 + 생체 배양 탱크 + 통신 안테나 + 온실 */
export function lab(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 4.1 + ctx.extraH;
  // 연구소 기단
  list.add("box", 0, FLOOR_M, 0, W - MARGIN_M * 1.6, 0.18, D - MARGIN_M * 1.6, C.padDark);
  const top = list.house({
    ...m,
    baseY: FLOOR_M + 0.18,
    wallH,
    roofH: 0,
    wall: ctx.wall(C.wallLab),
    roof: ctx.roof(C.wallWhite),
    style: "flat",
    ridge: null,
  });
  // 청록·바이오 시안 띠 + 정면 유리 출입 캐노피
  list.add("box", m.x, FLOOR_M + 0.18 + wallH - 0.85, m.z, m.w + 0.14, 0.38, m.d + 0.14, C.bioCyan);
  list.add(
    "box",
    m.x,
    FLOOR_M + 2.6,
    m.z + m.d / 2 + 0.55,
    Math.min(3.0, m.w * 0.45),
    0.16,
    1.1,
    C.glassDome,
  );
  // 중앙 대형 유리 배양 돔 + 내부 발광 코어
  const dome = Math.min(m.w, m.d) * 0.56;
  list.add("cylinder", m.x - m.w * 0.1, top, m.z, dome * 1.04, 0.32, dome * 1.04, C.metalDark);
  list.add("dome", m.x - m.w * 0.1, top + 0.32, m.z, dome, dome * 0.6, dome, C.glassDome);
  list.add("glow", m.x - m.w * 0.1, top + 0.35, m.z, dome * 0.28, dome * 0.32, dome * 0.28, list.windowColor);
  // 쌍둥이 생체 배양 탱크(옆쪽)
  const tx = m.x + m.w / 2 + 0.95;
  for (let i = 0; i < 2; i++) {
    const tz = m.z - m.d * 0.22 + i * 1.8;
    list.add("cylinder", tx, FLOOR_M + 0.18, tz, 1.15, 0.5, 1.15, C.metalDark);
    list.add("cylinder", tx, FLOOR_M + 0.68, tz, 0.95, 2.5, 0.95, C.glassDome);
    list.add("glow", tx, FLOOR_M + 1.1, tz, 0.42, 1.6, 0.42, list.windowColor);
    list.add("cylinder", tx, FLOOR_M + 3.18, tz, 1.1, 0.35, 1.1, C.metal);
  }
  // 옥상 통신 안테나 + 신호등
  const ax = m.x + m.w * 0.3;
  const az = m.z - m.d * 0.26;
  list.add("cylinder", ax, top, az, 0.16, 3.4, 0.16, C.metal);
  list.add("cone", ax, top + 3.4, az, 0.55, 0.65, 0.55, ctx.ridge ?? C.bioCyan);
  // 레벨 2부터 옆 온실 모듈
  if (level >= 2) {
    list.add("box", -W * 0.31, FLOOR_M + 0.18, D * 0.31, W * 0.28, 1.8, D * 0.22, C.glassDome);
  }
}

/** 행정 건물: 돌 광장 + 계단 + 대리석 열주 현관 + 국가 시그니처 컬러·깃발 문양 배너·국기 + 시계탑/금 돔 */
export function government(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 5.6 + ctx.extraH;
  const accent = ctx.ridge ?? C.roofTerracotta;
  // 대리석 기단 + 앞 계단
  list.add("box", m.x, FLOOR_M, m.z, m.w + 1.6, 0.5, m.d + 2.2, C.cobble);
  const top = list.house({
    ...m,
    baseY: FLOOR_M + 0.5,
    wallH,
    roofH: 3.3,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofTerracotta),
    style: "hip",
    doorW: Math.min(2.4, m.w * 0.24),
    doorH: 3.2,
  });
  // 지붕 시그니처 컬러 띠(처마 밑)
  if (ctx.ridge) {
    list.add("box", m.x, FLOOR_M + 0.5 + wallH - 0.35, m.z, m.w + 0.22, 0.28, m.d + 0.22, ctx.ridge);
  }
  // 앞 기둥 줄(대리석 원기둥) + 들보 + 삼각 박공
  const pz = m.z + m.d / 2 + 1.5;
  const pw = m.w * 0.74;
  const columns = Math.max(4, Math.min(6, Math.floor(pw / 2)));
  for (let i = 0; i < columns; i++) {
    const cx = m.x - pw / 2 + (pw * i) / (columns - 1);
    list.add("cylinder", cx, FLOOR_M + 0.8, pz, 0.68, wallH - 0.6, 0.68, C.marble);
  }
  list.add("box", m.x, FLOOR_M + 0.5 + wallH - 0.3, pz - 0.5, pw + 1.1, 0.62, 2.6, C.marble);
  list.add("gable", m.x, FLOOR_M + 0.8 + wallH + 0.02, pz - 0.5, 2.8, 1.9, pw + 1.3, ctx.wall(C.wallCream), {
    turn: Math.PI / 2,
  });
  // 정면 계단
  list.steps(m.x, pz + 0.75, pw + 1.4, 2.2, 3, 0.5, C.marble, 1);

  // 국가 시그니처 컬러·문양: 1) 정면 박공 중앙 문장 방패, 2) 현관 양옆 수직 국가 배너, 3) 앞 광장 대형 국기 게양대
  if (ctx.ridge) {
    list.banner(m.x, FLOOR_M + 0.8 + wallH + 0.2, pz + 0.94, 1.5, 1.5, 0, ctx.ridge, { rod: false });
    const bannerW = Math.min(1.15, m.w * 0.12);
    const bannerH = Math.min(3.0, wallH * 0.56);
    for (const side of [-1, 1]) {
      list.banner(
        m.x + side * (pw * 0.5 + 0.75),
        FLOOR_M + 1.5,
        m.z + m.d / 2 + 0.14,
        bannerW,
        bannerH,
        0,
        ctx.ridge,
      );
    }
  }
  // 대형 국기 게양대(국가 색 없으면 흰 깃발)
  list.flag(m.x + pw / 2 + 1.8, D / 2 - MARGIN_M - 0.55, 8.2 + level * 0.8, accent, {
    width: 2.3,
    height: 1.45,
  });

  // 광장 조경 나무 + 가로등
  if (W >= 15) {
    list.tree(-W * 0.38, D * 0.28, 0.95);
    list.tree(W * 0.38, -D * 0.32, 0.95);
    list.lantern(-pw / 2 - 1.4, FLOOR_M, pz + 1.1, 2.8);
    list.lantern(pw / 2 + 1.4, FLOOR_M, pz + 1.1, 2.8);
  }

  // 레벨 2: 시계탑, 레벨 3: 금 반구 돔
  if (level >= 2) {
    list.add("box", m.x, top - 1.5, m.z, 2.8, 4.4, 2.8, ctx.wall(C.wallCream));
    list.add("glow", m.x, top + 1.3, m.z + 1.42, 1.35, 1.35, 0.14, list.windowColor);
    list.add(
      level >= 3 ? "dome" : "pyramid",
      m.x,
      top + 2.9,
      m.z,
      3.2,
      level >= 3 ? 2.5 : 2.7,
      3.2,
      level >= 3 ? C.gold : ctx.roof(C.roofTerracotta),
    );
  }
}

/** 병원: 흰 2층 본동 + 구급 현관 차양 + 입면·옥상 붉은 십자 + 별관 + 구급등 */
export function hospital(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 6.0 + ctx.extraH;
  const top = list.house({
    ...m,
    wallH,
    roofH: 0,
    wall: ctx.wall(C.wallWhite),
    roof: ctx.roof(C.padStone),
    style: "flat",
    doorW: 2.5,
    ridge: null,
  });
  // 구급 차양 + 차양 기둥 + 응급등
  const cz = m.z + m.d / 2 + 1.1;
  list.add("box", m.x, FLOOR_M + 2.75, cz, 3.8, 0.22, 2.1, C.white);
  for (const px of [-1.6, 1.6]) list.add("cylinder", m.x + px, FLOOR_M, cz + 0.8, 0.2, 2.75, 0.2, C.metal);
  list.add("glow", m.x, FLOOR_M + 3.05, cz + 0.9, 0.75, 0.25, 0.25, list.windowColor);
  // 앞 벽 십자 + 옥상 헬리패드 원·십자
  const cy = FLOOR_M + wallH - 1.85;
  list.add("box", m.x, cy, m.z + m.d / 2 + 0.06, 0.55, 1.7, 0.2, C.crossRed);
  list.add("box", m.x, cy + 0.575, m.z + m.d / 2 + 0.06, 1.7, 0.55, 0.2, C.crossRed);
  list.add("cylinder", m.x, top, m.z, 4.4, 0.06, 4.4, C.padDark);
  list.add("box", m.x, top + 0.05, m.z, 1.1, 0.08, 3.4, C.crossRed);
  list.add("box", m.x, top + 0.05, m.z, 3.4, 0.08, 1.1, C.crossRed);
  list.tree(W * 0.36, -D * 0.3, 0.85);
  // 레벨 2부터 옆 병동 별관
  if (level >= 2) {
    list.house({
      x: -W * 0.31,
      z: D * 0.25,
      w: W * 0.27,
      d: D * 0.27,
      wallH: 3.5,
      roofH: 0,
      wall: ctx.wall(C.wallWhite),
      roof: ctx.roof(C.padStone),
      style: "flat",
      doorW: 0,
    });
  }
}

/** 숙소: 2층 연립 합숙소 + 앞 테라스·난간 + 굴뚝 + 마당 가로등·벤치 */
export function lodging(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 4.6 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.2,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofThatch),
    style: "gable-x",
    doorW: Math.min(1.8, m.w * 0.22),
    doorH: 2.4,
    ridge: ctx.ridge,
  });
  // 돌 굴뚝
  list.add("box", m.x - m.w * 0.32, FLOOR_M, m.z - m.d * 0.2, 0.75, wallH + 2.6, 0.75, C.wallBrick);
  // 앞쪽 목조 베란다(포치 지붕 + 기둥 + 계단)
  const pz = m.z + m.d / 2 + 0.7;
  const pw = m.w * 0.82;
  list.add("box", m.x, FLOOR_M, pz, pw, 0.28, 1.4, C.plank);
  list.add("box", m.x, FLOOR_M + 2.45, pz, pw + 0.2, 0.16, 1.45, C.roofBrown);
  for (let i = 0; i < 4; i++) {
    const px = m.x - pw / 2 + 0.25 + ((pw - 0.5) * i) / 3;
    list.add("box", px, FLOOR_M + 0.28, pz + 0.58, 0.18, 2.18, 0.18, C.trim);
  }
  // 마당 벤치·가로등·화분
  list.add("box", -W * 0.26, FLOOR_M, D * 0.35, 1.8, 0.45, 0.65, C.plank);
  list.lantern(W * 0.32, FLOOR_M, D * 0.34, 2.5);
  if (level >= 2) {
    list.add("box", W * 0.28, FLOOR_M, -D * 0.28, 1.6, 0.55, 1.1, C.crop);
  }
}

/** 일반 집(모르는 시설·시험용): 판이 크면 작은 민가 여러 채 */
export function house(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const roofs = [C.roofTerracotta, C.roofSlate, C.roofMoss, C.roofThatch];
  const pickRoof = (): (typeof roofs)[number] =>
    roofs[Math.floor(random() * roofs.length) % roofs.length] ?? C.roofTerracotta;
  const cols = W > 14 ? 2 : 1;
  const rows = D > 14 ? 2 : 1;
  const cw = (W - MARGIN_M * 2) / cols;
  const cd = (D - MARGIN_M * 2) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const single = cols * rows === 1;
      const hx = single ? m.x : -W / 2 + MARGIN_M + cw * (c + 0.5);
      const hz = single ? m.z : -D / 2 + MARGIN_M + cd * (r + 0.5);
      const hw = single ? m.w : cw * 0.72;
      const hd = single ? m.d : cd * 0.68;
      const wallH = 3.2 + ctx.extraH + random() * 0.5;
      list.house({
        x: hx,
        z: hz,
        w: hw,
        d: hd,
        wallH,
        roofH: 2.2,
        wall: ctx.wall(random() < 0.5 ? C.wallCream : C.wallWhite),
        roof: ctx.roof(pickRoof()),
        style: random() < 0.75 ? "gable-x" : "hip",
        ridge: ctx.ridge,
      });
      list.add("box", hx + hw * 0.25, FLOOR_M, hz - hd * 0.2, 0.55, wallH + 2.3, 0.55, C.wallBrick);
    }
  if (level >= 2) list.add("box", W * 0.32, FLOOR_M, D * 0.36, 1.2, 1, 0.9, C.plank);
}

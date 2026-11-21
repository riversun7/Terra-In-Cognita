// 1차 생산 채집소 모델 6종 — 농장·벌목장·광산·약초원·목장·낚시터(전체 개편 2026-11-19).
// 순수 코드(three를 쓰지 않는다). 좌표·도우미는 buildingParts.ts, 종류 표는 buildingKinds.ts KIND_MODELS가 가리킨다.
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";

/** 농장: 빨간 헛간 + 풍차 탑 + 사일로 + 이랑 밭 + 건초·물통 */
export function farm(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 4.4 + ctx.extraH,
    roofH: 3.1,
    wall: ctx.wall(C.wallBarn),
    roof: ctx.roof(C.roofBrown),
    style: "gable-z",
    doorW: Math.min(2.8, m.w * 0.42),
    doorH: 3.1,
    ridge: ctx.ridge,
  });
  // 사일로(원기둥 + 반구), 레벨 2부터 2기
  const siloD = Math.min(3.2, W * 0.14);
  const siloX = m.x + m.w / 2 + siloD * 0.75;
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
    const sx = siloX + i * (siloD + 0.35);
    const h = 6.8 + level * 0.6 - i * 1.1;
    list.add("cylinder", sx, FLOOR_M, m.z - m.d * 0.18, siloD, h, siloD, C.wallWhite);
    list.add("dome", sx, FLOOR_M + h, m.z - m.d * 0.18, siloD, siloD * 0.55, siloD, C.metal);
  }
  // 소형 풍차 탑(오른쪽 뒤)
  const wx = W * 0.34;
  const wz = -D * 0.3;
  list.add("pyramid", wx, FLOOR_M, wz, 2.2, 5.4, 2.2, C.wallWood);
  list.add("box", wx, FLOOR_M + 5.1, wz + 0.65, 0.55, 0.55, 0.7, C.trim);
  list.add("box", wx, FLOOR_M + 5.35, wz + 1.02, 3.6, 0.28, 0.12, C.sail, { turn: 0.35 });
  list.add("box", wx, FLOOR_M + 5.35, wz + 1.02, 0.28, 3.6, 0.12, C.sail, { turn: 0.35 });

  // 앞쪽 밭: 흙 이랑 + 작물 줄 + 관개 수로
  const z0 = D * 0.04;
  const z1 = D / 2 - MARGIN_M;
  const fieldW = W - MARGIN_M * 2;
  list.add("box", 0, FLOOR_M, (z0 + z1) / 2, fieldW, 0.2, z1 - z0, C.soil);
  list.add("box", -fieldW * 0.44, FLOOR_M + 0.12, (z0 + z1) / 2, 0.7, 0.14, z1 - z0 - 0.3, C.water);
  const pitch = 1.65;
  const ripe = random() < 0.5 ? 0 : 1;
  let row = 0;
  for (let z = z0 + pitch / 2; z < z1 - 0.3; z += pitch, row++) {
    const color = (row + ripe) % 2 === 0 ? C.crop : C.wheat;
    list.add("box", 0.45, FLOOR_M + 0.2, z, fieldW - 1.7, 0.55 + random() * 0.2, 0.78, color);
  }
  // 건초 더미(레벨 2면 셋)
  const bales = level >= 2 ? 3 : 2;
  for (let i = 0; i < bales; i++) {
    list.add("cylinder", -W * 0.38 + i * 1.4, FLOOR_M, -D * 0.02, 1.15, 1.2, 1.2, C.roofThatch, {
      lay: true,
      turn: Math.PI / 2,
    });
  }
}

/** 벌목장: 이끼 지붕 산장 + 톱 캐노피 + 통나무 수레 + 원목 더미 + 그루터기 */
export function lumber(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.4 + ctx.extraH,
    roofH: 2.3,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofMoss),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 돌 굴뚝
  list.add("box", m.x - m.w * 0.32, FLOOR_M, m.z - m.d * 0.28, 0.75, 5.2 + ctx.extraH, 0.75, C.wallStone);
  // 톱 캐노피: 기둥 넷 + 붉은 천막 지붕 + 작업대·원형 톱날
  const sx = W * 0.22;
  const sz = -D * 0.18;
  const sw = W * 0.4;
  const sd = D * 0.38;
  const postH = 3.2;
  for (const px of [-sw / 2 + 0.2, sw / 2 - 0.2])
    for (const pz of [-sd / 2 + 0.2, sd / 2 - 0.2])
      list.add("box", sx + px, FLOOR_M, sz + pz, 0.3, postH, 0.3, C.log);
  list.add("gable", sx, FLOOR_M + postH, sz, sw + 0.4, 1.4, sd + 0.4, C.roofBrown);
  list.add("box", sx, FLOOR_M, sz, sw * 0.62, 0.95, 0.95, C.plank);
  list.add("cylinder", sx, FLOOR_M + 0.55, sz, 0.12, 1.4, 1.4, C.metal, { lay: true });
  // 앞쪽 통나무 더미 + 원목 수레
  const piles = level >= 2 ? 3 : 2;
  const len = Math.min(4.4, W * 0.28);
  for (let i = 0; i < piles; i++) {
    const px = -W / 2 + MARGIN_M + len / 2 + i * (len + 0.75);
    list.logPile(px, D * 0.31, len, 3, (random() - 0.5) * 0.18);
  }
  // 수레(앞 오른쪽)
  const cx = W * 0.28;
  const cz = D * 0.14;
  list.add("box", cx, FLOOR_M + 0.42, cz, 2.2, 0.24, 1.25, C.plank);
  list.add("cylinder", cx, FLOOR_M + 0.68, cz - 0.24, 2.4, 0.46, 0.46, C.log, { lay: true });
  list.add("cylinder", cx, FLOOR_M + 0.68, cz + 0.24, 2.4, 0.46, 0.46, C.log, { lay: true });
  for (const wx of [-0.75, 0.75])
    for (const wz of [-0.68, 0.68])
      list.add("cylinder", cx + wx, FLOOR_M, cz + wz, 0.14, 0.65, 0.65, C.trim, { lay: true });
  // 그루터기
  list.add("cylinder", -W * 0.36, FLOOR_M, D * 0.08, 0.95, 0.55, 0.95, C.log);
  list.lantern(m.x + m.w / 2 + 0.55, FLOOR_M, m.z + m.d / 2, 2.4);
  if (level >= 2) list.tree(W * 0.36, -D * 0.38, 0.9);
}

/** 광산: 바위 절벽 + 목재 갱도 + 철골 권양탑 + 레일·광차 + 광석 더미 */
export function mine(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 계단식 바위 절벽
  list.add("pyramid", -W * 0.14, FLOOR_M, -D * 0.24, W * 0.58, 5.6 + level * 0.45, D * 0.44, C.rock, {
    turn: 0.14,
  });
  list.add("pyramid", W * 0.12, FLOOR_M, -D * 0.34, W * 0.38, 3.8, D * 0.28, C.rock, { turn: -0.28 });
  list.add("box", -W * 0.28, FLOOR_M, -D * 0.22, W * 0.2, 2.2, D * 0.28, C.rock);
  // 갱도 입구 + 입구 램프
  const ex = -W * 0.12;
  const ez = -D * 0.04;
  list.add("box", ex, FLOOR_M, ez, 2.4, 2.4, 1.0, C.shaft);
  list.add("box", ex - 1.35, FLOOR_M, ez + 0.32, 0.38, 2.75, 0.38, C.log);
  list.add("box", ex + 1.35, FLOOR_M, ez + 0.32, 0.38, 2.75, 0.38, C.log);
  list.add("box", ex, FLOOR_M + 2.65, ez + 0.32, 3.2, 0.42, 0.44, C.log);
  list.add("glow", ex, FLOOR_M + 2.15, ez + 0.55, 0.45, 0.32, 0.16, list.windowColor);
  // 권양탑(철골 + 지붕 + 도르래 바퀴)
  const towerH = 6.8 + level * 0.75 + ctx.extraH;
  const half = Math.min(m.w, m.d) * 0.32;
  for (const px of [-half, half])
    for (const pz of [-half, half])
      list.add("box", m.x + px, FLOOR_M, m.z + pz, 0.36, towerH, 0.36, C.metalDark);
  list.add("box", m.x, FLOOR_M + towerH * 0.48, m.z, half * 2 + 0.3, 0.26, half * 2 + 0.3, C.log);
  list.add("box", m.x, FLOOR_M + towerH * 0.82, m.z, half * 2 + 0.3, 0.22, half * 2 + 0.3, C.metalDark);
  list.add("gable", m.x, FLOOR_M + towerH, m.z, half * 2 + 0.7, 1.4, half * 2 + 0.7, ctx.roof(C.roofBrown));
  list.add("cylinder", m.x, FLOOR_M + towerH + 0.2, m.z, 0.3, 2.2, 2.2, C.metal, {
    lay: true,
    turn: Math.PI / 2,
  });
  // 레일 + 광차
  const railLen = D / 2 - MARGIN_M - ez;
  for (const off of [-0.55, 0.55])
    list.add("box", ex + off, FLOOR_M, ez + railLen / 2, 0.14, 0.12, railLen, C.metalDark);
  const cz = ez + railLen * 0.55;
  list.add("box", ex, FLOOR_M + 0.36, cz, 1.45, 0.8, 1.75, C.metalDark);
  list.add("pyramid", ex, FLOOR_M + 1.16, cz, 1.2, 0.55, 1.4, C.ore);
  for (const wx of [-0.72, 0.72])
    for (const wz of [-0.55, 0.55])
      list.add("cylinder", ex + wx, FLOOR_M, cz + wz, 0.14, 0.5, 0.5, C.metal, { lay: true });
  // 광석·석탄 더미
  list.add("pyramid", W * 0.28, FLOOR_M, D * 0.28, 2.6, 1.5, 2.4, C.ore, { turn: random() });
  list.add("pyramid", W * 0.08, FLOOR_M, D * 0.34, 2.2, 1.2, 2.0, C.coal, { turn: random() });
  if (level >= 2) list.add("pyramid", W * 0.34, FLOOR_M, D * 0.02, 2.0, 1.35, 2.0, C.ore, { turn: random() });
}

/** 약초원: 이끼 지붕 오두막 + 유리 온실 + 돋운 약초 화단 + 건조 시렁 */
export function herb(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.1 + ctx.extraH,
    roofH: 2.2,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofMoss),
    style: "hip",
    ridge: ctx.ridge,
  });
  // 유리 온실 모듈(뒤 오른쪽)
  const gx = W * 0.24;
  const gz = -D * 0.24;
  list.add("box", gx, FLOOR_M, gz, W * 0.32, 0.55, D * 0.28, C.wallStone);
  list.add("box", gx, FLOOR_M + 0.55, gz, W * 0.3, 1.4, D * 0.26, C.glassDome);
  list.add("gable", gx, FLOOR_M + 1.95, gz, W * 0.32, 1.0, D * 0.28, C.glassDome);
  // 돋운 화단: 나무 틀 + 잎·라벤더 덤불
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
      const size = 0.8 + random() * 0.28;
      list.add("dome", x, FLOOR_M + 0.45, z, size, size * 0.72, size, bloom ? C.herbBloom : C.herbLeaf);
    }
  }
  // 말리는 시렁(기둥 + 매단 약초 다발)
  const rx = -W * 0.32;
  const rz = -D * 0.02;
  const span = Math.min(3.2, W * 0.26);
  for (const px of [-span / 2, span / 2]) list.add("box", rx + px, FLOOR_M, rz, 0.22, 2.4, 0.22, C.log);
  list.add("box", rx, FLOOR_M + 2.3, rz, span + 0.3, 0.16, 0.16, C.log);
  for (let i = 0; i < 4; i++)
    list.add("cone", rx - span / 2 + (span / 4) * (i + 0.5), FLOOR_M + 1.45, rz, 0.38, 0.8, 0.38, C.herbDry);
}

/** 목장: 붉은 축사 + 급수탑 + 흰 울타리 목초지 + 가축 + 물통 + 건초 */
export function ranch(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 4.1 + ctx.extraH,
    roofH: 2.8,
    wall: ctx.wall(C.wallBarn),
    roof: ctx.roof(C.roofSlate),
    style: "gable-z",
    doorW: Math.min(2.6, m.w * 0.42),
    doorH: 2.8,
    ridge: ctx.ridge,
  });
  // 급수탑(기둥 넷 + 물탱크 + 원뿔 지붕)
  const tx = -W * 0.28;
  const tz = -D * 0.24;
  for (const lx of [-0.7, 0.7])
    for (const lz of [-0.7, 0.7]) list.add("box", tx + lx, FLOOR_M, tz + lz, 0.24, 3.6, 0.24, C.log);
  list.add("cylinder", tx, FLOOR_M + 3.6, tz, 2.2, 2.1, 2.2, C.wallWood);
  list.add("cone", tx, FLOOR_M + 5.7, tz, 2.5, 1.2, 2.5, C.roofBrown);
  // 울타리(앞쪽 목초지)
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
  // 가축
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
  // 물통 + 건초 묶음
  list.add("box", W * 0.3, FLOOR_M, -D * 0.08, 2.2, 0.6, 0.85, C.plank);
  list.add("box", W * 0.3, FLOOR_M + 0.45, -D * 0.08, 1.9, 0.12, 0.58, C.water);
  for (let i = 0; i < (level >= 2 ? 3 : 2); i++)
    list.add("cylinder", -W * 0.38, FLOOR_M, -D * 0.32 + i * 1.35, 1.1, 1.1, 1.1, C.roofThatch, {
      lay: true,
    });
}

/** 낚시터: 수상 오두막 + 목조 부두 + 돛단배·뒤집힌 배 + 그물 건조대 + 부두 등불 */
export function fishing(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.1 + ctx.extraH,
    roofH: 2.1,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofTeal),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 널판 부두 + 기둥
  const dockW = Math.min(2.6, W * 0.24);
  const dz0 = m.z + m.d / 2;
  const dz1 = D / 2 - MARGIN_M;
  const dx = m.x;
  list.add("box", dx, FLOOR_M + 0.5, (dz0 + dz1) / 2, dockW, 0.18, dz1 - dz0, C.plank);
  for (let z = dz0 + 0.6; z < dz1; z += 1.7)
    for (const px of [-dockW / 2 + 0.15, dockW / 2 - 0.15])
      list.add("cylinder", dx + px, FLOOR_M, z, 0.22, 0.7, 0.22, C.log);
  list.lantern(dx + dockW / 2 - 0.25, FLOOR_M + 0.68, dz1 - 0.45, 2.1);
  // 뒤집힌 배 + 돛대
  const bx = W * 0.3;
  const bz = D * 0.24;
  list.add("dome", bx, FLOOR_M, bz, 1.45, 0.72, 3.6, C.hull, { turn: 0.22 });
  list.add("box", bx, FLOOR_M + 0.64, bz, 0.12, 0.14, 3.3, C.trim, { turn: 0.22 });
  // 그물 말리는 틀
  const nx = -W * 0.3;
  const nz = D * 0.22;
  for (const pz of [-1.2, 1.2]) list.add("box", nx, FLOOR_M, nz + pz, 0.2, 2.2, 0.2, C.log);
  list.add("box", nx, FLOOR_M + 0.8, nz, 0.08, 1.3, 2.3, C.net);
  list.barrel(-W * 0.36, -D * 0.3);
  if (level >= 2) list.crates(W * 0.34, -D * 0.32, 2, random, 0.9);
}

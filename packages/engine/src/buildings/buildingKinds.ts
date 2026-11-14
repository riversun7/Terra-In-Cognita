// 시설 종류별 로우폴리 모델 몸체 — 순수 코드(three를 쓰지 않는다). buildingModels.ts가 종류마다 이 함수를 부른다(파일 크기를 나눈 것).
// ADR 2026-11-08-building-art의 종류 표가 이 파일이다. 좌표·조각 규칙은 buildingParts.ts.
import type { BuildingArtKind } from "./buildingLook.ts";
import { BUILDING_COLORS as C, FURNACE_GLOW, type Rgb } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M, type PartList } from "./buildingParts.ts";
import { fishing, herb, ranch } from "./buildingKindsGather.ts";
import { dock } from "./buildingKindsTransport.ts";

/** 본채 자리(로컬 m): 뼈대·폐허·비계가 이 자리를 쓴다 */
export interface Rect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

/** 종류 모델이 받는 것 */
export interface KindContext {
  readonly list: PartList;
  readonly W: number;
  readonly D: number;
  readonly level: number;
  /** 본채 벽 높이에 더할 층(레벨 3부터 한 층씩) */
  readonly extraH: number;
  readonly random: () => number;
  readonly ridge: Rgb | null;
  readonly main: Rect;
  /** 본채 벽 색: 겉모습 자료(팩 look.wall)가 있으면 그 색, 없으면 모델 기본 색(fallback) */
  readonly wall: (fallback: Rgb) => Rgb;
  /** 지붕 색: 겉모습 자료(팩 look.roof)가 있으면 그 색, 없으면 모델 기본 색 */
  readonly roof: (fallback: Rgb) => Rgb;
}

/** 종류마다 본채 자리(바닥 크기 비율) */
export function mainRectOf(kind: BuildingArtKind, W: number, D: number): Rect {
  const r = (x: number, z: number, w: number, d: number): Rect => ({
    x: x * W,
    z: z * D,
    w: w * W,
    d: d * D,
  });
  switch (kind) {
    case "farm":
      return r(-0.2, -0.22, 0.42, 0.4);
    case "lumber":
      return r(-0.26, -0.24, 0.36, 0.36);
    case "mine":
      return r(0.2, -0.14, 0.34, 0.34);
    case "herb":
      return r(-0.22, -0.26, 0.38, 0.34);
    case "ranch":
      return r(0.18, -0.26, 0.46, 0.38);
    case "fishing":
      return r(-0.04, -0.24, 0.42, 0.36);
    case "dock":
      return r(-0.22, -0.26, 0.36, 0.3);
    case "smelter":
      return r(-0.12, -0.12, 0.56, 0.5);
    case "sawmill":
      return r(0, -0.12, 0.72, 0.52);
    case "kiln":
      return r(0, -0.06, 0.62, 0.62);
    case "stockpile":
      return r(0, -0.18, 0.62, 0.42);
    case "storehouse":
      return r(0, -0.12, 0.72, 0.6);
    case "warehouse":
      return r(0, -0.14, 0.8, 0.54);
    case "temple":
      return r(0, -0.02, 0.5, 0.58);
    case "government":
      return r(0, -0.18, 0.68, 0.46);
    case "hospital":
      return r(0, -0.12, 0.72, 0.54);
    default:
      // 주방·공방·연구소·일반 집
      return r(0, -0.08, 0.66, 0.6);
  }
}

/** 모델 하나를 만든다 */
/** 지붕 색 하나를 씨앗으로 고른다 */
function pickRoof(random: () => number, choices: readonly Rgb[]): Rgb {
  return choices[Math.floor(random() * choices.length) % choices.length] ?? C.roofTerracotta;
}

// ---------- 종류별 ----------

function farm(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 헛간(박공이 앞을 본다) + 큰 문
  list.house({
    ...m,
    wallH: 4.4 + ctx.extraH,
    roofH: 3,
    wall: ctx.wall(C.wallBarn),
    roof: ctx.roof(C.roofBrown),
    style: "gable-z",
    doorW: Math.min(2.8, m.w * 0.4),
    doorH: 3,
    ridge: ctx.ridge,
  });
  // 사일로(원기둥 + 반구), 레벨 2부터 하나 더
  const siloD = Math.min(3.4, W * 0.14);
  const siloX = m.x + m.w / 2 + siloD * 0.8;
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
    const sx = siloX + i * (siloD + 0.4);
    const h = 7 + level * 0.6 - i * 1.2;
    list.add("cylinder", sx, FLOOR_M, m.z - m.d * 0.2, siloD, h, siloD, C.wallWhite);
    list.add("dome", sx, FLOOR_M + h, m.z - m.d * 0.2, siloD, siloD * 0.55, siloD, C.metal);
  }
  // 앞쪽 밭: 흙 이랑과 작물 줄(줄마다 잎·익은 곡식 번갈아, 씨앗으로 시작 색)
  const z0 = D * 0.04;
  const z1 = D / 2 - MARGIN_M;
  const fieldW = W - MARGIN_M * 2;
  list.add("box", 0, FLOOR_M, (z0 + z1) / 2, fieldW, 0.18, z1 - z0, C.soil);
  const pitch = 1.7;
  const ripe = random() < 0.5 ? 0 : 1;
  let row = 0;
  for (let z = z0 + pitch / 2; z < z1 - 0.3; z += pitch, row++) {
    const color = (row + ripe) % 2 === 0 ? C.crop : C.wheat;
    list.add("box", 0, FLOOR_M + 0.18, z, fieldW - 0.6, 0.55 + random() * 0.2, 0.8, color);
  }
  // 레벨 2부터 건초 더미(눕힌 원기둥)
  if (level >= 2) {
    for (let i = 0; i < 3; i++)
      list.add("cylinder", -W * 0.38 + i * 1.5, FLOOR_M, -D * 0.02, 1.2, 1.3, 1.3, C.roofThatch, {
        lay: true,
        turn: Math.PI / 2,
      });
  }
}

function lumber(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 오두막(나무 벽, 이끼 지붕)
  list.house({
    ...m,
    wallH: 3.4 + ctx.extraH,
    roofH: 2.2,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofMoss),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 톱 헛간: 기둥 넷 + 지붕(벽 없음), 안에 작업대와 둥근 톱
  const sx = W * 0.2;
  const sz = -D * 0.18;
  const sw = W * 0.42;
  const sd = D * 0.38;
  const postH = 3.2;
  for (const px of [-sw / 2 + 0.2, sw / 2 - 0.2])
    for (const pz of [-sd / 2 + 0.2, sd / 2 - 0.2])
      list.add("box", sx + px, FLOOR_M, sz + pz, 0.32, postH, 0.32, C.log);
  list.add("gable", sx, FLOOR_M + postH, sz, sw + 0.4, 1.5, sd + 0.4, C.roofBrown);
  list.add("box", sx, FLOOR_M, sz, sw * 0.6, 0.95, 0.9, C.plank);
  list.add("cylinder", sx, FLOOR_M + 0.5, sz, 0.12, 1.3, 1.3, C.metal, { lay: true });
  // 앞쪽 통나무 더미(레벨 2면 셋)
  const piles = level >= 2 ? 3 : 2;
  const len = Math.min(4.6, W * 0.3);
  for (let i = 0; i < piles; i++) {
    const px = -W / 2 + MARGIN_M + len / 2 + i * (len + 0.8);
    list.logPile(px, D * 0.3, len, 3, (random() - 0.5) * 0.2);
  }
  // 그루터기
  list.add("cylinder", W * 0.32, FLOOR_M, D * 0.1, 0.9, 0.55, 0.9, C.log);
  if (level >= 2) list.add("box", W * 0.32, FLOOR_M, -D * 0.4, 2.4, 0.6, 1.2, C.plank);
}

function mine(ctx: KindContext): void {
  const { list, W, D, level, random } = ctx;
  // 뒤쪽 바위 언덕(사각뿔 둘)과 갱도 입구(어두운 상자 + 나무 틀)
  list.add("pyramid", -W * 0.14, FLOOR_M, -D * 0.24, W * 0.6, 5.5 + level * 0.5, D * 0.44, C.rock, {
    turn: 0.15,
  });
  list.add("pyramid", W * 0.12, FLOOR_M, -D * 0.34, W * 0.4, 3.8, D * 0.28, C.rock, { turn: -0.3 });
  const ex = -W * 0.12;
  const ez = -D * 0.04;
  list.add("box", ex, FLOOR_M, ez, 2.4, 2.4, 0.9, C.shaft);
  list.add("box", ex - 1.35, FLOOR_M, ez + 0.3, 0.35, 2.7, 0.35, C.log);
  list.add("box", ex + 1.35, FLOOR_M, ez + 0.3, 0.35, 2.7, 0.35, C.log);
  list.add("box", ex, FLOOR_M + 2.6, ez + 0.3, 3.1, 0.4, 0.4, C.log);
  // 권양탑: 기둥 넷 + 꼭대기 판 + 바퀴(앞을 보는 원판)
  const m = ctx.main;
  const towerH = 6.5 + level * 0.8 + ctx.extraH;
  const half = Math.min(m.w, m.d) * 0.32;
  for (const px of [-half, half])
    for (const pz of [-half, half]) list.add("box", m.x + px, FLOOR_M, m.z + pz, 0.34, towerH, 0.34, C.log);
  list.add("box", m.x, FLOOR_M + towerH * 0.5, m.z, half * 2 + 0.3, 0.25, half * 2 + 0.3, C.log);
  list.add("box", m.x, FLOOR_M + towerH, m.z, half * 2 + 0.6, 0.35, half * 2 + 0.6, ctx.roof(C.roofBrown));
  list.add("cylinder", m.x, FLOOR_M + towerH + 0.2, m.z, 0.3, 2.2, 2.2, C.metalDark, {
    lay: true,
    turn: Math.PI / 2,
  });
  // 레일 둘(입구 → 앞) + 광차(몸통·광석·바퀴)
  const railLen = D / 2 - MARGIN_M - ez;
  for (const off of [-0.55, 0.55])
    list.add("box", ex + off, FLOOR_M, ez + railLen / 2, 0.14, 0.12, railLen, C.metalDark);
  const cz = ez + railLen * 0.55;
  list.add("box", ex, FLOOR_M + 0.35, cz, 1.4, 0.8, 1.7, C.metalDark);
  list.add("pyramid", ex, FLOOR_M + 1.15, cz, 1.2, 0.55, 1.4, C.ore);
  for (const wx of [-0.72, 0.72])
    for (const wz of [-0.55, 0.55])
      list.add("cylinder", ex + wx, FLOOR_M, cz + wz, 0.14, 0.5, 0.5, C.metal, { lay: true });
  // 광석·석탄 더미(레벨 2면 하나 더)
  list.add("pyramid", W * 0.28, FLOOR_M, D * 0.28, 2.6, 1.5, 2.4, C.ore, { turn: random() });
  list.add("pyramid", W * 0.08, FLOOR_M, D * 0.34, 2.2, 1.2, 2, C.coal, { turn: random() });
  if (level >= 2) list.add("pyramid", W * 0.34, FLOOR_M, D * 0.02, 2, 1.3, 2, C.ore, { turn: random() });
}

function smelter(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 4.6 + ctx.extraH,
    roofH: 2.4,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorX: -m.w * 0.25,
    ridge: ctx.ridge,
  });
  // 용광로 입구(밤에 주황 불빛)
  list.add("glow", m.x + m.w * 0.18, FLOOR_M + 0.5, m.z + m.d / 2, 2, 1.4, 0.2, FURNACE_GLOW);
  // 굴뚝(벽돌, 레벨 2면 셋)
  const count = level >= 2 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const h = 10 + level + i * 1.2;
    list.add("cylinder", m.x + m.w / 2 + 1.3, FLOOR_M, m.z - m.d * 0.3 + i * 2.2, 1.5, h, 1.5, C.wallBrick);
    list.add(
      "cylinder",
      m.x + m.w / 2 + 1.3,
      FLOOR_M + h,
      m.z - m.d * 0.3 + i * 2.2,
      1.8,
      0.4,
      1.8,
      C.metalDark,
    );
  }
  list.add("pyramid", W * 0.3, FLOOR_M, D * 0.3, 2.6, 1.4, 2.4, C.coal, { turn: random() });
  // 주괴 더미
  for (let i = 0; i < 3; i++)
    list.add("box", -W * 0.3 + i * 0.7, FLOOR_M, D * 0.32, 0.6, 0.3 + (i % 2) * 0.3, 1.4, C.metal);
}

function kitchen(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const roof = pickRoof(random, [C.roofTerracotta, C.roofThatch]);
  list.house({
    ...m,
    wallH: 3.4 + ctx.extraH,
    roofH: 2.3,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(roof),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 굴뚝(레벨 2면 둘)
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++)
    list.add(
      "box",
      m.x + m.w * (0.28 - i * 0.56),
      FLOOR_M,
      m.z - m.d * 0.15,
      0.8,
      3.4 + ctx.extraH + 2.6,
      0.8,
      C.wallBrick,
    );
  // 줄무늬 차양(문 위)과 통·탁자
  list.add("box", m.x, FLOOR_M + 2.45, m.z + m.d / 2 + 0.6, Math.min(3, m.w * 0.6), 0.16, 1.2, C.awning);
  list.add(
    "box",
    m.x,
    FLOOR_M + 2.61,
    m.z + m.d / 2 + 0.6,
    Math.min(3, m.w * 0.6) * 0.33,
    0.04,
    1.2,
    C.white,
  );
  list.barrel(-W * 0.36, D * 0.36);
  list.barrel(-W * 0.36 + 0.95, D * 0.38);
  list.add("box", W * 0.3, FLOOR_M, D * 0.36, 1.2, 0.8, 0.8, C.plank);
}

function workshop(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.6 + ctx.extraH,
    roofH: 2,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorW: Math.min(2.6, m.w * 0.42),
    doorH: 2.6,
    ridge: ctx.ridge,
  });
  // 앞면 톱니바퀴 간판(앞을 보는 원판)
  list.add("cylinder", m.x, FLOOR_M + 3.6 + ctx.extraH + 0.25, m.z + m.d / 2 + 0.15, 0.2, 1.3, 1.3, C.metal, {
    lay: true,
    turn: Math.PI / 2,
  });
  // 모루(받침 + 쇠)·작업대·통
  list.add("box", W * 0.3, FLOOR_M, D * 0.34, 0.6, 0.6, 0.6, C.log);
  list.add("box", W * 0.3, FLOOR_M + 0.6, D * 0.34, 1.1, 0.4, 0.5, C.metalDark);
  list.add("box", -W * 0.3, FLOOR_M, D * 0.34, 1.6, 0.85, 0.8, C.plank);
  if (level >= 2) list.barrel(-W * 0.3 + 1.3, D * 0.34);
}

function sawmill(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.8 + ctx.extraH,
    roofH: 2.2,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofBrown),
    style: "gable-x",
    doorX: m.w * 0.25,
    doorW: 2.4,
    ridge: ctx.ridge,
  });
  // 옆면 큰 톱(원판)과 통나무 들이는 길
  list.add("cylinder", m.x - m.w / 2 - 0.2, FLOOR_M + 0.4, m.z + m.d * 0.1, 0.16, 2.4, 2.4, C.metal, {
    lay: true,
  });
  list.logPile(-W * 0.3, D * 0.34, Math.min(4.2, W * 0.32), 2, Math.PI / 2);
  // 널빤지 더미(레벨 2면 하나 더)
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++)
    for (let k = 0; k < 4; k++)
      list.add("box", W * 0.22 + i * 2.2, FLOOR_M + k * 0.22, D * 0.34, 1.8, 0.2, 3, C.plank, {
        turn: (k % 2) * 0.06,
      });
}

function kiln(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const dia = Math.min(m.w, m.d);
  const brick = ctx.wall(C.wallBrick);
  list.add("cylinder", m.x, FLOOR_M, m.z, dia, 1.2, dia, brick);
  list.add("dome", m.x, FLOOR_M + 1.2, m.z, dia, 3.4 + ctx.extraH * 0.5 + level * 0.3, dia, brick);
  list.add("glow", m.x, FLOOR_M + 0.3, m.z + dia / 2 - 0.15, 1.3, 1.2, 0.4, FURNACE_GLOW);
  list.add("cylinder", m.x + dia * 0.3, FLOOR_M, m.z - dia * 0.36, 1, 7 + level, 1, brick);
  // 벽돌 더미(레벨 2면 둘)
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++)
    list.add("box", -W * 0.34 + i * 1.6, FLOOR_M, D * 0.36, 1.3, 0.8, 1, C.wallBrick, { turn: 0.1 * i });
}

function stockpile(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  // 기둥 넷 + 낮은 천막 지붕, 아래에 상자
  const postH = 2.6;
  for (const px of [-m.w / 2 + 0.2, m.w / 2 - 0.2])
    for (const pz of [-m.d / 2 + 0.2, m.d / 2 - 0.2])
      list.add("box", m.x + px, FLOOR_M, m.z + pz, 0.25, postH, 0.25, C.log);
  list.add(
    "gable",
    m.x,
    FLOOR_M + postH,
    m.z,
    m.w + 0.3,
    1.2,
    m.d + 0.3,
    ctx.ridge ?? ctx.roof(C.roofThatch),
  );
  list.crates(m.x, m.z, 3 + level, random, 0.95);
  list.barrel(-W * 0.34, D * 0.34);
  list.barrel(-W * 0.34 + 0.9, D * 0.34);
  list.logPile(W * 0.2, D * 0.34, Math.min(3, W * 0.4), 2);
}

function storehouse(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  list.house({
    ...m,
    wallH: 4.4 + ctx.extraH,
    roofH: 3,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofBrown),
    style: "gable-z",
    doorW: Math.min(3.2, m.w * 0.35),
    doorH: 3.4,
    ridge: ctx.ridge,
  });
  list.crates(-W * 0.3, D * 0.36, 3 + Math.min(2, level - 1), random, 1);
  list.barrel(W * 0.32, D * 0.36);
}

function warehouse(ctx: KindContext): void {
  const { list, W, D, random, main: m } = ctx;
  const big = W >= 26;
  list.house({
    ...m,
    wallH: 5.6 + ctx.extraH,
    roofH: 2.6,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorX: -m.w * 0.22,
    doorW: 3.2,
    doorH: 4,
    ridge: ctx.ridge,
  });
  // 둘째 큰 문 + 앞 하역대(널빤지 판)
  list.add("box", m.x + m.w * 0.22, FLOOR_M, m.z + m.d / 2, 3.2, 4, 0.22, C.trim);
  list.add("box", m.x, FLOOR_M, m.z + m.d / 2 + 1, m.w * 0.85, 0.9, 2, C.plank);
  list.crates(W * 0.28, D * 0.38, 4, random, 1.1);
  list.crates(-W * 0.32, D * 0.38, 3, random, 1.1);
  // 대규모 창고(5칸 이상): 뒤쪽 사무동
  if (big)
    list.house({
      x: m.x + m.w * 0.3,
      z: -D / 2 + MARGIN_M + 2.4,
      w: m.w * 0.3,
      d: 4,
      wallH: 3.6,
      roofH: 1.8,
      wall: ctx.wall(C.wallCream),
      roof: ctx.roof(C.roofTerracotta),
      style: "gable-x",
      doorW: 0,
    });
}

function temple(ctx: KindContext): void {
  const { list, level, main: m } = ctx;
  list.house({
    ...m,
    wallH: 5 + ctx.extraH,
    roofH: 3,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofTeal),
    style: "gable-z",
    doorH: 3,
    ridge: ctx.ridge,
  });
  // 앞 계단 둘
  list.add("box", m.x, FLOOR_M, m.z + m.d / 2 + 0.9, m.w * 0.6, 0.25, 1.6, C.padStone);
  list.add("box", m.x, FLOOR_M + 0.25, m.z + m.d / 2 + 0.6, m.w * 0.5, 0.25, 1, C.padStone);
  // 뒤쪽 첨탑: 탑 + 뾰족 지붕 + 금 끝
  const tz = m.z - m.d / 2 + 1.6;
  const towerH = 9 + level + ctx.extraH;
  list.add("box", m.x, FLOOR_M, tz, 3, towerH, 3, C.wallStone);
  list.add("glow", m.x, FLOOR_M + towerH - 2.4, tz + 1.5, 0.9, 1.4, 0.14, list.windowColor);
  list.add("pyramid", m.x, FLOOR_M + towerH, tz, 3.4, 6, 3.4, C.roofTeal);
  list.add("cone", m.x, FLOOR_M + towerH + 6, tz, 0.5, 1.4, 0.5, C.gold);
  // 레벨 2부터 앞 양쪽 작은 탑
  if (level >= 2)
    for (const side of [-1, 1]) {
      const sx = m.x + side * (m.w / 2 + 0.9);
      list.add("box", sx, FLOOR_M, m.z + m.d * 0.3, 1.6, 6, 1.6, C.wallStone);
      list.add("pyramid", sx, FLOOR_M + 6, m.z + m.d * 0.3, 1.9, 2.6, 1.9, C.roofTeal);
    }
}

function lab(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 4 + ctx.extraH;
  const top = list.house({
    ...m,
    wallH,
    roofH: 0,
    wall: ctx.wall(C.wallLab),
    roof: ctx.roof(C.wallWhite),
    style: "flat",
    ridge: null,
  });
  // 청록 띠·유리 반구·안테나
  list.add("box", m.x, FLOOR_M + wallH - 0.9, m.z, m.w + 0.12, 0.4, m.d + 0.12, C.roofTeal);
  const dome = Math.min(m.w, m.d) * 0.6;
  list.add("dome", m.x - m.w * 0.12, top, m.z, dome, dome * 0.55, dome, C.glassDome);
  list.add("cylinder", m.x + m.w * 0.32, top, m.z - m.d * 0.25, 0.14, 3.2, 0.14, C.metal);
  list.add("cone", m.x + m.w * 0.32, top + 3.2, m.z - m.d * 0.25, 0.5, 0.6, 0.5, ctx.ridge ?? C.roofTeal);
  // 레벨 2부터 옆 온실(유리 상자)
  if (level >= 2) list.add("box", -W * 0.3, FLOOR_M, D * 0.32, W * 0.3, 1.8, D * 0.22, C.glassDome);
}

function government(ctx: KindContext): void {
  const { list, D, level, main: m } = ctx;
  const wallH = 5.4 + ctx.extraH;
  const top = list.house({
    ...m,
    wallH,
    roofH: 3.2,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(C.roofTerracotta),
    style: "hip",
    doorH: 3,
  });
  // 앞 기둥 줄(흰 원기둥) + 들보 + 박공(앞을 보는 삼각)
  const pz = m.z + m.d / 2 + 1.5;
  const pw = m.w * 0.7;
  const columns = Math.max(4, Math.min(6, Math.floor(pw / 2)));
  for (let i = 0; i < columns; i++) {
    const cx = m.x - pw / 2 + (pw * i) / (columns - 1);
    list.add("cylinder", cx, FLOOR_M + 0.3, pz, 0.7, wallH - 0.6, 0.7, C.white);
  }
  list.add("box", m.x, FLOOR_M + wallH - 0.3, pz - 0.5, pw + 1, 0.6, 2.6, C.white);
  list.add("gable", m.x, FLOOR_M + wallH + 0.3, pz - 0.5, 2.8, 1.8, pw + 1.2, C.wallCream, {
    turn: Math.PI / 2,
  });
  // 계단
  list.add("box", m.x, FLOOR_M, pz + 0.6, pw + 1.2, 0.3, 2.4, C.padStone);
  // 국가 깃발(앞 가운데, 큰 것). 국가가 없으면 흰 깃발
  list.flag(m.x + pw / 2 + 1.6, D / 2 - MARGIN_M - 0.4, 7 + level, ctx.ridge ?? C.white);
  // 레벨 2: 시계탑, 레벨 3: 금 반구
  if (level >= 2) {
    list.add("box", m.x, top - 1.5, m.z, 2.6, 4.2, 2.6, C.wallCream);
    list.add("glow", m.x, top + 1.2, m.z + 1.3, 1.3, 1.3, 0.14, list.windowColor);
    list.add(
      level >= 3 ? "dome" : "pyramid",
      m.x,
      top + 2.7,
      m.z,
      3,
      level >= 3 ? 2.4 : 2.6,
      3,
      level >= 3 ? C.gold : C.roofTerracotta,
    );
  }
}

function hospital(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 6 + ctx.extraH;
  const top = list.house({
    ...m,
    wallH,
    roofH: 0,
    wall: ctx.wall(C.wallWhite),
    roof: ctx.roof(C.padStone),
    style: "flat",
    doorW: 2.4,
    ridge: null,
  });
  // 앞 차양 + 앞 벽 십자 + 지붕 십자
  list.add("box", m.x, FLOOR_M + 2.7, m.z + m.d / 2 + 1, 3.6, 0.2, 2, C.white);
  const cy = FLOOR_M + wallH - 1.9;
  list.add("box", m.x, cy, m.z + m.d / 2 + 0.05, 0.55, 1.7, 0.2, C.crossRed);
  list.add("box", m.x, cy + 0.575, m.z + m.d / 2 + 0.05, 1.7, 0.55, 0.2, C.crossRed);
  list.add("box", m.x, top, m.z, 1.2, 0.08, 3.6, C.crossRed);
  list.add("box", m.x, top, m.z, 3.6, 0.08, 1.2, C.crossRed);
  // 레벨 2부터 옆 별관
  if (level >= 2)
    list.house({
      x: -W * 0.32,
      z: D * 0.26,
      w: W * 0.26,
      d: D * 0.26,
      wallH: 3.4,
      roofH: 0,
      wall: ctx.wall(C.wallWhite),
      roof: ctx.roof(C.padStone),
      style: "flat",
      doorW: 0,
    });
}

function house(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const roofs = [C.roofTerracotta, C.roofSlate, C.roofMoss, C.roofThatch];
  // 판이 크면(가로·세로 모두 14m 넘음) 작은 집 여러 채
  const cols = W > 14 ? 2 : 1;
  const rows = D > 14 ? 2 : 1;
  const cw = (W - MARGIN_M * 2) / cols;
  const cd = (D - MARGIN_M * 2) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const single = cols * rows === 1;
      list.house({
        x: single ? m.x : -W / 2 + MARGIN_M + cw * (c + 0.5),
        z: single ? m.z : -D / 2 + MARGIN_M + cd * (r + 0.5),
        w: single ? m.w : cw * 0.72,
        d: single ? m.d : cd * 0.68,
        wallH: 3.2 + ctx.extraH + random() * 0.6,
        roofH: 2.2,
        wall: ctx.wall(random() < 0.5 ? C.wallCream : C.wallWhite),
        roof: ctx.roof(pickRoof(random, roofs)),
        style: random() < 0.75 ? "gable-x" : "hip",
        ridge: ctx.ridge,
      });
    }
  if (level >= 2) list.add("box", W * 0.32, FLOOR_M, D * 0.36, 1.2, 1, 0.9, C.plank);
}

export const KIND_MODELS: Readonly<Record<BuildingArtKind, (ctx: KindContext) => void>> = {
  farm,
  lumber,
  mine,
  smelter,
  kitchen,
  workshop,
  sawmill,
  kiln,
  stockpile,
  storehouse,
  warehouse,
  temple,
  lab,
  government,
  hospital,
  house,
  herb,
  ranch,
  fishing,
  dock,
};

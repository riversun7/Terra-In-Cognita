// 2차 가공·제작 시설 모델 5종 — 제련소·주방·공방·제재소·가마(전체 개편 2026-11-19).
import type { KindContext } from "./buildingKinds.ts";
import { BUILDING_COLORS as C, FURNACE_GLOW } from "./buildingPalette.ts";
import { FLOOR_M } from "./buildingParts.ts";

/** 제련소: 돌 작업장 + 채광 지붕 + 용광로 화구 + 띠 두른 벽돌 굴뚝 + 냉각수조 + 석탄·주괴 */
export function smelter(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const wallH = 4.6 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.3,
    wall: ctx.wall(C.wallStone),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorX: -m.w * 0.25,
    ridge: ctx.ridge,
  });
  // 지붕 위 환기 모니터(채광창)
  list.add("box", m.x, FLOOR_M + wallH + 1.4, m.z, m.w * 0.45, 0.9, m.d * 0.3, C.metalDark);
  // 용광로 입구(주황 불빛)
  list.add("glow", m.x + m.w * 0.18, FLOOR_M + 0.45, m.z + m.d / 2, 2.1, 1.45, 0.22, FURNACE_GLOW);
  // 굴뚝(벽돌 + 철 띠, 레벨 2면 셋)
  const count = level >= 2 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const h = 10 + level + i * 1.1;
    const cz = m.z - m.d * 0.3 + i * 2.1;
    const cx = m.x + m.w / 2 + 1.25;
    list.add("cylinder", cx, FLOOR_M, cz, 1.5, h, 1.5, C.wallBrick);
    list.add("cylinder", cx, FLOOR_M + h * 0.65, cz, 1.65, 0.32, 1.65, C.metalDark);
    list.add("cylinder", cx, FLOOR_M + h, cz, 1.85, 0.45, 1.85, C.metalDark);
  }
  // 냉각 수조
  list.add("box", -W * 0.28, FLOOR_M, -D * 0.3, 2.2, 0.65, 1.5, C.wallStone);
  list.add("box", -W * 0.28, FLOOR_M + 0.55, -D * 0.3, 1.8, 0.14, 1.15, C.water);
  list.add("pyramid", W * 0.3, FLOOR_M, D * 0.3, 2.5, 1.4, 2.3, C.coal, { turn: random() });
  // 주괴 더미(철·구리 번갈아)
  for (let i = 0; i < 4; i++)
    list.add(
      "box",
      -W * 0.34 + i * 0.65,
      FLOOR_M,
      D * 0.32,
      0.55,
      0.32 + (i % 2) * 0.28,
      1.35,
      i % 2 === 0 ? C.metal : C.copper,
    );
}

/** 주방: 크림 벽·기와 지붕 + 넓은 화덕 굴뚝 + 줄무늬 차양 + 야외 솥·통 */
export function kitchen(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const roof = random() < 0.5 ? C.roofTerracotta : C.roofThatch;
  const wallH = 3.4 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.3,
    wall: ctx.wall(C.wallCream),
    roof: ctx.roof(roof),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 벽돌 굴뚝(레벨 2면 둘)
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
    const cx = m.x + m.w * (0.28 - i * 0.56);
    const cz = m.z - m.d * 0.15;
    list.add("box", cx, FLOOR_M, cz, 0.85, wallH + 2.7, 0.85, C.wallBrick);
    list.add("box", cx, FLOOR_M + wallH + 2.7, cz, 1.05, 0.25, 1.05, C.padStone);
  }
  // 줄무늬 차양
  const aw = Math.min(3.2, m.w * 0.65);
  list.add("box", m.x, FLOOR_M + 2.45, m.z + m.d / 2 + 0.55, aw, 0.16, 1.15, C.awning);
  list.add("box", m.x, FLOOR_M + 2.61, m.z + m.d / 2 + 0.55, aw * 0.34, 0.04, 1.15, C.white);
  // 야외 가마솥 화덕
  list.add("cylinder", W * 0.28, FLOOR_M, D * 0.34, 1.1, 0.65, 1.1, C.wallBrick);
  list.add("dome", W * 0.28, FLOOR_M + 0.5, D * 0.34, 0.85, 0.45, 0.85, C.metalDark);
  list.barrel(-W * 0.36, D * 0.34);
  list.barrel(-W * 0.36 + 0.9, D * 0.36);
  list.add("box", 0, FLOOR_M, D * 0.36, 1.3, 0.8, 0.75, C.plank);
}

/** 공방: 나무·벽돌 작업장 + 톱니 간판 + 소형 지브 크레인 + 화덕 + 모루·작업대 */
export function workshop(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const wallH = 3.6 + ctx.extraH;
  list.house({
    ...m,
    wallH,
    roofH: 2.1,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofSlate),
    style: "gable-x",
    doorW: Math.min(2.6, m.w * 0.42),
    doorH: 2.6,
    ridge: ctx.ridge,
  });
  // 앞면 톱니바퀴 간판
  list.add("cylinder", m.x, FLOOR_M + wallH + 0.3, m.z + m.d / 2 + 0.16, 0.22, 1.35, 1.35, C.copper, {
    lay: true,
    turn: Math.PI / 2,
  });
  // 소형 지브 호이스트(오른쪽 마당)
  list.crane(W * 0.34, FLOOR_M, -D * 0.05, 3.6 + ctx.extraH * 0.4, 2.2, Math.PI * 0.75, C.metalDark);
  // 모루·화로·작업대
  list.add("box", W * 0.28, FLOOR_M, D * 0.34, 0.62, 0.58, 0.62, C.log);
  list.add("box", W * 0.28, FLOOR_M + 0.58, D * 0.34, 1.15, 0.42, 0.5, C.metalDark);
  list.add("glow", m.x + m.w / 2, FLOOR_M + 0.4, m.z, 0.2, 0.85, 1.1, FURNACE_GLOW);
  list.add("box", -W * 0.28, FLOOR_M, D * 0.34, 1.65, 0.85, 0.8, C.plank);
  if (level >= 2) list.barrel(-W * 0.28 + 1.25, D * 0.34);
}

/** 제재소: 긴 목조 헛간 + 수차/동력 톱날 + 통나무 투입 경사 + 제재 널빤지 더미 */
export function sawmill(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  list.house({
    ...m,
    wallH: 3.8 + ctx.extraH,
    roofH: 2.3,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofBrown),
    style: "gable-x",
    doorX: m.w * 0.25,
    doorW: 2.4,
    ridge: ctx.ridge,
  });
  // 수로·수차 + 대형 원형 톱날
  list.add("box", m.x - m.w / 2 - 0.55, FLOOR_M, m.z, 0.9, 0.24, m.d * 0.85, C.water);
  list.add("cylinder", m.x - m.w / 2 - 0.24, FLOOR_M + 0.45, m.z - m.d * 0.18, 0.36, 2.2, 2.2, C.log, {
    lay: true,
  });
  list.add("cylinder", m.x - m.w / 2 - 0.16, FLOOR_M + 0.55, m.z + m.d * 0.2, 0.14, 2.5, 2.5, C.metal, {
    lay: true,
  });
  list.logPile(-W * 0.3, D * 0.33, Math.min(4.0, W * 0.3), 2, Math.PI / 2);
  // 제재 널빤지 더미
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++)
    for (let k = 0; k < 4; k++)
      list.add("box", W * 0.22 + i * 2.1, FLOOR_M + k * 0.22, D * 0.33, 1.75, 0.2, 2.8, C.plank, {
        turn: (k % 2) * 0.05,
      });
}

/** 가마: 이중 벽돌 반구 가마 + 주황 불빛 화구 + 굴뚝 + 벽돌·도기 더미 */
export function kiln(ctx: KindContext): void {
  const { list, W, D, level, main: m } = ctx;
  const dia = Math.min(m.w, m.d) * 0.88;
  const brick = ctx.wall(C.wallBrick);
  const roof = ctx.roof(C.roofTerracotta);
  list.add("cylinder", m.x - dia * 0.1, FLOOR_M, m.z, dia, 1.25, dia, brick);
  list.add(
    "dome",
    m.x - dia * 0.1,
    FLOOR_M + 1.25,
    m.z,
    dia,
    3.3 + ctx.extraH * 0.5 + level * 0.28,
    dia,
    roof,
  );
  list.add("glow", m.x - dia * 0.1, FLOOR_M + 0.3, m.z + dia / 2 - 0.12, 1.35, 1.25, 0.38, FURNACE_GLOW);
  // 굴뚝(단차 마감)
  const cx = m.x + dia * 0.34;
  const cz = m.z - dia * 0.32;
  list.add("cylinder", cx, FLOOR_M, cz, 1.05, 6.8 + level, 1.05, brick);
  list.add("cylinder", cx, FLOOR_M + 6.8 + level, cz, 1.3, 0.3, 1.3, C.metalDark);
  // 보조 가마(레벨 2부터)
  if (level >= 2) {
    const sub = dia * 0.55;
    list.add("cylinder", m.x + dia * 0.45, FLOOR_M, m.z + 0.2, sub, 0.8, sub, brick);
    list.add("dome", m.x + dia * 0.45, FLOOR_M + 0.8, m.z + 0.2, sub, 1.8, sub, roof);
  }
  // 구운 벽돌·도기 더미
  for (let i = 0; i < (level >= 2 ? 2 : 1); i++)
    list.add("box", -W * 0.33 + i * 1.55, FLOOR_M, D * 0.35, 1.25, 0.8, 0.95, C.wallBrick, { turn: 0.1 * i });
  list.barrel(W * 0.33, D * 0.34);
}

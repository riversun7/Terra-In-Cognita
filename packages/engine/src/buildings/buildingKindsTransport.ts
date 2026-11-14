// 교통 시설 모델 — 부두(docs/adr/2026-11-13-boats.md 3절). buildingKinds.ts KIND_MODELS가 부른다(그 파일 600줄 경고를 넘지 않게 나눴다).
// 부두 = 칸 전체를 덮는 널판 갑판 + 둘레 말뚝 + 작은 창고 + 밧줄 기둥 + 물에 띄운 작은 배. 물가 쪽이 앞(z+)이라 생각한다(낚시터와 같은 약속).
import { BUILDING_COLORS as C } from "./buildingPalette.ts";
import { FLOOR_M, MARGIN_M } from "./buildingParts.ts";
import type { KindContext } from "./buildingKinds.ts";

export function dock(ctx: KindContext): void {
  const { list, W, D, level, random, main: m } = ctx;
  const w = W - MARGIN_M * 2;
  const d = D - MARGIN_M * 2;
  // 널판 갑판(칸 전체) + 갑판 가장자리 테
  list.add("box", 0, FLOOR_M + 0.35, 0, w, 0.2, d, C.plank);
  list.add("box", 0, FLOOR_M + 0.5, -d / 2 + 0.12, w, 0.12, 0.24, C.trim);
  // 둘레 말뚝(앞쪽 물가로 갈수록 촘촘히)
  for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3 + 1e-6; x += Math.max(1.2, w / 6))
    for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) list.add("cylinder", x, FLOOR_M, z, 0.3, 1.1, 0.3, C.log);
  // 작은 창고(본채 자리)
  list.house({
    ...m,
    wallH: 2.6 + ctx.extraH,
    roofH: 1.6,
    wall: ctx.wall(C.wallWood),
    roof: ctx.roof(C.roofTeal),
    style: "gable-x",
    ridge: ctx.ridge,
  });
  // 밧줄 기둥 둘(앞 가장자리)
  for (const x of [-w * 0.3, w * 0.3])
    list.add("cylinder", x, FLOOR_M + 0.45, d / 2 - 0.7, 0.34, 0.8, 0.34, C.trim);
  // 묶어 둔 작은 배(갑판 앞 물 쪽 — 반구 몸 + 용골)
  const bz = d / 2 - 1;
  list.add("dome", w * 0.1, FLOOR_M + 0.3, bz, 3.4, 0.6, 1.4, C.hull);
  list.add("box", w * 0.1, FLOOR_M + 0.85, bz, 3.1, 0.12, 0.12, C.trim);
  // 통·상자(레벨 2면 상자 더)
  list.barrel(-w * 0.36, -d * 0.1);
  if (level >= 2) list.crates(w * 0.32, -d * 0.12, 2, random, 0.9);
}

// 지형별 2차맵 오브젝트 모델(기획 D-536 — 모든 지형 5종 이상, 42 §5 표) — propParts.ts buildShape가 겉모습 shape "kit"을 여기로 넘긴다.
// 부품(줄기·원뿔·잎·바위·덩이·조각)만 쓴다: 그리기 호출은 부품 수(6번) 그대로다. 삼각형을 아끼려고 덩이(20)·조각(8)·잎(3)을 주로 쓰고
// 바위(36)는 하나까지만 쓴다(엔진 시험: 모델마다 부품 8개·삼각형 90개 이하, 평균 45 이하).
// - 물 위 소품(겉모습 float)은 propView가 수면 높이를 y와 ctx.ground로 준다: 수면에 떠 있거나 수면 위로 나온 부분만 그린다.
// - 자리·크기·돌림은 칸 해시(ctx.r)로 정한다. 장식이라 Math를 써도 된다(판정 아님).
import { Color } from "three";
import type { PropLook } from "./propLook.ts";
import type { PartSink, ShapeContext } from "./propParts.ts";

/** 다시 쓰는 색(sink가 바로 복사한다) */
const main = new Color();
const second = new Color();
const third = new Color();

const WOOD = new Color(0.42, 0.32, 0.22);
const SNOW = new Color(0.93, 0.95, 0.97);
const DARK = new Color(0.12, 0.11, 0.1);
const FOAM = new Color(0.9, 0.95, 0.98);

/** 방위 turn으로 돌린 칸 안 옮김(dx, dz) → 세계 옮김 */
function at(ctx: ShapeContext, dx: number, dz: number): { x: number; z: number } {
  const c = Math.cos(ctx.turn);
  const s = Math.sin(ctx.turn);
  return { x: ctx.x + dx * c + dz * s, z: ctx.z - dx * s + dz * c };
}

/** 겉모습 색(또는 덧색) × 밝기 → target */
function tone(target: Color, rgb: readonly [number, number, number], ctx: ShapeContext, mul = 1): Color {
  return target.setRGB(rgb[0] * ctx.shade * mul, rgb[1] * ctx.shade * mul, rgb[2] * ctx.shade * mul);
}

/** 납작한 원판(웅덩이·소금밭·연잎 등): 덩이를 아주 낮게 */
function disc(put: PartSink, ctx: ShapeContext, rx: number, rz: number, lift: number, color: Color): void {
  put("blob", ctx.x, ctx.y + lift, ctx.z, rx, 0.04, rz, ctx.turn, 0, color);
}

/** 조각 count개를 반지름 spread 안에 흩는다(땅 높이에 붙임, onWater면 ctx.y 그대로) */
function chips(
  put: PartSink,
  ctx: ShapeContext,
  count: number,
  spread: number,
  scale: number,
  color: Color,
  salt: number,
  onWater = false,
): void {
  for (let k = 0; k < count; k++) {
    const spot = at(ctx, (ctx.r(salt + k) - 0.5) * spread * 2, (ctx.r(salt + 10 + k) - 0.5) * spread * 2);
    const s = scale * (0.6 + 0.8 * ctx.r(salt + 20 + k));
    const y = onWater ? ctx.y : ctx.ground(spot.x, spot.z);
    put("chip", spot.x, y + s * 0.25, spot.z, s, s * 0.6, s * 0.8, ctx.turn + k * 1.9, 0, color);
  }
}

/** 풀잎 count개 다발 */
function blades(
  put: PartSink,
  ctx: ShapeContext,
  count: number,
  height: number,
  spread: number,
  color: Color,
  salt: number,
  y0?: number,
): void {
  for (let k = 0; k < count; k++) {
    const angle = ctx.turn + (k * Math.PI * 2) / count + ctx.r(salt + k) * 0.7;
    const d = spread * (0.2 + 0.8 * ctx.r(salt + 10 + k));
    const x = ctx.x + Math.cos(angle) * d;
    const z = ctx.z + Math.sin(angle) * d;
    const h = height * (0.7 + 0.6 * ctx.r(salt + 20 + k));
    const y = y0 ?? ctx.ground(x, z);
    put("blade", x, y, z, 0.1 * ctx.size, h, 0.07, angle, (ctx.r(salt + 30 + k) - 0.5) * 0.6, color);
  }
}

/** 나무 한 그루(줄기 + 덩이 갓) */
function tree(
  put: PartSink,
  ctx: ShapeContext,
  x: number,
  z: number,
  height: number,
  trunk: number,
  crown: number,
  leaf: Color,
): void {
  const y = ctx.ground(x, z);
  put("stem", x, y, z, trunk, height * 0.6, trunk, ctx.turn, 0, WOOD);
  put("blob", x, y + height * 0.7, z, crown, crown * 0.75, crown, ctx.turn, 0, leaf);
}

/** 지형별 오브젝트 모델 하나(겉모습 kit 이름으로 고른다). 모르는 kit은 작은 돌 하나 */
export function buildKit(put: PartSink, look: PropLook, ctx: ShapeContext): void {
  const { x, y, z, size, turn } = ctx;
  const h = look.heightM * size;
  const accent = look.vein ?? look.color;
  const body = tone(main, look.color, ctx);
  switch (look.kit) {
    case "snowdrift":
      put("blob", x, y, z, 2.4 * size, h, 1.6 * size, turn, 0, ctx.snowy ? SNOW : body);
      put("blob", ...offsetArgs(ctx, 1.4, 0.4), 1.2 * size, h * 0.6, 1 * size, turn + 1, 0, body);
      return;
    case "crevasse":
      // 얼음 틈: 길고 좁은 어두운 조각 셋 + 가장자리 흰 덩이
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (k - 1) * 2.2, (ctx.r(40 + k) - 0.5) * 0.6);
        put("chip", spot.x, ctx.ground(spot.x, spot.z) + 0.02, spot.z, 0.35, 0.12, 1.6, turn, 0, body);
      }
      put("blob", x, y, z, 1.6 * size, 0.25, 0.5 * size, turn, 0, tone(second, accent, ctx));
      return;
    case "fossil": {
      put("blob", x, y + h * 0.3, z, h * 0.7, h * 0.45, h * 0.55, turn, 0, body);
      const bone = tone(second, accent, ctx);
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (k - 1) * 0.3, 0);
        put("chip", spot.x, y + h * 0.35, spot.z, 0.45 * size, 0.06, 0.08, turn + k * 0.4, 0, bone);
      }
      return;
    }
    case "mossRock":
      put("blob", x, y + h * 0.3, z, h * 0.6, h * 0.45, h * 0.55, turn, 0.1, body);
      put("blob", x, y + h * 0.62, z, h * 0.45, h * 0.12, h * 0.4, turn, 0, tone(second, accent, ctx));
      return;
    case "mossTufts":
      for (let k = 0; k < 4; k++) {
        const spot = at(ctx, (ctx.r(50 + k) - 0.5) * 2, (ctx.r(55 + k) - 0.5) * 2);
        const s = (0.35 + 0.3 * ctx.r(60 + k)) * size;
        const part = k < 2 ? "blob" : "chip";
        put(
          part,
          spot.x,
          ctx.ground(spot.x, spot.z),
          spot.z,
          s,
          h,
          s,
          turn,
          0,
          k === 0 ? body : tone(second, accent, ctx),
        );
      }
      return;
    case "pool":
      // 웅덩이: 가장자리(겉모습 색) + 물(덧색) + 돌 조각
      disc(put, ctx, 1.9 * size, 1.4 * size, 0.01, body);
      disc(put, ctx, 1.5 * size, 1.05 * size, 0.04, tone(second, accent, ctx));
      chips(put, ctx, 1, 1.8, 0.3, tone(third, look.color, ctx, 0.85), 70);
      return;
    case "herb":
      blades(put, ctx, 5, h, 0.5, body, 80);
      chips(put, ctx, 3, 0.45, 0.14, tone(second, accent, ctx), 90);
      return;
    case "mushrooms":
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (ctx.r(100 + k) - 0.5) * 1.2, (ctx.r(105 + k) - 0.5) * 1.2);
        const s = (0.6 + 0.6 * ctx.r(110 + k)) * size;
        const g = ctx.ground(spot.x, spot.z);
        put("blade", spot.x, g, spot.z, 0.07 * s, h * s, 0.07 * s, turn, 0, tone(second, look.color, ctx));
        put(
          "chip",
          spot.x,
          g + h * s,
          spot.z,
          0.24 * s,
          0.1 * s,
          0.24 * s,
          turn,
          0,
          tone(third, accent, ctx),
        );
      }
      return;
    case "berries":
      put("blob", x, y + h * 0.45, z, h * 0.6, h * 0.5, h * 0.55, turn, 0, body);
      chips(put, ctx, 4, 0.7, 0.13, tone(second, accent, ctx), 120, false);
      return;
    case "grain":
      blades(put, ctx, 8, h, 0.9, body, 130);
      return;
    case "dune":
      put("blob", x, y - h * 0.2, z, 3.2 * size, h, 2 * size, turn, 0, body);
      put("blob", ...offsetArgs(ctx, 2, 0.6), 1.6 * size, h * 0.65, 1.2 * size, turn + 0.6, 0, body);
      if (look.vein) blades(put, ctx, 4, 0.7 * size, 1.4, tone(second, accent, ctx), 140);
      return;
    case "saltFlat":
      disc(put, ctx, 2.6 * size, 2 * size, 0.01, body);
      chips(put, ctx, 3, 2, 0.22, tone(second, accent, ctx), 150);
      return;
    case "oasis": {
      disc(put, ctx, 2.2 * size, 1.6 * size, 0.02, tone(second, accent, ctx));
      for (let k = 0; k < 2; k++) {
        const spot = at(ctx, (k === 0 ? 1 : -1) * 2.4, (ctx.r(160 + k) - 0.5) * 1.5);
        const g = ctx.ground(spot.x, spot.z);
        const lean = 0.15 + 0.15 * ctx.r(165 + k);
        put("stem", spot.x, g, spot.z, 0.16 * size, h, 0.16 * size, turn + k, lean, WOOD);
        put("cone", spot.x, g + h * 0.85, spot.z, 1.2 * size, 0.4 * size, 1.2 * size, turn, 0, body);
      }
      return;
    }
    case "oilSeep":
      disc(put, ctx, 1.6 * size, 1.2 * size, 0.02, DARK);
      chips(put, ctx, 3, 1.4, 0.3, tone(second, accent, ctx), 170);
      return;
    case "baobab": {
      put("stem", x, y, z, 0.95 * size, h * 0.62, 0.95 * size, turn, 0, body);
      put("blob", x, y + h * 0.72, z, h * 0.32, h * 0.1, h * 0.32, turn, 0, tone(second, accent, ctx));
      for (let k = 0; k < 3; k++)
        put("blade", x, y + h * 0.6, z, 0.3 * size, h * 0.24, 0.2 * size, turn + k * 2.1, 0.9, body);
      return;
    }
    case "giantTree":
      put("stem", x, y, z, 0.7 * size, h * 0.7, 0.7 * size, turn, 0, WOOD);
      put("blob", x, y + h * 0.72, z, h * 0.26, h * 0.16, h * 0.26, turn, 0, body);
      put("cone", x, y + h * 0.82, z, h * 0.2, h * 0.18, h * 0.2, turn + 1, 0, tone(second, accent, ctx));
      return;
    case "vines":
      for (let k = 0; k < 4; k++) {
        const spot = at(ctx, (ctx.r(180 + k) - 0.5) * 1.6, (ctx.r(185 + k) - 0.5) * 1.6);
        put(
          "blade",
          spot.x,
          ctx.ground(spot.x, spot.z),
          spot.z,
          0.12,
          h,
          0.08,
          turn + k,
          0.25 * ctx.r(190 + k),
          body,
        );
      }
      blades(put, ctx, 4, h * 0.4, 0.8, tone(second, accent, ctx), 195);
      return;
    case "fruitTree":
      tree(put, ctx, x, z, h, 0.22 * size, h * 0.3, body);
      chips(put, ctx, 4, h * 0.25, 0.18, tone(second, accent, ctx), 200, true);
      return;
    case "peat":
      put("blob", x, y, z, 1.4 * size, h, 1.1 * size, turn, 0, body);
      blades(put, ctx, 4, 0.6 * size, 1.1, tone(second, accent, ctx), 210);
      return;
    case "mangrove": {
      put("blob", x, y + h * 0.75, z, h * 0.32, h * 0.2, h * 0.32, turn, 0, body);
      put("stem", x, y + h * 0.25, z, 0.16 * size, h * 0.5, 0.16 * size, turn, 0, WOOD);
      for (let k = 0; k < 4; k++)
        put(
          "blade",
          x,
          y,
          z,
          0.12,
          h * 0.38,
          0.08,
          turn + (k * Math.PI) / 2,
          0.55,
          tone(second, accent, ctx),
        );
      return;
    }
    case "spire":
      put("rock", x, y + h * 0.45, z, h * 0.3, h * 0.55, h * 0.26, turn, 0.08, body);
      put(
        "cone",
        ...offsetArgs(ctx, h * 0.25, 0.2),
        h * 0.18,
        h * 0.6,
        h * 0.18,
        turn,
        0,
        tone(second, accent, ctx),
      );
      return;
    case "cave":
      put("blob", x, y + h * 0.35, z, h * 0.8, h * 0.55, h * 0.6, turn, 0.1, body);
      put("blob", ...offsetArgs(ctx, 0, h * 0.5), h * 0.35, h * 0.3, h * 0.08, turn, 0, DARK);
      return;
    case "scree":
      chips(put, ctx, 5, 1.7, 0.45 * size, body, 220);
      return;
    case "tideRock":
      put("rock", x, y + h * 0.25, z, h * 0.65, h * 0.45, h * 0.55, turn, 0, body);
      chips(put, ctx, 2, h * 0.6, 0.22, tone(second, accent, ctx), 230);
      return;
    case "shells":
      chips(put, ctx, 4, 1.3, 0.16, body, 240);
      chips(put, ctx, 2, 1.3, 0.14, tone(second, accent, ctx), 250);
      return;
    case "ripple":
      // 수면 물결(물 위 소품): 납작한 흰 조각 셋
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (ctx.r(260 + k) - 0.5) * 2.6, (k - 1) * 0.9);
        put("chip", spot.x, y + 0.03, spot.z, 1 * size, 0.02, 0.18, turn, 0, k === 1 ? FOAM : body);
      }
      return;
    case "kelp":
      // 해초 숲: 수면에 뜬 잎 덩이 + 수면 위로 나온 잎
      for (let k = 0; k < 2; k++) {
        const spot = at(ctx, (ctx.r(270 + k) - 0.5) * 2.4, (ctx.r(275 + k) - 0.5) * 2.4);
        put("blob", spot.x, y + 0.02, spot.z, 0.7 * size, 0.05, 0.4 * size, turn + k, 0, body);
      }
      blades(put, ctx, 4, h, 1, tone(second, accent, ctx), 280, y);
      return;
    case "coral":
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (ctx.r(290 + k) - 0.5) * 2.2, (ctx.r(295 + k) - 0.5) * 2.2);
        const color = k % 2 === 0 ? body : tone(second, accent, ctx);
        put("blob", spot.x, y - 0.05, spot.z, 0.5 * size, h, 0.45 * size, turn + k, 0, color);
      }
      return;
    case "wreck": {
      // 난파선: 기운 선체 + 부러진 돛대 + 떠 있는 조각
      put("blob", x, y + h * 0.1, z, 3.4 * size, h * 0.5, 1.1 * size, turn, 0.25, body);
      put("stem", x, y, z, 0.12, h * 2.4, 0.12, turn, 0.5, WOOD);
      chips(put, ctx, 2, 3, 0.35, tone(second, accent, ctx), 300, true);
      return;
    }
    case "seaMarker":
      // 해저 광맥·해저 석유(추후 자원 자리): 수면에 뜬 무늬
      disc(put, ctx, 1.8 * size, 1.4 * size, 0.01, body);
      chips(put, ctx, 3, 1.5, 0.22, tone(second, accent, ctx), 310, true);
      return;
    case "fish":
      // 어군(정지 그림 — 움직이는 어군은 schoolView가 그린다): 수면 위 지느러미 조각
      chips(put, ctx, 5, 1.6, 0.25 * size, body, 320, true);
      return;
    case "vent":
      put("cone", x, y - h * 0.3, z, 0.9 * size, h, 0.9 * size, turn, 0, body);
      put("blob", x, y + h * 0.9, z, 0.8 * size, h * 0.6, 0.8 * size, turn, 0, tone(second, accent, ctx));
      return;
    case "iceberg":
      put("rock", x, y + h * 0.25, z, h * 0.7, h * 0.6, h * 0.55, turn, 0, body);
      put(
        "chip",
        ...offsetArgs(ctx, h * 0.6, 0.4),
        h * 0.35,
        h * 0.45,
        h * 0.3,
        turn + 1,
        0,
        tone(second, accent, ctx),
      );
      return;
    case "current":
      for (let k = 0; k < 4; k++) {
        const spot = at(ctx, (ctx.r(330 + k) - 0.5) * 1.2, (k - 1.5) * 0.7);
        put("chip", spot.x, y + 0.02, spot.z, 2.2 * size, 0.015, 0.12, turn, 0, k % 2 === 0 ? body : FOAM);
      }
      return;
    case "lily":
      for (let k = 0; k < 3; k++) {
        const spot = at(ctx, (ctx.r(340 + k) - 0.5) * 2, (ctx.r(345 + k) - 0.5) * 2);
        put("blob", spot.x, y + 0.02, spot.z, 0.45 * size, 0.03, 0.45 * size, turn + k, 0, body);
      }
      chips(put, ctx, 1, 0.6, 0.18, tone(second, accent, ctx), 350, true);
      return;
    case "mudFlat":
      disc(put, ctx, 2.4 * size, 1.8 * size, 0.01, body);
      chips(put, ctx, 3, 2, 0.2, tone(second, accent, ctx), 360);
      return;
    default:
      put("chip", x, y + 0.1, z, 0.3, 0.2, 0.3, turn, 0, body);
  }
}

/** 칸 안 옮김 → put의 (x, y, z) 앞 세 인자(땅 높이에 붙임) */
function offsetArgs(ctx: ShapeContext, dx: number, dz: number): [number, number, number] {
  const spot = at(ctx, dx, dz);
  return [spot.x, ctx.ground(spot.x, spot.z), spot.z];
}

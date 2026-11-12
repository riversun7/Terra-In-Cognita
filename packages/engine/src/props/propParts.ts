// 2차맵 소품 모델을 짓는 부분(부품) — propView.ts가 부품마다 InstancedMesh 하나로 그린다(ADR 46 "바뀜 (2026-11-11)").
// - 부품은 모양(기하)으로 나눈다: 줄기(원기둥)·원뿔·잎(세모 뿔)·바위(십이면체)·덩이(이십면체)·조각(팔면체). 소품 종류가 18가지라도
//   그리기 호출은 부품 수(6번)를 넘지 않는다(전에는 모양마다 하나라 8번). 색은 인스턴스마다 다르다.
// - 자리·크기·돌림·변형은 칸 해시(r)로 정한다. 장식이라 Math를 써도 된다(판정 아님). 같은 2차맵이면 같은 소금이라 같은 모습이다.
// - 삼각형: 줄기 20·원뿔 12·잎 3·바위 36·덩이 20·조각 8. 나무 한 그루 약 40, 풀 한 포기(잎 셋) 9 — 가시거리 표의 "모델 약 40삼각형" 안.
import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
} from "three";
import type { ClutterKind, PropLook } from "./propLook.ts";

/** 부품(기하) 종류 */
export type Part = "stem" | "cone" | "blade" | "rock" | "blob" | "chip";

export const PARTS: readonly Part[] = ["stem", "cone", "blade", "rock", "blob", "chip"];

/** 부품 기하(바닥이 y = 0이 되게 올린 것은 줄기·원뿔·잎. 바위·덩이·조각은 가운데가 원점) */
export function partGeometry(part: Part): BufferGeometry {
  switch (part) {
    case "stem":
      return new CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0);
    case "cone":
      return new ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
    case "blade":
      // 밑면 없는 세모 뿔(삼각형 3개): 풀잎·고사리 잎·갈대 줄기
      return new ConeGeometry(1, 1, 3, 1, true).translate(0, 0.5, 0);
    case "rock":
      return new DodecahedronGeometry(1, 0);
    case "chip":
      return new OctahedronGeometry(1, 0);
    default:
      return new IcosahedronGeometry(1, 0);
  }
}

/** 부품 하나를 놓는 곳(propView가 InstancedMesh에 쓴다). yaw = 세로축 돌림, tilt = 그 뒤 옆(z)축 기울임(라디안) */
export type PartSink = (
  part: Part,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  tilt: number,
  color: Color,
) => void;

/** 모델 하나를 지을 때 쓰는 값 */
export interface ShapeContext {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 크기 배율(0.8 ~ 1.25) */
  readonly size: number;
  /** 방위(라디안) */
  readonly turn: number;
  /** 밝기 배율(0.85 ~ 1.15) */
  readonly shade: number;
  /** 지표가 눈·얼음(나무·바위에 눈을 얹는다) */
  readonly snowy: boolean;
  /** 칸 해시(0 ~ 1), k마다 다른 값 */
  readonly r: (k: number) => number;
  /** 세계 (x, z)의 땅 높이(m) — 칸 안에서 흩어 놓는 작은 것(돌·풀)이 땅에 붙게 */
  readonly ground: (x: number, z: number) => number;
}

const TRUNK = new Color(0.42, 0.32, 0.22);
const BIRCH_TRUNK = new Color(0.86, 0.85, 0.8);
const DEAD_WOOD = new Color(0.5, 0.45, 0.4);
const SNOW = new Color(0.93, 0.95, 0.97);
/** 꽃 색(한 칸은 한 가지 색 — 꽃밭이 덩이로 보이게) */
const BLOSSOMS: readonly (readonly [number, number, number])[] = [
  [0.98, 0.86, 0.3],
  [0.97, 0.97, 0.94],
  [0.95, 0.55, 0.7],
  [0.66, 0.52, 0.9],
  [0.9, 0.32, 0.28],
];
const MUSHROOM_CAP = new Color(0.78, 0.26, 0.2);

/** 다시 쓰는 색(부를 때마다 덮어쓴다 — sink가 바로 복사한다) */
const tint = new Color();
const extra = new Color();

/** 방위 turn으로 돌린 칸 안 옮김(dx, dz) → 세계 옮김 */
function offset(ctx: ShapeContext, dx: number, dz: number): { x: number; z: number } {
  const c = Math.cos(ctx.turn);
  const s = Math.sin(ctx.turn);
  return { x: ctx.x + dx * c + dz * s, z: ctx.z - dx * s + dz * c };
}

/** 겉모습 색 × 밝기 × 배율(rgb) */
function shaded(look: PropLook, ctx: ShapeContext, mr = 1, mg = 1, mb = 1): Color {
  return tint.setRGB(
    look.color[0] * ctx.shade * mr,
    look.color[1] * ctx.shade * mg,
    look.color[2] * ctx.shade * mb,
  );
}

/** 풀잎 count개 다발: 반지름 spread(m) 안에 흩고 조금씩 기울인다 */
function bladeTuft(
  put: PartSink,
  ctx: ShapeContext,
  cx: number,
  cz: number,
  count: number,
  height: number,
  width: number,
  spread: number,
  color: Color,
  salt: number,
): void {
  for (let k = 0; k < count; k++) {
    const angle = ctx.turn + (k * Math.PI * 2) / count + ctx.r(salt + k) * 0.8;
    const d = spread * (0.3 + 0.7 * ctx.r(salt + 10 + k));
    const x = cx + Math.cos(angle) * d;
    const z = cz + Math.sin(angle) * d;
    const h = height * (0.7 + 0.6 * ctx.r(salt + 20 + k));
    put(
      "blade",
      x,
      ctx.ground(x, z),
      z,
      width,
      h,
      width * 0.6,
      angle,
      (ctx.r(salt + 30 + k) - 0.5) * 0.5,
      color,
    );
  }
}

/** 소품 그림 하나의 모델 */
export function buildShape(put: PartSink, look: PropLook, ctx: ShapeContext): void {
  const { x, y, z, size, turn } = ctx;
  const h = look.heightM * size;
  const variant = ctx.r(6);
  switch (look.shape) {
    case "broadleaf": {
      if (variant < 0.55) {
        // 둥근 갓
        put("stem", x, y, z, 0.28 * size, h * 0.45, 0.28 * size, turn, 0, TRUNK);
        put("blob", x, y + h * 0.62, z, h * 0.28, h * 0.3, h * 0.28, turn, 0, shaded(look, ctx));
      } else if (variant < 0.8) {
        // 두 층 갓(키 큰 활엽수)
        put("stem", x, y, z, 0.3 * size, h * 0.55, 0.3 * size, turn, 0, TRUNK);
        put(
          "blob",
          x,
          y + h * 0.52,
          z,
          h * 0.3,
          h * 0.24,
          h * 0.3,
          turn,
          0,
          shaded(look, ctx, 0.92, 0.95, 0.92),
        );
        put(
          "blob",
          x,
          y + h * 0.8,
          z,
          h * 0.2,
          h * 0.2,
          h * 0.2,
          turn + 1,
          0,
          shaded(look, ctx, 1.05, 1.06, 1),
        );
      } else {
        // 자작나무 같은 흰 줄기·좁은 갓
        put("stem", x, y, z, 0.2 * size, h * 0.7, 0.2 * size, turn, 0, BIRCH_TRUNK);
        put(
          "blob",
          x,
          y + h * 0.72,
          z,
          h * 0.17,
          h * 0.28,
          h * 0.17,
          turn,
          0,
          shaded(look, ctx, 1.25, 1.12, 0.8),
        );
      }
      return;
    }
    case "conifer": {
      const cap = ctx.snowy;
      if (variant < 0.5) {
        // 두 층 가문비
        put("stem", x, y, z, 0.25 * size, h * 0.2, 0.25 * size, turn, 0, TRUNK);
        put("cone", x, y + h * 0.12, z, h * 0.2, h * 0.55, h * 0.2, turn, 0, shaded(look, ctx));
        put(
          "cone",
          x,
          y + h * 0.45,
          z,
          h * 0.14,
          h * 0.55,
          h * 0.14,
          turn + 0.5,
          0,
          cap ? SNOW : shaded(look, ctx, 1.06, 1.06, 1.04),
        );
      } else if (variant < 0.82) {
        put("stem", x, y, z, 0.25 * size, h * 0.2, 0.25 * size, turn, 0, TRUNK);
        put("cone", x, y + h * 0.15, z, h * 0.18, h * 0.85, h * 0.18, turn, 0, shaded(look, ctx));
        if (cap) put("cone", x, y + h * 0.72, z, h * 0.07, h * 0.28, h * 0.07, turn, 0, SNOW);
      } else {
        // 가는 소나무: 긴 줄기, 위쪽만 잎
        put("stem", x, y, z, 0.22 * size, h * 0.6, 0.22 * size, turn, 0, TRUNK);
        put(
          "cone",
          x,
          y + h * 0.45,
          z,
          h * 0.12,
          h * 0.55,
          h * 0.12,
          turn,
          0,
          cap ? SNOW : shaded(look, ctx, 0.9, 1, 0.95),
        );
      }
      return;
    }
    case "palm": {
      // 줄기를 조금 기울이고(바닷바람) 갓을 그 끝에
      const lean = 0.08 + variant * 0.14;
      const top = offset(ctx, h * 0.85 * Math.sin(lean), 0);
      put("stem", x, y, z, 0.2 * size, h * 0.85, 0.2 * size, turn, -lean, TRUNK);
      put(
        "blob",
        top.x,
        y + h * 0.85 * Math.cos(lean),
        top.z,
        h * 0.32,
        h * 0.08,
        h * 0.32,
        turn,
        0,
        shaded(look, ctx),
      );
      return;
    }
    case "bush":
      put("blob", x, y + h * 0.35, z, h * 0.75, h * 0.5, h * 0.75, turn, 0, shaded(look, ctx));
      if (variant < 0.5) {
        const side = offset(ctx, h * 0.6, 0);
        put(
          "blob",
          side.x,
          y + h * 0.25,
          side.z,
          h * 0.45,
          h * 0.35,
          h * 0.45,
          turn,
          0,
          shaded(look, ctx, 1.08, 1.04, 1),
        );
      }
      return;
    case "reeds":
      bladeTuft(put, ctx, x, z, 5, h, 0.12 * size, 0.8, shaded(look, ctx), 40);
      return;
    case "boulder":
      put(
        "rock",
        x,
        y + h * 0.25,
        z,
        h * 0.55,
        h * 0.4,
        h * 0.5,
        turn,
        0,
        ctx.snowy ? extra.copy(SNOW).multiplyScalar(0.92) : shaded(look, ctx),
      );
      return;
    case "log":
      put("stem", x, y + h * 0.4, z, h * 0.45, 3.5 * size, h * 0.45, turn, Math.PI / 2, shaded(look, ctx));
      return;
    case "cactus": {
      const body = shaded(look, ctx);
      if (variant < 0.65) {
        // 기둥 선인장 + 팔 하나·둘
        put("stem", x, y, z, 0.26 * size, h, 0.26 * size, turn, 0, body);
        const arms = variant < 0.35 ? 2 : 1;
        for (let k = 0; k < arms; k++) {
          const side = k === 0 ? 1 : -1;
          const arm = offset(ctx, side * 0.5 * size, 0);
          const lift = h * (0.35 + 0.15 * ctx.r(50 + k));
          put("stem", arm.x, y + lift, arm.z, 0.17 * size, h * 0.35, 0.17 * size, turn, 0, body);
        }
      } else {
        // 둥근 통 선인장(꽃 하나)
        put("blob", x, y + h * 0.15, z, h * 0.2, h * 0.17, h * 0.2, turn, 0, body);
        put("chip", x, y + h * 0.33, z, 0.12, 0.08, 0.12, turn, 0, extra.setRGB(0.95, 0.5, 0.6));
      }
      return;
    }
    case "dryShrub": {
      const color = shaded(look, ctx);
      put("blob", x, y + h * 0.3, z, h * 0.7, h * 0.35, h * 0.7, turn, 0, color);
      bladeTuft(put, ctx, x, z, 3, h * 0.9, 0.06, 0.45, color, 60);
      return;
    }
    case "tallGrass":
      bladeTuft(put, ctx, x, z, 6, h, 0.16 * size, 1.4, shaded(look, ctx), 70);
      return;
    case "flowers": {
      bladeTuft(put, ctx, x, z, 3, h * 0.8, 0.08, 1.1, shaded(look, ctx), 80);
      const [rr, gg, bb] = BLOSSOMS[Math.floor(ctx.r(9) * BLOSSOMS.length)] ?? [1, 1, 1];
      const petal = extra.setRGB(rr, gg, bb);
      for (let k = 0; k < 4; k++) {
        const spot = offset(ctx, (ctx.r(90 + k) - 0.5) * 2.2, (ctx.r(95 + k) - 0.5) * 2.2);
        const g = ctx.ground(spot.x, spot.z);
        put(
          "chip",
          spot.x,
          g + h * (0.6 + 0.4 * ctx.r(100 + k)),
          spot.z,
          0.13,
          0.08,
          0.13,
          turn + k,
          0,
          petal,
        );
      }
      return;
    }
    case "stones": {
      const count = 2 + Math.floor(variant * 3);
      for (let k = 0; k < count; k++) {
        const spot = offset(ctx, (ctx.r(110 + k) - 0.5) * 2.6, (ctx.r(115 + k) - 0.5) * 2.6);
        const s = h * (0.45 + 0.8 * ctx.r(120 + k));
        const color = ctx.snowy
          ? extra.copy(SNOW).multiplyScalar(0.94)
          : shaded(look, ctx, 0.9 + 0.2 * ctx.r(125 + k));
        // 큰 돌 하나만 십이면체, 나머지는 작은 조각(삼각형 아끼기)
        put(
          k === 0 ? "rock" : "chip",
          spot.x,
          ctx.ground(spot.x, spot.z) + s * 0.2,
          spot.z,
          s,
          s * 0.65,
          s * 0.85,
          turn + k * 1.7,
          0,
          color,
        );
      }
      return;
    }
    case "driftwood": {
      const wood = shaded(look, ctx);
      put("stem", x, y + 0.15 * size, z, 0.16 * size, 3.2 * size, 0.16 * size, turn, Math.PI / 2, wood);
      if (variant < 0.5) {
        const branch = offset(ctx, 0.6, 0.4);
        put("stem", branch.x, y + 0.12, branch.z, 0.08, 1.3 * size, 0.08, turn + 0.9, Math.PI / 2, wood);
      }
      return;
    }
    case "termiteMound": {
      const earth = shaded(look, ctx);
      put("cone", x, y, z, 0.75 * size, h, 0.75 * size, turn, 0, earth);
      const side = offset(ctx, 0.7 * size, 0.2);
      put("cone", side.x, y, side.z, 0.45 * size, h * 0.55, 0.45 * size, turn, 0, earth);
      return;
    }
    case "deadTree": {
      put("stem", x, y, z, 0.2 * size, h, 0.2 * size, turn, 0, DEAD_WOOD);
      for (let k = 0; k < 3; k++) {
        const yaw = turn + (k * Math.PI * 2) / 3 + ctx.r(130 + k);
        put(
          "stem",
          x,
          y + h * (0.45 + 0.15 * k),
          z,
          0.08 * size,
          h * 0.35,
          0.08 * size,
          yaw,
          0.7 + 0.3 * ctx.r(135 + k),
          DEAD_WOOD,
        );
      }
      return;
    }
    case "fern": {
      // 고사리: 잎 다섯을 바깥으로 눕힌 다발
      const leaf = shaded(look, ctx);
      for (let k = 0; k < 5; k++) {
        const yaw = turn + (k * Math.PI * 2) / 5;
        put("blade", x, y, z, 0.22 * size, h * (0.8 + 0.4 * ctx.r(140 + k)), 0.06, yaw, 0.85, leaf);
      }
      return;
    }
    case "iceBlock": {
      const ice = shaded(look, ctx);
      put("rock", x, y + h * 0.35, z, h * 0.4, h * 0.6, h * 0.35, turn, 0, ice);
      if (variant < 0.5) {
        const side = offset(ctx, h * 0.5, 0.3);
        put("rock", side.x, y + h * 0.2, side.z, h * 0.25, h * 0.35, h * 0.25, turn + 1, 0, ice);
      }
      return;
    }
    case "outcrop": {
      // 땅에서 비죽 나온 바위: 낮고 넓은 큰 바위 + 옆 바위 조각 + 윗면에 광맥 조각 셋(노두, 질문 1083 나 — 삼각형 아끼기)
      const stone = ctx.snowy ? extra.copy(SNOW).multiplyScalar(0.92) : shaded(look, ctx);
      put("rock", x, y + h * 0.18, z, h * 0.95, h * 0.5, h * 0.75, turn, 0.12, stone);
      const side = offset(ctx, h * 0.75, (variant - 0.5) * h);
      put(
        "chip",
        side.x,
        ctx.ground(side.x, side.z) + h * 0.1,
        side.z,
        h * 0.45,
        h * 0.35,
        h * 0.4,
        turn + 2,
        0,
        shaded(look, ctx, 0.92, 0.92, 0.92),
      );
      const vein = look.vein ?? look.color;
      for (let k = 0; k < 3; k++) {
        const spot = offset(ctx, (ctx.r(160 + k) - 0.5) * h * 0.9, (ctx.r(165 + k) - 0.5) * h * 0.6);
        put(
          "chip",
          spot.x,
          y + h * (0.42 + 0.1 * ctx.r(170 + k)),
          spot.z,
          h * 0.18,
          h * 0.12,
          h * 0.16,
          turn + k * 2.1,
          0,
          extra.setRGB(vein[0] * ctx.shade, vein[1] * ctx.shade, vein[2] * ctx.shade),
        );
      }
      return;
    }
    case "bones": {
      const bone = shaded(look, ctx);
      for (let k = 0; k < 3; k++) {
        const spot = offset(ctx, (k - 1) * 0.35, (ctx.r(150 + k) - 0.5) * 0.6);
        put("stem", spot.x, y + 0.05, spot.z, 0.05, 0.9 * size, 0.05, turn + k * 0.5, Math.PI / 2, bone);
      }
      put("chip", x, y + 0.12, z, 0.22, 0.16, 0.26, turn, 0, bone);
      return;
    }
    default: {
      const unknown: never = look.shape;
      void unknown;
    }
  }
}

/** 숲 아래 덤불(성긴 숲에서 나무를 그리지 않은 칸): 고사리나 버섯 */
export function buildUndergrowth(put: PartSink, ctx: ShapeContext, leafColor: Color): void {
  if (ctx.r(160) < 0.6) {
    for (let k = 0; k < 3; k++)
      put(
        "blade",
        ctx.x,
        ctx.y,
        ctx.z,
        0.16,
        0.6 + 0.3 * ctx.r(161 + k),
        0.05,
        ctx.turn + k * 2.1,
        0.9,
        leafColor,
      );
    return;
  }
  for (let k = 0; k < 2; k++) {
    const spot = offset(ctx, (ctx.r(165 + k) - 0.5) * 0.8, (ctx.r(167 + k) - 0.5) * 0.8);
    put(
      "chip",
      spot.x,
      ctx.ground(spot.x, spot.z) + 0.12,
      spot.z,
      0.14,
      0.07,
      0.14,
      ctx.turn,
      0,
      MUSHROOM_CAP,
    );
  }
}

/** 땅 잔소품 색 */
const CLUTTER_COLOR: Readonly<Record<ClutterKind, readonly [number, number, number]>> = {
  tuft: [0.42, 0.62, 0.3],
  sedge: [0.33, 0.45, 0.26],
  pebbles: [0.55, 0.54, 0.52],
  shell: [0.94, 0.9, 0.84],
  snowLump: [0.93, 0.95, 0.98],
  iceShard: [0.76, 0.88, 0.96],
  cattail: [0.45, 0.55, 0.3],
  blossom: [0.98, 0.86, 0.3],
};

/** 땅 잔소품 하나(작게, 가까이만) */
export function buildClutter(put: PartSink, kind: ClutterKind, ctx: ShapeContext): void {
  const [cr, cg, cb] = CLUTTER_COLOR[kind];
  const color = tint.setRGB(cr * ctx.shade, cg * ctx.shade, cb * ctx.shade);
  const { x, y, z, turn } = ctx;
  switch (kind) {
    case "tuft":
      bladeTuft(put, ctx, x, z, 3, 0.45 * ctx.size, 0.07, 0.25, color, 170);
      return;
    case "sedge":
      bladeTuft(put, ctx, x, z, 3, 0.7 * ctx.size, 0.06, 0.2, color, 175);
      return;
    case "blossom":
      put("blade", x, y, z, 0.04, 0.35, 0.04, turn, 0, extra.setRGB(0.4, 0.6, 0.3));
      put("chip", x, y + 0.38, z, 0.1, 0.06, 0.1, turn, 0, color);
      return;
    case "pebbles":
      for (let k = 0; k < 2; k++) {
        const spot = offset(ctx, (ctx.r(180 + k) - 0.5) * 1.6, (ctx.r(182 + k) - 0.5) * 1.6);
        const s = 0.12 + 0.18 * ctx.r(184 + k);
        put(
          "chip",
          spot.x,
          ctx.ground(spot.x, spot.z) + s * 0.3,
          spot.z,
          s,
          s * 0.6,
          s * 0.8,
          turn + k,
          0,
          color,
        );
      }
      return;
    case "shell":
      put("chip", x, y + 0.03, z, 0.09, 0.04, 0.07, turn, 0, color);
      return;
    case "snowLump":
      put("chip", x, y + 0.05, z, 0.45 * ctx.size, 0.18, 0.35 * ctx.size, turn, 0, color);
      return;
    case "iceShard":
      put("chip", x, y + 0.2, z, 0.18, 0.45, 0.14, turn, 0.2, color);
      return;
    case "cattail":
      // 부들: 잎 둘 + 갈색 이삭(물 위로 솟는다)
      bladeTuft(put, ctx, x, z, 2, 1.6 * ctx.size, 0.05, 0.2, color, 190);
      put("chip", x, y + 1.5 * ctx.size, z, 0.05, 0.16, 0.05, turn, 0, extra.setRGB(0.4, 0.27, 0.16));
      return;
    default: {
      const unknown: never = kind;
      void unknown;
    }
  }
}

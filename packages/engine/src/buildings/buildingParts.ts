// 건물 모델 조각 — 순수 코드(three를 쓰지 않는다, 시험 대상). 모델은 단위 도형(상자·박공 지붕·사각뿔·원기둥·원뿔·반구·창문 빛)
// 조각의 목록이고, 그리기(buildingView.ts)는 도형마다 InstancedMesh 하나로 모든 건물의 조각을 한 번에 그린다(그리기 호출 = 도형 수).
// 좌표(로컬, m): 바닥 판 가운데가 원점, x 오른쪽, y 위, z 앞(건물 앞면 = 문 쪽). 조각 자리는 "바닥 가운데"다.
// 돌림(turn)은 세로축 라디안(three rotateY와 같은 방향). 눕힘(lay)은 원기둥 같은 도형의 세로축을 로컬 x로 눕힌다(통나무):
// 그때도 sx = x 방향 길이, sy = 높이(굵기), sz = z 방향 굵기라서 경계 셈이 같다.
// 장식이라 Math를 써도 된다(판정 아님). 같은 입력이면 같은 조각이 나온다(건물 ID로 씨앗).
import type { Rgb } from "./buildingPalette.ts";
import { BUILDING_COLORS as C } from "./buildingPalette.ts";

/** 단위 도형(모두 [-0.5, 0.5]³ 상자 안, 그리기에서 바닥이 y에 오게 옮긴다) */
export type PartShape = "box" | "gable" | "pyramid" | "cylinder" | "cone" | "dome" | "glow";

export const PART_SHAPES: readonly PartShape[] = [
  "box",
  "gable",
  "pyramid",
  "cylinder",
  "cone",
  "dome",
  "glow",
];

export interface BuildingPart {
  readonly shape: PartShape;
  /** 바닥 가운데(로컬 m) */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 크기(m): x 폭, 높이, z 깊이(눕힌 도형은 sx가 길이) */
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** 세로축 돌림(라디안) */
  readonly turn: number;
  /** 눕힘(세로축 → 로컬 x) */
  readonly lay: boolean;
  /** 색(0~1). 창문 빛(glow)은 밝기·빛 색 */
  readonly color: Rgb;
  /** 바닥 판: 그릴 때 아래를 비탈의 가장 낮은 땅까지 늘린다 */
  readonly ground: boolean;
}

/** 바닥 판 두께(m) — 다른 조각은 이 위(FLOOR_M)에 선다 */
export const FLOOR_M = 0.3;
/** 판 가장자리에서 건물까지 띄우는 기본 거리(m) */
export const MARGIN_M = 0.6;

/** 로컬 경계 상자(돌림을 본 것) */
export interface PartBounds {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

export function partBounds(part: BuildingPart): PartBounds {
  const c = Math.abs(Math.cos(part.turn));
  const s = Math.abs(Math.sin(part.turn));
  const hx = (c * part.sx + s * part.sz) / 2;
  const hz = (s * part.sx + c * part.sz) / 2;
  return {
    x0: part.x - hx,
    x1: part.x + hx,
    y0: part.y,
    y1: part.y + part.sy,
    z0: part.z - hz,
    z1: part.z + hz,
  };
}

/** 씨앗 난수(0 ≤ 값 < 1) — mulberry32. 장식 변화(좌우 뒤집기·색 고르기·흔들기)에만 쓴다 */
export function seededRandom(seed: number): () => number {
  let state = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface PartOptions {
  readonly turn?: number;
  readonly lay?: boolean;
  readonly ground?: boolean;
}

/** 지붕 모양: 박공(용마루가 x·z를 따라)·모임(사각뿔)·평지붕 */
export type RoofStyle = "gable-x" | "gable-z" | "hip" | "flat";

/** 집 한 채(벽 + 지붕 + 문 + 창문)의 자리와 모양 */
export interface HouseSpec {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly wallH: number;
  readonly roofH: number;
  readonly wall: Rgb;
  readonly roof: Rgb;
  readonly style: RoofStyle;
  /** 앞문 폭(m, 0이면 문 없음)과 높이 */
  readonly doorW?: number;
  readonly doorH?: number;
  /** 문 가로 자리(집 가운데 기준, 기본 0) */
  readonly doorX?: number;
  /** 창문(기본 있음) */
  readonly windows?: boolean;
  /** 용마루 띠 색(국가 색, 박공만) */
  readonly ridge?: Rgb | null;
  /** 지붕 처마 밖으로 내민 길이(m, 기본 0.3) */
  readonly eave?: number;
  /** 벽 밑 높이(기본 바닥 판 위) */
  readonly baseY?: number;
}

/** 조각 목록 — 도우미가 조각을 더한다 */
export class PartList {
  readonly parts: BuildingPart[] = [];
  /** 창문 밝기(켜짐·꺼짐) — 상태가 정한다 */
  windowColor: Rgb = [1, 1, 1];

  add(
    shape: PartShape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: Rgb,
    options: PartOptions = {},
  ): void {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    this.parts.push({
      shape,
      x,
      y,
      z,
      sx,
      sy,
      sz,
      turn: options.turn ?? 0,
      lay: options.lay ?? false,
      color,
      ground: options.ground ?? false,
    });
  }

  /** 바닥 판(판 전체, 비탈이면 아래로 늘어난다) */
  pad(width: number, depth: number, color: Rgb): void {
    this.add("box", 0, 0, 0, width, FLOOR_M, depth, color, { ground: true });
  }

  /** 집 한 채. 지붕 꼭대기 높이(m)를 돌려준다 */
  house(spec: HouseSpec): number {
    const base = spec.baseY ?? FLOOR_M;
    const { x, z, w, d, wallH } = spec;
    this.add("box", x, base, z, w, wallH, d, spec.wall);
    const top = base + wallH;
    const eave = spec.eave ?? 0.3;
    const rw = w + eave * 2;
    const rd = d + eave * 2;
    switch (spec.style) {
      case "gable-x":
        this.add("gable", x, top, z, rw, spec.roofH, rd, spec.roof);
        if (spec.ridge) this.add("box", x, top + spec.roofH - 0.12, z, rw, 0.3, 0.36, spec.ridge);
        break;
      case "gable-z":
        this.add("gable", x, top, z, rd, spec.roofH, rw, spec.roof, { turn: Math.PI / 2 });
        if (spec.ridge) this.add("box", x, top + spec.roofH - 0.12, z, 0.36, 0.3, rd, spec.ridge);
        break;
      case "hip":
        this.add("pyramid", x, top, z, rw, spec.roofH, rd, spec.roof);
        break;
      case "flat":
        this.add("box", x, top, z, w + 0.3, 0.35, d + 0.3, spec.roof);
        break;
      default: {
        const unknown: never = spec.style;
        void unknown;
      }
    }
    const doorW = spec.doorW ?? Math.min(1.6, w * 0.3);
    const doorH = Math.min(spec.doorH ?? 2.3, wallH * 0.8);
    const doorX = x + (spec.doorX ?? 0);
    if (doorW > 0) this.add("box", doorX, base, z + d / 2, doorW, doorH, 0.22, C.trim);
    if (spec.windows !== false)
      this.windows(x, z, w, d, base, wallH, doorW > 0 ? { x: doorX, w: doorW } : null);
    return top + (spec.style === "flat" ? 0.35 : spec.roofH);
  }

  /** 벽 네 면의 창문(빛나는 조각). 층마다 한 줄(3m), 문 자리는 비운다 */
  windows(
    x: number,
    z: number,
    w: number,
    d: number,
    base: number,
    wallH: number,
    door: { x: number; w: number } | null,
  ): void {
    const rows = Math.max(1, Math.floor((wallH - 0.6) / 3));
    const winW = 1;
    const winH = 1.1;
    const depth = 0.14;
    for (let row = 0; row < rows; row++) {
      const y = base + 1.15 + row * 3;
      if (y + winH > base + wallH - 0.25) break;
      // 앞·뒤 면(x를 따라)
      for (const sign of [1, -1]) {
        for (const at of spots(w, winW)) {
          const wx = x + at;
          if (sign === 1 && row === 0 && door && Math.abs(wx - door.x) < door.w / 2 + winW / 2 + 0.25)
            continue;
          this.add("glow", wx, y, z + (sign * d) / 2, winW, winH, depth, this.windowColor);
        }
      }
      // 옆 면(z를 따라)
      for (const sign of [1, -1]) {
        for (const at of spots(d, winW)) {
          this.add("glow", x + (sign * w) / 2, y, z + at, depth, winH, winW, this.windowColor);
        }
      }
    }
  }

  /** 깃대 + 국가 색 깃발 */
  flag(x: number, z: number, poleH: number, color: Rgb): void {
    this.add("cylinder", x, FLOOR_M, z, 0.16, poleH, 0.16, C.metal);
    this.add("box", x + 0.85, FLOOR_M + poleH - 1.15, z, 1.6, 1, 0.08, color);
  }

  /** 상자 더미(1 ~ count개를 쌓고 흔든다) */
  crates(x: number, z: number, count: number, random: () => number, size = 1.1): void {
    for (let i = 0; i < count; i++) {
      const layer = i < 3 ? 0 : 1;
      const slot = i % 3;
      const ox = layer === 0 ? (slot - 1) * size * 1.05 : (slot - 0.5) * size * 1.05;
      if (layer === 1 && slot === 2) break;
      this.add("box", x + ox, FLOOR_M + layer * size, z, size, size, size, C.crate, {
        turn: (random() - 0.5) * 0.5,
      });
    }
  }

  /** 통 하나 */
  barrel(x: number, z: number): void {
    this.add("cylinder", x, FLOOR_M, z, 0.8, 1.05, 0.8, C.barrel);
  }

  /** 통나무 더미(x를 따라 누움): 아래 줄부터 rows줄, 줄마다 하나씩 준다 */
  logPile(x: number, z: number, length: number, rows: number, turn = 0): void {
    const dia = 0.72;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    for (let row = 0; row < rows; row++) {
      const count = rows - row;
      for (let i = 0; i < count; i++) {
        // 더미 안 자리(가로 z 방향으로 늘어놓는다) → 돌림
        const local = (i - (count - 1) / 2) * dia;
        this.add(
          "cylinder",
          x + s * local,
          FLOOR_M + row * dia * 0.86,
          z + c * local,
          length,
          dia,
          dia,
          C.log,
          {
            lay: true,
            turn,
          },
        );
      }
    }
  }

  /** 무너진 돌 조각 count개(가운데 x·z, 퍼짐 반경 radius 안) */
  rubble(x: number, z: number, count: number, radius: number, random: () => number): void {
    for (let i = 0; i < count; i++) {
      const size = 0.6 + random() * 0.9;
      const angle = random() * Math.PI * 2;
      const r = random() * radius;
      const shape: PartShape = i % 3 === 0 ? "pyramid" : "box";
      this.add(
        shape,
        x + Math.cos(angle) * r,
        FLOOR_M,
        z + Math.sin(angle) * r,
        size,
        size * 0.7,
        size * 0.8,
        C.rubble,
        {
          turn: random() * Math.PI,
        },
      );
    }
  }

  /** 짓는 중 뼈대: 기둥(모서리 + 4.5m마다)·위아래 들보·낮은 벽 */
  frame(x: number, z: number, w: number, d: number, h: number): void {
    const post = 0.32;
    const xs = spread(w - post, 4.5);
    const zs = spread(d - post, 4.5);
    for (const px of xs) {
      for (const pz of [-(d - post) / 2, (d - post) / 2])
        this.add("box", x + px, FLOOR_M, z + pz, post, h, post, C.scaffold);
    }
    for (const pz of zs.slice(1, -1)) {
      for (const px of [-(w - post) / 2, (w - post) / 2])
        this.add("box", x + px, FLOOR_M, z + pz, post, h, post, C.scaffold);
    }
    for (const y of [FLOOR_M + h - 0.3, FLOOR_M + h * 0.5]) {
      this.add("box", x, y, z - (d - post) / 2, w, 0.3, post, C.scaffold);
      this.add("box", x, y, z + (d - post) / 2, w, 0.3, post, C.scaffold);
      this.add("box", x - (w - post) / 2, y, z, post, 0.3, d, C.scaffold);
      this.add("box", x + (w - post) / 2, y, z, post, 0.3, d, C.scaffold);
    }
    // 뒤쪽과 옆 한쪽은 낮은 벽이 올라가는 중
    this.add("box", x, FLOOR_M, z - (d - post) / 2, w, Math.min(1.4, h * 0.35), post * 1.4, C.wallStone);
    this.add("box", x - (w - post) / 2, FLOOR_M, z, post * 1.4, Math.min(0.9, h * 0.25), d, C.wallStone);
  }

  /** 레벨 올리는 중 비계: 집 둘레 0.7m 밖 기둥과 발판 두 층 */
  scaffold(x: number, z: number, w: number, d: number, h: number): void {
    const out = 0.7;
    const W = w + out * 2;
    const D = d + out * 2;
    for (const px of [-W / 2, W / 2]) {
      for (const pz of [-D / 2, D / 2]) this.add("box", x + px, FLOOR_M, z + pz, 0.2, h, 0.2, C.scaffold);
    }
    for (const y of [FLOOR_M + h * 0.45, FLOOR_M + h - 0.2]) {
      this.add("box", x, y, z + D / 2, W, 0.16, 0.6, C.plank);
      this.add("box", x + W / 2, y, z, 0.6, 0.16, D, C.plank);
    }
  }
}

/** 길이 len 벽에 폭 size 창을 놓을 자리(가운데 기준), 간격 약 3.2m */
function spots(len: number, size: number): number[] {
  const count = Math.floor((len - 1.4) / 3.2);
  if (count <= 0) return len >= size + 1 ? [0] : [];
  const step = len / (count + 1);
  return Array.from({ length: count }, (_, i) => -len / 2 + step * (i + 1));
}

/** 길이 len을 maxStep 이하 간격으로 나눈 점(양 끝 포함, 가운데 기준) */
function spread(len: number, maxStep: number): number[] {
  const count = Math.max(1, Math.ceil(len / maxStep));
  return Array.from({ length: count + 1 }, (_, i) => -len / 2 + (len * i) / count);
}

// 캐릭터 모델 조각 — 순수 코드(three를 쓰지 않는다, 시험 대상). docs/adr/2026-11-11-character-3d.md 2절.
// 모델은 단위 도형 조각의 목록이다. 그리기(characterMeshes.ts)는 도형마다 InstancedMesh 하나로 모든 캐릭터의 조각을 한 번에 그린다.
// 좌표(로컬, m): 두 발 사이 바닥이 원점, x 오른쪽, y 위, z 앞(얼굴 쪽). 조각 자리는 "가운데"다.
// 돌림은 x → y → z 축 차례(라디안, 행렬 = Rz · Ry · Rx — three Euler "ZYX"와 같다. 대부분 한 축만 쓴다).
// 조각은 묶음 여섯(몸·머리·두 팔·두 다리)에 든다. 움직임은 묶음을 그 축(pivot) 둘레로 돌린다(뼈대 없음).

/** 단위 도형(모두 [-0.5, 0.5]³ 상자 안) */
export const CHARACTER_SHAPES = ["box", "taper", "cyl", "cone", "ball", "dome", "wedge", "pyramid"] as const;
export type CharacterShape = (typeof CHARACTER_SHAPES)[number];

/**
 * 도형마다 삼각형 수(characterGeometry.ts가 만드는 지오메트리와 같다 — 시험이 맞춰 본다).
 * box 상자, taper 사다리꼴 기둥(아래 1 × 1, 위 0.72 × 0.72), cyl 6각 기둥, cone 6각 뿔, ball 공(6 × 4), dome 반구(6 × 2, 바닥 없음),
 * wedge 쐐기(아래 1 × 1, 용마루가 x를 따라 위), pyramid 사각뿔
 */
export const SHAPE_TRIANGLES: Readonly<Record<CharacterShape, number>> = {
  box: 12,
  taper: 12,
  cyl: 24,
  cone: 12,
  ball: 36,
  dome: 18,
  wedge: 8,
  pyramid: 6,
};

/** 묶음 번호: 몸(뿌리)·머리·왼팔·오른팔·왼다리·오른다리 */
export const GROUP = { body: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5 } as const;
export type CharacterGroup = (typeof GROUP)[keyof typeof GROUP];
export const GROUP_COUNT = 6;

export interface CharacterPart {
  readonly shape: CharacterShape;
  readonly group: CharacterGroup;
  /** 가운데(로컬 m) */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 크기(m) */
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** 돌림(라디안) */
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  /** 색 0xRRGGBB(sRGB) */
  readonly color: number;
  /** 빛나는 조각(눈·등불): 빛을 받지 않고 밤에도 그대로 보인다 */
  readonly glow: boolean;
}

export interface CharacterModel {
  readonly parts: readonly CharacterPart[];
  /** 묶음마다 돌림 축 자리(x, y, z) — GROUP_COUNT × 3 */
  readonly pivots: readonly number[];
  /** 가장 높은 곳(m)과 가장 넓은 반 너비(m, 팔 포함) */
  readonly heightM: number;
  readonly halfWidthM: number;
  /** 삼각형 수 */
  readonly triangles: number;
}

interface PartOptions {
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly glow?: boolean;
}

/** #RRGGBB 수 두 색을 t(0~1)만큼 섞는다 */
export function mixColor(from: number, to: number, t: number): number {
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.min(255, Math.max(0, Math.round(a + (b - a) * t)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 밝기 배율(1보다 작으면 어둡게, 크면 흰색 쪽으로) */
export function shadeColor(color: number, k: number): number {
  return k <= 1 ? mixColor(0x000000, color, k) : mixColor(color, 0xffffff, Math.min(1, k - 1));
}

/** 조각 목록 — 지금 묶음(group)에 조각을 더한다 */
export class CharacterPartList {
  readonly parts: CharacterPart[] = [];
  group: CharacterGroup = GROUP.body;

  /** 조각 하나(가운데 자리) */
  add(
    shape: CharacterShape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    options: PartOptions = {},
  ): void {
    this.parts.push({
      shape,
      group: this.group,
      x,
      y,
      z,
      sx,
      sy,
      sz,
      rx: options.rx ?? 0,
      ry: options.ry ?? 0,
      rz: options.rz ?? 0,
      color,
      glow: options.glow ?? false,
    });
  }

  /** 좌우 한 쌍(x = ∓x, 돌림 ry·rz는 뒤집는다). 묶음은 왼쪽·오른쪽 것(같으면 지금 묶음) */
  pair(
    left: CharacterGroup,
    right: CharacterGroup,
    shape: CharacterShape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    options: PartOptions = {},
  ): void {
    const keep = this.group;
    this.group = left;
    this.add(shape, -x, y, z, sx, sy, sz, color, {
      ...options,
      ry: -(options.ry ?? 0),
      rz: -(options.rz ?? 0),
    });
    this.group = right;
    this.add(shape, x, y, z, sx, sy, sz, color, options);
    this.group = keep;
  }
}

/** 조각 목록의 삼각형 수 */
export function countTriangles(parts: readonly CharacterPart[]): number {
  let total = 0;
  for (const part of parts) total += SHAPE_TRIANGLES[part.shape];
  return total;
}

/**
 * 조각의 로컬 행렬(열 우선 4 × 4, T · Rz · Ry · Rx · S)을 out[o…o+15]에 쓴다. three Matrix4.elements와 같은 차례
 */
export function writePartMatrix(out: Float32Array | number[], o: number, part: CharacterPart): void {
  const cx = Math.cos(part.rx);
  const sx = Math.sin(part.rx);
  const cy = Math.cos(part.ry);
  const sy = Math.sin(part.ry);
  const cz = Math.cos(part.rz);
  const sz = Math.sin(part.rz);
  // R = Rz · Ry · Rx
  const r00 = cz * cy;
  const r01 = cz * sy * sx - sz * cx;
  const r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy;
  const r11 = sz * sy * sx + cz * cx;
  const r12 = sz * sy * cx - cz * sx;
  const r20 = -sy;
  const r21 = cy * sx;
  const r22 = cy * cx;
  out[o] = r00 * part.sx;
  out[o + 1] = r10 * part.sx;
  out[o + 2] = r20 * part.sx;
  out[o + 3] = 0;
  out[o + 4] = r01 * part.sy;
  out[o + 5] = r11 * part.sy;
  out[o + 6] = r21 * part.sy;
  out[o + 7] = 0;
  out[o + 8] = r02 * part.sz;
  out[o + 9] = r12 * part.sz;
  out[o + 10] = r22 * part.sz;
  out[o + 11] = 0;
  out[o + 12] = part.x;
  out[o + 13] = part.y;
  out[o + 14] = part.z;
  out[o + 15] = 1;
}

/** 아핀 행렬 곱 out = a · b (열 우선 4 × 4, 마지막 행은 0 0 0 1로 본다). out은 a·b와 겹치면 안 된다 */
export function multiplyAffine(
  out: Float32Array | number[],
  oo: number,
  a: ArrayLike<number>,
  ao: number,
  b: ArrayLike<number>,
  bo: number,
): void {
  const a00 = a[ao] ?? 0;
  const a10 = a[ao + 1] ?? 0;
  const a20 = a[ao + 2] ?? 0;
  const a01 = a[ao + 4] ?? 0;
  const a11 = a[ao + 5] ?? 0;
  const a21 = a[ao + 6] ?? 0;
  const a02 = a[ao + 8] ?? 0;
  const a12 = a[ao + 9] ?? 0;
  const a22 = a[ao + 10] ?? 0;
  for (let column = 0; column < 4; column++) {
    const bx = b[bo + column * 4] ?? 0;
    const by = b[bo + column * 4 + 1] ?? 0;
    const bz = b[bo + column * 4 + 2] ?? 0;
    const w = column === 3 ? 1 : 0;
    out[oo + column * 4] = a00 * bx + a01 * by + a02 * bz + (a[ao + 12] ?? 0) * w;
    out[oo + column * 4 + 1] = a10 * bx + a11 * by + a12 * bz + (a[ao + 13] ?? 0) * w;
    out[oo + column * 4 + 2] = a20 * bx + a21 * by + a22 * bz + (a[ao + 14] ?? 0) * w;
    out[oo + column * 4 + 3] = w;
  }
}

/** 조각의 로컬 경계(돌림을 넉넉히 본 축 정렬 상자): 반 크기 = 조각 대각선의 반 */
export function partReach(part: CharacterPart): {
  readonly minY: number;
  readonly maxY: number;
  readonly maxX: number;
  readonly maxZ: number;
} {
  const turned = part.rx !== 0 || part.ry !== 0 || part.rz !== 0;
  const diagonal = Math.hypot(part.sx, part.sy, part.sz) / 2;
  const hx = turned ? diagonal : part.sx / 2;
  const hy = turned ? diagonal : part.sy / 2;
  const hz = turned ? diagonal : part.sz / 2;
  return {
    minY: part.y - hy,
    maxY: part.y + hy,
    maxX: Math.abs(part.x) + hx,
    maxZ: Math.abs(part.z) + hz,
  };
}

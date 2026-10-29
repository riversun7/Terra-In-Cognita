// 타일 모양(구 위 방향·각 크기·오차) — 순수 계산(시험 대상). 고르기(lodSelect)·시야 거르기(culling)·누르기가 함께 쓴다.
// 방향은 @terra/planet/projection의 탄젠트 투영(stToUV, faceUVToXYZ)으로 구한다. 생성기·서버와 같은 투영이다.
import type { Face } from "@terra/planet";
import { averageCellEdgeMeters, faceUVToXYZ, stToUV, uvToST, xyzToFaceUV } from "@terra/planet/projection";
import { type TileNode, nodeSTRange } from "./tileTree.ts";
import { type Vec3, angleBetween, normalize } from "./vec3.ts";

/** 면 칸 좌표(정규화) (s, t) → 구 위 단위 벡터 */
export function faceSTDirection(face: Face, s: number, t: number): Vec3 {
  return normalize(faceUVToXYZ(face, stToUV(s), stToUV(t)));
}

/** 방향(길이 무관) → 면과 면 칸 좌표(정규화) */
export function directionToFaceST(direction: Vec3): { face: Face; s: number; t: number } {
  const { face, u, v } = xyzToFaceUV(direction);
  return { face, s: uvToST(u), t: uvToST(v) };
}

/** 한 타일 메시가 한 변을 나누는 마디 수의 최솟값(면 전체 타일도 구가 둥글게 보이게) */
export const MIN_SEGMENTS = 32;
/** MIN_SEGMENTS = 2^5 */
const SEGMENT_LEVEL = 5;

export interface TileShape {
  readonly node: TileNode;
  /** 타일 가운데 방향(단위 벡터) */
  readonly center: Vec3;
  /** 꼭짓점 4개 방향: (s0, t0), (s1, t0), (s1, t1), (s0, t1) */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** 가운데에서 가장 먼 꼭짓점까지 각(rad). 타일 변은 대원 위라 가장 먼 점은 꼭짓점이다 */
  readonly angularRadius: number;
  /** 이 레벨 칸의 평균 한 변(m) — 화면 오차의 기준 */
  readonly cellEdgeM: number;
  /** 메시 한 칸(마디)을 평면 삼각형으로 그릴 때 구 안쪽으로 들어가는 깊이 상한(m) */
  readonly sagM: number;
}

/**
 * 마디 하나의 모양. sag: 칸 대각선 각 θ의 활꼴 깊이 R·θ²/8(θ = 평균 변 × 1.2 × √2, 탄젠트 투영의 큰 칸 여유).
 * 메시 마디는 칸보다 작을 수 있다(면 전체 타일은 MIN_SEGMENTS로 나눈다) → 마디 레벨 = max(L, 5).
 */
export function tileShape(node: TileNode, radiusM: number): TileShape {
  const { s0, t0, span } = nodeSTRange(node);
  const s1 = s0 + span;
  const t1 = t0 + span;
  const center = faceSTDirection(node.face, s0 + span / 2, t0 + span / 2);
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    faceSTDirection(node.face, s0, t0),
    faceSTDirection(node.face, s1, t0),
    faceSTDirection(node.face, s1, t1),
    faceSTDirection(node.face, s0, t1),
  ];
  let angularRadius = 0;
  for (const corner of corners) angularRadius = Math.max(angularRadius, angleBetween(center, corner));
  // 면 전체 타일(맵 레벨 5 미만)은 MIN_SEGMENTS(= 2^5)로 나누므로 마디는 레벨 5 칸 크기다
  const segmentLevel = Math.max(node.mapLevel, SEGMENT_LEVEL);
  const segmentAngle = (averageCellEdgeMeters(segmentLevel, radiusM) / radiusM) * 1.2 * Math.SQRT2;
  return {
    node,
    center,
    corners,
    angularRadius,
    cellEdgeM: averageCellEdgeMeters(node.mapLevel, radiusM),
    sagM: (radiusM * segmentAngle * segmentAngle) / 8,
  };
}

/**
 * 타일이 반지름 [innerM, outerM] 사이에 있을 때 감싸는 구(중심 m, 반지름 m).
 * 가운데 방향 위의 한 점을 중심으로 두고, 끝점(가운데·꼭짓점 쪽의 안·바깥 반지름) 네 곳까지 거리 중 가장 먼 것을 반지름으로 한다.
 */
export function boundingSphere(
  shape: TileShape,
  innerM: number,
  outerM: number,
): { center: Vec3; radius: number } {
  const cos = Math.cos(shape.angularRadius);
  const sin = Math.sin(shape.angularRadius);
  // 가운데 축 위 위치 m: 끝점 (x, y) = (outer, 0), (outer·cos, outer·sin), (inner·cos, inner·sin), (inner, 0)
  const m = (outerM + innerM * cos) / 2;
  const far = (x: number, y: number): number => Math.hypot(x - m, y);
  const radius = Math.max(
    far(outerM, 0),
    far(outerM * cos, outerM * sin),
    far(innerM * cos, innerM * sin),
    far(innerM, 0),
  );
  const c = shape.center;
  return { center: [c[0] * m, c[1] * m, c[2] * m], radius };
}

/** 모양을 한 번만 구하는 저장소(마디 키 → 모양). 너무 커지면 비운다(큰 행성) */
export class TileShapeCache {
  private readonly shapes = new Map<number, TileShape>();
  private readonly radiusM: number;
  private readonly limit: number;

  constructor(radiusM: number, limit = 50_000) {
    this.radiusM = radiusM;
    this.limit = limit;
  }

  get(key: number, node: TileNode): TileShape {
    let shape = this.shapes.get(key);
    if (!shape) {
      if (this.shapes.size >= this.limit) this.shapes.clear();
      shape = tileShape(node, this.radiusM);
      this.shapes.set(key, shape);
    }
    return shape;
  }
}

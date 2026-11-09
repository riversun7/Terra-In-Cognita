// 소품 모델을 세울 땅 — 화면이 보는 땅(시야 사다리꼴)과 가시거리 원이 겹치는 볼록 다각형(순수 함수, 시험 대상).
// 사용자 지적 2026-11-09 "확대하면 주변이 더 안 보인다": 전에는 카메라 목표 둘레 원(반지름 = 화면 짧은 변 × 0.8, 최소 60m)에만 세워서
// 가장 가까이 볼 때 화면 위쪽(목표에서 85~130m)에 나무가 없었다. 이제는 화면 네 모서리 아래 땅(목표점 높이 평면)을 가시거리(목표점에서 잰
// 반지름)로 잘라, 화면에 보이는 곳만 세운다(뒤쪽·옆 화면 밖에 모델을 쓰지 않는다). docs/adr/2026-10-28-s1-second-map.md "바뀜 (2026-11-09)".
import {
  CAMERA_FOV_RAD,
  type CameraState,
  type GroundPoint,
  type ScreenPoint,
  type Viewport,
  groundUnder,
} from "../camera/cameraMath.ts";

/** 가시거리 원을 다각형으로 볼 때 변 수(바깥에 접하게 키워 원보다 작지 않다) */
const CIRCLE_SIDES = 24;

/** 볼록 다각형 넓이(m², 꼭짓점 차례 상관없이 양수) */
export function polygonArea(polygon: readonly GroundPoint[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

/** 꼭짓점 차례를 한쪽(z 아래가 + 인 땅 좌표에서 x→z 회전 방향, 넓이 부호 +)으로 맞춘다 */
function oriented(polygon: readonly GroundPoint[]): GroundPoint[] {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a && b) sum += a.x * b.z - b.x * a.z;
  }
  return sum >= 0 ? [...polygon] : [...polygon].reverse();
}

/** 점에서 볼록 다각형(차례 맞춤) 안쪽까지의 가장 작은 변 거리(m): 안이면 ≥ 0, 밖이면 음수 */
export function insideDistance(polygon: readonly GroundPoint[], x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const length = Math.sqrt(ex * ex + ez * ez);
    if (length < 1e-9) continue;
    // 넓이 부호 + 차례에서 안쪽은 변 방향의 왼쪽(외적 > 0)
    const side = (ex * (z - a.z) - ez * (x - a.x)) / length;
    if (side < best) best = side;
  }
  return best;
}

/** 볼록 다각형 subject를 볼록 다각형 clip(둘 다 차례 맞춤)으로 자른다(Sutherland–Hodgman) */
function clipConvex(subject: readonly GroundPoint[], clip: readonly GroundPoint[]): GroundPoint[] {
  let output = [...subject];
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b) continue;
    const side = (p: GroundPoint): number => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const input = output;
    output = [];
    for (let k = 0; k < input.length; k++) {
      const current = input[k];
      const previous = input[(k + input.length - 1) % input.length];
      if (!current || !previous) continue;
      const sc = side(current);
      const sp = side(previous);
      if (sc >= 0) {
        if (sp < 0) output.push(cross(previous, current, sp, sc));
        output.push(current);
      } else if (sp >= 0) {
        output.push(cross(previous, current, sp, sc));
      }
    }
  }
  return output;
}

/** 변 p→q가 자르는 선과 만나는 점(sp·sq = 두 끝의 부호 있는 거리) */
function cross(p: GroundPoint, q: GroundPoint, sp: number, sq: number): GroundPoint {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
}

/** 가운데 (x, z), 반지름 r 원에 바깥으로 접하는 다각형(차례 맞춤) */
function circlePolygon(x: number, z: number, r: number): GroundPoint[] {
  const outer = r / Math.cos(Math.PI / CIRCLE_SIDES);
  const points: GroundPoint[] = [];
  for (let i = 0; i < CIRCLE_SIDES; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SIDES;
    points.push({ x: x + Math.cos(angle) * outer, z: z + Math.sin(angle) * outer });
  }
  return oriented(points);
}

/** 소품 모델을 세울 땅: 볼록 다각형(차례 맞춤)과 상한을 넘을 때 먼저 세울 기준 점(화면 아래 가운데 땅 = 보는 사람 쪽) */
export interface PropArea {
  readonly polygon: readonly GroundPoint[];
  readonly nearX: number;
  readonly nearZ: number;
}

/**
 * 화면이 보는 땅(네 모서리 아래, 목표점 높이 평면)과 목표점 둘레 reachM 원이 겹치는 곳.
 * 시선이 평면에 닿지 않으면(지평선 위 — 기울기 하한으로 생기지 않지만) 그 모서리는 목표점에서 reachM 너머로 둔다
 */
export function propArea(
  state: CameraState,
  viewport: Viewport,
  reachM: number,
  fov = CAMERA_FOV_RAD,
): PropArea {
  const corners: ScreenPoint[] = [
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
    { x: viewport.width, y: 0 },
    { x: 0, y: 0 },
  ];
  const far = reachM * 4;
  const ground = corners.map((point): GroundPoint => {
    const hit = groundUnder(state, viewport, point, fov);
    if (hit) return hit;
    // 닿지 않는 위쪽 모서리: 화면 가로 방향은 그대로 두고 앞으로 멀리
    const side = point.x < viewport.width / 2 ? -1 : 1;
    return {
      x: state.targetX - Math.sin(state.yaw) * far + Math.cos(state.yaw) * side * far,
      z: state.targetZ - Math.cos(state.yaw) * far - Math.sin(state.yaw) * side * far,
    };
  });
  const polygon = clipConvex(oriented(ground), circlePolygon(state.targetX, state.targetZ, reachM));
  const bottom = groundUnder(state, viewport, { x: viewport.width / 2, y: viewport.height }, fov);
  return {
    polygon: polygon.length >= 3 ? polygon : circlePolygon(state.targetX, state.targetZ, reachM),
    nearX: bottom?.x ?? state.targetX,
    nearZ: bottom?.z ?? state.targetZ,
  };
}

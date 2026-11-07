// 항성계 평면 배치(위에서 내려다본 그림) — 항성은 가운데, 궤도는 고리, 생명 가능 지대는 띠. 개발자 항성계 편집기가 쓰고,
// 나중 게임 항성계 화면(기획 D-350·D-353, 질문 100~103)도 같은 배치를 쓰도록 화면 코드와 나눠 둔다(ADR 2026-10-31-star-system-editor).
// - 좌표: 가운데 (0, 0), 반지름 1인 원 안(SVG viewBox "-1 -1 2 2"에 그대로 쓴다). 화면 크기는 CSS가 정한다.
// - 거리 눈금은 제곱근: 안쪽 궤도(0.4 AU)와 바깥 궤도(30 AU)가 한 그림에 같이 보이게. 로그 눈금은 1 AU 근처를 너무 벌린다.
//   0 AU는 항성 원의 가장자리(STAR_RADIUS), 가장 먼 거리는 VIEW_EDGE에 온다.
// - 생명 가능 지대 띠는 @terra/shared habitableZone(√L 배)을 같은 눈금으로 옮긴 것이다. 궤도가 없어도 띠가 보이게 범위를 잡는다.
// - 천체 각도: 궤도 차례마다 황금각(약 137.5°)만큼 돌린다(늘 같은 그림, 이웃 궤도의 천체가 겹치지 않게). 공전은 그리지 않는다.
// - 로그 눈금(scale "log")은 1차맵 항성계 보기가 쓴다(ADR 2026-11-07-planet-view 3절): 태양계(0.39 ~ 30 AU)를 제곱근으로 그리면
//   안쪽 행성 넷이 그림 반지름의 0.16 ~ 0.25에 몰려 이름표가 겹친다. 로그는 가장 가까운 궤도 ÷ 1.6을 항성 가장자리에 둔다.
// 게임 규칙(거리 단위·공전 주기 등)이 정해지면 이 모듈의 눈금만 바꾼다.
import { habitableZone } from "@terra/shared";

/** 항성 원의 반지름(그림 반지름에 대한 몫) */
export const STAR_RADIUS = 0.07;
/** 가장 먼 거리가 오는 반지름(가장자리 여백) */
export const VIEW_EDGE = 0.92;
/** 범위 = 가장 먼 궤도·생명 가능 지대 바깥 끝 중 큰 것 × 이 몫(바깥 궤도가 가장자리에 붙지 않게) */
const RANGE_PADDING = 1.08;
/** 궤도가 없을 때 범위 = 생명 가능 지대 바깥 끝 × 이 몫 */
const EMPTY_RANGE = 1.6;
/** 로그 눈금: 항성 가장자리 = 가장 가까운 궤도(또는 생명 가능 지대 안쪽 끝) ÷ 이 몫 */
const LOG_INNER_GAP = 1.6;
/** 황금각(라디안) = π × (3 − √5) */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface SystemLayout {
  /** 그림 안 가장 먼 거리(AU) */
  readonly maxAu: number;
  /** 생명 가능 지대 띠의 안·바깥 반지름(그림 몫) */
  readonly habitable: { readonly inner: number; readonly outer: number };
  /** 거리(AU) → 반지름(그림 몫, STAR_RADIUS ~ VIEW_EDGE) */
  readonly radiusOf: (distanceAu: number) => number;
}

/** 거리 눈금: 제곱근(편집기, 0 AU를 그릴 수 있다) · 로그(1차맵 항성계 보기, 안쪽 궤도를 벌린다) */
export type SystemScale = "sqrt" | "log";

/** 항성 광도와 궤도 거리(AU, 가까운 것부터)로 배치를 잡는다 */
export function systemLayout(
  luminosity: number,
  distancesAu: readonly number[],
  scale: SystemScale = "sqrt",
): SystemLayout {
  const zone = habitableZone(luminosity);
  const farthest = distancesAu.reduce((max, distance) => Math.max(max, distance), 0);
  const maxAu = farthest > 0 ? Math.max(farthest, zone.outer) * RANGE_PADDING : zone.outer * EMPTY_RANGE;
  const nearest = distancesAu.reduce((min, distance) => Math.min(min, distance), zone.inner);
  const innerAu = Math.min(maxAu / 2, nearest / LOG_INNER_GAP);
  const span = Math.log(maxAu / innerAu);
  const radiusOf = (distanceAu: number): number => {
    const share =
      scale === "log"
        ? distanceAu <= innerAu
          ? 0
          : Math.min(1, Math.log(distanceAu / innerAu) / span)
        : Math.sqrt(Math.min(1, Math.max(0, distanceAu / maxAu)));
    return STAR_RADIUS + (VIEW_EDGE - STAR_RADIUS) * share;
  };
  return { maxAu, habitable: { inner: radiusOf(zone.inner), outer: radiusOf(zone.outer) }, radiusOf };
}

/** 궤도 차례 index의 천체 자리(그림 좌표). 0번은 오른쪽 위, 차례마다 황금각만큼 돈다 */
export function bodyPosition(index: number, radius: number): { readonly x: number; readonly y: number } {
  const angle = -Math.PI / 4 + index * GOLDEN_ANGLE;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

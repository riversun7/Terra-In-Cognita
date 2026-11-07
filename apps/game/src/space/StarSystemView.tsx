// 항성계 그림(위에서 내려다본 2D, SVG) — 가운데 항성, 궤도 고리, 생명 가능 지대 띠, 궤도 위 천체와 이름표.
// 배치는 starSystemLayout.ts(순수 함수)가 정하고 이 파일은 그리기만 한다. 개발자 항성계 편집기와 1차맵 항성계 보기가 같은 그림을 쓴다
// (ADR 2026-10-31-star-system-editor 6절, ADR 2026-11-07-planet-view 3절). 문구는 받아서 쓴다(화면마다 다른 메시지 키).
// - 우주 그림이라 화면 테마와 상관없이 검정 바탕 + 우주 색(tokens.css --color-space-*)이다(D-070). 그래서 두 화면이 같아 보인다.
// - 천체는 누를 수 있다(role="button", Enter·Space). 누르는 자리는 보이는 점보다 크다(그림 몫 0.13).
// - 이름표는 HTML 층(그림 위, 퍼센트 자리)이라 그림 크기와 상관없이 글자 크기가 같다. 읽기 프로그램은 천체 단추 이름(label)을 읽는다.
//   이름표는 천체 옆에 붙되 그림 가장자리 가까이에서는 위아래에 붙어 안쪽으로 뻗는다(잘리지 않게, labelPlacement).
// - 항성 색은 자료(항성 종류 표)라 속성으로 넣는다. 나머지 색은 CSS가 칠한다(starSystemView.css).
import { starType, zoneOf } from "@terra/shared";
import type { KeyboardEvent } from "react";
import { STAR_RADIUS, type SystemScale, bodyPosition, systemLayout } from "./starSystemLayout.ts";
import "./starSystemView.css";

/** 천체를 누르는 자리 반지름(그림 몫). 390px 화면(그림 폭 약 350px)에서 지름 약 45px */
const HIT_RADIUS = 0.13;
const PLANET_RADIUS = 0.03;
const GAS_GIANT_RADIUS = 0.045;
const MARK_RADIUS = 0.026;
const MOON_RADIUS = 0.011;
/** 소행성대 먼지 점 수 */
const BELT_DOTS = 72;
/** 이 몫보다 가장자리에 가까운 천체는 이름표를 안쪽으로 붙인다 */
const LABEL_EDGE = 0.5;
/** 이름표를 천체 가운데에서 띄우는 거리(그림 몫 — 그림이 커지면 함께 커지는 지금 행성 고리보다 바깥) */
const LABEL_CLEAR = 0.062;
/** 이름표 쪽 → 띄우는 방향 */
const LABEL_SHIFT = {
  right: [1, 0],
  left: [-1, 0],
  top: [0, -1],
  bottom: [0, 1],
} as const;

/** 그림에 놓는 천체 종류(편집기 정의의 천체 종류 + 가스 행성) */
export type SystemBodyKind = "planet" | "gas_giant" | "asteroid_belt" | "structure" | "empty";

export interface SystemBodyView {
  readonly distanceAu: number;
  readonly kind: SystemBodyKind;
  /** 천체 단추 이름(읽기 프로그램) */
  readonly label: string;
  /** 그림에 보이는 이름(없으면 이름표 없음) */
  readonly name?: string | undefined;
  /** 이름 아래 작은 줄(거리·"지금 행성" 등) */
  readonly note?: string | undefined;
  /** 지금 보는 행성(강조 고리) */
  readonly current?: boolean | undefined;
  /** 위성 수(작은 점) */
  readonly moons?: number | undefined;
}

export interface StarSystemViewProps {
  readonly starTypeId: string;
  readonly bodies: readonly SystemBodyView[];
  /** 그림 전체 이름(읽기 프로그램) */
  readonly label: string;
  readonly selected: number | null;
  readonly onSelect: (index: number) => void;
  /** 거리 눈금(기본 제곱근) */
  readonly scale?: SystemScale | undefined;
}

/** 이름표 자리: 천체의 어느 쪽(side)과, 위아래면 가로 맞춤(align: 글이 천체에서 시작·가운데·끝) */
export interface LabelPlacement {
  readonly side: "right" | "left" | "top" | "bottom";
  readonly align: "start" | "center" | "end";
}

/**
 * 이름표 자리. 가로로 가장자리 가까이(|x| > LABEL_EDGE)면 위아래에 붙이고 글은 안쪽으로 뻗는다(잘리지 않고 안쪽 천체 이름표와 덜 겹친다).
 * 가운데 띠에서는 위아래로 멀면 위아래 바깥쪽(가장자리에 닿을 만큼이면 안쪽), 가까우면 옆 바깥쪽
 */
export function labelPlacement(x: number, y: number): LabelPlacement {
  const vertical = (): "top" | "bottom" => {
    if (Math.abs(y) > LABEL_EDGE * 1.5) return y > 0 ? "top" : "bottom";
    return y > 0 ? "bottom" : "top";
  };
  if (Math.abs(x) > LABEL_EDGE) return { side: vertical(), align: x > 0 ? "end" : "start" };
  if (Math.abs(y) > LABEL_EDGE * 0.6) return { side: vertical(), align: "center" };
  return { side: x >= 0 ? "right" : "left", align: "center" };
}

/** 소행성대 먼지 점(고정 자리: 각도는 고르게 + 반지름은 조금 흔든다) */
function beltDots(radius: number): { x: number; y: number; r: number }[] {
  return Array.from({ length: BELT_DOTS }, (_, index) => {
    const angle = (index / BELT_DOTS) * Math.PI * 2 + (index % 3) * 0.031;
    const wobble = (((index * 37) % 11) - 5) * 0.0028;
    const r = radius + wobble;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), r: index % 4 === 0 ? 0.0065 : 0.0045 };
  });
}

const percent = (value: number): string => `${((value + 1) * 50).toFixed(3)}%`;

export function StarSystemView({
  starTypeId,
  bodies,
  label,
  selected,
  onSelect,
  scale = "sqrt",
}: StarSystemViewProps) {
  const star = starType(starTypeId);
  const luminosity = star?.luminosity ?? 1;
  const color = star?.color ?? "#ffffff";
  const layout = systemLayout(
    luminosity,
    bodies.map((body) => body.distanceAu),
    scale,
  );
  const band = layout.habitable;
  const onKey = (event: KeyboardEvent<SVGGElement>, index: number): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(index);
  };
  const placed = bodies.map((body, index) => {
    const radius = layout.radiusOf(body.distanceAu);
    return { body, index, radius, ...bodyPosition(index, radius) };
  });
  return (
    <div className="ssv-wrap">
      <svg className="ssv" viewBox="-1 -1 2 2" role="group" aria-label={label}>
        <circle
          className="ssv-hz"
          r={(band.inner + band.outer) / 2}
          strokeWidth={Math.max(0.004, band.outer - band.inner)}
          fill="none"
        />
        {placed.map(({ body, index, radius }) =>
          body.kind === "asteroid_belt" ? (
            <g key={`ring-${index}`} className="ssv-dust" data-selected={selected === index ? "" : undefined}>
              {beltDots(radius).map((dot) => (
                <circle key={`${dot.x.toFixed(4)},${dot.y.toFixed(4)}`} cx={dot.x} cy={dot.y} r={dot.r} />
              ))}
            </g>
          ) : (
            <circle
              key={`ring-${index}`}
              className="ssv-ring"
              data-kind={body.kind}
              data-selected={selected === index ? "" : undefined}
              r={radius}
              fill="none"
              strokeWidth={selected === index ? 0.006 : 0.0035}
            />
          ),
        )}
        <circle className="ssv-star-glow" r={STAR_RADIUS * 1.9} fill={color} />
        <circle className="ssv-star" r={STAR_RADIUS} fill={color} />
        {placed.map(({ body, index, x, y }) => {
          const zone = zoneOf(luminosity, body.distanceAu);
          return (
            <g
              key={`body-${index}`}
              className="ssv-body"
              data-kind={body.kind}
              data-zone={zone}
              data-current={body.current ? "" : undefined}
              role="button"
              tabIndex={0}
              aria-label={body.label}
              aria-pressed={selected === index}
              transform={`translate(${x} ${y})`}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <circle className="ssv-hit" r={HIT_RADIUS} />
              <circle className="ssv-select" r={HIT_RADIUS * 0.55} fill="none" strokeWidth={0.008} />
              {body.current ? (
                <circle className="ssv-current" r={GAS_GIANT_RADIUS * 1.15} fill="none" strokeWidth={0.008} />
              ) : null}
              {body.kind === "planet" || body.kind === "gas_giant" ? (
                <circle
                  className="ssv-planet"
                  r={body.kind === "gas_giant" ? GAS_GIANT_RADIUS : PLANET_RADIUS}
                  strokeWidth={0.008}
                />
              ) : body.kind === "structure" ? (
                <rect
                  className="ssv-structure"
                  x={-MARK_RADIUS}
                  y={-MARK_RADIUS}
                  width={MARK_RADIUS * 2}
                  height={MARK_RADIUS * 2}
                  transform="rotate(45)"
                />
              ) : body.kind === "asteroid_belt" ? (
                <g className="ssv-belt">
                  <circle r={MARK_RADIUS * 0.55} cx={-0.022} cy={0.01} />
                  <circle r={MARK_RADIUS * 0.42} cx={0.018} cy={-0.016} />
                  <circle r={MARK_RADIUS * 0.36} cx={0.016} cy={0.022} />
                </g>
              ) : (
                <circle className="ssv-empty" r={MARK_RADIUS} fill="none" strokeWidth={0.008} />
              )}
              {Array.from({ length: Math.min(4, body.moons ?? 0) }, (_, moon) => {
                const angle = -Math.PI / 3 + moon * 1.4;
                const orbit = (body.kind === "gas_giant" ? GAS_GIANT_RADIUS : PLANET_RADIUS) + 0.026;
                return (
                  <circle
                    key={`moon-${moon}`}
                    className="ssv-moon"
                    cx={orbit * Math.cos(angle)}
                    cy={orbit * Math.sin(angle)}
                    r={MOON_RADIUS}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="ssv-labels" aria-hidden="true">
        {placed.map(({ body, index, x, y }) => {
          if (!body.name) return null;
          const place = labelPlacement(x, y);
          const [dx, dy] = LABEL_SHIFT[place.side];
          return (
            <span
              key={`label-${index}`}
              className="ssv-label"
              data-side={place.side}
              data-align={place.align}
              data-current={body.current ? "" : undefined}
              data-selected={selected === index ? "" : undefined}
              style={{ left: percent(x + dx * LABEL_CLEAR), top: percent(y + dy * LABEL_CLEAR) }}
            >
              <span className="ssv-label-name">{body.name}</span>
              {body.note ? <span className="ssv-label-note">{body.note}</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

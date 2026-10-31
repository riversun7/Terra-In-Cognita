// 항성계 그림(위에서 내려다본 2D, SVG) — 가운데 항성, 궤도 고리, 생명 가능 지대 띠, 궤도 위 천체.
// 배치는 starSystemLayout.ts(순수 함수)가 정하고 이 파일은 그리기만 한다: 개발자 항성계 편집기가 쓰고, 나중 게임 항성계 화면도
// 같은 그림에서 시작한다(ADR 2026-10-31-star-system-editor). 문구는 받아서 쓴다(화면마다 다른 메시지 키).
// - 천체는 누를 수 있다(role="button", Enter·Space). 누르는 자리는 보이는 점보다 크다(터치 목표 --tap-size 근처, 그림 몫 0.13).
// - 항성 색은 자료(항성 종류 표)라 속성으로 넣는다. 나머지 색은 CSS가 디자인 토큰으로 칠한다(starSystemView.css).
import { type StarSystemDefinition, starType, zoneOf } from "@terra/shared";
import type { KeyboardEvent } from "react";
import { STAR_RADIUS, bodyPosition, systemLayout } from "./starSystemLayout.ts";
import "./starSystemView.css";

/** 천체를 누르는 자리 반지름(그림 몫). 390px 화면에서 지름 약 46px */
const HIT_RADIUS = 0.13;
const PLANET_RADIUS = 0.034;
const MARK_RADIUS = 0.028;

export interface StarSystemViewProps {
  readonly definition: StarSystemDefinition;
  /** 그림 전체 이름(읽기 프로그램) */
  readonly label: string;
  /** 궤도 차례 → 천체 이름(읽기 프로그램) */
  readonly bodyLabel: (index: number) => string;
  readonly selected: number | null;
  readonly onSelect: (index: number) => void;
}

export function StarSystemView({ definition, label, bodyLabel, selected, onSelect }: StarSystemViewProps) {
  const luminosity = starType(definition.star.type)?.luminosity ?? 1;
  const color = starType(definition.star.type)?.color ?? "#ffffff";
  const layout = systemLayout(
    luminosity,
    definition.orbits.map((orbit) => orbit.distanceMilliAu / 1000),
  );
  const band = layout.habitable;
  const onKey = (event: KeyboardEvent<SVGGElement>, index: number): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(index);
  };
  return (
    <svg className="ssv" viewBox="-1 -1 2 2" role="group" aria-label={label}>
      <circle
        className="ssv-hz"
        r={(band.inner + band.outer) / 2}
        strokeWidth={band.outer - band.inner}
        fill="none"
      />
      {definition.orbits.map((orbit, index) => (
        <circle
          key={`ring-${orbit.distanceMilliAu}`}
          className="ssv-ring"
          data-kind={orbit.body.kind}
          data-selected={selected === index ? "" : undefined}
          r={layout.radiusOf(orbit.distanceMilliAu / 1000)}
          fill="none"
          strokeWidth={orbit.body.kind === "asteroid_belt" ? 0.03 : 0.006}
          strokeDasharray={orbit.body.kind === "asteroid_belt" ? "0.012 0.02" : undefined}
        />
      ))}
      <circle className="ssv-star-glow" r={STAR_RADIUS * 1.7} fill={color} />
      <circle className="ssv-star" r={STAR_RADIUS} fill={color} strokeWidth={0.008} />
      {definition.orbits.map((orbit, index) => {
        const { x, y } = bodyPosition(index, layout.radiusOf(orbit.distanceMilliAu / 1000));
        const zone = zoneOf(luminosity, orbit.distanceMilliAu / 1000);
        return (
          <g
            key={`body-${orbit.distanceMilliAu}`}
            className="ssv-body"
            data-kind={orbit.body.kind}
            data-zone={zone}
            role="button"
            tabIndex={0}
            aria-label={bodyLabel(index)}
            aria-pressed={selected === index}
            transform={`translate(${x} ${y})`}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <circle className="ssv-hit" r={HIT_RADIUS} strokeWidth={0.012} />
            {orbit.body.kind === "planet" ? (
              <circle className="ssv-planet" r={PLANET_RADIUS} strokeWidth={0.012} />
            ) : orbit.body.kind === "structure" ? (
              <rect
                className="ssv-structure"
                x={-MARK_RADIUS}
                y={-MARK_RADIUS}
                width={MARK_RADIUS * 2}
                height={MARK_RADIUS * 2}
                transform="rotate(45)"
              />
            ) : orbit.body.kind === "asteroid_belt" ? (
              <g className="ssv-belt">
                <circle r={MARK_RADIUS * 0.55} cx={-0.025} cy={0.01} />
                <circle r={MARK_RADIUS * 0.4} cx={0.02} cy={-0.018} />
                <circle r={MARK_RADIUS * 0.35} cx={0.018} cy={0.024} />
              </g>
            ) : (
              <circle className="ssv-empty" r={MARK_RADIUS} fill="none" strokeWidth={0.01} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

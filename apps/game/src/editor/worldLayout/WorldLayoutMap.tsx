// 세계 배치 지도 — 행성 편집기 평면 미니맵(FlatMap, 1차맵 타일로 칠함) 위에 국가 도시·수도·놓은 자리·자동 제안 표시를 겹친다.
// 표시는 보기만 하는 겹(pointer-events: none) — 누르기는 FlatMap이 받아 위도·경도를 알린다(고른 점 고리도 FlatMap이 그린다).
// 색 = 국가 시그니처 컬러(팩 프리셋 — 있으면), 없으면 국가 차례로 개발 화면 토큰 --color-stat-* 여섯을 돌려 쓴다(worldLayout.css data-nation).
// 국력 등급 계획 표시(plan_home·plan_city·add_city)는 등급이 클수록 크다(data-tier).
import { m } from "../../paraglide/messages.js";
import { FlatMap } from "../planet/FlatMap.tsx";
import type { LatLon } from "../planet/flatMapRender.ts";
import type { MapMark } from "./worldLayoutModel.ts";
import type { FlatPlanet } from "./worldLayoutPlanet.ts";

interface Props {
  readonly planet: FlatPlanet;
  readonly marks: readonly MapMark[];
  readonly picked: LatLon | null;
  readonly onPick: (point: LatLon) => void;
}

/** 국가 색 차례 수(토큰 여섯) */
const COLORS = 6;

export function WorldLayoutMap({ planet, marks, picked, onPick }: Props) {
  return (
    <div className="wl-map" data-marks={marks.length}>
      <FlatMap
        fields={planet.fields}
        biomeColors={planet.biomeColors}
        selected={picked}
        onPick={onPick}
        label={m.dev_world_layout_map_label()}
      />
      <div className="wl-marks" aria-hidden="true">
        {marks.map((mark) => (
          <span
            key={mark.id}
            className="wl-mark"
            data-kind={mark.kind}
            data-nation={mark.nation % COLORS}
            data-code={mark.code}
            data-tier={mark.tier}
            data-colored={mark.color === undefined ? undefined : ""}
            style={{
              left: `${(mark.x * 100).toFixed(3)}%`,
              top: `${(mark.y * 100).toFixed(3)}%`,
              // 국가 시그니처 컬러(자료 색) — 글자 색으로 주고 CSS가 currentColor로 그린다
              ...(mark.color === undefined ? {} : { color: mark.color }),
            }}
            title={mark.label}
          />
        ))}
      </div>
    </div>
  );
}

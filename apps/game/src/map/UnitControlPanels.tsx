// 2차맵 화면의 유닛 조종 몫 — "다른 곳에 내 유닛 N" 줄·고른 유닛 단추([멈추기]·[내 유닛으로])·운영자 표시와 개발 단추.
// 내 유닛 목록은 근처 판 유닛 탭으로 옮겼다(nearby/NearbyPanel.tsx, docs/adr/2026-11-08-seamless-second-map.md WP-2).
// docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야
// 자유이동이 가능"). 상태는 화면(SecondaryMapScreen.tsx)이 갖고, 여기는 그리기만 한다.
// 기획 답 632 다: 유닛 목록 끝에 "다른 곳에 내 유닛 N" 한 줄 — 누르면 유닛 화면(모든 유닛).
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { elsewhereText } from "./mapUnits.ts";
import "./unitControl.css";

/** "다른 곳에 내 유닛 N" 한 줄(632 다): 누르면 유닛 화면 */
export function ElsewhereLine({ count }: { readonly count: number }) {
  const text = elsewhereText(count);
  if (text === null) return null;
  return (
    <p className="map-units-elsewhere" data-elsewhere={count}>
      <button
        type="button"
        className="button-small map-units-elsewhere-open"
        onClick={() => navigate({ route: "units" })}
      >
        {text}
      </button>
    </p>
  );
}

/** 고른 유닛 단추: [멈추기](명령할 수 있고 가는 중일 때)·[내 유닛으로](남의 유닛을 살펴보는 중일 때 — 늘 유닛 하나가 골라져 있다, WP-1) */
export function SelectedActions({
  onStop,
  onBack,
}: {
  /** 멈출 수 없으면 null */
  readonly onStop: (() => void) | null;
  /** 기준 유닛을 고른 중이면 null */
  readonly onBack: (() => void) | null;
}) {
  if (!onStop && !onBack) return null;
  return (
    <div className="map-actions">
      {onStop ? (
        <button type="button" className="button-small button-primary map-unit-stop" onClick={onStop}>
          {m.map_unit_stop()}
        </button>
      ) : null}
      {onBack ? (
        <button type="button" className="button-small map-back-anchor" onClick={onBack}>
          {m.map_back_to_anchor()}
        </button>
      ) : null}
    </div>
  );
}

/** 운영자 모드 표시(위 판 제목 옆). 색에만 기대지 않게 글자로 */
export function OperatorBadge() {
  return (
    <span className="map-operator-badge" role="status" title={m.map_operator_badge_label()}>
      {m.map_operator_badge()}
      <span className="visually-hidden">{` — ${m.map_operator_badge_label()}`}</span>
    </span>
  );
}

/**
 * 개발·운영 단추(dev·admin): [시험 일꾼 받기]·[운영자 모드](모든 유닛 명령 + 안개 없는 전체 보기)·[자유 시점](운영자 모드에서만 — 기준 유닛 따라가기를
 * 끄고 끌어서 옮긴다, docs/adr/2026-11-08-seamless-second-map.md WP-1 Q2). 운영자 단추는 빨간 운영자 모양(map-operator-button, 사용자 답 Q2)
 */
export function OperatorActions({
  operator,
  notice,
  freeView,
  onSpawn,
  onToggle,
  onFreeView,
}: {
  readonly operator: boolean;
  readonly notice: string | null;
  readonly freeView: boolean;
  readonly onSpawn: () => void;
  readonly onToggle: () => void;
  readonly onFreeView: () => void;
}) {
  return (
    <div className="map-actions" data-observe={operator ? "on" : "off"}>
      {notice ? (
        <p className="map-panel map-command" role="status">
          {notice}
        </p>
      ) : null}
      <button type="button" className="button-small map-operator-button map-dev-spawn" onClick={onSpawn}>
        {m.map_vision_spawn()}
      </button>
      <button
        type="button"
        className="button-small map-operator-button map-dev-observe map-operator-toggle"
        aria-pressed={operator}
        onClick={onToggle}
      >
        {m.map_operator_mode()}
      </button>
      {operator ? (
        <button
          type="button"
          className="button-small map-operator-button map-free-view"
          aria-pressed={freeView}
          onClick={onFreeView}
        >
          {m.map_free_view()}
        </button>
      ) : null}
    </div>
  );
}

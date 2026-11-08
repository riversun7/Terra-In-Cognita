// 2차맵 화면의 유닛 조종 몫 — 내 유닛 목록(접고 펴기)·고른 유닛 단추([멈추기]·[선택 해제])·운영자 표시와 개발 단추.
// docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야
// 자유이동이 가능"). 상태는 화면(SecondaryMapScreen.tsx)이 갖고, 여기는 그리기만 한다. 모바일 우선(390px): 목록은 아래 판 위에 펼치고 접는다.
// 기획 답 632 다: 목록 끝에 "다른 곳에 내 유닛 N" 한 줄 — 누르면 유닛 화면(모든 유닛).
import type { MapUnit } from "@terra/shared/mapUnits";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { elsewhereText, unitName, unitStatusText } from "./mapUnits.ts";
import "./unitControl.css";

/** 목록 id(접기 단추의 aria-controls) */
const LIST_ID = "map-units-list";

/** 접힌 목록의 [내 유닛 N] 단추 */
export function UnitsToggle({
  count,
  onOpen,
}: {
  /** 받기 전이면 null(수 없이 "내 유닛") */
  readonly count: number | null;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="button-small map-units-toggle"
      aria-expanded={false}
      aria-controls={LIST_ID}
      onClick={onOpen}
    >
      {count === null ? m.map_units_title() : m.map_units_toggle({ count })}
    </button>
  );
}

/** 펼친 내 유닛 목록. 줄을 누르면 그 유닛을 고르고 카메라를 그 자리로(화면이 한다) */
export function MyUnitsPanel({
  units,
  failed,
  elsewhere,
  moving,
  selected,
  now,
  onPick,
  onClose,
}: {
  readonly units: readonly MapUnit[] | null;
  readonly failed: boolean;
  /** 이 2차맵 밖의 내 유닛 수(632 다) */
  readonly elsewhere: number;
  /** 엔진이 지금 가는 중이라고 하는 유닛(1초마다) */
  readonly moving: ReadonlySet<number>;
  readonly selected: number | null;
  /** 목록을 받은 서버 시각(부상 남은 시간 "N시간 M분", D-525) */
  readonly now?: number | undefined;
  readonly onPick: (unit: MapUnit) => void;
  readonly onClose: () => void;
}) {
  return (
    <section className="map-panel map-units" aria-labelledby="map-units-title" data-count={units?.length}>
      <div className="map-units-head">
        <h2 id="map-units-title" className="map-units-title">
          {m.map_units_title()}
          {units ? <span className="map-units-count">{units.length}</span> : null}
        </h2>
        <button
          type="button"
          className="button-small map-units-close"
          aria-expanded={true}
          aria-controls={LIST_ID}
          onClick={onClose}
        >
          {m.map_units_collapse()}
        </button>
      </div>
      {failed ? (
        <p className="map-units-note" role="status">
          {m.map_units_failed()}
        </p>
      ) : null}
      {units === null ? (
        failed ? null : (
          <p className="map-units-note" role="status">
            {m.map_units_loading()}
          </p>
        )
      ) : units.length === 0 ? (
        <p className="map-units-note">{m.map_units_empty()}</p>
      ) : (
        <ul id={LIST_ID} className="map-units-list" aria-label={m.map_units_list_label()}>
          {units.map((unit) => (
            <li key={unit.unitId}>
              <button
                type="button"
                className="map-unit-row"
                aria-pressed={selected === unit.unitId}
                data-unit-id={unit.unitId}
                data-kind={unit.kind}
                data-hold={unit.hold ?? undefined}
                onClick={() => onPick(unit)}
              >
                <span className="map-unit-name">{unitName(unit)}</span>
                <span className="map-unit-status">{unitStatusText(unit, moving.has(unit.unitId), now)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ElsewhereLine count={elsewhere} />
    </section>
  );
}

/** "다른 곳에 내 유닛 N" 한 줄(632 다): 누르면 유닛 화면 */
function ElsewhereLine({ count }: { readonly count: number }) {
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

/** 고른 유닛 단추: [멈추기](명령할 수 있고 가는 중일 때)·[선택 해제] */
export function SelectedActions({
  onStop,
  onDeselect,
}: {
  /** 멈출 수 없으면 null */
  readonly onStop: (() => void) | null;
  readonly onDeselect: () => void;
}) {
  return (
    <div className="map-actions">
      {onStop ? (
        <button type="button" className="button-small button-primary map-unit-stop" onClick={onStop}>
          {m.map_unit_stop()}
        </button>
      ) : null}
      <button type="button" className="button-small" onClick={onDeselect}>
        {m.map_deselect()}
      </button>
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

/** 개발·운영 단추(dev·admin): [시험 일꾼 받기]·[운영자 모드](모든 유닛 명령 + 안개 없는 전체 보기) */
export function OperatorActions({
  operator,
  notice,
  onSpawn,
  onToggle,
}: {
  readonly operator: boolean;
  readonly notice: string | null;
  readonly onSpawn: () => void;
  readonly onToggle: () => void;
}) {
  return (
    <div className="map-actions" data-observe={operator ? "on" : "off"}>
      {notice ? (
        <p className="map-panel map-command" role="status">
          {notice}
        </p>
      ) : null}
      <button type="button" className="button-small map-dev-spawn" onClick={onSpawn}>
        {m.map_vision_spawn()}
      </button>
      <button
        type="button"
        className="button-small map-dev-observe map-operator-toggle"
        aria-pressed={operator}
        onClick={onToggle}
      >
        {m.map_operator_mode()}
      </button>
    </div>
  );
}

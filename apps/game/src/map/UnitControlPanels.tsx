// 2차맵 화면의 유닛 조종 몫 — [내 유닛 N]·내 유닛 목록·"다른 곳에 내 유닛 N" 줄·고른 유닛 단추([멈추기])·남의 유닛 정보 판·운영자 표시와 개발 단추.
// 바뀜(사용자 지적 2026-11-09 "다른 유닛 눌려지면 상호작용 메뉴가 나오거나 다른곳을 눌러 저절로 닫히게 해야함"): 남의 유닛은 고르지 않고 정보 판(PeekCard)을
// 연다. 고른 유닛이 늘 내 유닛이라 [내 유닛으로]는 없앴다.
// 바뀜(사용자 지적 2026-11-09 문제2 "내 사이보그가 아니라 보유한 유닛목록을 띄워서 선택해야한다. 내 유닛선택이 아예 사라졌다"): [내 사이보그]
// 단추 자리에 [내 유닛 N] → 이 2차맵의 내 유닛 목록(사이보그 본체가 첫 줄, 637 나 차례)을 다시 둔다. 근처 판 유닛 탭(가까운 차례, 남의 유닛 포함)은
// 그대로다(docs/adr/2026-11-08-seamless-second-map.md "바뀜 3").
// docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야
// 자유이동이 가능"). 상태는 화면(SecondaryMapScreen.tsx)이 갖고, 여기는 그리기만 한다.
// 기획 답 632 다: 유닛 목록 끝에 "다른 곳에 내 유닛 N" 한 줄 — 누르면 유닛 화면(모든 유닛).
import type { MapUnit, MapUnitGlance } from "@terra/shared/mapUnits";
import { type ReactNode, useId } from "react";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { elsewhereText, peekText, unitName, unitStatusText } from "./mapUnits.ts";
import "./unitControl.css";

/** 목록 id(여닫기 단추의 aria-controls) */
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

/** 펼친 내 유닛 목록. 줄을 누르면 그 유닛을 고르고 카메라가 따라간다(화면이 한다) */
export function MyUnitsPanel({
  units,
  failed,
  elsewhere,
  moving,
  now,
  selected,
  onPick,
  onClose,
}: {
  /** 이 2차맵의 내 유닛(목록 차례 — sortMapUnits, 받기 전 null) */
  readonly units: readonly MapUnit[] | null;
  readonly failed: boolean;
  /** 이 2차맵 밖의 내 유닛 수(632 다) */
  readonly elsewhere: number;
  /** 엔진이 지금 가는 중이라고 하는 유닛(1초마다) */
  readonly moving: ReadonlySet<number>;
  /** 목록을 받은 서버 시각(부상 남은 시간, D-525) */
  readonly now?: number | undefined;
  readonly selected: number | null;
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

/** 고른 유닛 단추: [멈추기](명령할 수 있고 가는 중일 때) */
export function SelectedActions({
  onStop,
}: {
  /** 멈출 수 없으면 null */
  readonly onStop: (() => void) | null;
}) {
  if (!onStop) return null;
  return (
    <div className="map-actions">
      <button type="button" className="button-small button-primary map-unit-stop" onClick={onStop}>
        {m.map_unit_stop()}
      </button>
    </div>
  );
}

/**
 * 남의 유닛 정보 판(docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"): 플레이어가 남의 유닛을 누르면 명령 유닛은 그대로 두고 이 판을 연다.
 * 이름·주인·움직임과 "땅을 누르면 닫고 내 유닛을 보낸다" 안내, [닫기]. 지도자면 지도자 몫(children — 지도자와 이야기)을 안에 둔다.
 * 땅을 누르면 화면이 닫는다(같은 누르기가 명령 유닛을 그곳으로 보낸다)
 */
export function PeekCard({
  unitId,
  moving,
  glance,
  onClose,
  children,
}: {
  readonly unitId: number;
  readonly moving: boolean;
  readonly glance: MapUnitGlance | null;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const titleId = useId();
  const text = peekText(unitId, moving, glance);
  return (
    <section className="map-panel map-peek" aria-labelledby={titleId} data-unit={unitId}>
      <div className="map-peek-head">
        <h2 id={titleId} className="map-peek-title">
          {text.unit}
        </h2>
        <button type="button" className="button-small map-peek-close" onClick={onClose}>
          {m.map_peek_close()}
        </button>
      </div>
      <p className="map-peek-line">{text.line}</p>
      <p className="map-peek-note">{m.map_peek_note()}</p>
      {children}
    </section>
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
 * 개발·운영 단추(dev·admin): [운영자 모드](모든 유닛 명령 + 안개 없는 전체 보기)·[자유 시점](운영자 모드에서만 — 기준 유닛 따라가기를
 * 끄고 끌어서 옮긴다, docs/adr/2026-11-08-seamless-second-map.md WP-1 Q2). 운영자 단추는 빨간 운영자 모양(map-operator-button, 사용자 답 Q2).
 * [시험 일꾼 받기]는 지웠다(사용자 지적 2026-11-09 "시험일꾼받기 기능 없애라" — 서버 dev_spawn_units 처리는 남는다)
 */
export function OperatorActions({
  operator,
  freeView,
  onToggle,
  onFreeView,
}: {
  readonly operator: boolean;
  readonly freeView: boolean;
  readonly onToggle: () => void;
  readonly onFreeView: () => void;
}) {
  return (
    <div className="map-actions" data-observe={operator ? "on" : "off"}>
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

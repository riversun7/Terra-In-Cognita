// 2차맵 화면의 유닛 조종 몫 — 내 유닛 목록·"다른 곳에 내 유닛 N" 줄·고른 유닛 단추([멈추기])·남의 유닛 정보 판·운영자 표시와 운영 메뉴 줄.
// 바뀜(사용자 지적 2026-11-12 "2차맵에 버튼을 제대로 정리해라"): [내 유닛 N] 단추는 아래 탭 [유닛](MapBottomNav.tsx)이 맡고, [운영자 모드]·[자유 시점]은
// 운영 메뉴 판(OperatorMenu.tsx) 안의 줄이다.
// 바뀜(사용자 지적 2026-11-09 "다른 유닛 눌려지면 상호작용 메뉴가 나오거나 다른곳을 눌러 저절로 닫히게 해야함"): 남의 유닛은 고르지 않고 작은 창(PeekCard)을
// 연다. 고른 유닛이 늘 내 유닛이라 [내 유닛으로]는 없앴다. 2026-11-10: 운영자 모드도 같다 — 작은 창의 [이 유닛 조종]만 명령 유닛을 바꾼다.
// 바뀜(사용자 지적 2026-11-09 문제2 "내 사이보그가 아니라 보유한 유닛목록을 띄워서 선택해야한다. 내 유닛선택이 아예 사라졌다"): [내 사이보그]
// 단추 자리에 [내 유닛 N] → 이 2차맵의 내 유닛 목록(사이보그 본체가 첫 줄, 637 나 차례)을 다시 둔다. 근처 판 유닛 탭(가까운 차례, 남의 유닛 포함)은
// 그대로다(docs/adr/2026-11-08-seamless-second-map.md "바뀜 3").
// docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야
// 자유이동이 가능"). 상태는 화면(SecondaryMapScreen.tsx)이 갖고, 여기는 그리기만 한다.
// 기획 답 632 다: 유닛 목록 끝에 "다른 곳에 내 유닛 N" 한 줄 — 누르면 유닛 화면(모든 유닛).
import type { MapUnit, MapUnitGlance } from "@terra/shared/mapUnits";
import { type ReactNode, useId } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { navigate } from "../shell/routerStore.ts";
import { elsewhereText, peekText, unitName, unitStatusText } from "./mapUnits.ts";
import { UnitAdvice } from "../roster/UnitAdvice.tsx";
import { HouseReport } from "../faction/identity/HouseReport.tsx";
import { OperatorMenuToggle } from "./OperatorMenu.tsx";
import { OPERATOR_PACE_CHOICES } from "./operatorPace.ts";
import "./unitControl.css";

/** 목록 id(여닫기 단추의 aria-controls) */
const LIST_ID = "map-units-list";

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
              {/* 고른 내 유닛: 스탯 기준 추천 한 줄(1차 생산·전투 유형, docs/adr/2026-11-11-production-six.md) */}
              {selected === unit.unitId && unit.stats ? <UnitAdvice stats={unit.stats} compact /> : null}
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

/** 작은 창이 열린 동안 땅을 누르면 무엇이 가나(안내 줄): 내 유닛·운영자가 조종 중인 유닛·보낼 유닛 없음 */
export type PeekGround = "own" | "operator" | "none";

const PEEK_NOTE = {
  own: () => m.map_peek_note(),
  operator: () => m.map_peek_note_operator(),
  none: () => m.map_peek_note_none(),
} satisfies Record<PeekGround, () => string>;

/**
 * 남의 유닛 작은 창(상호작용 메뉴 — docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"·"바뀜 (2026-11-10)", 사용자 지적 2026-11-10
 * "다른 유닛 클릭시 팝업으로 상호작용 메뉴띄우고 다른곳 클릭시 닫기"): 누구든(운영자 모드도) 남의 유닛을 누르면 명령 유닛은 그대로 두고 이 창을 연다.
 * 이름, 주인·움직임 한 줄, 지금 할 수 있는 일(지도자면 지도자 몫 children — 지도자와 이야기, 운영자 모드면 [이 유닛 조종] — 이 단추만 명령 유닛을
 * 바꾼다), 없으면 "할 수 있는 일이 아직 없다" 한 줄, 닫는 법 안내, [닫기]. 다른 곳을 누르면 화면이 닫는다(땅이면 같은 누르기로 명령 유닛이 간다)
 */
export function PeekCard({
  unitId,
  moving,
  glance,
  ground,
  hasActions,
  onControl,
  onClose,
  children,
}: {
  readonly unitId: number;
  readonly moving: boolean;
  readonly glance: MapUnitGlance | null;
  readonly ground: PeekGround;
  /** children에 할 수 있는 일이 있나(지도자) — 없고 운영자도 아니면 "아직 없다" 줄 */
  readonly hasActions: boolean;
  /** 운영자 모드: 이 유닛을 명령 유닛으로 삼는다(없으면 단추 없음) */
  readonly onControl: (() => void) | null;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const titleId = useId();
  const text = peekText(unitId, moving, glance);
  return (
    <section
      className="map-panel map-peek"
      role="dialog"
      aria-labelledby={titleId}
      data-unit={unitId}
      data-ground={ground}
    >
      <div className="map-peek-head">
        <h2 id={titleId} className="map-peek-title">
          {text.unit}
        </h2>
        <button type="button" className="button-small map-peek-close" onClick={onClose}>
          {m.map_peek_close()}
        </button>
      </div>
      <p className="map-peek-line">
        {glance?.faction?.emblem ? (
          <NationEmblem
            spec={glance.faction.emblem.spec}
            color={glance.faction.emblem.color}
            uploaded={glance.faction.emblem.uploaded}
            size={20}
            className="map-peek-emblem"
          />
        ) : null}
        {text.line}
      </p>
      {glance?.owner ? (
        // 유저 유닛: 주인이 정한 세력 이름·약어·마크(docs/adr/2026-11-11-faction-identity.md 6절)
        <p className="map-peek-line map-peek-owner" data-part="peek-owner">
          <NationEmblem
            spec={glance.owner.emblem}
            color={glance.owner.color}
            uploaded={glance.owner.uploaded}
            size={20}
            className="map-peek-emblem"
          />
          <span translate="no">
            {m.map_peek_owner({ name: glance.owner.name, tag: glance.owner.shortName })}
          </span>
        </p>
      ) : null}
      {glance?.unaffiliated === true ? (
        // 가문 없는 유저 유닛 = 무소속(기획 D-565)
        <p className="map-peek-line map-peek-owner" data-part="peek-unaffiliated">
          {m.map_peek_unaffiliated()}
        </p>
      ) : null}
      {glance?.npcHouse ? (
        // NPC 도시 휴먼의 가문(질문 1848 답 — 도시마다 하나, 가문장 = 시장). 이름은 성이라 번역하지 않는다
        <p className="map-peek-line map-peek-owner" data-part="peek-npc-house" translate="no">
          {glance.npcHouse.leader === true
            ? m.map_peek_npc_house_leader({ name: glance.npcHouse.name })
            : m.map_peek_npc_house({ name: glance.npcHouse.name })}
        </p>
      ) : null}
      {/* 다른 가문 [신고](질문 930 나) — 옛 서버면 가문 ID가 없어 단추가 없다 */}
      {glance?.owner?.houseId === undefined ? null : (
        <HouseReport houseId={glance.owner.houseId} name={glance.owner.name} />
      )}
      {children}
      {onControl ? (
        <div className="map-peek-menu">
          <button
            type="button"
            className="button-small map-operator-button map-peek-control"
            onClick={onControl}
          >
            {m.map_peek_control()}
          </button>
        </div>
      ) : hasActions ? null : (
        <p className="map-peek-empty">{m.map_peek_no_actions()}</p>
      )}
      <p className="map-peek-note">{PEEK_NOTE[ground]()}</p>
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
 * 운영 메뉴의 운영자 줄(dev·admin): [운영자 모드](모든 유닛 명령 + 안개 없는 전체 보기)·[자유 시점](운영자 모드에서만 — 기준 유닛 따라가기를
 * 끄고 끌어서 옮긴다, docs/adr/2026-11-08-seamless-second-map.md WP-1 Q2). 운영자 단추는 빨간 운영자 모양(map-operator-button, 사용자 답 Q2).
 * [시험 일꾼 받기]는 지웠다(사용자 지적 2026-11-09 "시험일꾼받기 기능 없애라"). 서버 명령 dev_spawn_units도 프로토콜 20에서 뺐다
 */
export function OperatorItems({
  operator,
  freeView,
  pace,
  onToggle,
  onFreeView,
  onPace,
}: {
  readonly operator: boolean;
  readonly freeView: boolean;
  /** 운영자 배율(기본 1 — 기획 D-560 1246) */
  readonly pace: number;
  readonly onToggle: () => void;
  readonly onFreeView: () => void;
  readonly onPace: (factor: number) => void;
}) {
  return (
    <>
      <OperatorMenuToggle
        pressed={operator}
        onToggle={onToggle}
        className="map-dev-observe map-operator-toggle"
        label={m.map_operator_mode()}
        note={m.map_ops_operator_note()}
      />
      {operator ? (
        <OperatorMenuToggle
          pressed={freeView}
          onToggle={onFreeView}
          className="map-free-view"
          label={m.map_free_view()}
        />
      ) : null}
      {operator ? <OperatorPaceRow pace={pace} onPace={onPace} /> : null}
    </>
  );
}

/** [운영자 속도] 칩 줄(1×·10×·100×, 눌린 것 = 지금 배율). 칩을 누르면 운영 메뉴가 닫힌다(D-560 1239) */
function OperatorPaceRow({
  pace,
  onPace,
}: {
  readonly pace: number;
  readonly onPace: (factor: number) => void;
}) {
  return (
    <li className="map-operator-menu-row map-operator-pace" data-pace={pace}>
      <span className="map-operator-pace-label" id="map-operator-pace-label">
        {m.map_operator_pace()}
      </span>
      <span className="map-operator-pace-chips" role="group" aria-labelledby="map-operator-pace-label">
        {OPERATOR_PACE_CHOICES.map((factor) => (
          <button
            key={factor}
            type="button"
            className="button-small map-operator-button map-operator-pace-chip"
            data-factor={factor}
            aria-pressed={pace === factor}
            onClick={() => onPace(factor)}
          >
            {m.map_operator_pace_value({ factor })}
          </button>
        ))}
      </span>
      <p className="map-operator-menu-note">{m.map_operator_pace_note()}</p>
    </li>
  );
}

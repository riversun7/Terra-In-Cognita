// 유닛 목록 칸 — 걸러 보기(종류·상태·거점)·다중 선택(D-6016)·상세. 좁은 폭은 목록 ↔ 상세, 넓은 폭은 목록 옆 상세 판.
// 정렬은 손이 필요한 순이다(질문 137 기본안 → D-443, rosterText.ts sortUnits). 고른 유닛에 줄 명령은 아직 "곧 열림"이다.
import type { RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import { useMemo, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { PreviewTag, SoonButton } from "../roster/parts.tsx";
import { navigate } from "../shell/routerStore.ts";
import {
  NO_FILTER,
  type StatusFilter,
  type TypeFilter,
  UNIT_STATUSES,
  type UnitFilter,
  basesOf,
  filterUnits,
  formatNumber,
  jobLabel,
  sortUnits,
  statusLabel,
  typeLabel,
  unitLabel,
  unitStatus,
} from "../roster/rosterText.ts";
import { type VitalsNow, type VitalsShown, worldUnitId } from "../roster/useVitals.ts";
import { InjuryBadge } from "../roster/InjuryBadge.tsx";
import { EntityRef, type UnitSymbolRole } from "../ui/EntityRef.tsx";
import { UnitAvatar, UnitDetail } from "./UnitDetail.tsx";

function unitRoleOf(unit: Pick<RosterUnit, "type" | "self">): UnitSymbolRole {
  if (unit.self === true || unit.type === "cyborg") return "cyborg";
  if (unit.type === "android") return "android";
  if (unit.type === "creature") return "creature";
  return "human";
}

// 사이보그 = 내 사이보그 본체(맨 위 줄, "본체" 표 — 사용자 결정 2026-11-24)와 융합한 사이보그 유닛(D-470 "유닛 탭 종류에 사이보그도")
const TYPE_FILTERS = [
  "all",
  "human",
  "creature",
  "android",
  "cyborg",
  "test",
] as const satisfies readonly TypeFilter[];

const TYPE_FILTER_LABELS = {
  all: m.units_filter_all,
  human: m.roster_type_human,
  creature: m.roster_type_creature,
  android: m.roster_type_android,
  cyborg: m.roster_type_cyborg,
  test: m.units_filter_test,
} satisfies Record<TypeFilter, () => string>;

const isTypeFilter = (value: string): value is TypeFilter =>
  (TYPE_FILTERS as readonly string[]).includes(value);
const isStatusFilter = (value: string): value is StatusFilter =>
  value === "all" || (UNIT_STATUSES as readonly string[]).includes(value);

/** 주소가 고른 유닛의 ID(self = 본체 줄). 목록에 없으면 null */
function requestedUnit(data: UnitsListResponse, openUnit: string | undefined): string | null {
  if (openUnit === undefined) return null;
  const found =
    openUnit === "self"
      ? data.units.find((unit) => unit.self === true)
      : data.units.find((unit) => unit.id === openUnit);
  return found?.id ?? null;
}

/** 화면 유닛의 지금 생명 수치(실제 세계 유닛만, D-512) */
const vitalsOf = (vitals: VitalsNow | undefined, unit: RosterUnit): VitalsShown | undefined => {
  const id = worldUnitId(unit.id);
  return id === null ? undefined : vitals?.of(id);
};

export function UnitList({
  data,
  vitals,
  onHoldingsChanged,
  openUnit,
}: {
  data: UnitsListResponse;
  vitals?: VitalsNow | undefined;
  /** 보유 물건 목록이 다시 왔을 때(장착·해제·사용 뒤): 생명 수치와 유닛 목록(입은 장비가 든 스탯)을 다시 받는다 */
  onHoldingsChanged?: (() => void) | undefined;
  /** 주소의 ?unit=(유닛 ID 또는 self = 내 사이보그 본체 줄): 그 유닛의 상세를 연다 */
  openUnit?: string | undefined;
}) {
  const [filter, setFilter] = useState<UnitFilter>(NO_FILTER);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(() => requestedUnit(data, openUnit));
  // 화면이 떠 있는 채로 주소의 ?unit=이 바뀌면(위 띠 사이보그 얼굴) 그 유닛을 연다. 지워지면(상세를 닫음) 그대로 둔다
  const [applied, setApplied] = useState(openUnit);
  if (applied !== openUnit) {
    setApplied(openUnit);
    if (openUnit !== undefined) setOpenId(requestedUnit(data, openUnit));
  }
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const sorted = useMemo(() => sortUnits(data.units), [data.units]);
  const shown = useMemo(() => filterUnits(sorted, filter), [sorted, filter]);
  const bases = useMemo(() => basesOf(data.units), [data.units]);
  // 고른 것 중 지금 목록에 있는 것만 센다(받은 자료가 바뀌어 사라진 유닛은 빼고)
  const selectedShown = shown.filter((unit) => selected.has(unit.id));
  const open = openId === null ? undefined : data.units.find((unit) => unit.id === openId);
  const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((unit) => unit.id)));
  const closeDetail = () => {
    const id = openId;
    setOpenId(null);
    // 주소로 연 상세면 주소에서 지운다(같은 길을 다시 누르면 또 열리게)
    if (openUnit !== undefined) navigate({ route: "units" }, { replace: true });
    // 좁은 폭에서 목록이 다시 보이면 보던 줄로 초점을 돌려준다(다음 그리기 뒤)
    if (id !== null) requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  };

  if (data.units.length === 0) {
    return (
      <div className="panel roster-empty-panel">
        <p className="roster-empty-title">{m.units_empty_title()}</p>
        <p className="lead">{m.units_empty_body()}</p>
      </div>
    );
  }

  return (
    <div className="units-split" data-view={open ? "detail" : "list"}>
      <div className="units-list-pane">
        <div className="units-filters">
          <label className="units-filter">
            <span className="units-filter-label">{m.units_filter_type()}</span>
            <select
              value={filter.type}
              onChange={(event) => {
                const value = event.target.value;
                if (isTypeFilter(value)) setFilter((current) => ({ ...current, type: value }));
              }}
            >
              {TYPE_FILTERS.map((id) => (
                <option key={id} value={id}>
                  {TYPE_FILTER_LABELS[id]()}
                </option>
              ))}
            </select>
          </label>
          <label className="units-filter">
            <span className="units-filter-label">{m.units_filter_status()}</span>
            <select
              value={filter.status}
              onChange={(event) => {
                const value = event.target.value;
                if (isStatusFilter(value)) setFilter((current) => ({ ...current, status: value }));
              }}
            >
              <option value="all">{m.units_filter_all()}</option>
              {UNIT_STATUSES.map((id) => (
                <option key={id} value={id}>
                  {statusLabel(id)}
                </option>
              ))}
            </select>
          </label>
          {bases.length > 0 ? (
            <label className="units-filter">
              <span className="units-filter-label">{m.units_filter_base()}</span>
              <select
                value={filter.base}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilter((current) => ({ ...current, base: value }));
                }}
              >
                <option value="">{m.units_filter_all()}</option>
                {bases.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="units-list-head">
          <p className="roster-meta" aria-live="polite">
            {m.units_count({ shown: formatNumber(shown.length), total: formatNumber(data.units.length) })}
          </p>
          {shown.length > 0 ? (
            <button type="button" className="button-text" onClick={toggleAll}>
              {allShownSelected ? m.units_select_none() : m.units_select_all()}
            </button>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <p className="roster-empty">{m.units_filter_empty()}</p>
        ) : (
          <ul className="units-rows">
            {shown.map((unit) => (
              <UnitRow
                key={unit.id}
                unit={unit}
                data={data}
                vitals={vitalsOf(vitals, unit)}
                checked={selected.has(unit.id)}
                current={unit.id === openId}
                onToggle={() => toggle(unit.id)}
                onOpen={() => setOpenId(unit.id)}
                rowRef={(element) => {
                  if (element) rowRefs.current.set(unit.id, element);
                  else rowRefs.current.delete(unit.id);
                }}
              />
            ))}
          </ul>
        )}
        {selectedShown.length > 0 ? (
          <div className="units-selection" role="region" aria-label={m.units_selection_label()}>
            <p className="units-selection-count">
              {m.units_selected({ count: formatNumber(selectedShown.length) })}
            </p>
            <div className="units-selection-actions">
              <SoonButton label={m.units_action_assign_job()} />
              <SoonButton label={m.units_action_add_party()} />
              <button type="button" className="button-small" onClick={() => setSelected(new Set())}>
                {m.units_select_none()}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="units-detail-pane">
        {open ? (
          <UnitDetail
            key={open.id}
            unit={open}
            data={data}
            vitals={vitalsOf(vitals, open)}
            onVitalsStale={onHoldingsChanged ?? vitals?.reload}
            onClose={closeDetail}
          />
        ) : (
          <div className="panel units-detail-placeholder">
            <p className="lead">{m.units_detail_pick()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UnitRow({
  unit,
  data,
  vitals,
  checked,
  current,
  onToggle,
  onOpen,
  rowRef,
}: {
  unit: RosterUnit;
  data: UnitsListResponse;
  vitals: VitalsShown | undefined;
  checked: boolean;
  current: boolean;
  onToggle: () => void;
  onOpen: () => void;
  rowRef: (element: HTMLButtonElement | null) => void;
}) {
  const label = unitLabel(unit);
  const status = unitStatus(unit);
  const meta = [
    unit.level === null ? null : m.roster_level({ level: formatNumber(unit.level) }),
    typeLabel(unit.type),
    unit.place?.base ?? null,
  ].filter((part) => part !== null);
  return (
    <li
      className="units-row"
      data-current={current ? "true" : undefined}
      data-status={status}
      data-self={unit.self ? "true" : undefined}
    >
      <label className="units-row-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="visually-hidden">{m.units_select_one({ name: label })}</span>
      </label>
      <button
        type="button"
        className="units-row-main"
        ref={rowRef}
        onClick={onOpen}
        aria-current={current || undefined}
      >
        <UnitAvatar unit={unit} />
        <span className="units-row-text">
          <span className="units-row-title">
            <EntityRef
              kind="unit"
              role={unitRoleOf(unit)}
              name={label}
              mine={unit.self === true}
              className="units-row-name"
            />
            {unit.self ? <span className="roster-tag units-self-tag">{m.units_self_tag()}</span> : null}
            {unit.preview ? <PreviewTag /> : null}
          </span>
          <span className="units-row-meta">{meta.join(" · ")}</span>
          <span className="units-row-chips">
            <span className="roster-tag" data-tone={status}>
              {statusLabel(status)}
            </span>
            {unit.job ? <span className="roster-tag">{jobLabel(unit.job, data.names)}</span> : null}
            <InjuryBadge injury={unit.injury} now={data.generatedAt} />
            {vitals ? (
              <span
                className="roster-tag"
                data-vitals="hp"
                data-tone={vitals.values.hp < vitals.max.hp ? "injured" : undefined}
              >
                {m.vitals_hp_short({
                  value: formatNumber(vitals.values.hp),
                  max: formatNumber(vitals.max.hp),
                })}
              </span>
            ) : null}
            {unit.moving ? <span className="roster-tag">{m.roster_moving()}</span> : null}
            {unit.cargo.length > 0 ? (
              <span className="roster-tag">
                {m.roster_cargo_count({ count: formatNumber(unit.cargo.length) })}
              </span>
            ) : null}
            <span className="roster-tag roster-tag-plain">
              {unit.energy.kind === "battery"
                ? m.roster_battery_short({
                    value: formatNumber(unit.energy.value),
                    max: formatNumber(unit.energy.max),
                  })
                : m.roster_fatigue_short({
                    value: formatNumber(unit.energy.value),
                    max: formatNumber(unit.energy.max),
                  })}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

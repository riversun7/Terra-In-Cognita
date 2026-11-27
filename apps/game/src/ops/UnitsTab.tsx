// 운영자 콘솔 · 유닛 탭 — 메모리 월드의 모든 유닛(유저·NPC 나눠 거르기, 2차맵 키·종류 코드). 줄을 누르면 유닛 상세(통제).
// 다른 화면에서 건너오면(jump — 유저의 유닛 수, 유닛 표의 위치 등) 그 주인·2차맵으로 거른 채 연다. 주인 거르기는 줄 위 표지로 보이고 푼다.
import { OPS_UNIT_STATES, type OpsUnitSort, type OpsUnitState } from "@terra/shared/ops";
import { useCallback, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail, OpsUnitsJump } from "./OpsConsole.tsx";
import { LoadState, Pager, UNIT_KIND_CODES, unitKindLabel, useOpsLoad } from "./opsUi.tsx";
import { type UnitSort, UnitTable } from "./UnitTable.tsx";

const PAGE = 100;
type OwnerKind = "user" | "faction" | "";

const STATE_LABELS: { readonly [S in OpsUnitState]: () => string } = {
  working: m.ops_state_working,
  resting: m.ops_state_resting,
  idle: m.ops_state_idle,
  moving: m.ops_status_moving,
  injured: m.ops_state_injured,
  captive: m.ops_status_captive,
};
const isState = (value: string): value is OpsUnitState =>
  (OPS_UNIT_STATES as readonly string[]).includes(value);

function parseOptionalInt(value: string): number | undefined {
  if (!/^[0-9]{1,15}$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

export function UnitsTab({
  open,
  canUsers,
  canNpcs,
  planetId,
  jump,
}: {
  /** 건너온 거르기(주인·2차맵). 없으면 전체 */
  jump?: OpsUnitsJump | undefined;
  open: OpenDetail;
  canUsers: boolean;
  canNpcs: boolean;
  /** 이 행성의 유닛만(없으면 모든 행성) */
  planetId?: string | undefined;
}) {
  // 둘 다 볼 수 없으면 볼 수 있는 쪽으로 처음부터 거른다(서버가 둘 다 없는 조회를 막는다)
  const initialOwner: OwnerKind =
    jump?.ownerKind ?? (canUsers && canNpcs ? "" : canUsers ? "user" : "faction");
  const [ownerKind, setOwnerKind] = useState<OwnerKind>(initialOwner);
  /** 주인 하나로 거르기(건너온 것만 — 줄 위 표지에서 푼다) */
  const [owner, setOwner] = useState<{ id: number; label: string } | null>(
    jump?.ownerId === undefined ? null : { id: jump.ownerId, label: jump.label ?? `#${jump.ownerId}` },
  );
  const [mapInput, setMapInput] = useState(jump?.mapKey === undefined ? "" : String(jump.mapKey));
  const [kindInput, setKindInput] = useState("");
  const [idInput, setIdInput] = useState("");
  const [query, setQuery] = useState<{ mapKey?: number; kind?: number; offset: number }>(
    jump?.mapKey === undefined ? { offset: 0 } : { offset: 0, mapKey: jump.mapKey },
  );
  const ownerId = owner?.id;
  /** 작업 상태 거르기("" = 전체)와 정렬(칸 머리를 눌러 바꾼다 — 같은 칸을 다시 누르면 차례를 뒤집는다) */
  const [state, setState] = useState<OpsUnitState | "">("");
  const [sort, setSort] = useState<UnitSort>({ key: "id", desc: false });
  const restart = (): void => setQuery((previous) => ({ ...previous, offset: 0 }));
  const pickState = (value: OpsUnitState | ""): void => {
    setState(value);
    restart();
  };
  const pickSort = (key: OpsUnitSort): void => {
    // 레벨·피로는 큰 것부터, ID는 작은 것부터 시작한다
    setSort((previous) =>
      previous.key === key ? { key, desc: !previous.desc } : { key, desc: key !== "id" },
    );
    restart();
  };
  const loaded = useOpsLoad(
    useCallback(
      (signal: AbortSignal) =>
        api.ops.units.list.query(
          {
            ...(ownerKind === "" ? {} : { ownerKind }),
            ...(ownerId === undefined ? {} : { ownerId }),
            planetId,
            ...(query.mapKey === undefined ? {} : { mapKey: query.mapKey }),
            ...(query.kind === undefined ? {} : { kind: query.kind }),
            ...(state === "" ? {} : { state }),
            sort: sort.key,
            desc: sort.desc,
            limit: PAGE,
            offset: query.offset,
          },
          { signal },
        ),
      [ownerKind, ownerId, query, planetId, state, sort],
    ),
  );
  const rows = loaded.data?.rows ?? [];
  return (
    <div className="ops-stack">
      <form
        className="ops-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const mapKey = parseOptionalInt(mapInput);
          const kind = parseOptionalInt(kindInput);
          setQuery({
            offset: 0,
            ...(mapKey === undefined ? {} : { mapKey }),
            ...(kind === undefined ? {} : { kind }),
          });
        }}
      >
        <label className="ops-inline">
          {m.ops_filter_owner()}
          <select
            value={ownerKind}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "" || value === "user" || value === "faction") {
                setOwnerKind(value);
                setQuery((previous) => ({ ...previous, offset: 0 }));
              }
            }}
          >
            {canUsers && canNpcs ? <option value="">{m.ops_filter_all()}</option> : null}
            {canUsers ? <option value="user">{m.ops_owner_user()}</option> : null}
            {canNpcs ? <option value="faction">{m.ops_owner_faction()}</option> : null}
          </select>
        </label>
        <label className="ops-inline">
          {m.ops_filter_state()}
          <select
            value={state}
            data-ops-filter="state"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "" || isState(value)) pickState(value);
            }}
          >
            <option value="">{m.ops_filter_all()}</option>
            {OPS_UNIT_STATES.map((value) => (
              <option key={value} value={value}>
                {STATE_LABELS[value]()}
              </option>
            ))}
          </select>
        </label>
        <label className="ops-inline">
          {m.ops_filter_map()}
          <input
            className="input ops-narrow"
            inputMode="numeric"
            value={mapInput}
            onChange={(event) => setMapInput(event.target.value)}
          />
        </label>
        <label className="ops-inline">
          {m.ops_filter_unit_kind()}
          <input
            className="input ops-narrow"
            inputMode="numeric"
            list="ops-unit-kinds"
            value={kindInput}
            onChange={(event) => setKindInput(event.target.value)}
          />
          <datalist id="ops-unit-kinds">
            {UNIT_KIND_CODES.map((kind) => (
              <option key={kind} value={kind}>
                {unitKindLabel(kind)}
              </option>
            ))}
          </datalist>
        </label>
        <button type="submit" className="button-small">
          {m.ops_search()}
        </button>
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
        <label className="ops-inline">
          {m.ops_open_unit()}
          <input
            className="input ops-narrow"
            inputMode="numeric"
            value={idInput}
            onChange={(event) => setIdInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button-small"
          disabled={parseOptionalInt(idInput) === undefined}
          onClick={() => {
            const id = parseOptionalInt(idInput);
            if (id !== undefined) open({ kind: "unit", id });
          }}
        >
          {m.ops_open()}
        </button>
      </form>
      {owner ? (
        <p className="ops-inline" data-ops-owner-filter={owner.id}>
          <span className="dev-badge" translate="no">
            {m.ops_units_owner({ owner: owner.label })}
          </span>
          <button
            type="button"
            className="button-small"
            onClick={() => {
              setOwner(null);
              setQuery((previous) => ({ ...previous, offset: 0 }));
            }}
          >
            {m.ops_filter_clear()}
          </button>
        </p>
      ) : null}
      <LoadState loaded={loaded} />
      {loaded.data?.status === "not_ready" ? <p className="message">{m.ops_res_not_ready()}</p> : null}
      <UnitTable rows={rows} open={open} sort={sort} onSort={pickSort} onState={pickState} />
      <Pager
        offset={query.offset}
        shown={rows.length}
        total={loaded.data?.total ?? 0}
        size={PAGE}
        onGo={(offset) => setQuery((previous) => ({ ...previous, offset }))}
      />
    </div>
  );
}

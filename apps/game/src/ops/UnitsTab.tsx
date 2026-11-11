// 운영자 콘솔 · 유닛 탭 — 메모리 월드의 모든 유닛(유저·NPC 나눠 거르기, 2차맵 키·종류 코드). 줄을 누르면 유닛 상세(통제).
import { useCallback, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import type { OpenDetail } from "./OpsConsole.tsx";
import { LoadState, Pager, UNIT_KIND_CODES, unitKindLabel, useOpsLoad } from "./opsUi.tsx";
import { UnitTable } from "./UnitTable.tsx";

const PAGE = 100;
type OwnerKind = "user" | "faction" | "";

function parseOptionalInt(value: string): number | undefined {
  if (!/^[0-9]{1,15}$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

export function UnitsTab({
  open,
  canUsers,
  canNpcs,
  planetId,
}: {
  open: OpenDetail;
  canUsers: boolean;
  canNpcs: boolean;
  /** 이 행성의 유닛만(없으면 모든 행성) */
  planetId?: string | undefined;
}) {
  // 둘 다 볼 수 없으면 볼 수 있는 쪽으로 처음부터 거른다(서버가 둘 다 없는 조회를 막는다)
  const initialOwner: OwnerKind = canUsers && canNpcs ? "" : canUsers ? "user" : "faction";
  const [ownerKind, setOwnerKind] = useState<OwnerKind>(initialOwner);
  const [mapInput, setMapInput] = useState("");
  const [kindInput, setKindInput] = useState("");
  const [query, setQuery] = useState<{ mapKey?: number; kind?: number; offset: number }>({ offset: 0 });
  const loaded = useOpsLoad(
    useCallback(
      (signal: AbortSignal) =>
        api.ops.units.list.query(
          {
            ...(ownerKind === "" ? {} : { ownerKind }),
            planetId,
            ...(query.mapKey === undefined ? {} : { mapKey: query.mapKey }),
            ...(query.kind === undefined ? {} : { kind: query.kind }),
            limit: PAGE,
            offset: query.offset,
          },
          { signal },
        ),
      [ownerKind, query, planetId],
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
      </form>
      <LoadState loaded={loaded} />
      {loaded.data?.status === "not_ready" ? <p className="message">{m.ops_res_not_ready()}</p> : null}
      <UnitTable rows={rows} open={open} />
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

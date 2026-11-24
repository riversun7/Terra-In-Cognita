// 건물별 접근 권한 표시·변경 카드(ADR 2026-11-25-building-access-and-foreign-build.md):
// - 모두에게: 현재 적용 중인 접근 권한(기본값 여부)과 본인이 차단된 경우 이유를 알린다.
// - 주인·도시 통치자·운영자(canSet && showEditor): 권한 범위를 4단계(anyone / city_resident / city_house / nation_citizen) 또는 기본값(null)으로 저장한다.
import { BUILDING_ACCESS_SCOPES, type BuildingAccessScope } from "@terra/shared/facilities";
import { useId, useState } from "react";
import { sendFacilityCommand } from "../../economy/facilityCommands.ts";
import { FACILITY_ERROR_TEXT } from "../../economy/facilityText.ts";
import { m } from "../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";

const SCOPE_TEXT: Readonly<Record<BuildingAccessScope, () => string>> = {
  anyone: m.building_access_scope_anyone,
  city_resident: m.building_access_scope_city_resident,
  city_house: m.building_access_scope_city_house,
  nation_citizen: m.building_access_scope_nation_citizen,
};

function blockReasonText(reason: string | null): string {
  switch (reason) {
    case "blacklisted":
      return m.building_access_blocked_blacklisted();
    case "city_resident":
      return m.building_access_blocked_city_resident();
    case "city_house":
      return m.building_access_blocked_city_house();
    default:
      return m.building_access_blocked_nation_citizen();
  }
}

export interface BuildingAccessControlProps {
  readonly buildingId: number;
  readonly scope: BuildingAccessScope;
  readonly ownScope: BuildingAccessScope | null;
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly canSet: boolean;
  readonly showEditor: boolean;
  readonly reload: () => void;
}

export function BuildingAccessControl({
  buildingId,
  scope,
  ownScope,
  allowed,
  reason,
  canSet,
  showEditor,
  reload,
}: BuildingAccessControlProps) {
  const selectId = useId();
  const [selected, setSelected] = useState<BuildingAccessScope | "">(ownScope ?? "");
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const currentLabel =
    ownScope === null ? m.building_access_default_tag({ scope: SCOPE_TEXT[scope]() }) : SCOPE_TEXT[scope]();

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const next: BuildingAccessScope | null = selected === "" ? null : selected;
      const outcome = await sendFacilityCommand({ t: "facility_access", buildingId, scope: next });
      if (outcome.ok) {
        notice.show([m.building_access_saved()]);
        reload();
      } else {
        problem.show([FACILITY_ERROR_TEXT[outcome.code]()]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bp-card" aria-label={m.building_access_title()} data-part="building-access">
      <h3 className="bp-card-title">{m.building_access_title()}</h3>
      <p className="bp-muted" data-part="building-access-scope">
        {currentLabel}
      </p>
      {!allowed ? (
        <p className="bp-warn" role="alert" data-part="building-access-blocked">
          {blockReasonText(reason)}
        </p>
      ) : null}
      {showEditor && canSet ? (
        <div className="bp-row">
          <label className="sr-only" htmlFor={selectId}>
            {m.building_access_title()}
          </label>
          <select
            id={selectId}
            className="bp-grow"
            value={selected}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "") setSelected("");
              else {
                const matched = BUILDING_ACCESS_SCOPES.find((item) => item === value);
                if (matched) setSelected(matched);
              }
            }}
          >
            <option value="">{m.building_access_option_default()}</option>
            {BUILDING_ACCESS_SCOPES.map((item) => (
              <option key={item} value={item}>
                {SCOPE_TEXT[item]()}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button-small button-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {m.building_access_save()}
          </button>
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}

// 건물 칸(생산 칸, 노동 계약 위) — 짓기·레벨업·노화·수리·장비 수리(49 N50·M14·M15·N54, D-171·D-508·D-509·D-514).
// docs/adr/2026-11-07-buildings-runtime.md. 기술 기본 화면: 값은 건물 편집기(/dev/buildings)·설정 패널에서 고친다.
// - 자료는 tRPC facilities.overview(실제 자료만), 바꾸는 명령은 WebSocket(facilityCommands.ts, 프로토콜 10)이다.
// - 서버가 판정한다(소유·배치·재료·시간). 화면은 미리 셈(재료·시간, 같은 식)과 결과 코드 문구만 보인다.
// - 차례: 규칙 한 줄 → 일꾼 고르기(짓기·레벨업 단축, 수리·장비 수리에 꼭) → 내 시설 → 새로 짓기 → 고칠 장비 → 내 세력 비콘 → 내 재료.
import type { FacilitiesOverviewResponse } from "@terra/shared/facilities";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { fmt, formatDuration, pickName } from "./economyText.ts";
import { BeaconCard, FacilityCard, HoldingRepairRow } from "./FacilityCards.tsx";
import { sendFacilityCommand } from "./facilityCommands.ts";
import { FACILITY_ERROR_TEXT, type FacilityRun, canAfford, cutTime, stacksText } from "./facilityText.ts";
import { Loaded } from "./parts.tsx";
import { NO_ARGS, useFacilities, useNowTick } from "./queries.ts";
import "./facilities.css";

const ROTATIONS = [0, 90, 180, 270] as const;

/** 0~255 칸 */
const isCell = (value: string): boolean => /^[0-9]{1,3}$/.test(value) && Number(value) <= 255;

function UnitPicker({
  data,
  picked,
  onChange,
}: {
  data: FacilitiesOverviewResponse;
  picked: readonly number[];
  onChange: (next: number[]) => void;
}) {
  const free = data.units.filter((unit) => !unit.busy);
  return (
    <fieldset className="facility-units" data-part="facility-units">
      <legend className="eco-subtitle">{m.facility_units_title()}</legend>
      <p className="eco-footnote">
        {m.facility_units_note({
          cut: Math.round(data.rules.builderCutPm / 10),
          max: Math.round(data.rules.builderCutMaxPm / 10),
        })}
      </p>
      {free.length === 0 ? (
        <p className="eco-empty">{m.facility_units_none()}</p>
      ) : (
        <div className="facility-unit-list">
          {free.map((unit) => (
            <label key={unit.id} className="facility-unit">
              <input
                type="checkbox"
                checked={picked.includes(unit.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...picked, unit.id] : picked.filter((id) => id !== unit.id),
                  )
                }
              />
              <span>
                {unit.cyborg
                  ? m.facility_unit_cyborg({ score: unit.craftScore })
                  : m.facility_unit_option({ id: unit.id, score: unit.craftScore })}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function BuildForm({
  data,
  units,
  run,
  busy,
}: {
  data: FacilitiesOverviewResponse;
  units: readonly number[];
  run: FacilityRun;
  busy: boolean;
}) {
  const buildable = data.catalog.filter((entry) => entry.footprint !== null && entry.levels.length > 0);
  const [facility, setFacility] = useState("");
  const [x, setX] = useState("120");
  const [y, setY] = useState("120");
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(0);
  const chosen = buildable.find((entry) => entry.id === facility) ?? buildable[0];
  const mapKey = data.maps[0];
  const level1 = chosen?.levels[0];
  const ready =
    chosen !== undefined && level1 !== undefined && mapKey !== undefined && isCell(x) && isCell(y);
  return (
    <form
      className="labor-form"
      aria-labelledby="facility-new-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || !chosen || mapKey === undefined) return;
        void run({
          t: "facility_build",
          mapKey,
          facility: chosen.id,
          x: Number(x),
          y: Number(y),
          rotation,
          ...(units.length > 0 ? { unitIds: [...units] } : {}),
        });
      }}
    >
      <h3 id="facility-new-title" className="eco-subtitle">
        {m.facility_new_title()}
      </h3>
      <label className="eco-field">
        <span>{m.facility_field_facility()}</span>
        <select
          className="eco-select"
          value={chosen?.id ?? ""}
          onChange={(event) => setFacility(event.target.value)}
          disabled={buildable.length === 0}
        >
          {buildable.length === 0 ? <option value="">{m.facility_none_buildable()}</option> : null}
          {buildable.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {m.facility_option_facility({
                name: pickName(entry.name, entry.id),
                w: entry.footprint?.width ?? 0,
                h: entry.footprint?.height ?? 0,
              })}
            </option>
          ))}
        </select>
      </label>
      <div className="facility-cells">
        <label className="eco-field">
          <span>{m.facility_field_x()}</span>
          <input
            className="eco-input"
            inputMode="numeric"
            autoComplete="off"
            value={x}
            aria-invalid={!isCell(x)}
            onChange={(event) => setX(event.target.value.trim())}
          />
        </label>
        <label className="eco-field">
          <span>{m.facility_field_y()}</span>
          <input
            className="eco-input"
            inputMode="numeric"
            autoComplete="off"
            value={y}
            aria-invalid={!isCell(y)}
            onChange={(event) => setY(event.target.value.trim())}
          />
        </label>
        <label className="eco-field">
          <span>{m.facility_field_rotation()}</span>
          <select
            className="eco-select"
            value={String(rotation)}
            onChange={(event) =>
              setRotation(ROTATIONS.find((value) => String(value) === event.target.value) ?? 0)
            }
          >
            {ROTATIONS.map((value) => (
              <option key={value} value={String(value)}>
                {m.facility_rotation({ deg: value })}
              </option>
            ))}
          </select>
        </label>
      </div>
      {level1 ? (
        <p className="eco-have" data-part="facility-preview">
          {m.facility_build_preview({
            materials: stacksText(data, level1.materials),
            time: formatDuration(cutTime(level1.timeMs, units.length, data)),
          })}
        </p>
      ) : null}
      <div className="labor-actions">
        {data.dev && level1 ? (
          <button
            type="button"
            className="button-small"
            disabled={busy}
            onClick={() => {
              // 개발 시험: 고른 시설 Lv1·Lv2 재료를 두 번 지을 만큼
              const next = chosen?.levels[1]?.materials ?? [];
              for (const stack of [...level1.materials, ...next])
                void run({
                  t: "dev_facility_grant",
                  item: stack.item,
                  qty: Math.min(100_000, stack.qty * 2),
                });
            }}
          >
            {m.facility_dev_grant()}
          </button>
        ) : null}
        <button
          type="submit"
          className="eco-submit"
          disabled={busy || !ready || (level1 !== undefined && !canAfford(data, level1.materials))}
        >
          {m.facility_build()}
        </button>
      </div>
    </form>
  );
}

export function FacilityPanel() {
  const facilities = useFacilities(NO_ARGS);
  const tick = useNowTick();
  const live = useLiveLines();
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [picked, setPicked] = useState<number[]>([]);
  const run: FacilityRun = async (command) => {
    setBusy(true);
    const outcome = await sendFacilityCommand(command);
    setBusy(false);
    setTone(outcome.ok ? "success" : "error");
    live.show([outcome.ok ? m.facility_done() : FACILITY_ERROR_TEXT[outcome.code]()]);
    facilities.refresh();
    return outcome.ok;
  };
  const data = facilities.data;
  const now = data ? data.generatedAt + Math.max(0, tick - facilities.receivedAt) : tick;
  const rules = data?.rules;
  return (
    <section className="panel labor facility" aria-labelledby="facility-title" data-part="facilities">
      <h2 id="facility-title" className="eco-section-title">
        {m.facility_title()}
      </h2>
      {rules ? (
        <p className="eco-footnote">
          {m.facility_rules({
            damaged: Math.round(rules.damagedPm / 10),
            disabled: Math.round(rules.disabledPm / 10),
            floor: Math.round(rules.idleFloorPm / 10),
            decay: formatDuration(rules.idleDecayMs),
            step: Math.round(rules.repairStepPm / 10),
          })}
        </p>
      ) : null}
      <Loaded view={facilities}>
        {(loaded) => {
          if (loaded.status === "not_ready") return <p className="eco-empty">{m.facility_not_ready()}</p>;
          // 고른 일꾼 가운데 지금도 쓸 수 있는 것만 보낸다(작업이 시작되면 바쁨)
          const units = picked.filter((id) => loaded.units.some((unit) => unit.id === id && !unit.busy));
          const props = { data: loaded, units, now, run, busy };
          const owned = loaded.materials.filter((entry) => entry.have !== "0");
          return (
            <>
              <UnitPicker data={loaded} picked={units} onChange={setPicked} />
              <h3 className="eco-subtitle">{m.facility_mine_title()}</h3>
              {loaded.facilities.length === 0 ? (
                <p className="eco-empty">{m.facility_mine_empty()}</p>
              ) : (
                <ul className="labor-contracts">
                  {loaded.facilities.map((facility) => (
                    <FacilityCard key={facility.buildingId} facility={facility} {...props} />
                  ))}
                </ul>
              )}
              <BuildForm data={loaded} units={units} run={run} busy={busy} />
              <h3 className="eco-subtitle">{m.facility_holdings_title()}</h3>
              {loaded.holdings.length === 0 ? (
                <p className="eco-empty">{m.facility_holdings_empty()}</p>
              ) : (
                <ul className="eco-rows">
                  {loaded.holdings.map((holding) => (
                    <HoldingRepairRow
                      key={holding.id}
                      holding={holding}
                      data={loaded}
                      units={units}
                      run={run}
                      busy={busy}
                    />
                  ))}
                </ul>
              )}
              {loaded.beacons.length > 0 ? (
                <>
                  <h3 className="eco-subtitle">{m.facility_beacons_title()}</h3>
                  <ul className="labor-contracts">
                    {loaded.beacons.map((beacon) => (
                      <BeaconCard key={beacon.id} beacon={beacon} {...props} />
                    ))}
                  </ul>
                </>
              ) : null}
              <h3 className="eco-subtitle">{m.facility_materials_title()}</h3>
              <p className="eco-have" data-part="facility-materials">
                {owned.length === 0
                  ? m.facility_materials_empty()
                  : owned
                      .map((entry) => `${pickName(entry.name ?? undefined, entry.item)} ${fmt(entry.have)}`)
                      .join(" · ")}
              </p>
            </>
          );
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}

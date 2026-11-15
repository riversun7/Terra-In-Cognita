// 건물 칸(생산 칸, 노동 계약 위) — 짓기·레벨업·노화·수리·장비 수리(49 N50·M14·M15·N54, D-171·D-508·D-509·D-514).
// docs/adr/2026-11-07-buildings-runtime.md. 기술 기본 화면: 값은 건물 편집기(/dev/buildings)·설정 패널에서 고친다.
// - 자료는 tRPC facilities.overview(실제 자료만), 바꾸는 명령은 WebSocket(facilityCommands.ts, 프로토콜 10)이다.
// - 서버가 판정한다(소유·배치·재료·시간). 화면은 미리 셈(재료·시간, 같은 식)과 결과 코드 문구만 보인다.
// - 차례: 규칙 한 줄 → 일꾼 고르기(짓기·레벨업 단축, 수리·장비 수리·공격에 꼭) → 내 시설 → 새로 짓기 → 고칠 장비 → 내 세력 비콘 →
//   칠 수 있는 건물(질문 381, AttackParts.tsx) → 내 창고·화물. 비콘 재료는 그 세력의 가장 가까운 도시 창고(질문 410 ①).
// - 재료 자리(D-516 361, "바뀜 (창고·직무)"): 짓는 칸이 속한 도시(같은 2차맵의 가장 가까운 도시) 창고 + 그 도시의 내 창고 시설 + 그 2차맵
//   내 유닛 화물. 미리 셈·단추 막기도 그 자리의 물자로 센다(@terra/shared/facilities materialStockAt). 개발 재료 받기는 그 칸의 도시 창고로.
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 채집 시설 카드에 일꾼 칸(직무 배치, WorkerParts.tsx — 명령은 노동 계약 길
//   labor_assign·labor_unassign, 프로토콜 14). 짓기 폼은 2차맵을 고르고(서버가 띄운 것이 여럿이면), [지도에서 고르기]로 2차맵에서 칸을 눌러
//   X·Y를 채운다(buildPick.ts 연결점).
import type { FacilitiesOverviewResponse, FacilityWaterMaskResponse } from "@terra/shared/facilities";
import { cityOfCell } from "@terra/shared/goodsPlaces";
import { hasWaterNear, rotatedRect, waterMaskFromHex } from "@terra/shared/waterNearby";
import { useEffect, useState } from "react";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { formatDuration, pickName } from "./economyText.ts";
import { TargetList } from "./AttackParts.tsx";
import { BeaconCard, FacilityCard, HoldingRepairRow } from "./FacilityCards.tsx";
import { clearBuildPick, peekBuildPick, requestBuildPick } from "./buildPick.ts";
import { sendFacilityCommand } from "./facilityCommands.ts";
import { sendLaborCommand } from "./laborCommands.ts";
import { LABOR_ERROR_TEXT, type LaborRun } from "./laborText.ts";
import {
  FACILITY_ERROR_TEXT,
  type FacilityRun,
  canAfford,
  cutTime,
  stacksText,
  stockAt,
} from "./facilityText.ts";
import { Loaded } from "./parts.tsx";
import {
  NO_ARGS,
  useFacilities,
  useLabor,
  useNowTick,
  useRuins,
  useTemple,
  useWaterMask,
} from "./queries.ts";
import { PlacesList } from "./StorageParts.tsx";
import "./facilities.css";

const ROTATIONS = [0, 90, 180, 270] as const;

/** 0~255 칸 */
const isCell = (value: string): boolean => /^[0-9]{1,3}$/.test(value) && Number(value) <= 255;

/**
 * 짓기 폼의 물가 조건 상태(질문 947 나): none = 조건 없음, unknown = 물 표·칸을 아직 모름, ok = 둘레에 물, dry = 둘레에 물이 없음(서버가
 * needs_water로 거절할 자리 — 단추를 막는다)
 */
export function waterStateOf(
  mask: FacilityWaterMaskResponse | null,
  radius: number | null,
  footprint: { readonly width: number; readonly height: number } | null,
  at: { readonly x: number; readonly y: number; readonly rotation: number } | null,
): "none" | "unknown" | "ok" | "dry" {
  if (radius === null || !footprint) return "none";
  if (!at || mask?.status !== "ready") return "unknown";
  const water = waterMaskFromHex(mask.hex, mask.size);
  if (!water) return "unknown";
  return hasWaterNear(water, rotatedRect(at.x, at.y, footprint, at.rotation), radius) ? "ok" : "dry";
}

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
  // 2차맵에서 고른 칸(buildPick.ts)이 있으면 그 시설·2차맵·칸으로 시작한다(처음 그릴 때 한 번 읽고 지운다)
  const [picked] = useState(peekBuildPick);
  useEffect(() => clearBuildPick(), []);
  const [facility, setFacility] = useState(picked?.facility ?? "");
  const [x, setX] = useState(picked ? String(picked.x) : "120");
  const [y, setY] = useState(picked ? String(picked.y) : "120");
  const [map, setMap] = useState<number | null>(picked?.mapKey ?? null);
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(0);
  const chosen = buildable.find((entry) => entry.id === facility) ?? buildable[0];
  // 처음 2차맵 = 내 사이보그 본체가 있는 2차맵(같은 2차맵의 유닛만 일하고 시작 재료는 그 시작 도시 창고에 있다), 없으면 띄운 첫 2차맵
  const home = data.units.find((unit) => unit.cyborg)?.mapKey;
  const mapKey =
    map !== null && data.maps.includes(map)
      ? map
      : home !== undefined && data.maps.includes(home)
        ? home
        : data.maps[0];
  const level1 = chosen?.levels[0];
  const ready =
    chosen !== undefined && level1 !== undefined && mapKey !== undefined && isCell(x) && isCell(y);
  // 짓는 칸이 속한 도시와 그 자리의 재료(서버와 같은 규칙)
  const city =
    mapKey !== undefined && isCell(x) && isCell(y)
      ? cityOfCell(data.cities, mapKey, Number(x), Number(y))
      : undefined;
  const stock = stockAt(data, mapKey ?? -1, city?.id ?? null);
  // 물가 조건(질문 947 나, 낚시터): 그 2차맵 물 표로 서버와 같은 함수(@terra/shared/waterNearby)를 미리 돌린다. 판정은 지을 때 서버
  const waterRadius = chosen?.needsWaterWithin ?? null;
  const water = useWaterMask(waterRadius !== null && mapKey !== undefined ? [String(mapKey)] : null);
  const waterState = waterStateOf(
    water.data,
    waterRadius,
    chosen?.footprint ?? null,
    ready ? { x: Number(x), y: Number(y), rotation } : null,
  );
  return (
    <form
      className="labor-form"
      aria-labelledby="facility-new-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || !chosen || mapKey === undefined || waterState === "dry") return;
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
      {data.maps.length > 1 ? (
        <label className="eco-field">
          <span>{m.facility_field_map()}</span>
          <select
            className="eco-select"
            value={mapKey === undefined ? "" : String(mapKey)}
            onChange={(event) => setMap(Number(event.target.value))}
          >
            {data.maps.map((key) => (
              <option key={key} value={String(key)}>
                {m.facility_option_map({ key })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
            materials: stacksText(data, stock, level1.materials),
            time: formatDuration(cutTime(level1.timeMs, units.length, data)),
          })}
        </p>
      ) : null}
      {waterRadius !== null ? (
        <p
          className={waterState === "dry" ? "field-error eco-field-error" : "eco-footnote"}
          data-part="facility-water"
          data-water={waterState}
          role={waterState === "dry" ? "alert" : undefined}
        >
          {waterState === "dry"
            ? m.facility_build_water_dry({ cells: waterRadius })
            : waterState === "ok"
              ? m.facility_build_water_ok({ cells: waterRadius })
              : m.facility_build_water_rule({ cells: waterRadius })}
        </p>
      ) : null}
      <p className="eco-footnote" data-part="facility-source">
        {city ? m.facility_build_city({ id: city.id }) : m.facility_build_no_city()}
      </p>
      <div className="labor-actions">
        <button
          type="button"
          className="button-small"
          data-part="facility-map-pick"
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return;
            // 2차맵에서 칸을 누르면 이 폼으로 돌아와 X·Y가 채워진다(판정은 지을 때 서버)
            requestBuildPick({ facility: chosen.id });
            navigate({ route: "map" });
          }}
        >
          {m.facility_map_pick()}
        </button>
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
                  // 짓는 칸이 속한 도시 창고로(서버가 칸으로 도시를 정한다)
                  ...(mapKey !== undefined && isCell(x) && isCell(y)
                    ? { mapKey, x: Number(x), y: Number(y) }
                    : {}),
                });
            }}
          >
            {m.facility_dev_grant()}
          </button>
        ) : null}
        <button
          type="submit"
          className="eco-submit"
          disabled={
            busy ||
            !ready ||
            waterState === "dry" ||
            (level1 !== undefined && !canAfford(stock, level1.materials))
          }
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
    // 꺼내기는 운반꾼이 나른다(기획 D-569 1784): 운반꾼이 없거나 모두 바쁘면 그 뜻으로 알린다
    const noCarrier =
      !outcome.ok &&
      command.t === "storage_move" &&
      command.direction === "out" &&
      (outcome.code === "unknown_unit" || outcome.code === "unit_busy");
    live.show([
      outcome.ok
        ? m.facility_done()
        : noCarrier
          ? m.facility_move_no_carrier()
          : FACILITY_ERROR_TEXT[outcome.code](),
    ]);
    facilities.refresh();
    // 신전·연구소 칸(TemplePanel.tsx)·폐허 칸(RuinsPanel.tsx — 행정 건물 = 폐허 주인)도 건물 목록을 보인다
    useTemple.refreshAll();
    useRuins.refreshAll();
    return outcome.ok;
  };
  // 직무 배치(채집 시설 일꾼 칸): 노동 계약 길로 보내고 건물·노동 계약 목록을 다시 받는다
  const runLabor: LaborRun = async (command) => {
    setBusy(true);
    const outcome = await sendLaborCommand(command);
    setBusy(false);
    setTone(outcome.ok ? "success" : "error");
    live.show([outcome.ok ? m.facility_worker_done() : LABOR_ERROR_TEXT[outcome.code]()]);
    facilities.refresh();
    useLabor.refreshAll();
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
          const props = { data: loaded, units, now, run, busy, runLabor };
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
              <TargetList data={loaded} units={units} run={run} busy={busy} />
              <h3 className="eco-subtitle">{m.facility_places_title()}</h3>
              <PlacesList data={loaded} run={run} busy={busy} />
            </>
          );
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}

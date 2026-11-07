// 영토 층 화면(/dev/territory) — docs/adr/2026-11-03-territory-layer.md 5절, 기획 D-485·D-486·49 N42·N51. dev·admin, 틀 안, 촘촘(개발 화면 층).
// - 왼쪽 지도(TerritoryMap: 세밀 경계·칸 표·껍질·영향권·도시·비콘), 오른쪽 판: 고른 칸(소유·칸 가운데 소속·그 칸 비콘) + 놓기·치우기,
//   세력 표·도시 표(.dev-table). 390px에서는 지도 → 판이 한 칸씩 쌓인다.
// - 자료 = tRPC territory.planet(모든 세력, 권한 territory: observe). 놓기·치우기 = WebSocket beacon_place·beacon_remove(다른 세력 대신은
//   territory: dev-place). 명령이 끝나면 다시 읽는다. 세밀 경계는 기기가 같은 함수(claimAt)로 다시 셈한 것이다(서버 칸 표와 같은 규칙).
// 조각 이름 TerritoryLabScreen-*([Tt]erritoryLab).
import { type CellKey, decodeCellKey } from "@terra/planet";
import { territoryPoint } from "@terra/planet/territory";
import { claimAt } from "@terra/shared/territory";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { sendBeaconCommand } from "./beaconCommands.ts";
import { TerritoryMap } from "./TerritoryMap.tsx";
import { TerritoryTables } from "./TerritoryTables.tsx";
import { BEACON_CODE_TEXT, factionLabel } from "./territoryMessages.ts";
import { cellRows, factionColorToken, labCenter, layoutOf } from "./territoryModel.ts";
import "./territoryLab.css";

/** 세계 행성(시험 행성) */
const PLANET_ID = "s2_test_planet";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: TerritoryPlanetView }
  | { readonly status: "failed"; readonly notReady: boolean };

function loadView(): Promise<Load> {
  return api.territory.planet.query({ planetId: PLANET_ID }).then(
    (data): Load => ({ status: "ready", data }),
    (error: unknown): Load => {
      const info = apiErrorInfo(error);
      if (info.sessionEnded) void refreshSession();
      return { status: "failed", notReady: info.code === "PRECONDITION_FAILED" };
    },
  );
}

export default function TerritoryLabScreen() {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<CellKey | null>(null);
  const [factionFor, setFactionFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  // 처음 한 번 읽는다(setLoad는 비동기 콜백 안이다)
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void loadView().then(setLoad);
  }, []);

  const data = load.status === "ready" ? load.data : null;
  const layout = useMemo(() => (data ? layoutOf(data) : null), [data]);
  const rows = useMemo(() => (data ? cellRows(data) : null), [data]);
  const chosenFaction = factionFor ?? data?.myFactionId ?? data?.factions[0]?.id ?? null;
  const factionById = new Map((data?.factions ?? []).map((faction) => [faction.id, faction]));
  const nameOf = (id: number) => factionLabel(factionById.get(id), id, locale);

  const reload = async (): Promise<void> => setLoad(await loadView());

  const run = async (command: Parameters<typeof sendBeaconCommand>[0], done: (id?: number) => string) => {
    setBusy(true);
    notice.show([]);
    problem.show([]);
    const outcome = await sendBeaconCommand(command);
    if (outcome.ok) notice.show([done(outcome.beaconId)]);
    else problem.show([BEACON_CODE_TEXT[outcome.code]()]);
    await reload();
    setBusy(false);
  };

  const cell = selected === null ? null : decodeCellKey(selected);
  const row = selected === null ? undefined : rows?.get(selected);
  const beaconHere =
    selected === null ? undefined : data?.beacons.find((beacon) => beacon.cellKey === selected);
  const centerClaim = selected !== null && layout ? claimAt(layout, territoryPoint(selected)) : null;

  return (
    <section
      className="screen screen-wide tl-screen"
      aria-labelledby="territory-title"
      data-density="compact"
      data-status={load.status}
      data-beacons={data?.beacons.length}
    >
      <div className="screen-header">
        <h1 id="territory-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_territory()}
        </h1>
        <BackButton />
      </div>
      <p className="lead tl-lead">{m.dev_territory_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_territory_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="tl-actions">
          <p role="alert" className="field-error">
            {load.notReady ? m.dev_territory_not_ready() : m.dev_territory_failed()}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_territory_reload()}
          </button>
        </div>
      ) : null}
      {data && layout ? (
        <>
          <div className="tl-summary">
            <span className="dev-badge">
              {m.dev_territory_summary({
                factions: data.factions.length,
                cities: data.cities.length,
                beacons: data.beacons.length,
                cells: data.cells.length,
              })}
            </span>
            <span className="dev-muted">{data.planetId}</span>
            <button type="button" className="button-small" disabled={busy} onClick={() => void reload()}>
              {m.dev_territory_reload()}
            </button>
          </div>
          <ul className="tl-legend">
            <li data-mark="fine">{m.dev_territory_legend_fine()}</li>
            <li data-mark="cells">{m.dev_territory_legend_cells()}</li>
            <li data-mark="hull">{m.dev_territory_legend_hull()}</li>
            <li data-mark="influence">{m.dev_territory_legend_influence()}</li>
            <li data-mark="city">{m.dev_territory_legend_city()}</li>
            <li data-mark="beacon">{m.dev_territory_legend_beacon()}</li>
          </ul>
          <div className="tl-split">
            <TerritoryMap
              data={data}
              layout={layout}
              center={labCenter(data, chosenFaction)}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="tl-panel">
              <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
              <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
              {data.beacon.enabled ? (
                <p className="field-hint">
                  {m.dev_territory_beacon_cost({
                    materials: data.beacon.materials
                      .map((stack) => `${stack.item} × ${stack.qty}`)
                      .join(", "),
                  })}
                </p>
              ) : (
                <p className="field-error">{m.dev_territory_beacon_off()}</p>
              )}
              <label className="tl-field">
                <span>{m.dev_territory_faction_for()}</span>
                <select
                  value={chosenFaction ?? ""}
                  onChange={(event) => setFactionFor(Number(event.target.value))}
                >
                  {data.factions.map((faction) => (
                    <option key={faction.id} value={faction.id}>
                      {nameOf(faction.id)}
                      {faction.id === data.myFactionId ? ` (${m.dev_territory_mine()})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {cell === null || selected === null ? (
                <p className="field-hint">{m.dev_territory_pick()}</p>
              ) : (
                <div className="tl-cell" data-cell={selected}>
                  <p className="dev-code">
                    {m.dev_territory_cell({ key: String(selected), face: cell.face, i: cell.i, j: cell.j })}
                  </p>
                  <p>
                    {row
                      ? m.dev_territory_owner({ faction: nameOf(row[1]), city: row[2], samples: row[3] })
                      : m.dev_territory_owner_none()}
                  </p>
                  <p className="dev-muted">
                    {centerClaim
                      ? m.dev_territory_claim_center({
                          faction: nameOf(centerClaim.faction),
                          source:
                            centerClaim.source === "city"
                              ? m.dev_territory_source_city()
                              : m.dev_territory_source_hull(),
                        })
                      : m.dev_territory_claim_center_none()}
                  </p>
                  {beaconHere ? (
                    <>
                      <p>
                        {m.dev_territory_beacon_here({
                          id: beaconHere.id,
                          faction: nameOf(beaconHere.factionId),
                          city: beaconHere.cityId ?? 0,
                          durability: beaconHere.durability,
                        })}
                      </p>
                      <button
                        type="button"
                        className="button-small"
                        disabled={busy}
                        onClick={() =>
                          void run({ t: "beacon_remove", beaconId: beaconHere.id }, () =>
                            m.dev_territory_removed(),
                          )
                        }
                      >
                        {m.dev_territory_remove()}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-small button-primary"
                      disabled={busy || chosenFaction === null || !data.beacon.enabled}
                      onClick={() =>
                        void run(
                          {
                            t: "beacon_place",
                            planetId: data.planetId,
                            cellKey: selected,
                            ...(chosenFaction === null ? {} : { factionId: chosenFaction }),
                          },
                          (id) => m.dev_territory_placed({ id: id ?? 0 }),
                        )
                      }
                    >
                      {m.dev_territory_place()}
                    </button>
                  )}
                </div>
              )}
              <TerritoryTables data={data} nameOf={nameOf} colorToken={(id) => factionColorToken(data, id)} />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

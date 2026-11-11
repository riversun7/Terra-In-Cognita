// 세계 배치 화면 "도시 건물 배치" 판 — docs/adr/2026-11-11-city-building-layout.md 4·5절, 사용자 요청(2026-11-11) "건물들도 바둑판 배열이
// 아닌 전략적으로 배치하도록하자". NPC 국가 시작 도시마다 지금 건물 자리와 전략 배치로 다시 놓은 뒤 자리를 표(지표 지금 → 뒤)와 2차맵 그림
// (건물 몫 색, 광장, 출퇴근 길 = 채집소 → 숙소 → 행정 건물, 옮김 = 채집소 → 창고)으로 보이고, [다시 놓기 예약]으로 다음 서버 시작 때 NPC 건물만
// 옮기게 한다(tRPC worldLayout.cityLayout·requestCityRelayout·cancelCityRelayout — 놓기 권한, 감사 기록).
import type { WorldCityLayoutCity, WorldCityRelayoutView } from "@terra/shared/worldPlacementApi";
import { useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { type CityLayoutMode, layoutLines, layoutRects, layoutWindow, shift } from "./cityLayoutModel.ts";

interface Props {
  readonly planetId: string | undefined;
  readonly locale: string;
}

type Load =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly view: WorldCityRelayoutView };

const when = (ms: number, locale: string): string => new Date(ms).toLocaleString(locale);
const cityLabel = (city: WorldCityLayoutCity) => city.name ?? city.code ?? `#${city.cityId}`;

function CityMap({ city, mode }: { readonly city: WorldCityLayoutCity; readonly mode: CityLayoutMode }) {
  const rects = layoutRects(city, mode);
  const view = layoutWindow(city);
  const hall = rects.find((rect) => rect.role === "core");
  return (
    <svg
      className="wl-city-map"
      viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
      role="img"
      aria-label={m.dev_world_layout_city_label({ city: cityLabel(city) })}
    >
      <rect className="wl-city-ground" x={view.x} y={view.y} width={view.size} height={view.size} />
      {hall ? (
        <rect
          className="wl-city-plaza"
          x={hall.x - 3}
          y={hall.y - 3}
          width={hall.width + 6}
          height={hall.height + 6}
        />
      ) : null}
      {layoutLines(rects).map((line) => (
        <polyline key={line.id} className="wl-city-line" data-line={line.kind} points={line.points} />
      ))}
      {rects.map((rect) => (
        <rect
          key={rect.id}
          className="wl-city-building"
          data-role={rect.role}
          data-pinned={rect.pinned ? "" : undefined}
          data-moves={rect.moves ? "" : undefined}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
        />
      ))}
    </svg>
  );
}

export function WorldCityLayoutPanel({ planetId, locale }: Props) {
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const [pick, setPick] = useState<number | null>(null);
  const [mode, setMode] = useState<CityLayoutMode>("planned");
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<WorldCityRelayoutView>): void => {
    setBusy(true);
    work().then(
      (view) => {
        setLoad({ status: "ready", view });
        setBusy(false);
      },
      () => {
        setLoad({ status: "failed" });
        setBusy(false);
      },
    );
  };
  const show = (): void => {
    setLoad({ status: "loading" });
    run(() => api.worldLayout.cityLayout.query({ planetId }));
  };
  const view = load.status === "ready" ? load.view : null;
  const city = view ? (view.cities.find((entry) => entry.cityId === pick) ?? view.cities[0]) : undefined;
  const request = view?.request ?? null;
  const pending = request !== null && request.appliedAtMs === null;
  return (
    <section className="wl-city" aria-labelledby="wl-city-title" data-state={load.status}>
      <div className="wl-actions">
        <h2 id="wl-city-title" className="wl-catch-title">
          {m.dev_world_layout_city_title()}
        </h2>
        <button type="button" className="button-small" disabled={busy} onClick={show}>
          {m.dev_world_layout_city_show()}
        </button>
        {load.status !== "idle" ? (
          <button type="button" className="button-small" onClick={() => setLoad({ status: "idle" })}>
            {m.dev_world_layout_catchment_hide()}
          </button>
        ) : null}
      </div>
      <p className="field-hint">{m.dev_world_layout_city_lead()}</p>
      {load.status === "failed" ? (
        <p role="alert" className="field-error">
          {m.dev_world_layout_city_failed()}
        </p>
      ) : null}
      {view ? (
        <>
          <p className="dev-code" data-city-summary="">
            {m.dev_world_layout_city_summary({
              cities: view.totals.cities,
              moves: view.totals.moves,
              pinned: view.totals.pinned,
            })}
          </p>
          {request ? (
            <p className="dev-badge" data-tone={pending ? "pending" : "applied"} data-city-request="">
              {pending
                ? m.dev_world_layout_city_pending({ when: when(request.requestedAtMs, locale) })
                : m.dev_world_layout_city_done({ when: when(request.appliedAtMs ?? 0, locale) })}
            </p>
          ) : null}
          <div className="wl-actions">
            <button
              type="button"
              className="button-small button-primary"
              data-city-request-button=""
              disabled={busy || pending || view.totals.moves === 0}
              onClick={() => run(() => api.worldLayout.requestCityRelayout.mutate({ planetId }))}
            >
              {m.dev_world_layout_city_request()}
            </button>
            <button
              type="button"
              className="button-small"
              disabled={busy || !pending}
              onClick={() =>
                run(async () => {
                  await api.worldLayout.cancelCityRelayout.mutate({ planetId });
                  return api.worldLayout.cityLayout.query({ planetId });
                })
              }
            >
              {m.dev_world_layout_city_cancel()}
            </button>
          </div>
          <p className="field-hint">{m.dev_world_layout_city_request_hint()}</p>
          {view.cities.length === 0 ? <p className="field-hint">{m.dev_world_layout_city_none()}</p> : null}
          {view.cities.length > 0 ? (
            <div className="dev-table-wrap">
              <table className="dev-table wl-city-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_world_layout_city_col_city()}</th>
                    <th scope="col">{m.dev_world_layout_city_col_moves()}</th>
                    <th scope="col">{m.dev_world_layout_city_col_hall()}</th>
                    <th scope="col">{m.dev_world_layout_city_col_sectors()}</th>
                    <th scope="col">{m.dev_world_layout_city_col_haul()}</th>
                    <th scope="col">{m.dev_world_layout_city_col_commute()}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.cities.map((entry) => (
                    <tr
                      key={entry.cityId}
                      data-city-row={entry.cityId}
                      data-selected={entry === city ? "" : undefined}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="button-small wl-city-pick"
                          onClick={() => setPick(entry.cityId)}
                        >
                          {cityLabel(entry)}
                        </button>
                      </th>
                      <td>
                        {m.dev_world_layout_city_moves({
                          moves: entry.moves,
                          movable: entry.movable,
                          pinned: entry.pinned,
                        })}
                      </td>
                      <td>{shift(entry.now.hallOffset, entry.planned.hallOffset)}</td>
                      <td>{shift(entry.now.sectors, entry.planned.sectors)}</td>
                      <td>{shift(entry.now.haul, entry.planned.haul)}</td>
                      <td>{shift(entry.now.commutePm, entry.planned.commutePm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {city ? (
            <>
              <fieldset className="wl-city-mode">
                <legend>{m.dev_world_layout_city_mode({ city: cityLabel(city) })}</legend>
                <label>
                  <input
                    type="radio"
                    name="wl-city-mode"
                    checked={mode === "now"}
                    onChange={() => setMode("now")}
                  />
                  {m.dev_world_layout_city_mode_now()}
                </label>
                <label>
                  <input
                    type="radio"
                    name="wl-city-mode"
                    checked={mode === "planned"}
                    onChange={() => setMode("planned")}
                  />
                  {m.dev_world_layout_city_mode_planned()}
                </label>
              </fieldset>
              <ul className="wl-legend wl-city-legend">
                <li data-role="core">{m.dev_world_layout_city_legend_core()}</li>
                <li data-role="living">{m.dev_world_layout_city_legend_living()}</li>
                <li data-role="storage">{m.dev_world_layout_city_legend_storage()}</li>
                <li data-role="gather">{m.dev_world_layout_city_legend_gather()}</li>
                <li data-role="other">{m.dev_world_layout_city_legend_other()}</li>
                <li data-line="route">{m.dev_world_layout_city_legend_route()}</li>
                <li data-line="haul">{m.dev_world_layout_city_legend_haul()}</li>
              </ul>
              <CityMap city={city} mode={mode} />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

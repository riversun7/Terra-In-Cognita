// 세계 배치 화면 배후지 덮개 — docs/adr/2026-11-11-city-catchment.md 4절, 사용자 지적(2026-11-11) "npc세력의 도시 배치를 어느정도 벌려야 한다".
// 고른 국가 수도 둘레 격자(1차맵 칸 하나 = 네모 하나)에 칸마다 원자재(광석·물·숲·농사지을 땅)를 칠하고, 지금 세계 도시(실선 원)와 세계 새로
// 시작 뒤 설 계획 도시(점선 원)의 배후지(반경 R)를 겹친다. 운영자가 간격·자원 덮임을 눈으로 판단한다(읽기만 — tRPC worldLayout.catchment).
// 원 하나 = 배후지 반경, 원끼리 겹치면 그 도시들이 같은 땅을 다툰다.
// 바뀜(2026-11-12, ADR "바뀜 (2026-11-12)"): 반경이 도시마다 다르다(인구·도시 등급·기술). 지금 도시는 지금 반경(실선)과 목표 반경(처음 기간에
// 이를 크기, 가는 점선)을 함께 그리고, 다른 배후지와 겹친 도시(다툼 — 둘 다 자원이 고갈된다)는 위험 색. 고른 국가 도시 표(인구·반경·겹친 칸·덮임).
import type { WorldCatchmentCity, WorldCatchmentView } from "@terra/shared/worldPlacementApi";
import { useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { catchmentRows, gridCells, meanCover, radiusCells } from "./worldLayoutModel.ts";

interface Props {
  readonly planetId: string | undefined;
  /** 고른 국가 코드(없으면 단추가 막힌다) */
  readonly code: string | null;
  readonly busy: boolean;
}

type Load =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "none" }
  | { readonly status: "ready"; readonly view: WorldCatchmentView };

export function WorldCatchmentPanel({ planetId, code, busy }: Props) {
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const show = (): void => {
    if (code === null) return;
    setLoad({ status: "loading" });
    api.worldLayout.catchment.query({ planetId, code }).then(
      (view) => setLoad(view ? { status: "ready", view } : { status: "none" }),
      () => setLoad({ status: "failed" }),
    );
  };
  const view = load.status === "ready" ? load.view : null;
  const side = view ? 2 * view.span + 1 : 0;
  const ownPlan = view ? view.plan.filter((city) => city.own) : [];
  const ownWorld = view ? view.world.filter((city) => city.own) : [];
  const circle = (city: WorldCatchmentCity, kind: "world" | "plan", index: number) =>
    view ? (
      <g
        key={`${kind}-${index}`}
        data-catch-city={kind}
        data-own={city.own ? "" : undefined}
        data-contested={city.shared > 0 ? "" : undefined}
      >
        {kind === "world" && city.targetMilli !== city.radiusMilli ? (
          <circle
            className="wl-catch-target"
            cx={city.di + view.span + 0.5}
            cy={city.dj + view.span + 0.5}
            r={radiusCells(city.targetMilli)}
          />
        ) : null}
        <circle
          className="wl-catch-ring"
          cx={city.di + view.span + 0.5}
          cy={city.dj + view.span + 0.5}
          r={radiusCells(city.radiusMilli)}
        />
        <circle
          className="wl-catch-dot"
          cx={city.di + view.span + 0.5}
          cy={city.dj + view.span + 0.5}
          r={0.35}
        />
      </g>
    ) : null;
  return (
    <section className="wl-catch" aria-labelledby="wl-catch-title" data-state={load.status}>
      <div className="wl-actions">
        <h2 id="wl-catch-title" className="wl-catch-title">
          {m.dev_world_layout_catchment_title()}
        </h2>
        <button
          type="button"
          className="button-small"
          disabled={busy || code === null || load.status === "loading"}
          onClick={show}
        >
          {m.dev_world_layout_catchment_show()}
        </button>
        {load.status !== "idle" ? (
          <button type="button" className="button-small" onClick={() => setLoad({ status: "idle" })}>
            {m.dev_world_layout_catchment_hide()}
          </button>
        ) : null}
      </div>
      <p className="field-hint">{m.dev_world_layout_catchment_lead()}</p>
      {load.status === "failed" ? (
        <p role="alert" className="field-error">
          {m.dev_world_layout_catchment_failed()}
        </p>
      ) : null}
      {load.status === "none" ? <p className="field-hint">{m.dev_world_layout_catchment_none()}</p> : null}
      {view ? (
        <>
          <p className="dev-code" data-catch-summary="">
            {m.dev_world_layout_catchment_summary({
              same: view.sameGapCells.toFixed(1),
              foreign: view.foreignGapCells.toFixed(1),
              world: view.overlapWorld,
              plan: view.overlapPlan,
              contestedWorld: view.contestedWorld,
              contestedPlan: view.contestedPlan,
            })}
          </p>
          {view.radiusCells === 0 ? <p className="field-hint">{m.dev_world_layout_catchment_off()}</p> : null}
          <ul className="wl-legend wl-catch-legend">
            <li data-tone="ore">{m.dev_world_layout_catchment_legend_ore()}</li>
            <li data-tone="water">{m.dev_world_layout_catchment_legend_water()}</li>
            <li data-tone="wood">{m.dev_world_layout_catchment_legend_wood()}</li>
            <li data-tone="crop">{m.dev_world_layout_catchment_legend_crop()}</li>
            <li data-catch-legend="world">{m.dev_world_layout_catchment_legend_world()}</li>
            <li data-catch-legend="plan">{m.dev_world_layout_catchment_legend_plan()}</li>
            <li data-catch-legend="target">{m.dev_world_layout_catchment_legend_target()}</li>
            <li data-catch-legend="contested">{m.dev_world_layout_catchment_legend_contested()}</li>
          </ul>
          <svg
            className="wl-catch-map"
            viewBox={`0 0 ${side} ${side}`}
            role="img"
            aria-label={m.dev_world_layout_catchment_label({ code: view.code })}
          >
            {gridCells(view.cells, side).map((cell) => (
              <rect
                key={cell.id}
                className="wl-catch-cell"
                data-tone={cell.tone}
                x={cell.x}
                y={cell.y}
                width={1}
                height={1}
              />
            ))}
            {view.world.map((city, index) => circle(city, "world", index))}
            {view.plan.map((city, index) => circle(city, "plan", index))}
          </svg>
          <p className="dev-code" data-catch-own="">
            {m.dev_world_layout_catchment_own({
              world: ownWorld.length,
              worldCover: meanCover(ownWorld) ?? "-",
              plan: ownPlan.length,
              planCover: meanCover(ownPlan) ?? "-",
            })}
          </p>
          <div className="wl-catch-table-wrap">
            <table className="dev-table wl-catch-table" data-catch-table="">
              <thead>
                <tr>
                  <th scope="col">{m.dev_world_layout_catchment_col_kind()}</th>
                  <th scope="col">{m.dev_world_layout_catchment_col_pop()}</th>
                  <th scope="col">{m.dev_world_layout_catchment_col_radius()}</th>
                  <th scope="col">{m.dev_world_layout_catchment_col_target()}</th>
                  <th scope="col">{m.dev_world_layout_catchment_col_shared()}</th>
                  <th scope="col">{m.dev_world_layout_catchment_col_cover()}</th>
                </tr>
              </thead>
              <tbody>
                {catchmentRows(ownWorld, ownPlan).map((row) => (
                  <tr key={row.id} data-contested={row.shared > 0 ? "" : undefined}>
                    <td>
                      {row.kind === "world"
                        ? m.dev_world_layout_catchment_kind_world({ n: row.n })
                        : m.dev_world_layout_catchment_kind_plan({ n: row.n })}
                    </td>
                    <td>{row.population ?? "-"}</td>
                    <td>{row.radius}</td>
                    <td>{row.target}</td>
                    <td>{row.shared}</td>
                    <td>{row.cover}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

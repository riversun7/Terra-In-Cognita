// 건물 채집소(농장·목장·약초원) 관리 칸 — 면적 모듈·기르는 티어(기획 D-567·D-569 1761·1765, docs/adr/2026-11-15-gather-object-tiers.md
// "바뀜 (D-569)"). 2차맵 채집소 판(StationPanel.tsx 관리 칸)이 그린다.
// - 기를 티어: [기본(최고 T…)] + T0~최고 티어 고르기(facility_gather_tier, 프로토콜 45). 낮은 티어는 권장 스탯 합이 낮아 약한 일꾼도 100% 효율.
// - 면적 모듈: 붙은 수·자리·면적 배율, 다음 재료·짓는 시간, [모듈 하나 붙이기](facility_plot — 짓기처럼 작업이 걸린다), 붙이는 중이면 남은 시간,
//   [모듈 하나 떼기](facility_plot_remove — 재료는 돌려주지 않는다 [임시]).
// - 판정은 서버다(소유·자리·재료·티어 상한). 옛 서버(칸 없음)면 티어 고르기·떼기를 숨긴다.
import type { GatherStationPlots } from "@terra/shared/gatherStation";
import { formatDuration } from "../../economy/economyText.ts";
import { m } from "../../paraglide/messages.js";
import { nameText } from "./gatherData.ts";
import { qtyOf } from "./stationData.ts";

/** 이 칸이 보내는 명령(건물 ID는 판이 붙인다) */
export type PlotCommand =
  | { readonly t: "facility_plot" }
  | { readonly t: "facility_plot_remove" }
  | { readonly t: "facility_gather_tier"; readonly tier: number | null };

/** 티어 고르기 칸의 "기본" 값(T 숫자와 겹치지 않는다) */
const DEFAULT_TIER = "default";

export function StationPlots({
  plots,
  now,
  sending,
  operator,
  send,
}: {
  readonly plots: GatherStationPlots;
  readonly now: number;
  readonly sending: boolean;
  /** 운영자 모드(재료 없이 붙인다) */
  readonly operator: boolean;
  /** 명령 하나를 보낸다(결과 문구·다시 읽기는 판이 한다) */
  readonly send: (command: PlotCommand) => void;
}) {
  const affordable = plots.materials?.every((stack) => stack.have >= stack.qty) ?? false;
  const building =
    plots.buildingUntilMs !== null && plots.buildingUntilMs !== undefined && plots.buildingUntilMs > now;
  const maxTier = plots.maxTier;
  return (
    <div data-part="station-plots">
      {maxTier !== undefined ? (
        <label className="field" data-part="station-tier">
          <span className="field-label">{m.station_tier_label()}</span>
          <select
            value={
              plots.chosenTier === null || plots.chosenTier === undefined
                ? DEFAULT_TIER
                : String(plots.chosenTier)
            }
            disabled={sending}
            onChange={(event) => {
              const value = event.currentTarget.value;
              send({ t: "facility_gather_tier", tier: value === DEFAULT_TIER ? null : Number(value) });
            }}
          >
            <option value={DEFAULT_TIER}>{m.station_tier_default({ tier: maxTier })}</option>
            {Array.from({ length: maxTier + 1 }, (_, tier) => (
              <option key={tier} value={String(tier)}>
                {plots.statPerTier === undefined
                  ? m.station_tier_option_plain({ tier })
                  : m.station_tier_option({ tier, stat: tier * plots.statPerTier })}
              </option>
            ))}
          </select>
          <span className="field-hint">{m.station_tier_hint()}</span>
        </label>
      ) : null}
      <p className="gather-station-subtitle">{m.station_plots_title()}</p>
      <p className="gather-muted">
        {m.station_plots_line({
          count: plots.count,
          slots: plots.slots,
          per: (plots.perPlotPm / 10).toFixed(0),
          area: (plots.areaPm / 10).toFixed(0),
        })}
      </p>
      {building ? (
        <p data-part="station-plot-building">
          {m.station_plots_building({ time: formatDuration((plots.buildingUntilMs ?? now) - now) })}
        </p>
      ) : plots.materials ? (
        <>
          <p className="gather-muted">
            {m.station_upgrade_cost({
              materials: plots.materials
                .map((stack) =>
                  m.station_upgrade_material({
                    name: nameText(stack.name, stack.item),
                    have: qtyOf(String(stack.have)),
                    qty: qtyOf(String(stack.qty)),
                  }),
                )
                .join(" · "),
            })}
          </p>
          <div className="gather-actions">
            <button
              type="button"
              className="button-small"
              disabled={sending || (!affordable && !operator)}
              onClick={() => send({ t: "facility_plot" })}
            >
              {plots.timeMs === undefined
                ? m.station_plots_button()
                : m.station_plots_button_time({ time: formatDuration(plots.timeMs) })}
            </button>
          </div>
        </>
      ) : plots.count >= plots.slots ? (
        <p className="gather-muted">{m.station_plots_full()}</p>
      ) : null}
      {plots.maxTier !== undefined && plots.count > 0 && !building ? (
        <div className="gather-actions">
          <button
            type="button"
            className="button-small"
            disabled={sending}
            onClick={() => send({ t: "facility_plot_remove" })}
          >
            {m.station_plots_remove()}
          </button>
        </div>
      ) : null}
    </div>
  );
}

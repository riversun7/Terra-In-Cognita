// 건물 채집소 관리 칸 그리기 시험(기획 D-569 1761·1765, StationPlots.tsx) — 기를 티어 고르기(기본 + T0~최고)·모듈 재료·짓는 시간·떼기·붙이는 중.
// react-dom/server로 HTML을 만들어 본다(브라우저 없이)
import type { GatherStationPlots } from "@terra/shared/gatherStation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { m } from "../../paraglide/messages.js";
import { StationPlots } from "./StationPlots.tsx";

const NOW = 1_800_000_000_000;

const PLOTS: GatherStationPlots = {
  count: 1,
  slots: 3,
  areaPm: 1200,
  perPlotPm: 200,
  tier: 3,
  recommendedStat: 60,
  materials: [{ item: "pine_log", name: null, qty: 7, have: 20 }],
  maxTier: 5,
  chosenTier: 3,
  timeMs: 120_000,
  buildingUntilMs: null,
  statPerTier: 20,
};

const render = (plots: GatherStationPlots) =>
  renderToStaticMarkup(
    createElement(StationPlots, { plots, now: NOW, sending: false, operator: false, send: () => undefined }),
  );

describe("건물 채집소 관리 칸", () => {
  it("기를 티어: 기본 + T0~최고 티어(권장 합), 고른 티어가 골라져 있다. 모듈 재료·짓는 시간 단추·떼기 단추", () => {
    const html = render(PLOTS);
    expect(html).toContain(m.station_tier_default({ tier: 5 }));
    for (let tier = 0; tier <= 5; tier++)
      expect(html).toContain(m.station_tier_option({ tier, stat: tier * 20 }));
    expect(html).not.toContain(m.station_tier_option({ tier: 6, stat: 120 }));
    expect(html).toMatch(/<option value="3" selected="">/);
    expect(html).toContain(m.station_plots_remove());
    expect(html).toContain('data-part="station-plots"');
  });

  it("붙이는 중이면 남은 시간만(붙이기·떼기 단추 없음), 옛 서버(칸 없음)는 고르기·떼기를 숨긴다", () => {
    const building = render({ ...PLOTS, buildingUntilMs: NOW + 60_000 });
    expect(building).toContain('data-part="station-plot-building"');
    expect(building).not.toContain(m.station_plots_remove());
    const {
      maxTier: _max,
      chosenTier: _chosen,
      timeMs: _time,
      buildingUntilMs: _until,
      statPerTier: _stat,
      ...old
    } = PLOTS;
    const legacy = render(old);
    expect(legacy).not.toContain('data-part="station-tier"');
    expect(legacy).not.toContain(m.station_plots_remove());
    expect(legacy).toContain(m.station_plots_button());
  });
});

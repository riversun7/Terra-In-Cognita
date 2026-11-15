// 건물 화면 채집 시설 카드의 채집소 칸 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요",
// docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)".
// - 자료는 tRPC gather.station(2차맵 채집소 판과 같은 자료, map/gather/stationData.ts). 카드마다 열 때와 STATION_POLL_MS마다 묻는다.
// - 버프·반경 안 원자재·채집소 창고(무게·내 몫)·자동 옮김·일꾼 상태 수를 한눈에 보이고, [판매가로 사서 도시 창고로]는 사업장 사기
//   (business_buy — 기획 D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매", 돈은 사업장 매출)를 내 몫 물자마다 보낸다. 산 물건은
//   운반꾼이 나른다(1784). 결과는 카드 아래 한 줄. 레벨 올리기·일꾼 배치는 같은 카드의 기존 단추를 쓴다.
// - 농장(facility 채집소, 오브젝트 없음 — 기획 정리 756 ②)도 보인다: 반경·원자재 대신 수확·피로 버프·창고·자동 옮김·일꾼 상태 수.
// - 건물 채집소(농장·목장·약초원, 기획 D-566 1721·D-567): 기르는 티어·면적 모듈 줄과 [모듈 하나 붙이기](facility_plot, 프로토콜 41). 바뀜
//   (D-569 1765): 모듈은 짓기처럼 작업이 걸려 붙이는 중이면 남은 시간을 보인다(티어 고르기·떼기는 2차맵 채집소 판 — map/gather/StationPlots.tsx).
import type { FacilityView } from "@terra/shared/facilities";
import type { GatherStationResponse } from "@terra/shared/gatherStation";
import { useEffect, useState } from "react";
import { minutesText, nameText } from "../map/gather/gatherData.ts";
import { STATION_POLL_MS, buffsText, kgOf, loadGatherStation, qtyOf } from "../map/gather/stationData.ts";
import { sendBusinessCommand } from "../map/business/businessCommands.ts";
import { RESULT_TEXT } from "../map/business/businessText.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FacilityRun } from "./facilityText.ts";
import "./station.css";

/** 프로토콜 입력 한도(business_buy qty, 게임 값 아님) */
const MOVE_MAX = 1_000_000;

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export function StationSummary({
  facility,
  run,
  busy,
}: {
  facility: FacilityView;
  run: FacilityRun;
  busy: boolean;
}) {
  const [station, setStation] = useState<GatherStationResponse | null>(null);
  const [buyNote, setBuyNote] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const buildingId = facility.buildingId;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      try {
        const response = await loadGatherStation(buildingId);
        if (!stopped) setStation(response);
      } catch {
        // 다음 차례에 다시 묻는다
      }
      if (!stopped) timer = setTimeout(() => void tick(), STATION_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [buildingId]);

  /** 옮긴 뒤 바로 다시 묻는다 */
  const refresh = async (): Promise<void> => {
    try {
      setStation(await loadGatherStation(buildingId));
    } catch {
      // 다음 차례에 다시 묻는다
    }
  };

  const ok = station?.status === "ok" && station.buildingId === buildingId ? station : null;
  if (!ok || ok.kind === null) return null;
  const now = serverNow();
  const objects = ok.objects;
  const counts = { working: 0, blocked: 0, resting: 0 };
  for (const worker of ok.workers) {
    if (worker.state === "working") counts.working += 1;
    else if (worker.state === "resting") counts.resting += 1;
    else if (worker.state !== "waiting") counts.blocked += 1;
  }
  const haul = async (): Promise<void> => {
    setBuying(true);
    let note: string = m.station_buy_haul_done();
    for (const line of ok.storage.goods) {
      const qty = /^[0-9]{1,30}$/.test(line.qty) ? Math.min(MOVE_MAX, Number(line.qty)) : 0;
      if (qty <= 0) continue;
      const outcome = await sendBusinessCommand({ t: "business_buy", buildingId, item: line.asset, qty });
      if (!outcome.ok) {
        note = RESULT_TEXT[outcome.code]();
        break;
      }
    }
    setBuying(false);
    setBuyNote(note);
    await refresh();
  };
  const addPlot = async (): Promise<void> => {
    await run({ t: "facility_plot", buildingId });
    await refresh();
  };
  return (
    <fieldset className="facility-station" data-part="facility-station" data-kind={ok.kind}>
      <legend className="eco-subtitle">
        {ok.buffs && ok.buffs.radiusCells !== null
          ? m.station_summary_title({ cells: ok.buffs.radiusCells })
          : m.station_summary_title_facility()}
      </legend>
      {ok.buffs ? <p className="eco-row-meta">{buffsText(ok.buffs)}</p> : null}
      {ok.plots ? (
        // 건물 채집소(D-566 1721·D-567): 기르는 티어·면적 모듈
        <p className="eco-row-meta" data-part="station-plots-line">
          {m.station_plots_card({
            tier: ok.plots.tier,
            count: ok.plots.count,
            slots: ok.plots.slots,
            area: (ok.plots.areaPm / 10).toFixed(0),
          })}
        </p>
      ) : null}
      {ok.plots?.buildingUntilMs !== null &&
      ok.plots?.buildingUntilMs !== undefined &&
      ok.plots.buildingUntilMs > now ? (
        // 모듈 붙이는 중(D-569 1765 — 짓기처럼 작업)
        <p className="eco-row-meta" data-part="station-plot-building">
          {m.station_plots_building({ time: minutesText(ok.plots.buildingUntilMs - now) })}
        </p>
      ) : ok.mine && ok.plots?.materials ? (
        <div className="labor-actions">
          <button
            type="button"
            className="button-small"
            data-part="station-plot-add"
            disabled={busy}
            onClick={() => void addPlot()}
          >
            {m.station_plots_button()}
          </button>
        </div>
      ) : null}
      {objects && objects.total === 0 ? (
        <p className="eco-footnote" data-part="station-no-objects">
          {m.station_objects_none()}
        </p>
      ) : objects ? (
        <p className="eco-row-meta">
          {m.station_objects_line({ total: objects.total, ready: objects.ready, depleted: objects.depleted })}
          {objects.nextRegrowAtMs !== null
            ? ` · ${m.station_objects_next({ time: minutesText(objects.nextRegrowAtMs - now) })}`
            : ""}
        </p>
      ) : null}
      <p className="eco-row-meta">
        {ok.storage.capacityGrams === null
          ? m.station_storage_used_nocap({ used: kgOf(ok.storage.usedGrams) })
          : m.station_storage_used({ used: kgOf(ok.storage.usedGrams), cap: kgOf(ok.storage.capacityGrams) })}
        {ok.storage.goods.length > 0
          ? ` · ${ok.storage.goods
              .map((line) =>
                m.station_storage_line({
                  name: nameText(line.name, line.item ?? line.asset),
                  qty: qtyOf(line.qty),
                }),
              )
              .join(" · ")}`
          : ""}
      </p>
      <p className="eco-footnote" data-part="station-haul">
        {ok.cityId === null
          ? m.station_haul_no_city()
          : ok.haul.nextAtMs === null
            ? m.station_haul_off()
            : m.station_haul_next({ time: minutesText(ok.haul.nextAtMs - now) })}
        {ok.workers.length > 0
          ? ` · ${ok.kind === "objects" ? m.station_summary_workers(counts) : m.station_summary_workers_facility(counts)}`
          : ""}
      </p>
      {ok.mine && ok.cityId !== null && ok.storage.goods.length > 0 ? (
        <div className="labor-actions">
          <button
            type="button"
            className="button-small"
            data-part="station-buy-haul"
            disabled={busy || buying}
            onClick={() => void haul()}
          >
            {m.station_buy_haul()}
          </button>
        </div>
      ) : null}
      {buyNote !== null ? (
        <p className="eco-footnote" role="status" data-part="station-buy-note">
          {buyNote}
        </p>
      ) : null}
    </fieldset>
  );
}

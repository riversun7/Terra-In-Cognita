// 건물 화면 채집 시설 카드의 채집소 칸 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요",
// docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)".
// - 자료는 tRPC gather.station(2차맵 채집소 판과 같은 자료, map/gather/stationData.ts). 카드마다 열 때와 STATION_POLL_MS마다 묻는다.
// - 버프·반경 안 원자재·채집소 창고(무게·내 몫)·자동 옮김·일꾼 상태 수를 한눈에 보이고, [도시 창고로 옮기기]는 이미 있는 창고 꺼내기
//   (storage_move out)를 내 몫 물자마다 보낸다. 레벨 올리기·일꾼 배치는 같은 카드의 기존 단추를 쓴다.
import type { FacilityView } from "@terra/shared/facilities";
import type { GatherStationResponse } from "@terra/shared/gatherStation";
import { useEffect, useState } from "react";
import { minutesText, nameText } from "../map/gather/gatherData.ts";
import { STATION_POLL_MS, buffsText, kgOf, loadGatherStation, qtyOf } from "../map/gather/stationData.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FacilityRun } from "./facilityText.ts";
import "./station.css";

/** 프로토콜 입력 한도(storage_move qty, 게임 값 아님) */
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
  if (!ok || ok.kind !== "objects") return null;
  const now = serverNow();
  const objects = ok.objects;
  const counts = { working: 0, blocked: 0, resting: 0 };
  for (const worker of ok.workers) {
    if (worker.state === "working") counts.working += 1;
    else if (worker.state === "resting") counts.resting += 1;
    else if (worker.state !== "waiting") counts.blocked += 1;
  }
  const haul = async (): Promise<void> => {
    for (const line of ok.storage.goods) {
      const qty = /^[0-9]{1,30}$/.test(line.qty) ? Math.min(MOVE_MAX, Number(line.qty)) : 0;
      if (qty <= 0) continue;
      if (!(await run({ t: "storage_move", buildingId, asset: line.asset, qty, direction: "out" }))) break;
    }
    await refresh();
  };
  return (
    <fieldset className="facility-station" data-part="facility-station">
      <legend className="eco-subtitle">
        {m.station_summary_title({ cells: ok.buffs?.radiusCells ?? 0 })}
      </legend>
      {ok.buffs ? <p className="eco-row-meta">{buffsText(ok.buffs)}</p> : null}
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
      <p className="eco-footnote">
        {ok.cityId === null
          ? m.station_haul_no_city()
          : ok.haul.nextAtMs === null
            ? m.station_haul_off()
            : m.station_haul_next({ time: minutesText(ok.haul.nextAtMs - now) })}
        {ok.workers.length > 0
          ? ` · ${m.station_summary_workers({ working: counts.working, blocked: counts.blocked, resting: counts.resting })}`
          : ""}
      </p>
      {ok.mine && ok.cityId !== null && ok.storage.goods.length > 0 ? (
        <div className="labor-actions">
          <button type="button" className="button-small" disabled={busy} onClick={() => void haul()}>
            {m.station_haul()}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

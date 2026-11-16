// 배 시설 판의 내 배 한 줄 아래 항구 칸(기획 D-570 1821·1823, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)") — HarborPanel.tsx가 쓴다.
// - 함포 칸: 칸마다 [함포 / 포획 장비 …] 고르기 → boat_gear(달기·떼기). 달 수 있는 장비가 없는 배는 칸만 보인다.
// - 싣기: 이 항구에서 실을 수 있는 내 물건(항구 옆 거래소 건물 창고 + 그 도시 내 창고)과 묶음 수 → boat_load.
// 서버가 정박·소유·재고·창고 상한을 다시 본다. 결과는 판의 알림 줄(run)로.
import type { HarborBoatView, HarborItemView } from "@terra/shared/harbor";
import { useState } from "react";
import { getLocale } from "../../paraglide/runtime.js";
import { m } from "../../paraglide/messages.js";
import type { BoatCommand } from "./boatCommands.ts";
import type { BoatOutcomeKind } from "./boatText.ts";

const nameOf = (row: HarborItemView): string =>
  row.name ? (getLocale() === "ko" ? row.name.ko : row.name.en) : row.item;

export function BoatPortRow({
  boat,
  buildingId,
  sending,
  run,
}: {
  readonly boat: HarborBoatView;
  readonly buildingId: number;
  readonly sending: boolean;
  readonly run: (kind: BoatOutcomeKind, command: BoatCommand) => void;
}) {
  const loadable = boat.loadable ?? [];
  const [item, setItem] = useState<string>(loadable[0]?.item ?? "");
  const [lots, setLots] = useState(1);
  const chosen = loadable.find((row) => row.item === item) ?? loadable[0];
  const slots = boat.slots ?? [];
  const options = boat.gearOptions ?? [];
  return (
    <div className="harbor-port" data-boat-port={boat.boatId}>
      {slots.length > 0 ? (
        <fieldset className="harbor-gear">
          <legend className="gather-muted">{m.harbor_gear_title()}</legend>
          {slots.map((slot, index) => (
            <label key={index} className="harbor-field">
              <span>{m.harbor_gear_slot({ slot: index + 1, caliber: slot.caliber })}</span>
              <select
                value={slot.gear ?? ""}
                disabled={sending || options.length === 0}
                onChange={(event) =>
                  run("gear", {
                    t: "boat_gear",
                    boatId: boat.boatId,
                    buildingId,
                    slot: index,
                    item: event.target.value === "" ? null : event.target.value,
                  })
                }
              >
                <option value="">{m.harbor_gear_none()}</option>
                {options.map((row) => (
                  <option key={row.item} value={row.item}>
                    {m.harbor_gear_option({ name: nameOf(row), tier: row.maxTier ?? 0 })}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      ) : null}
      {boat.loadable === undefined ? null : loadable.length === 0 ? (
        <p className="gather-muted harbor-load-empty">{m.harbor_load_empty()}</p>
      ) : (
        <div className="harbor-load">
          <label className="harbor-field">
            <span>{m.harbor_load_item()}</span>
            <select
              value={chosen?.item ?? ""}
              disabled={sending}
              onChange={(event) => setItem(event.target.value)}
            >
              {loadable.map((row) => (
                <option key={row.item} value={row.item}>
                  {m.harbor_load_option({ name: nameOf(row), lots: row.lots ?? 0 })}
                </option>
              ))}
            </select>
          </label>
          <label className="harbor-field">
            <span>{m.harbor_load_lots()}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={chosen?.lots ?? 1}
              value={lots}
              onChange={(event) =>
                setLots(Math.max(1, Math.min(chosen?.lots ?? 1, Math.trunc(Number(event.target.value)) || 1)))
              }
            />
          </label>
          <button
            type="button"
            className="button-small harbor-load-button"
            disabled={sending || !chosen}
            onClick={() => {
              if (chosen)
                run("load", { t: "boat_load", boatId: boat.boatId, buildingId, item: chosen.item, lots });
            }}
          >
            {m.harbor_load_button()}
          </button>
        </div>
      )}
    </div>
  );
}

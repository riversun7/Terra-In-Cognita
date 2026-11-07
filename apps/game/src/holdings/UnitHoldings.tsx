// 유닛 상세의 장비·지닌 물건(세계 유닛만) — 칸(누르면 칸 고르기 창) + 보유 물건 판 + 개발 시험 받기(dev·admin) + 창 둘.
// 칸 배치는 서버 holdings.list units(그 유닛이 물건을 들었을 때), 없으면 유닛 화면 자료의 칸(같은 휴먼 배치 — 서버 holdings/world.ts).
// 시안 유닛(p…)은 보유 물건이 없어 이 판을 쓰지 않는다(UnitDetail이 옛 칸 목록을 그린다).
import type { HoldingsListResponse } from "@terra/shared/holdings";
import type { RosterNames } from "@terra/shared/roster";
import { useEffect, useRef } from "react";
import { LoadState } from "../roster/parts.tsx";
import { DevGrant } from "./DevGrant.tsx";
import { SlotTileButton } from "./HoldingParts.tsx";
import { ReplaceDialog, SlotSheet } from "./HoldingsDialogs.tsx";
import { HoldingsPanel } from "./HoldingsPanel.tsx";
import { unitHoldings } from "./holdingsModel.ts";
import { holdingName, nameCompare } from "./holdingsText.ts";
import { useHoldings } from "./useHoldings.ts";
import "./holdings.css";

export function UnitHoldings({
  unit,
  fallbackLayout,
  names,
  onChanged,
}: {
  unit: number;
  fallbackLayout: readonly string[];
  names: RosterNames;
  /** 목록이 다시 왔을 때(명령 뒤) — 유닛 화면이 생명 수치를 다시 받는다(회복 물약, D-512). 처음 받은 것은 알리지 않는다 */
  onChanged?: (() => void) | undefined;
}) {
  const controller = useHoldings();
  const state = controller.state;
  const data = state.status === "ready" ? state.data : null;
  const seen = useRef<HoldingsListResponse | null>(null);
  useEffect(() => {
    if (!data) return;
    if (seen.current !== null && seen.current !== data) onChanged?.();
    seen.current = data;
  }, [data, onChanged]);
  if (state.status !== "ready") return <LoadState state={state} onRetry={controller.reload} />;
  const view = unitHoldings(state.data, unit, fallbackLayout, controller.now, nameCompare(), holdingName);
  return (
    <>
      <ul className="roster-slots holding-slot-grid">
        {view.slots.map((cell) => (
          <SlotTileButton
            key={cell.index}
            cell={cell}
            names={names}
            className="roster-slot"
            onOpen={() => controller.openSlot({ unit, index: cell.index })}
          />
        ))}
      </ul>
      <HoldingsPanel view={view} controller={controller} names={names} />
      <DevGrant controller={controller} unit={unit} />
      <SlotSheet view={view} controller={controller} names={names} />
      <ReplaceDialog view={view} controller={controller} />
    </>
  );
}

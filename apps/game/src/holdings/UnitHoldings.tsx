// 유닛 상세의 장비·지닌 물건(세계 유닛만) — 칸(인공장기·부품 묶음 + 일반장비 묶음, 옛 프로젝트 차례 두 줄. 누르면 칸 고르기 창) + 보유 물건 판 +
// 개발 시험 받기(dev·admin) + 창 둘. 사이보그 본체도 유닛이라 같은 판을 쓴다(docs/adr/2026-11-24-unit-cyborg-unify.md).
// 칸 배치는 서버 holdings.list units(그 유닛이 물건을 들었을 때), 없으면 유닛 화면 자료의 칸(같은 휴먼 배치 — 서버 holdings/world.ts).
// 시안 유닛(p…)은 보유 물건이 없어 이 판을 쓰지 않는다(UnitDetail이 옛 칸 목록을 그린다).
import type { HoldingsListResponse } from "@terra/shared/holdings";
import type { RosterNames } from "@terra/shared/roster";
import { useEffect, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { LoadState } from "../roster/parts.tsx";
import { formatNumber } from "../roster/rosterText.ts";
import { DevGrant } from "./DevGrant.tsx";
import { SlotTileButton, slotColumnsStyle } from "./HoldingParts.tsx";
import { ReplaceDialog, SlotSheet } from "./HoldingsDialogs.tsx";
import { HoldingsPanel } from "./HoldingsPanel.tsx";
import { type SlotCell, slotGroups, unitHoldings } from "./holdingsModel.ts";
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
  const groups = slotGroups(view);
  /** 칸 묶음 하나: 옛 프로젝트 화면처럼 두 줄(왼 줄 → 오른 줄) */
  const group = (cells: readonly SlotCell[], side: "organ" | "gear", title: string) =>
    cells.length === 0 ? null : (
      <section className="holding-slot-group" data-side={side} aria-label={title}>
        <h3 className="holding-subtitle">
          {title} <span className="roster-num">{formatNumber(cells.length)}</span>
        </h3>
        <ul className="roster-slots holding-slot-grid slot-columns" style={slotColumnsStyle(cells.length)}>
          {cells.map((cell) => (
            <SlotTileButton
              key={cell.index}
              cell={cell}
              names={names}
              className="roster-slot"
              onOpen={() => controller.openSlot({ unit, index: cell.index })}
            />
          ))}
        </ul>
      </section>
    );
  return (
    <>
      <div className="holding-slot-groups">
        {group(groups.organ, "organ", m.cyborg_organs_title())}
        {group(groups.gear, "gear", m.roster_gear_title())}
      </div>
      <HoldingsPanel view={view} controller={controller} names={names} />
      <DevGrant controller={controller} unit={unit} />
      <SlotSheet view={view} controller={controller} names={names} />
      <ReplaceDialog view={view} controller={controller} />
    </>
  );
}

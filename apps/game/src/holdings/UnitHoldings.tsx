// 유닛의 장비·지닌 물건(세계 유닛만) — 인벤토리 모드(mode="inventory": 소지품 기본 표시 + [착용 장비] 토글/넓은 화면 기본 확장, 인공장기 제외)와
// 유닛 상세 모드(mode="unit": 스탯창 아래 인공장기·일반장비·소지품 전체 표시)를 나눈다.
// 사용자 요청 2026-11-25: "인벤토리에 소지품을 보여주는 것이고 착용 장비를 눌러야 장비창이 나오게한다. 화면이 넓으면 기본 확장상태이거나.
// 인벤토리내 인공장기는 보여지는게 아니고 유닛 정보를 눌렀을때 스탯창에 나오는 것이다."
// 시안 유닛(p…)은 보유 물건이 없어 이 판을 쓰지 않는다(UnitDetail이 옛 칸 목록을 그린다).
import type { HoldingsListResponse } from "@terra/shared/holdings";
import type { RosterNames } from "@terra/shared/roster";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { LoadState } from "../roster/parts.tsx";
import { formatNumber } from "../roster/rosterText.ts";
import { DevGrant } from "./DevGrant.tsx";
import { BrokenGearAlert, SlotTileButton, slotColumnsStyle } from "./HoldingParts.tsx";
import { ReplaceDialog, SlotSheet } from "./HoldingsDialogs.tsx";
import { HoldingsPanel } from "./HoldingsPanel.tsx";
import { type SlotCell, isBroken, slotGroups, unitHoldings } from "./holdingsModel.ts";
import { holdingName, nameCompare } from "./holdingsText.ts";
import { useHoldings } from "./useHoldings.ts";
import "./holdings.css";

/** 넓은 화면(데스크톱 64em 이상)에서는 인벤토리의 착용 장비 창을 기본 확장 상태로 연다 */
function isWideViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 64em)").matches
  );
}

export function UnitHoldings({
  unit,
  fallbackLayout,
  names,
  mode = "unit",
  onGearOpenChange,
  onChanged,
}: {
  unit: number;
  fallbackLayout: readonly string[];
  names: RosterNames;
  /** "inventory" = 인벤토리·2차맵 가방(소지품 중심, 착용 장비 토글/넓은 화면 기본 확장, 인공장기 숨김), "unit" = 유닛 상세·스탯창(인공장기 포함) */
  mode?: "unit" | "inventory" | undefined;
  /** 인벤토리 모드에서 착용 장비 창이 열리거나 닫힐 때 바깥 판 폭을 맞추도록 알린다 */
  onGearOpenChange?: ((open: boolean) => void) | undefined;
  /** 목록이 다시 왔을 때(명령 뒤) — 유닛 화면이 생명 수치를 다시 받는다(회복 물약, D-512). 처음 받은 것은 알리지 않는다 */
  onChanged?: (() => void) | undefined;
}) {
  const gearPanelId = useId();
  const [gearOpen, setGearOpen] = useState<boolean>(() => (mode === "inventory" ? isWideViewport() : true));
  const controller = useHoldings();
  const state = controller.state;
  const data = state.status === "ready" ? state.data : null;
  const seen = useRef<HoldingsListResponse | null>(null);
  useEffect(() => {
    if (!data) return;
    if (seen.current !== null && seen.current !== data) onChanged?.();
    seen.current = data;
  }, [data, onChanged]);
  useEffect(() => {
    if (mode === "inventory") onGearOpenChange?.(gearOpen);
  }, [mode, gearOpen, onGearOpenChange]);

  if (state.status !== "ready") return <LoadState state={state} onRetry={controller.reload} />;
  const view = unitHoldings(state.data, unit, fallbackLayout, controller.now, nameCompare(), holdingName);
  const groups = slotGroups(view);

  /** 칸 묶음 하나: 옛 프로젝트 화면처럼 두 줄(왼 줄 → 오른 줄) */
  const group = (cells: readonly SlotCell[], side: "organ" | "gear", title: string, note?: string) =>
    cells.length === 0 ? null : (
      <section className="holding-slot-group" data-side={side} aria-label={title}>
        <h3 className="holding-subtitle">
          {title} <span className="roster-num">{formatNumber(cells.length)}</span>
        </h3>
        {note ? <p className="roster-note">{note}</p> : null}
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

  if (mode === "inventory") {
    const equippedGear = groups.gear.filter((cell) => cell.holding !== null).length;
    const brokenGear = groups.gear.filter((cell) => cell.holding !== null && isBroken(cell.holding)).length;
    return (
      <div className="holdings-inventory" data-mode="inventory" data-gear-open={gearOpen ? "true" : "false"}>
        <BrokenGearAlert count={brokenGear} />
        {groups.gear.length > 0 ? (
          <div className="holding-gear-bar">
            <button
              type="button"
              className="button-small holding-gear-toggle"
              aria-expanded={gearOpen}
              aria-controls={gearPanelId}
              onClick={() => setGearOpen((prev) => !prev)}
            >
              <span>
                {m.holdings_equipped_gear_toggle({
                  equipped: formatNumber(equippedGear),
                  total: formatNumber(groups.gear.length),
                })}
              </span>
              {brokenGear > 0 ? (
                <span className="holding-gear-warn-pill">
                  {m.home_cyborg_broken_gear({ count: formatNumber(brokenGear) })}
                </span>
              ) : null}
              <span className="holding-gear-caret" aria-hidden="true">
                {gearOpen ? "▾" : "▸"}
              </span>
            </button>
          </div>
        ) : null}
        <div className="holdings-inventory-layout" data-gear-open={gearOpen ? "true" : "false"}>
          {gearOpen && groups.gear.length > 0 ? (
            <div id={gearPanelId} className="holdings-inventory-gear">
              {group(groups.gear, "gear", m.roster_gear_title())}
            </div>
          ) : null}
          <div className="holdings-inventory-main">
            <HoldingsPanel view={view} controller={controller} names={names} includeOrgans={false} />
            <DevGrant controller={controller} unit={unit} />
          </div>
        </div>
        <SlotSheet view={view} controller={controller} names={names} />
        <ReplaceDialog view={view} controller={controller} />
      </div>
    );
  }

  const brokenAll = view.display.filter((cell) => cell.holding !== null && isBroken(cell.holding)).length;
  return (
    <>
      <BrokenGearAlert count={brokenAll} />
      <div className="holding-slot-groups">
        {group(groups.organ, "organ", m.cyborg_organs_title(), m.cyborg_organs_note())}
        {group(groups.gear, "gear", m.roster_gear_title())}
      </div>
      <HoldingsPanel view={view} controller={controller} names={names} includeOrgans={false} />
      <DevGrant controller={controller} unit={unit} />
      <SlotSheet view={view} controller={controller} names={names} />
      <ReplaceDialog view={view} controller={controller} />
    </>
  );
}

// 지도 운영 메뉴 — 사용자 지적 2026-11-12 "운영자메뉴를 하나로 모아 열고닫게 해라 너무 지저분하다. Fast ms 같은 장보창도 토글로해라".
// 운영진(gm·admin·dev, useStaffView)에게만 위 판 머리에 [운영] 단추 하나를 두고, 누르면 위 판 줄 아래에 판이 열린다(다시 누르면·Esc·밖을 누르면 닫힘).
// 판 안 항목(단추)을 누르면 그 일을 하고 판을 닫는다(기획 D-560 1239 "운영 메뉴 누르면 닫힘"). 밀대(1차맵 시점 등)는 단추가 아니라 닫지 않는다.
// 판 안: [성능 표시](운영진 — 1·2차맵이 같은 값, perfPanelToggle.ts), 2차맵이면 [운영자 모드]·[자유 시점](dev·admin, 옛 아래 판의 흩어진 단추).
// 운영자 단추는 빨간 운영자 모양(map-operator-button, 사용자 답 Q2). 운영자 권한이 없으면 단추도 판도 없다 — 서버도 명령마다 권한을 본다.
// 상태는 화면이 갖는다(useOperatorMenu) — 단추는 머리 판 안에, 판은 위 판 줄의 한 줄로 따로 놓기 때문이다.
import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { MapIcon } from "./mapIcons.tsx";
import { setPerfPanel, usePerfPanel } from "./perfPanelToggle.ts";
import "./mapHud.css";

/** 눌러도 판을 닫지 않는 곳: 판 안과 [운영] 단추 */
const KEEP_SELECTOR = ".map-operator-menu, .map-operator-menu-button";

export interface OperatorMenuControl {
  readonly open: boolean;
  readonly panelId: string;
  readonly toggle: () => void;
  readonly close: () => void;
}

/** 운영 메뉴 여닫기(밖을 누르거나 Esc면 닫는다 — 열린 대화상자가 있으면 Esc는 그쪽 몫) */
export function useOperatorMenu(): OperatorMenuControl {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  useEffect(() => {
    if (!open) return () => undefined;
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(KEEP_SELECTOR)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && document.querySelector("dialog[open]") === null) setOpen(false);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, panelId, toggle: () => setOpen((on) => !on), close: () => setOpen(false) };
}

/** 머리 판의 [운영] 단추 */
export function OperatorMenuButton({ control }: { readonly control: OperatorMenuControl }) {
  return (
    <button
      type="button"
      className="button-small map-operator-button map-operator-menu-button"
      aria-expanded={control.open}
      aria-controls={control.panelId}
      title={m.map_ops_menu_label()}
      onClick={control.toggle}
    >
      <MapIcon name="tools" />
      <span>{m.map_ops_menu()}</span>
    </button>
  );
}

/** 판 안의 켬·끔 단추 한 줄(눌린 상태 = 켬) */
export function OperatorMenuToggle({
  pressed,
  onToggle,
  className,
  label,
  note,
}: {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  /** 시험·모양용 이름(map-operator-toggle 등) */
  readonly className: string;
  readonly label: string;
  /** 단추 아래 한 줄 설명(없으면 없음) */
  readonly note?: string | undefined;
}) {
  return (
    <li className="map-operator-menu-row">
      <button
        type="button"
        className={`button-small map-operator-button map-operator-menu-item ${className}`}
        aria-pressed={pressed}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="map-operator-menu-state" aria-hidden="true">
          {pressed ? m.map_ops_on() : m.map_ops_off()}
        </span>
      </button>
      {note ? <p className="map-operator-menu-note">{note}</p> : null}
    </li>
  );
}

/** [성능 표시] 한 줄 — 1·2차맵이 같이 쓴다 */
export function PerfToggle() {
  const on = usePerfPanel();
  return (
    <OperatorMenuToggle
      pressed={on}
      onToggle={() => setPerfPanel(!on)}
      className="map-perf-toggle"
      label={m.map_ops_perf()}
    />
  );
}

/** 열린 운영 메뉴 판(닫혀 있으면 아무것도 그리지 않는다). children = 판 안 줄(OperatorMenuToggle) */
export function OperatorMenuPanel({
  control,
  children,
}: {
  readonly control: OperatorMenuControl;
  readonly children: ReactNode;
}) {
  if (!control.open) return null;
  // 항목 단추를 누르면(그 단추의 일이 먼저 돈다 — 거품 차례) 판을 닫는다(D-560 1239)
  const onPick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button.map-operator-menu-item, button.map-operator-pace-chip")
    )
      control.close();
  };
  return (
    <section
      id={control.panelId}
      className="map-panel map-operator-menu"
      aria-label={m.map_ops_menu_title()}
      data-part="operator-menu"
      onClick={onPick}
    >
      <h2 className="map-operator-menu-title">{m.map_ops_menu_title()}</h2>
      <ul className="map-operator-menu-list">{children}</ul>
    </section>
  );
}

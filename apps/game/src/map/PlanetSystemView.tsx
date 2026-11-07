// 1차맵 항성계 보기 — 1차맵을 1단계보다 더 줄이면 보인다(사용자 요청 2026-11-07 "더 축소시 항성계가 보여지게",
// ADR 2026-11-07-planet-view 3절). 행성 화면 위를 검은 우주로 덮고, 개발자 항성계 편집기와 같은 그림(space/StarSystemView)으로
// 항성·궤도·천체·위성을 보인다. 지금 행성은 노란 고리로 강조하고 처음부터 골라 둔다.
// - 돌아가기: [행성으로 돌아가기], 확대 단계 [+], 키우기(휠 위로·두 손가락 벌리기), Esc.
// - 자료는 [임시] 기기 상수(space/homeSystem.ts — 태양계, 확인 대기 질문 650). 다른 천체로 가는 길은 아직 없다(출시 = 지구).
// - 위 판 줄(머리 판·확대 단계)은 좁은 화면·영어에서 두 줄이 된다: 그 아래 끝을 재어 내용 위 여백(--planet-system-top)으로 쓴다.
import { starType } from "@terra/shared";
import { type PointerEvent, type RefObject, type WheelEvent, useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { HOME_SYSTEM, type HomeBody, currentBodyIndex } from "../space/homeSystem.ts";
import { type SystemBodyView, StarSystemView } from "../space/StarSystemView.tsx";
import { bodyFullName, bodyKindName, bodyNameParts } from "../space/spaceMessages.ts";
import "./planetSystem.css";

/** 두 손가락을 이만큼(배) 벌리면 행성으로 돌아간다 */
const PINCH_BACK = 1.15;

interface PlanetSystemViewProps {
  /** 행성(1차맵 1단계)으로 돌아간다 */
  readonly onBack: () => void;
  /** 위 판 줄(이 아래부터 내용을 놓는다) */
  readonly headerRef?: RefObject<HTMLElement | null> | undefined;
}

/** 거리(AU) 글: 1 미만은 두 자리, 그 위는 한 자리 */
function formatAu(distanceAu: number): string {
  return distanceAu < 1 ? distanceAu.toFixed(2) : distanceAu.toFixed(1);
}

function viewOf(item: HomeBody): SystemBodyView {
  const parts = bodyNameParts(item.id);
  const full = bodyFullName(item.id);
  return {
    distanceAu: item.distanceAu,
    kind: item.kind,
    label: item.current ? m.planet_system_body_current_label({ name: full }) : full,
    name: parts.name,
    note: item.current ? m.planet_system_current() : (parts.real ?? undefined),
    current: item.current,
    moons: item.moons.length,
  };
}

export function PlanetSystemView({ onBack, headerRef }: PlanetSystemViewProps) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(currentBodyIndex(HOME_SYSTEM));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<number | null>(null);
  const bodies = HOME_SYSTEM.bodies.map(viewOf);
  const chosen = selected === null ? null : HOME_SYSTEM.bodies[selected];
  const starName = starType(HOME_SYSTEM.star) ? m.space_star_sun() : "";

  // 위 판 줄 아래 끝 → 내용 위 여백(React 상태를 쓰지 않고 CSS 변수만 바꾼다)
  useEffect(() => {
    const header = headerRef?.current;
    const root = rootRef.current;
    if (!header || !root || typeof ResizeObserver === "undefined") return () => undefined;
    const place = (): void => {
      const bottom = header.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
      root.style.setProperty("--planet-system-top", `${Math.max(0, Math.round(bottom))}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(header);
    place();
    return () => observer.disconnect();
  }, [headerRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // 키우기(휠 위로)·두 손가락 벌리기 = 행성으로
  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (event.deltaY < 0) onBack();
  };
  const spread = (): number | null => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinchStart.current = spread();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinchStart.current;
    const now = spread();
    if (start !== null && now !== null && start > 0 && now / start >= PINCH_BACK) {
      pinchStart.current = null;
      onBack();
    }
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  return (
    <div
      ref={rootRef}
      className="planet-system"
      data-selected={chosen?.id}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="planet-system-head">
        <h2 className="planet-system-title" ref={headingRef} tabIndex={-1}>
          {m.planet_system_title({ name: m.planet_system_name() })}
        </h2>
      </div>
      <div className="planet-system-stage">
        <StarSystemView
          starTypeId={HOME_SYSTEM.star}
          bodies={bodies}
          scale="log"
          label={m.planet_system_view_label({ star: starName, count: String(bodies.length) })}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      {chosen ? (
        <section className="planet-system-card" aria-labelledby="planet-system-card-title">
          <h3 id="planet-system-card-title" className="planet-system-card-title">
            {bodyFullName(chosen.id)}
          </h3>
          <p className="planet-system-card-facts">
            {m.planet_system_body_facts({
              kind: bodyKindName(chosen.kind),
              distance: formatAu(chosen.distanceAu),
            })}
          </p>
          {chosen.moons.length > 0 ? (
            <p className="planet-system-card-facts">
              {m.planet_system_moons({ names: chosen.moons.map((moon) => bodyFullName(moon)).join(", ") })}
            </p>
          ) : null}
          {chosen.current ? (
            <button type="button" className="button-small button-primary planet-system-back" onClick={onBack}>
              {m.planet_system_back()}
            </button>
          ) : (
            <p className="planet-system-card-note">{m.planet_system_far()}</p>
          )}
        </section>
      ) : null}
      <p className="planet-system-hint">{m.planet_system_hint()}</p>
    </div>
  );
}

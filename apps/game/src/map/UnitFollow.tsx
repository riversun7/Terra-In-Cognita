// 2차맵 고른 유닛 따라가기 — 사용자 지적 2026-11-08 "화면은 선택된 유닛으로 고정되어야함", docs/adr/2026-11-08-map-input.md 2절.
// - 내 유닛(운영자 모드면 아무 유닛)을 고르면 엔진 카메라가 그 유닛을 따라간다(engine.follow — 목표점이 그 유닛의 지금 자리로 미끄러진다).
//   남의 유닛은 따라가지 않는다(정보만, 플레이어 카메라는 내 유닛 둘레로 묶인다 — 기획 정리 630).
// - 손으로 끌면(누르기 거리 넘게) 엔진이 따라가기를 끊고 알린다(onFollowBreak) → [따라가기](2차맵 사이 이동의 [따라가기]와 같은 글·모양)로 다시.
//   목록에서 그 유닛을 다시 고르거나 지도에서 그 유닛을 다시 눌러도 다시 따라간다. 고르기를 풀면 그만.
// - React 상태는 "끊긴 유닛" 하나뿐이다: 고른 유닛이 바뀌면 저절로 풀린다(효과 안에서 상태를 바꾸지 않는다).
import type { SecondMapEngine } from "@terra/engine";
import type { MapUnit } from "@terra/shared/mapUnits";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { m } from "../paraglide/messages.js";
import { unitControlOf } from "./mapUnits.ts";
import { reducedMotionList } from "./planetSky.ts";

/** 고른 유닛을 따라갈 수 있나: 다룰 수 있는 유닛(운영자 모드·내 유닛 — 명령을 못 하는 내 유닛도)이면. 남의 유닛·고르지 않음이면 false */
export function followableOf(input: {
  readonly operator: boolean;
  readonly selected: number | null;
  readonly units: readonly MapUnit[] | null;
  /** 시야 전송이 내 유닛이라고 함 */
  readonly ownByFeed: boolean;
}): boolean {
  if (input.selected === null) return false;
  const mine = input.units?.find((unit) => unit.unitId === input.selected);
  return unitControlOf({ operator: input.operator, mine, ownByFeed: input.ownByFeed }).kind !== "other";
}

export interface UnitFollow {
  /** 엔진이 고른 유닛을 따라가는 중 */
  readonly following: boolean;
  /** 끌어서 끊겼다([따라가기]를 보인다) */
  readonly lost: boolean;
  /** 다시 따라간다([따라가기], 목록·지도에서 다시 고르기) */
  readonly resume: () => void;
  /** 엔진 옵션 onFollowBreak에 넘긴다(끊긴 유닛) — 늘 같은 함수 */
  readonly onBreak: (unitId: number | null) => void;
}

/** followable = 고른 유닛을 다룰 수 있나(내 유닛·운영자 모드, 남의 유닛이면 false) */
export function useUnitFollow(
  engineRef: RefObject<SecondMapEngine | null>,
  selected: number | null,
  followable: boolean,
): UnitFollow {
  const [lostFor, setLostFor] = useState<number | null>(null);
  const target = followable && selected !== null && lostFor !== selected ? selected : null;
  useEffect(() => {
    // 동작 줄이기면 미끄러지지 않고 바로 붙는다
    engineRef.current?.follow(target, { instant: reducedMotionList()?.matches === true });
  }, [engineRef, target]);
  const resume = useCallback(() => setLostFor(null), []);
  return {
    following: target !== null,
    lost: followable && selected !== null && lostFor === selected,
    resume,
    onBreak: setLostFor,
  };
}

/** [따라가기] — 끌어서 끊긴 뒤 고른 유닛을 다시 따라간다(2차맵 사이 이동의 [따라가기]와 같은 글·모양) */
export function FollowAction({ show, onResume }: { readonly show: boolean; readonly onResume: () => void }) {
  if (!show) return null;
  return (
    <div className="map-actions">
      <button type="button" className="button-small button-primary map-unit-follow" onClick={onResume}>
        {m.map_travel_follow()}
      </button>
    </div>
  );
}

// 고른 남의 유닛의 한눈 정보(세력·종류) — 기획 답 636 나, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)".
// 고른 유닛이 남의 유닛일 때 한 번 묻는다(tRPC world.unitGlance — 서버가 지금 내 시야 안인지 본다). 고르기가 바뀌면 앞 물음을 끊는다.
// 받지 못하거나 시야 밖이면 null(화면은 번호·움직임만 보인다).
import type { MapUnitGlance } from "@terra/shared/mapUnits";
import { useEffect, useState } from "react";
import { loadUnitGlance } from "./mapUnits.ts";

const REQUEST_TIMEOUT_MS = 10_000;

export function useUnitGlance(mapKey: number, unitId: number | null, other: boolean): MapUnitGlance | null {
  const [answer, setAnswer] = useState<{
    readonly unitId: number;
    readonly glance: MapUnitGlance | null;
  } | null>(null);
  useEffect(() => {
    if (unitId === null || !other) return () => undefined;
    const controller = new AbortController();
    let replaced = false;
    // 오래 걸리면 끊는다(AbortSignal.any는 Safari 16.4에 없다 — 타이머로 같은 신호를 끊는다)
    const timer = setTimeout(
      () => controller.abort(new DOMException("unit glance timed out", "TimeoutError")),
      REQUEST_TIMEOUT_MS,
    );
    loadUnitGlance(mapKey, unitId, controller.signal).then(
      (response) => {
        if (!replaced) setAnswer({ unitId, glance: response.glance });
      },
      () => {
        if (!replaced) setAnswer({ unitId, glance: null });
      },
    );
    return () => {
      replaced = true;
      clearTimeout(timer);
      controller.abort(new DOMException("unit glance replaced", "AbortError"));
    };
  }, [mapKey, unitId, other]);
  // 다른 유닛의 앞 답은 쓰지 않는다
  return answer !== null && answer.unitId === unitId && other ? answer.glance : null;
}

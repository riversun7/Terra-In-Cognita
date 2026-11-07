// 생명 수치 받기(tRPC vitals.list)와 그 사이 값 셈 — 기획 D-512("클라에서 계산하는게 좋을듯").
// 서버는 응답 시각까지 셈한 값과 그 값의 시각을 보낸다. 기기는 서버 시각(받은 뒤 흐른 시간을 더함)에서 같은 함수(@terra/shared vitalsAt)로
// 분 단위 회복을 셈해 보여 주고, 다음 분 경계에만 다시 그린다(주기 타이머·서버 다시 묻기 없음, 다시 받기 규칙은 useRosterQuery와 같다).
// 지연 조각 안에서만 쓴다(tRPC 클라이언트 net/api.ts는 첫 화면 묶음에 들어가지 않는다).
import {
  type VitalsListResponse,
  type VitalsSnapshot,
  vitalsAt,
  vitalsNextChange,
} from "@terra/shared/vitals";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../net/api.ts";
import { useRosterQuery } from "./useRosterQuery.ts";

/** 받은 응답 + 받은 기기 시각(서버 시각과의 차를 셈한다) */
interface ReceivedVitals extends VitalsListResponse {
  readonly receivedAt: number;
}

const loadVitals = async (_preview: boolean, signal: AbortSignal): Promise<ReceivedVitals> => {
  const data = await api.vitals.list.query(undefined, { signal });
  return { ...data, receivedAt: Date.now() };
};

export interface VitalsNow {
  /** 세계 유닛의 지금 생명 수치(받지 못했거나 없는 유닛이면 undefined) */
  readonly of: (unitId: number) => VitalsSnapshot | undefined;
  /** 사이보그 본체의 지금 생명 수치 */
  readonly cyborg: VitalsSnapshot | undefined;
  /** 다시 받기(회복 물약을 쓴 뒤 등) */
  readonly reload: () => void;
}

/** 화면 유닛 ID("w<세계 유닛 ID>") → 세계 유닛 ID. 시안 자료("p…")면 null */
export function worldUnitId(id: string): number | null {
  if (!id.startsWith("w")) return null;
  const value = Number(id.slice(1));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** 다음 분 경계에 다시 그린다(그 뒤 조금 늦게: 경계 바로 앞에 그리지 않게) */
const REDRAW_SLACK_MS = 50;

/**
 * refreshOn: 바뀌면 다시 받는 값(보유 물건 목록 — 회복 물약을 쓰면 목록이 다시 온다). 처음 값은 다시 받지 않는다
 */
export function useVitals(refreshOn?: unknown): VitalsNow {
  const query = useRosterQuery(loadVitals, false);
  const { reload } = query;
  const seen = useRef<unknown>(undefined);
  useEffect(() => {
    if (refreshOn === undefined) return;
    if (seen.current !== undefined && seen.current !== refreshOn) reload();
    seen.current = refreshOn;
  }, [refreshOn, reload]);
  const data = query.state.status === "ready" ? query.state.data : null;
  const [clientNow, setClientNow] = useState(() => Date.now());
  const offset = data ? data.generatedAt - data.receivedAt : 0;

  useEffect(() => {
    if (!data) return undefined;
    const serverNow = clientNow + offset;
    let next = Number.POSITIVE_INFINITY;
    for (const unit of data.units) {
      const at = vitalsNextChange(vitalsAt(unit, serverNow));
      if (at !== null) next = Math.min(next, at);
    }
    if (!Number.isFinite(next)) return undefined;
    const timer = setTimeout(() => setClientNow(Date.now()), Math.max(0, next - serverNow) + REDRAW_SLACK_MS);
    return () => clearTimeout(timer);
  }, [data, clientNow, offset]);

  return useMemo(() => {
    const serverNow = clientNow + offset;
    const byUnit = new Map((data?.units ?? []).map((unit) => [unit.unit, unit]));
    const of = (unitId: number): VitalsSnapshot | undefined => {
      const found = byUnit.get(unitId);
      return found ? vitalsAt(found, serverNow) : undefined;
    };
    const cyborgView = data?.units.find((unit) => unit.cyborg);
    return { of, cyborg: cyborgView ? vitalsAt(cyborgView, serverNow) : undefined, reload };
  }, [data, clientNow, offset, reload]);
}

// 운영 스위치(docs/adr/2026-11-08-operator-roles-log-switch.md) — 표 ops_switches, 줄이 없으면 꺼짐(기본 꺼짐).
// 지금은 조회 감사 기록(view_audit: 2차맵 전체 보기·행성 정의 조회) 하나다. 개발 단계에 쓸모없는 줄이 쌓이지 않게 한다
// (사용자 요청 2026-11-08 "로그를 켜고 끌수 있게 스위치를 추가하자.(기본 꺼짐 상태)").
// 서버가 켤 때 한 번 읽어 메모리에 두고, 바꾸면 DB와 메모리를 함께 바꾼다(서버는 한 프로세스다). 읽지 못하면 꺼짐으로 본다.
import { OPS_SWITCHES, type OpsSwitch } from "@terra/shared/ops";
import type { OpsQueryable } from "./access.ts";

export interface OpsSwitches {
  isOn(id: OpsSwitch): boolean;
  /** 모든 스위치의 지금 값 */
  list(): { id: OpsSwitch; enabled: boolean }[];
  set(id: OpsSwitch, enabled: boolean, actorId: string, nowMs: number): Promise<void>;
}

const isSwitch = (value: string): value is OpsSwitch => (OPS_SWITCHES as readonly string[]).includes(value);

export async function loadOpsSwitches(pool: OpsQueryable): Promise<OpsSwitches> {
  const state = new Map<OpsSwitch, boolean>();
  const { rows } = await pool.query<{ id: string; enabled: boolean }>("select id, enabled from ops_switches");
  for (const row of rows) if (isSwitch(row.id)) state.set(row.id, row.enabled);
  return {
    isOn: (id) => state.get(id) ?? false,
    list: () => OPS_SWITCHES.map((id) => ({ id, enabled: state.get(id) ?? false })),
    async set(id, enabled, actorId, nowMs) {
      await pool.query(
        `insert into ops_switches (id, enabled, updated_at_ms, updated_by) values ($1, $2, $3, $4)
         on conflict (id) do update set enabled = excluded.enabled, updated_at_ms = excluded.updated_at_ms,
           updated_by = excluded.updated_by`,
        [id, enabled, nowMs, actorId],
      );
      state.set(id, enabled);
    },
  };
}

/** DB가 없거나 읽지 못한 서버: 늘 꺼짐, 바꾸지 못한다 */
export const NO_OPS_SWITCHES: OpsSwitches = {
  isOn: () => false,
  list: () => OPS_SWITCHES.map((id) => ({ id, enabled: false })),
  set: () => Promise.reject(new Error("ops switches unavailable")),
};

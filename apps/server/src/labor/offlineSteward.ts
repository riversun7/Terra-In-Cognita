// 비접속 유저 유닛의 필수요소 자율(관리인) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (비접속 유저 자율)"
// 사용자 방향(2026-11-21): "유닛들이 다른 곳에서 임금을 받게 활동은 계속해야 한다. 높은 기술에 투자 등 손실 위험이 있는 행동을 하지 않게 필수요소만
// 우선 돌아가게 하자." 접속을 끊은 지 일정 시간(설정 칸 npc_ai_offline_steward_after_ms)이 지난 유저의 일 없는 유닛을, 같은 2차맵에 열려 있는 남의
// 일자리(임금 높은 차례)에 넣는다. 유저가 직접 받는 것과 같은 명령(labor acceptJob)이라 조건·임금·세금·가문세가 모두 그대로다.
// - 돈을 쓰는 일(자기 시설 배치의 임금, 건설, 구인, 연구, 거래)은 하지 않는다. 계약은 돌아온 유저가 해지할 수 있다.
// - 대상: 고용 휴먼·사이보그 유닛(유저의 사이보그 본체·수호신·배는 건드리지 않는다).
// - 부하: 살피는 주기 = 가문 상태 점검 주기(설정 칸 npc_ai_house_check_ms), 한 번에 받는 계약 수 상한.
// 스위치: 설정 칸 npc_ai_offline_steward_enabled(0 = 끔).
import type { SocietyCoefficients } from "@terra/sim";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";

/** [임시] 한 번 살필 때 맺는 계약 수 상한(부하·한꺼번에 몰림 방지) */
export const STEWARD_ACCEPTS_PER_SWEEP = 20;

const STEWARD_KINDS: ReadonlySet<number> = new Set([UNIT_KIND_HUMAN, UNIT_KIND_CYBORG_UNIT]);

interface StewardMap {
  readonly mapKey: number;
  forEachUnit(
    visit: (unit: { readonly id: number; readonly kind: number; readonly ownerId: number }) => void,
  ): void;
}

export interface OfflineSteward {
  /** 살필 때가 되었으면 살피고 맺은 계약 수를 돌려준다(아니면 0) */
  sweep(nowMs: number): Promise<number>;
}

export function createOfflineSteward(o: {
  readonly rules: () => SocietyCoefficients;
  readonly settlement: {
    /** 접속을 끊은 유저와 끊긴 시각 */
    offlineUsers(): readonly { readonly userId: string; readonly sinceMs: number }[];
    findOwnerOfUser(userId: string): number | undefined;
  };
  readonly labor: {
    /** 그 유저가 받을 수 있는 남의 열린 일자리(임금 높은 차례 — labor service jobs) */
    jobs(
      userId: string,
      filter: Record<string, never>,
    ): {
      readonly status: string;
      readonly jobs: readonly {
        readonly id: number;
        readonly mapKey: number | null;
        readonly slots: number;
        readonly filled: number;
      }[];
    };
    acceptJob(userId: string, jobId: number, unitId: number): Promise<{ readonly ok: boolean }>;
    unitBusy(unitId: number): boolean;
  };
  readonly maps: ReadonlyMap<number, StewardMap>;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
}): OfflineSteward {
  let nextAt = 0;
  let busy = false;
  return {
    async sweep(nowMs) {
      const ai = o.rules().npcAi;
      if (ai.offlineStewardEnabled !== 1 || busy || nowMs < nextAt) return 0;
      nextAt = nowMs + Math.max(10_000, Math.trunc(ai.houseCheckMs));
      busy = true;
      let accepted = 0;
      try {
        const away = o.settlement
          .offlineUsers()
          .filter((user) => nowMs - user.sinceMs >= ai.offlineStewardAfterMs)
          .toSorted((a, b) => a.sinceMs - b.sinceMs || (a.userId < b.userId ? -1 : 1));
        if (away.length === 0) return 0;
        const owners = new Map<number, string>();
        for (const user of away) {
          const owner = o.settlement.findOwnerOfUser(user.userId);
          if (owner !== undefined) owners.set(owner, user.userId);
        }
        // 일 없는 유닛(주체 → 유닛·2차맵)
        const idle = new Map<number, { unitId: number; mapKey: number }[]>();
        for (const map of o.maps.values())
          map.forEachUnit((unit) => {
            if (!owners.has(unit.ownerId) || !STEWARD_KINDS.has(unit.kind) || o.labor.unitBusy(unit.id))
              return;
            const list = idle.get(unit.ownerId);
            if (list) list.push({ unitId: unit.id, mapKey: map.mapKey });
            else idle.set(unit.ownerId, [{ unitId: unit.id, mapKey: map.mapKey }]);
          });
        for (const [owner, units] of [...idle].toSorted((a, b) => a[0] - b[0])) {
          const userId = owners.get(owner);
          if (userId === undefined) continue;
          const board = o.labor.jobs(userId, {});
          if (board.status !== "ready") continue;
          // 남은 자리(이번에 채운 만큼 줄인다). 임금 높은 차례는 일자리 판이 이미 세웠다
          const left = new Map(board.jobs.map((job) => [job.id, job.slots - job.filled]));
          for (const unit of units.toSorted((a, b) => a.unitId - b.unitId)) {
            if (accepted >= STEWARD_ACCEPTS_PER_SWEEP) return accepted;
            for (const job of board.jobs) {
              if (job.mapKey !== unit.mapKey || (left.get(job.id) ?? 0) <= 0) continue;
              const result = await o.labor.acceptJob(userId, job.id, unit.unitId);
              if (!result.ok) {
                // 그 일자리는 이번에 더 보지 않는다(닫힘·보증금 모자람 등)
                left.set(job.id, 0);
                continue;
              }
              left.set(job.id, (left.get(job.id) ?? 1) - 1);
              accepted += 1;
              break;
            }
          }
        }
        return accepted;
      } catch (error) {
        o.log?.warn({ err: error }, "offline steward sweep failed");
        return accepted;
      } finally {
        busy = false;
      }
    },
  };
}

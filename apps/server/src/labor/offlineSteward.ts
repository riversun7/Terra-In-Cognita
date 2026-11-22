// 비접속 유저 유닛의 필수요소 자율(관리인) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (비접속 유저 자율)"·"바뀜 (2026-11-22, D-587 …)"
// 사용자 방향(2026-11-21): "유닛들이 다른 곳에서 임금을 받게 활동은 계속해야 한다. 높은 기술에 투자 등 손실 위험이 있는 행동을 하지 않게 필수요소만
// 우선 돌아가게 하자." 접속을 끊은 지 일정 시간(설정 칸 npc_ai_offline_steward_after_ms — 잠깐 끊긴 것만 거른다)이 지난 유저의 일 없는 유닛을, 같은
// 2차맵에 열려 있는 남의 일자리(임금 높은 차례)에 넣는다. 유저가 직접 받는 것과 같은 명령(labor acceptJob)이라 조건·임금·세금·가문세가 모두 그대로다.
// 사용자 답(D-587, 질문 2466 가): 늘 켜져 있고(끄는 칸 없음) 24시간 상한이 없다 — 이 기능에는 D-061·D-144·D-162를 대신한다. 그래서 남의 시설에서
// 임금형 계약으로 일하는 유닛은 접속을 끊은 지 24시간이 지나도 계속 일한다(stewardExemption → settlement.exemptOffline).
// - 꼭 필요한 일만, 손실 위험이 있는 일은 하지 않는다(D-586): 돈을 쓰는 일(자기 시설 배치의 임금, 건설, 구인, 연구, 거래)은 하지 않는다.
//   일꾼 쪽이 내는 돈이 없는 임금형 받기만 한다(보증금은 고용주가 낸다). 계약은 돌아온 유저가 해지할 수 있다.
// - 대상: 고용 휴먼·사이보그 유닛(유저의 사이보그 본체·수호신·배는 건드리지 않는다).
// - 부하: 살피는 주기 = 가문 상태 점검 주기(설정 칸 npc_ai_house_check_ms), 한 번에 받는 계약 수 상한.
// 바뀜 (league-2, 사용자 결정 D-590 2507 가): 관리인이 맡은 일도 작업 중 부상을 굴리고(그대로), 다친 유닛은 스스로 병원에 가 치료받거나 경상이면 계속 일한다 —
//   살필 때마다 stewardCare.ts(2차맵 모음에 붙은 판단 — 병원 서비스가 있을 때만)를 먼저 부른다. 치료 요금은 유저가 누르는 병원 치료와 같다(D-590이 이 일에서
//   "돈 쓰는 일 없음"을 대신한다).
import type { LaborContract, SocietyCoefficients } from "@terra/sim";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN, isGuardianUnit } from "../world/unitKinds.ts";
import { stewardCareOf } from "./stewardCare.ts";

/** [임시] 한 번 살필 때 맺는 계약 수 상한(부하·한꺼번에 몰림 방지) */
export const STEWARD_ACCEPTS_PER_SWEEP = 20;

const STEWARD_KINDS: ReadonlySet<number> = new Set([UNIT_KIND_HUMAN, UNIT_KIND_CYBORG_UNIT]);

interface StewardMap {
  readonly mapKey: number;
  forEachUnit(
    visit: (unit: {
      readonly id: number;
      readonly kind: number;
      readonly ownerId: number;
      readonly guardian?: boolean | undefined;
    }) => void,
  ): void;
}

export interface OfflineSteward {
  /** 살필 때가 되었으면 살피고 맺은 계약 수를 돌려준다(아니면 0) */
  sweep(nowMs: number): Promise<number>;
}

/**
 * 관리인이 맡는 일(24시간 상한 없이 계속 일하는 유닛): 남의 시설에서 열린(일함·일시 중지) 임금형 계약으로 일하는 유닛. 관리인이 맺은 계약이든
 * 유저가 끊기 전에 맺은 계약이든 같은 일이다(질문 docs/questions/2026-11-22-league-fix.md 2506)
 */
export function stewardExemption(
  contracts: ReadonlyMap<
    number,
    Pick<LaborContract, "unitId" | "kind" | "state" | "ownerId" | "workerOwnerId">
  >,
): (unitId: number) => boolean {
  return (unitId) => {
    for (const c of contracts.values())
      if (c.unitId === unitId && (c.state === "active" || c.state === "paused"))
        return c.kind === "wage" && c.workerOwnerId !== c.ownerId;
    return false;
  };
}

export function createOfflineSteward(o: {
  readonly rules: () => SocietyCoefficients;
  readonly settlement: {
    /** 접속을 끊은 유저와 끊긴 시각 */
    offlineUsers(): readonly { readonly userId: string; readonly sinceMs: number }[];
    findOwnerOfUser(userId: string): number | undefined;
    /** 관리인이 맡은 유닛은 비접속 24시간 상한을 받지 않는다(없으면 걸지 않는다 — 시험) */
    exemptOffline?: ((hook: ((unitId: number) => boolean) | undefined) => void) | undefined;
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
    readonly contracts?:
      | ReadonlyMap<number, Pick<LaborContract, "unitId" | "kind" | "state" | "ownerId" | "workerOwnerId">>
      | undefined;
  };
  readonly maps: ReadonlyMap<number, StewardMap>;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
}): OfflineSteward {
  // 늘 켜져 있다: 만들 때 정산에 상한 빼기 고리를 건다
  const exempt = o.labor.contracts ? stewardExemption(o.labor.contracts) : undefined;
  if (exempt) o.settlement.exemptOffline?.(exempt);
  let nextAt = 0;
  let busy = false;
  return {
    async sweep(nowMs) {
      const ai = o.rules().npcAi;
      if (busy || nowMs < nextAt) return 0;
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
        // 다친 유닛의 자율 판단(D-590 2507 가 — 병원 치료 또는 계속 일하기). 실패해도 일자리 잇기는 한다
        if (exempt)
          await stewardCareOf(o.maps)?.({ owners, stewarded: exempt, kinds: STEWARD_KINDS, nowMs })?.catch(
            (error: unknown) => o.log?.warn({ err: error }, "offline steward care failed"),
          );
        // 일 없는 유닛(주체 → 유닛·2차맵)
        const idle = new Map<number, { unitId: number; mapKey: number }[]>();
        for (const map of o.maps.values())
          map.forEachUnit((unit) => {
            if (
              !owners.has(unit.ownerId) ||
              !STEWARD_KINDS.has(unit.kind) ||
              isGuardianUnit(unit) ||
              o.labor.unitBusy(unit.id)
            )
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

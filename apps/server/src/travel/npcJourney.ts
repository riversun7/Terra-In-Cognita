// NPC 2차맵 사이 이동의 서비스 안쪽 몫 — service.ts에서 나눔(그 파일 1,000줄 상한). 사용자 결정 D-591("어떠한 경우에도 순간이동은 없다 파견으로 실제로
// 이동해서 참전한다"), 질문 2651 나·2654 가(줄기 no-teleport-b). 바깥에서 쓰는 모양은 travel/npcTravel.ts.
// - NPC 유닛 = NPC 휴먼(봇, 종류 0)·NPC 국가 지도자(종류 7). 플레이어 이동과 같은 길·시간(route.ts — 변까지 걷기, 띄우지 않은 2차맵은 곧은 거리 ÷ 속도 ×
//   지형 배율로 건너뛰기, 띄운 2차맵은 그 2차맵 길 찾기로 걷기)을 쓴다. 주인 확인은 없다(서버 판단이 보낸다).
// - 다른 점 [임시 — 질문 2696]: 목적 2차맵은 띄운 것이어야 한다(NPC 유닛은 좌표 유닛으로 서지 않는다 — 다시 켤 때 봇 좌표 유닛은 복구하지 않는다).
//   넘기 전 정산·탐사 기록·도중 습격·좌표 조우·1차맵 좌표 유닛 목록에서 빠진다. 가는 동안 스스로 걷지 않는다(2차맵 held).
// - 저장은 플레이어 길과 같은 world_travels(유닛당 한 줄 — user_id 없음). 다시 켜면 지도자 길은 첫 복구에서, 봇 길은 NPC 사회 런타임이 휴먼을 읽은 뒤
//   (restoreNpc) 잇는다 — 먼저 이으면 건너뛰는 봇이 2차맵에서 빠져 런타임이 그 휴먼을 잃는다.
import type { TravelKind } from "@terra/protocol";
import type { WorldTravelProblem, WorldTravelStop } from "@terra/shared/worldMap";
import type { CellPoint } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { TransferRow } from "../world/secondMapRows.ts";
import { UNIT_KIND_BOT, UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import type { HiddenPlaceOf } from "./coordReads.ts";
import type { UnitInfo } from "./serviceParts.ts";
import {
  type Journey,
  type TravelCommandResult,
  type TravelService,
  type TravelTarget,
  fail,
  startCode,
} from "./serviceTypes.ts";

/** NPC 이동으로 보낼 수 있는 유닛 종류(NPC 휴먼·NPC 국가 지도자) */
export const isNpcKind = (kind: number): boolean => kind === UNIT_KIND_BOT || kind === UNIT_KIND_NPC_LEADER;

/** NPC 이동이 끝남(도착·멈춤) */
export interface NpcTravelDone {
  readonly unitId: number;
  readonly state: "arrived" | "stopped";
  /** 멈춘 까닭(도착이면 null) */
  readonly stop: WorldTravelStop | null;
  /** 끝난 때 유닛이 선 2차맵(모르면 undefined) */
  readonly mapKey: number | undefined;
}

/** 가는 중인 NPC 길 한 줄(보기 값) */
export interface NpcTrip {
  /** 목적 2차맵 */
  readonly mapKey: number;
  /** 도착 예상(보낼 때 잰 값) */
  readonly arriveAt: number;
  /** 띄우지 않은 2차맵을 건너뛰는 중(2차맵 위에 없음) */
  readonly hidden: boolean;
}

/** 끝남 알림 목록 — 듣는 쪽이 던져도 다른 쪽과 이동은 이어 간다 */
export function createNpcListeners(log: { error(obj: object, message: string): void }) {
  const listeners: ((done: NpcTravelDone) => void)[] = [];
  return {
    add(listener: (done: NpcTravelDone) => void): void {
      listeners.push(listener);
    },
    emit(done: NpcTravelDone): void {
      for (const listener of listeners) {
        try {
          listener(done);
        } catch (error) {
          log.error({ err: error, unitId: done.unitId }, "travel: npc arrival listener failed");
        }
      }
    },
  };
}

/** NPC 이동 명령이 쓰는 서비스 안쪽 몫(service.ts) */
export interface NpcMethodParts {
  readonly stopped: () => boolean;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly journeys: ReadonlyMap<number, Journey>;
  readonly writer: WorldWriter | undefined;
  readonly locate: (unitId: number, fresh?: boolean) => { map: SecondMap; info: UnitInfo } | undefined;
  readonly planFor: (
    where: { readonly mapKey: number; readonly info: UnitInfo },
    target: TravelTarget,
  ) => { route: number[]; distance: number } | { problem: WorldTravelProblem };
  readonly launch: (
    found: { id: number; ownerId: number; mapKey: number; info: UnitInfo; map: SecondMap | undefined },
    planned: { route: number[]; distance: number },
    request: TravelTarget & { readonly kind: TravelKind },
    userId: string | null,
    speedFactor: number,
    npc: boolean,
  ) => Promise<TravelCommandResult>;
  readonly hiddenPlace: HiddenPlaceOf;
  readonly settleAt: (journey: Journey, row: TransferRow, mapKey: number, cell: CellPoint) => boolean;
  readonly finish: (journey: Journey, state: "arrived" | "stopped", stop: WorldTravelStop | null) => void;
  readonly arm: () => void;
  readonly listeners: ReturnType<typeof createNpcListeners>;
}

/** NPC 이동 명령(TravelService의 startNpc·onNpcDone·npcTrip·cancelNpc) */
export function createNpcMethods(
  p: NpcMethodParts,
): Pick<TravelService, "startNpc" | "onNpcDone" | "npcTrip" | "cancelNpc"> {
  return {
    async startNpc(request) {
      if (p.stopped()) return fail("busy");
      const at = p.locate(request.unitId, true);
      if (!at) return fail(p.journeys.get(request.unitId)?.hidden ? "busy" : "unknown_unit");
      if (!isNpcKind(at.info.kind) || at.info.domain === "sea") return fail("forbidden");
      // NPC 유닛은 좌표 유닛으로 서지 않는다 — 띄운 2차맵으로만 보낸다 [임시 2696]
      if (!p.maps.has(request.mapKey)) return fail("unknown_map");
      const found = { id: request.unitId, ownerId: at.info.ownerId, mapKey: at.map.mapKey, ...at };
      const planned = p.planFor(found, request);
      if ("problem" in planned) return fail(startCode(planned.problem));
      return p.launch(found, planned, { ...request, kind: "move" }, null, 1, true);
    },

    onNpcDone: (listener) => p.listeners.add(listener),

    npcTrip(unitId) {
      const journey = p.journeys.get(unitId);
      if (journey?.npc !== true) return undefined;
      return {
        mapKey: journey.route.at(-1) ?? -1,
        arriveAt: journey.arriveAtMs,
        hidden: journey.hidden !== null,
      };
    },

    cancelNpc(unitId, drop = false) {
      const journey = p.journeys.get(unitId);
      if (journey?.npc !== true) return false;
      const hidden = journey.hidden;
      if (hidden && drop) {
        // 사라진 유닛(사망): 든 행을 버리고 유닛 행을 지운다(다시 켤 때 되살아나지 않게)
        journey.hidden = null;
        p.writer?.remove("units", { id: unitId });
      } else if (hidden) {
        // 가는 중 멈춤: 지금 자리에 선다(띄운 2차맵이면 가까운 설 칸)
        const place = p.hiddenPlace(journey, hidden);
        if (place && p.settleAt(journey, hidden.row, place.mapKey, place.cell)) {
          journey.hidden = null;
          journey.leg = place.index;
        }
      } else p.maps.get(journey.route[journey.leg] ?? -1)?.halt(unitId);
      p.finish(journey, "stopped", "cancelled");
      p.arm();
      return true;
    },
  };
}

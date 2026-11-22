// NPC 유닛 파견 — 다른 모듈이 쓰는 작은 모양(사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다", 질문 2651 나·2654 가,
// 줄기 no-teleport-b). 실제 이동은 이동 서비스(service.ts startNpc — 플레이어 이동과 같은 길·시간, npcJourney.ts)가 한다.
// - send(unitId, 목적지, onDone): NPC 휴먼(봇)·NPC 국가 지도자를 그 2차맵 칸으로 보낸다. 같은 2차맵이면 그 안에서 걷기만. 결과 = 도착 예상 시각.
//   onDone은 끝날 때(도착·멈춤) 한 번 불린다 — 메모리에만 있다(다시 켜면 버린다: 다시 켠 뒤에는 듣는 쪽이 유닛 자리로 다시 판단한다 — 쿠데타는 전투 때
//   그 도시 2차맵에 서 있나로, 지도자는 수도가 바뀔 때·켤 때 수도 2차맵에 있나로).
// - trip(unitId): 가는 중이면 목적 2차맵·도착 예상·건너뛰는 중인가. 가는 동안 유닛은 일·스스로 걷기·좌표 조우에서 빠진다(npcJourney.ts).
// - cancel(unitId, drop): 멈춘다(drop = 사망 — 든 행을 버린다).
// 이동 서비스 하나에 하나(npcTravelOf — 끝남 알림을 한 번만 듣는다).
import type { TravelResultCode } from "@terra/protocol";
import type { NpcTravelDone, NpcTrip } from "./npcJourney.ts";
import type { TravelService } from "./serviceTypes.ts";

export type { NpcTravelDone, NpcTrip } from "./npcJourney.ts";

/** 파견 목적지(띄운 2차맵과 그 안 배치 칸) */
export interface NpcTravelTarget {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

export type NpcSendResult =
  | { readonly ok: true; readonly arriveAt: number }
  | { readonly ok: false; readonly code: TravelResultCode };

export interface NpcTravel {
  /** 보낸다(가는 중이면 새 길로). 끝나면 onDone 한 번(메모리에만) */
  send(unitId: number, to: NpcTravelTarget, onDone?: (done: NpcTravelDone) => void): Promise<NpcSendResult>;
  /** 가는 중이면 목적 2차맵·도착 예상(아니면 undefined) */
  trip(unitId: number): NpcTrip | undefined;
  /** 멈춘다(그 자리에 선다). drop = 유닛이 사라졌다(사망). 가는 중이 아니면 false */
  cancel(unitId: number, drop?: boolean): boolean;
}

type NpcTravelService = Pick<TravelService, "startNpc" | "onNpcDone" | "npcTrip" | "cancelNpc">;

const cache = new WeakMap<NpcTravelService, NpcTravel>();

/** 그 이동 서비스의 NPC 파견(서비스마다 하나) */
export function npcTravelOf(service: NpcTravelService): NpcTravel {
  const have = cache.get(service);
  if (have) return have;
  const waiting = new Map<number, (done: NpcTravelDone) => void>();
  service.onNpcDone((done) => {
    const callback = waiting.get(done.unitId);
    if (!callback) return;
    waiting.delete(done.unitId);
    callback(done);
  });
  const travel: NpcTravel = {
    async send(unitId, to, onDone) {
      // 앞 길의 듣는 쪽은 새 길이 덮는다(앞 길은 끝남 알림 없이 버려진다)
      waiting.delete(unitId);
      const sent = await service.startNpc({ unitId, mapKey: to.mapKey, x: to.x, y: to.y });
      if (!sent.ok) return { ok: false, code: sent.code };
      // 첫 구간에서 이미 끝났으면(드묾) 알림이 먼저 지나갔다 — 가는 중일 때만 기다린다
      if (onDone && service.npcTrip(unitId)) waiting.set(unitId, onDone);
      return { ok: true, arriveAt: sent.arriveAt ?? 0 };
    },
    trip: (unitId) => service.npcTrip(unitId),
    cancel: (unitId, drop) => service.cancelNpc(unitId, drop),
  };
  cache.set(service, travel);
  return travel;
}

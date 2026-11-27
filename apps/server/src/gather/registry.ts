// 세계 저장 층 → 채집 서비스(WeakMap) — 조우 뒤 다시 판단(travel/encounterWorld.ts, 질문 2035 답)이 app.ts(1,000줄 상한)를 거치지 않고 채집 줄을
// 멈추고 다시 잇게 한다. gather/world.ts가 채집 세계를 만든 뒤 적는다.
import type { GatherService } from "./serviceTypes.ts";
import type { StationRuntime } from "./station.ts";

const services = new WeakMap<object, GatherService>();
const stations = new WeakMap<object, StationRuntime>();

/** 채집 서비스를 그 세계 저장 층에 적는다 */
export function registerGather(persistence: object, service: GatherService): void {
  services.set(persistence, service);
}

/** 그 세계 저장 층의 채집 서비스(아직 없거나 DB 없는 세계면 undefined) */
export function gatherOf(persistence: object | undefined): GatherService | undefined {
  return persistence ? services.get(persistence) : undefined;
}

/** 채집소·운반 런타임을 그 세계 저장 층에 적는다(NPC 상태 기반 피로가 운반 중 여부를 본다) */
export function registerStation(persistence: object, station: StationRuntime): void {
  stations.set(persistence, station);
}

/** 그 세계 저장 층의 채집소·운반 런타임(아직 없거나 DB 없는 세계면 undefined) */
export function stationOf(persistence: object | undefined): StationRuntime | undefined {
  return persistence ? stations.get(persistence) : undefined;
}

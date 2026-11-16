// 배 고리 — 세계(world.ts)가 만들고 배 서비스가 준비되면 채운다(docs/adr/2026-11-15-shipyard-harbor.md). world.ts(1,000줄 상한)는 이 작은 고리만 들고,
// 걷기 빠르기(world/walkSpeed.ts)는 배가 움직이기 시작할 때 배 종류·내구도 배율을, 지도 유닛 목록(worldMap/reads.ts)은 배 표시 정보를 여기서 읽는다.
// 배 서비스가 아직 없으면(부팅 중·DB 없는 세계) 배율 1000‰, 정보 없음.
import type { BoatCatch } from "../gather/boatCrew.ts";
import type { BoatInfo } from "./service.ts";

export interface BoatHooks {
  /** 배 빠르기 배율(‰) */
  readonly speedPm: (unitId: number) => number;
  /** 배 표시 정보(없으면 undefined) */
  readonly info: (unitId: number) => BoatInfo | undefined;
  /** 배 채집 일꾼(낚시 선원 ↔ 포획 장비, D-570 1821 — 채집 서비스가 읽는다). 없으면 undefined */
  readonly catchCrew: (unitId: number) => BoatCatch | undefined;
  /** 배 서비스가 채운다(undefined = 비우기) */
  attach(source: Pick<BoatHooks, "speedPm" | "info" | "catchCrew"> | undefined): void;
}

export function createBoatHooks(): BoatHooks {
  let source: Pick<BoatHooks, "speedPm" | "info" | "catchCrew"> | undefined;
  return {
    speedPm: (unitId) => source?.speedPm(unitId) ?? 1000,
    info: (unitId) => source?.info(unitId),
    catchCrew: (unitId) => source?.catchCrew(unitId),
    attach(next) {
      source = next;
    },
  };
}

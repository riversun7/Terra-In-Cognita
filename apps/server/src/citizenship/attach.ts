// 국적 바꾸기 서비스를 월드에 잇는다(app.ts의 게이트웨이·worldMap/reads.ts의 조회가 부른다) — docs/adr/2026-11-08-citizenship.md.
// 세계가 준비된 뒤(DB가 있는 월드 + NPC 사회 런타임) 처음 부를 때 만들고 다시 쓴다. 서비스는 상태를 따로 들지 않는다(사이보그 기록·원장이
// 원본)라 조회용(안개·이름)과 명령용이 따로 만들어도 같은 값을 본다. 월드 파일(world/world.ts)을 키우지 않으려고 월드 밖에서 잇는다.
import { houseTiesOf } from "../world/houseTies.ts";
import type { World } from "../world/world.ts";
import {
  type CitizenshipService,
  type CitizenshipServiceOptions,
  createCitizenshipService,
} from "./service.ts";

export function citizenshipServiceOf(
  world: Pick<World, "status" | "persistence" | "npc" | "maps"> | undefined,
  options: {
    readonly now: () => number;
    readonly knownCityIds?: CitizenshipServiceOptions["knownCityIds"];
    readonly nationName?: CitizenshipServiceOptions["nationName"];
  },
): () => CitizenshipService | undefined {
  let built: { persistence: object; service: CitizenshipService } | undefined;
  return () => {
    if (!world || world.status().state !== "ready") return undefined;
    const p = world.persistence;
    if (!p) return undefined;
    if (built?.persistence === p) return built.service;
    const service = createCitizenshipService({
      maps: world.maps,
      cyborgs: p.cyborgs,
      facilities: p.facilities,
      owners: p.owners,
      settlement: p.settlement,
      ledger: p.ledger,
      writer: p.writer,
      runtime: () => world.npc,
      now: options.now,
      ready: () => world.status().state === "ready",
      knownCityIds: options.knownCityIds,
      nationName: options.nationName,
      inHouse: (userId) => houseTiesOf(p)?.houseOfUser(userId) !== undefined,
    });
    built = { persistence: p, service };
    return service;
  };
}

/** tRPC world.naturalization 조회(worldMap/reads.ts가 다른 지도 흐름 조회와 함께 내보낸다) */
export interface NaturalizationReads {
  naturalization: CitizenshipService["terms"];
}

/** 조회용 서비스(안개·이름은 지도 흐름 조회와 같은 함수). 세계가 준비되기 전이면 not_ready */
export function naturalizationReadsOfWorld(
  world: Pick<World, "status" | "persistence" | "npc" | "maps">,
  names: Required<Pick<CitizenshipServiceOptions, "knownCityIds" | "nationName">>,
): NaturalizationReads {
  const service = citizenshipServiceOf(world, { now: () => Date.now(), ...names });
  return {
    naturalization: async (viewer, buildingId, nowMs) =>
      (await service()?.terms(viewer, buildingId, nowMs)) ?? {
        status: "not_ready",
        buildingId,
        terms: null,
        generatedAt: nowMs,
      },
  };
}

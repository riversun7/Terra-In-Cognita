// 시뮬레이터 도시 → 공성 전투맵 입력(질문 1068 가, city/citySiege.ts). 공성(combatRun.ts siege)과 정원사 웨이브(run.ts)가 같은 입력을 쓴다.
// 도시 모양은 (세계 시드, 도시 ID)로 정해지고 행정 레벨·주거·시작 도시 여부가 바뀔 때만 다시 계획한다(캐시).
import { mix32 } from "../math/hash.ts";
import type { SiegeLayout } from "../combat/siegeArena.ts";
import { type SiegeCityKit, TEST_SIEGE_KIT, simCitySiegeLayout } from "../city/citySiege.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import type { SimWorld } from "./world.ts";

/** 도시 ID → 공성 입력(행정 건물이 없거나 옛 배치 설정이면 undefined — 옛 열린 맵) */
export type SimCitySiegeLayouts = (cityId: number) => SiegeLayout | undefined;

export function simCitySiegeLayouts(
  world: SimWorld,
  c: Pick<SocietyCoefficients, "worldSeed" | "facilityRuntime" | "logistics">,
  seed: number,
  kit: SiegeCityKit = TEST_SIEGE_KIT,
): SimCitySiegeLayouts {
  const cache = new Map<string, SiegeLayout | undefined>();
  return (cityId) => {
    const city = world.cities.get(cityId);
    if (!city) return undefined;
    const key = `${cityId}|${city.start ? 1 : 0}|${city.housing}|${city.adminLevel}`;
    if (cache.has(key)) return cache.get(key);
    const layout = simCitySiegeLayout({
      cityId,
      start: city.start,
      housing: city.housing,
      adminLevel: city.adminLevel,
      seed: c.worldSeed,
      kit,
      runtime: c.facilityRuntime,
      bedsPerLevel: c.logistics.lodgingBedsPerLevel,
      layoutSeed: mix32((seed >>> 0) ^ Math.imul(cityId + 1, 0x85eb_ca6b) ^ 0x3c6e_f372),
    });
    cache.set(key, layout);
    return layout;
  };
}

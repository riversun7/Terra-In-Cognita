// 도시 둘레 땅 문구 — 시작 도시 고르기의 "주변 자원·기후"(기획 60 §7.1 D-6041)와 1차맵 도시 판이 같이 쓴다.
// 값은 서버가 행성 값에서 읽은 그 2차맵 칸(@terra/shared/worldMap WorldMapLand). 엔진을 가져오지 않는다(첫 접속 조각).
// [임시] "자원"은 행성 값의 숲·물만 보인다(자원 매장·채집 분포는 아직 서버에 없다 — 질문 512). 판정에 쓰지 않는 보기 값이다.
import { WATER_COAST, WATER_LAKE, WATER_OCEAN, WATER_RIVER } from "@terra/planet";
import type { WorldMapLand } from "@terra/shared/worldMap";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";

/** 숲으로 칠 숲 밀도(0 ~ 255) 아래 문턱 — 이보다 낮으면 "숲 0%"를 보이지 않는다 */
const FOREST_MIN = 13;

export interface LandText {
  /** 바이옴 · 높이 */
  readonly ground: string;
  /** 숲 N% · 강 · 호수 · 해안(없으면 "눈에 띄는 것 없음") */
  readonly resources: string;
  /** 기온 · 습도 · 강수 */
  readonly climate: string;
}

/** 물 비트 → 이름들(바다·호수·강·해안) */
export function waterFeatures(water: number): string[] {
  const names: string[] = [];
  if (water & WATER_OCEAN) names.push(m.planet_water_ocean());
  if (water & WATER_LAKE) names.push(m.planet_water_lake());
  if (water & WATER_RIVER) names.push(m.planet_water_river());
  if (water & WATER_COAST) names.push(m.planet_water_coast());
  return names;
}

export function landText(land: WorldMapLand): LandText {
  const biome =
    land.biomeName === null
      ? (land.biomeId ?? m.planet_cell_biome_unknown({ id: "?" }))
      : getLocale() === "en"
        ? land.biomeName.en
        : land.biomeName.ko;
  const resources: string[] = [];
  if (land.forest >= FOREST_MIN)
    resources.push(m.world_land_forest({ percent: Math.round((land.forest / 255) * 100) }));
  resources.push(...waterFeatures(land.water));
  return {
    ground: m.planet_cell_ground({ biome, height: Math.round(land.elevationM) }),
    resources: resources.length > 0 ? resources.join(" · ") : m.world_land_none(),
    climate: m.world_land_climate({
      temp: Math.round(land.temperatureC),
      humidity: Math.round((land.humidity / 255) * 100),
      rain: Math.round(land.precipitationMm),
    }),
  };
}

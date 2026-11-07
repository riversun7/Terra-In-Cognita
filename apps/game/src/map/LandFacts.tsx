// 도시 둘레 땅 요약(땅·자원·기후) — 첫 접속 도시 단계(D-6041 "주변 자원·기후")와 1차맵 도시 판이 같이 쓴다. 엔진을 가져오지 않는다.
// 값이 아직 없으면(서버가 행성을 굽는 중) 그렇다고 알린다.
import type { WorldMapLand } from "@terra/shared/worldMap";
import { m } from "../paraglide/messages.js";
import { landText } from "./landText.ts";
import "./landFacts.css";

export function LandFacts({ land }: { land: WorldMapLand | null }) {
  if (!land) return <p className="land-facts-none">{m.world_land_unknown()}</p>;
  const text = landText(land);
  return (
    <dl className="land-facts" data-biome={land.biomeId ?? undefined}>
      <div>
        <dt>{m.world_land_ground_label()}</dt>
        <dd>{text.ground}</dd>
      </div>
      <div>
        <dt>{m.world_land_resources_label()}</dt>
        <dd>{text.resources}</dd>
      </div>
      <div>
        <dt>{m.world_land_climate_label()}</dt>
        <dd>{text.climate}</dd>
      </div>
    </dl>
  );
}

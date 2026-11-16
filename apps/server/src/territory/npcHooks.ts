// NPC 사회 런타임 ↔ 영토 서비스 고리(world/world.ts가 런타임 입력에 펼쳐 넣는다 — world.ts 1,000줄 상한)
// - onCityOwner: 기준 도시를 빼앗기면 영토 비콘도 함께 넘어간다(D-512 335, 도시 줄과 같은 쓰기 묶음).
// - territoryClaim: 마을 자리가 다른 세력의 1차맵 영토가 아니게(D-568 "판정도 지도대로", 질문 1922 나) — 마지막으로 셈한 배치(provinceAt)로
//   바로 답한다(마을은 하루 끝 저장 안에서 동기로 고른다).
import type { TerritoryService } from "./service.ts";

export function npcTerritoryHooks(
  territory: Pick<TerritoryService, "cityOwnerChanged" | "provinceAt">,
  planetId: string,
  log: { info(obj: object, message: string): void },
) {
  return {
    onCityOwner: (cityId: number, factionId: number): void => {
      const moved = territory.cityOwnerChanged(cityId, factionId);
      if (moved > 0) log.info({ cityId, factionId, moved }, "beacons follow city owner");
    },
    territoryClaim: (mapKey: number, x: number, y: number) => territory.provinceAt(planetId, mapKey, x, y),
  };
}

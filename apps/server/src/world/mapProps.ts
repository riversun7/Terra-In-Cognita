// 콘텐츠 map_props → 2차맵 생성기 소품 규칙 입력(ADR 2026-10-31-second-map-from-planet 4절).
// 서버 생성 워커(WP-3)와 경로 측정 스크립트(bench/secondMapPaths.ts)가 쓴다.
// 팩 항목은 2단계(참조)까지 통과한 파싱 결과라 바이옴이 참조 객체다. 정규 JSON(참조 → ID 문자열)으로 되돌린 뒤
// 스키마로 다시 읽어 타입을 얻는다(검증된 팩이라 실패하면 팩 코드가 틀린 것이다).
import { type ContentPack, mapPropEntrySchema } from "@terra/content";
import type { MapPropInput } from "@terra/planet/secondMap";
import { mapPropArtCode } from "@terra/shared";
import { SLOW_TABLE_SIZE } from "@terra/sim";

/** 팩의 소품 항목들(팩 순서 = 흩기 우선순위) */
export function mapPropInputsFromPack(pack: ContentPack): MapPropInput[] {
  return (pack.entries.get("map_props") ?? []).map((entry) => {
    const json: unknown = JSON.parse(JSON.stringify(entry));
    const prop = mapPropEntrySchema.parse(json);
    const common = {
      id: prop.id,
      art: prop.art,
      placement: prop.placement,
      biomes: prop.biomes.map(({ biome, weight }) => ({ biome: biome.id, weight })),
      curves: prop.curves,
    };
    if (prop.placement === "forest") return common;
    return { ...common, cover: prop.cover, clump: prop.clump, maxShare: prop.maxShare, water: prop.water };
  });
}

/**
 * 팩 소품의 느림 배율(slowPm, 기획 D-540 — 질문 1223 나) → 그림 번호 → 느림 배율 표(천분율, @terra/sim SLOW_TABLE_SIZE칸, 0 = 없음).
 * 지형 비용(@terra/sim placementCostsFromLayers)이 그림 층과 함께 받는다. 소품 규칙(생성기 입력·소품 규칙 해시)에는 넣지 않는다:
 * 생성기 출력·지형 캐시 열쇠는 그대로이고, 지형 비용은 캐시·고정본을 읽을 때마다 다시 계산한다. 같은 그림을 쓰는 항목이 둘이면 큰 값.
 */
export function mapPropSlowByArtFromPack(pack: ContentPack): Uint16Array {
  const table = new Uint16Array(SLOW_TABLE_SIZE);
  for (const entry of pack.entries.get("map_props") ?? []) {
    const json: unknown = JSON.parse(JSON.stringify(entry));
    const prop = mapPropEntrySchema.parse(json);
    if (prop.placement !== "scatter" || prop.slowPm === undefined) continue;
    const code = mapPropArtCode(prop.art);
    if (code > 0 && code < SLOW_TABLE_SIZE) table[code] = Math.max(table[code] ?? 0, prop.slowPm);
  }
  return table;
}

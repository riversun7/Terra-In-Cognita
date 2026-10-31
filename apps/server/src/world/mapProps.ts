// 콘텐츠 map_props → 2차맵 생성기 소품 규칙 입력(ADR 2026-10-31-second-map-from-planet 4절).
// 서버 생성 워커(WP-3)와 경로 측정 스크립트(bench/secondMapPaths.ts)가 쓴다.
// 팩 항목은 2단계(참조)까지 통과한 파싱 결과라 바이옴이 참조 객체다. 정규 JSON(참조 → ID 문자열)으로 되돌린 뒤
// 스키마로 다시 읽어 타입을 얻는다(검증된 팩이라 실패하면 팩 코드가 틀린 것이다).
import { type ContentPack, mapPropEntrySchema } from "@terra/content";
import type { MapPropInput } from "@terra/planet/secondMap";

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
    return { ...common, cover: prop.cover, clump: prop.clump, maxShare: prop.maxShare };
  });
}

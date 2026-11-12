// 원자재 오브젝트 종류(콘텐츠 gather_objects) → 서버 채집이 쓰는 모양 — docs/adr/2026-11-07-gather-objects.md.
// 팩 항목은 2단계(참조)까지 통과한 파싱 결과라 아이템·시설이 참조 객체다. 정규 JSON(참조 → ID 문자열)으로 되돌린 뒤 스키마로 다시 읽는다
// (map_props와 같은 방식, world/mapProps.ts). 그림 종류 이름은 소품 그림 번호(@terra/shared MAP_PROP_ARTS)로 바꿔 둔다.
import { type ContentPack, GATHER_PLOT_SURFACES, gatherObjectEntrySchema } from "@terra/content";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { mapPropArtCode } from "@terra/shared";
import type { CatchmentMaterial } from "@terra/shared/catchment";

/** 팩 지표 이름 → 지형 칸 지표 번호(@terra/protocol TERRAIN_SURFACE). 팩 이름 차례가 번호 차례다(시험이 본다) */
export function plotSurfaceCode(name: (typeof GATHER_PLOT_SURFACES)[number]): number {
  return name === "shallow_water" ? TERRAIN_SURFACE.shallowWater : TERRAIN_SURFACE[name];
}

export interface GatherKind {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly source: "prop" | "rock" | "plot" | "outcrop";
  /** source prop: 소품 그림 번호들 */
  readonly arts: readonly number[];
  /** source rock: 바위 지표 묶음 가운데 설 천분율. source outcrop: 광석 몫 1000일 때 묶음에 설 천분율(× 광석 몫 ÷ 1000) */
  readonly chancePm: number;
  /** source outcrop: 기기가 그 자리에 세우는 소품 그림 번호(0 = 없음) */
  readonly art: number;
  /** source outcrop: 설 몫으로 곱하는 2차맵 몫(광석 고도 몫 또는 목재 몫). 없으면 광석 고도 몫 */
  readonly share?: "ore" | "wood" | undefined;
  /** source plot·outcrop: 지표 번호들. plot: 묶음 문턱(지형 칸 64칸 가운데)·있어야 하는 원자재(없으면 null) */
  readonly surfaces: readonly number[];
  readonly minCells: number;
  readonly material: CatchmentMaterial | null;
  /** 유닛이 직접 캘 수 있나(false = 맡는 시설의 일꾼만 — 밭·목초지·물터) */
  readonly direct: boolean;
  /** 아이템 ID(item: 앞머리 없음) */
  readonly item: string;
  readonly lots: number;
  readonly workMs: number;
  readonly uses: number;
  readonly regrowMs: number;
  /** 맡는 시설 ID(없으면 null) */
  readonly facility: string | null;
  readonly primary: string;
  readonly secondary: string;
}

/** 팩의 오브젝트 종류(팩 차례 = 같은 그림을 둘이 맡을 때 앞의 것) */
export function gatherKindsFromPack(pack: ContentPack): GatherKind[] {
  return (pack.entries.get("gather_objects") ?? []).map((entry) => {
    const json: unknown = JSON.parse(JSON.stringify(entry));
    const kind = gatherObjectEntrySchema.parse(json);
    return {
      id: kind.id,
      name: { ko: kind.name.ko, en: kind.name.en },
      source: kind.source,
      arts: kind.source === "prop" ? kind.arts.map(mapPropArtCode).filter((code) => code > 0) : [],
      chancePm: kind.source === "rock" || kind.source === "outcrop" ? kind.chancePm : 0,
      art: kind.source === "outcrop" && kind.art ? Math.max(0, mapPropArtCode(kind.art)) : 0,
      share: kind.source === "outcrop" ? (kind.share ?? "ore") : "ore",
      surfaces: kind.source === "plot" || kind.source === "outcrop" ? kind.surfaces.map(plotSurfaceCode) : [],
      minCells: kind.source === "plot" ? kind.minCells : 0,
      material: kind.source === "plot" ? (kind.material ?? null) : null,
      direct: kind.direct ?? true,
      item: kind.item.id,
      lots: kind.lots,
      workMs: kind.workMs,
      uses: kind.uses,
      regrowMs: kind.regrowMs,
      facility: kind.facility?.id ?? null,
      primary: kind.primary,
      secondary: kind.secondary,
    };
  });
}

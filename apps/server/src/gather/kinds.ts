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
  readonly source: "prop" | "rock" | "plot" | "outcrop" | "site" | "school";
  /** source prop: 소품 그림 번호들 */
  readonly arts: readonly number[];
  /** source rock: 바위 지표 묶음 가운데 설 천분율. source outcrop: 광석 몫 1000일 때 묶음에 설 천분율(× 광석 몫 ÷ 1000) */
  readonly chancePm: number;
  /** source outcrop·site·school: 기기가 그 자리에 세우는(어군은 움직이며 그리는) 소품 그림 번호(0 = 없음) */
  readonly art: number;
  /** source outcrop: 설 몫으로 곱하는 2차맵 몫(광석 고도 몫 또는 목재 몫). 없으면 광석 고도 몫 */
  readonly share?: "ore" | "wood" | undefined;
  /**
   * source site: 2차맵(1차맵 칸) 바이옴 ID → 묶음(16×16 배치 칸)에 설 천분율. source school: 바이옴 ID → 2차맵 하나의 어군 수.
   * 그 밖은 빈 표(기획 D-536 — 지형별 오브젝트). 아래 칸들은 없으면 0·false·빈 표(앞 판 종류·시험 모양)
   */
  readonly biomes?: ReadonlyMap<string, number> | undefined;
  /** source site: 물가 거리(지형 칸, 0 = 보지 않음)·바닷가 2차맵만 */
  readonly shore?: number | undefined;
  readonly coast?: boolean | undefined;
  /** source school: 헤엄 빠르기(배치 칸 ÷ 분)·범위(배치 칸)·물가에서 낚는 거리(배치 칸, 0 = 배로만) */
  readonly speed?: number | undefined;
  readonly range?: number | undefined;
  readonly reach?: number | undefined;
  /** 배로만 닿는다(물 위 자리 또는 reach 0 어군 — 배는 아직 없다, 질문 1221) */
  readonly boat?: boolean | undefined;
  /** source plot·outcrop·site: 지표 번호들. plot: 묶음 문턱(지형 칸 64칸 가운데)·있어야 하는 원자재(없으면 null) */
  readonly surfaces: readonly number[];
  readonly minCells: number;
  readonly material: CatchmentMaterial | null;
  /** 유닛이 직접 캘 수 있나(false = 맡는 시설의 일꾼만 — 밭·목초지·물터) */
  readonly direct: boolean;
  /** 아이템 ID(item: 앞머리 없음). 굴림표·사다리 굴림이면 대표 아이템(판에 보이는 이름) */
  readonly item: string;
  /** 굴림표(기획 D-540 1222 나 — 난파선): 한 번 캘 때 이 가운데 하나를 가중치(‰)로. 없으면 빈 목록 */
  readonly table?: readonly { readonly item: string; readonly weightPm: number }[] | undefined;
  /** 사다리 굴림(기획 D-540 1222 다 — 어군): 맡는 시설의 채집 사다리에서 캐는 유닛의 유효 스탯 띠로 티어를 뽑는다 */
  readonly ladder?: boolean | undefined;
  /** 사다리 굴림의 티어 범위(기획 D-541 — 질문 1307 나, 어군 종류마다): 뽑은 티어를 이 안으로 접는다. 없으면 막지 않는다 */
  readonly tierRange?: { readonly min: number; readonly max: number } | undefined;
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
    const artName =
      kind.source === "outcrop" || kind.source === "site" || kind.source === "school" ? kind.art : undefined;
    const biomes =
      kind.source === "site"
        ? new Map(kind.biomes.map((item) => [item.biome.id, item.chancePm]))
        : kind.source === "school"
          ? new Map(kind.biomes.map((item) => [item.biome.id, item.count]))
          : new Map<string, number>();
    const surfaceNames =
      kind.source === "plot" || kind.source === "outcrop" || kind.source === "site" ? kind.surfaces : [];
    const reach = kind.source === "school" ? kind.reach : 0;
    return {
      id: kind.id,
      name: { ko: kind.name.ko, en: kind.name.en },
      source: kind.source,
      arts: kind.source === "prop" ? kind.arts.map(mapPropArtCode).filter((code) => code > 0) : [],
      chancePm: kind.source === "rock" || kind.source === "outcrop" ? kind.chancePm : 0,
      art: artName ? Math.max(0, mapPropArtCode(artName)) : 0,
      share: kind.source === "outcrop" ? (kind.share ?? "ore") : "ore",
      biomes,
      shore: kind.source === "site" ? (kind.shore ?? 0) : 0,
      coast: kind.source === "site" ? kind.coast === true : false,
      speed: kind.source === "school" ? kind.speed : 0,
      range: kind.source === "school" ? kind.range : 0,
      reach,
      boat:
        (kind.source === "school" && reach === 0) ||
        (kind.source === "site" && surfaceNames.every((name) => name === "water")),
      surfaces: surfaceNames.map(plotSurfaceCode),
      minCells: kind.source === "plot" ? kind.minCells : 0,
      material: kind.source === "plot" ? (kind.material ?? null) : null,
      direct: kind.direct ?? true,
      item: kind.item.id,
      ...(kind.table
        ? { table: kind.table.map((row) => ({ item: row.item.id, weightPm: row.weightPm })) }
        : {}),
      ...(kind.ladder === true ? { ladder: true } : {}),
      ...(kind.ladder === true && kind.tierRange
        ? { tierRange: { min: kind.tierRange.min, max: kind.tierRange.max } }
        : {}),
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

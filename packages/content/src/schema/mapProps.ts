// 2차맵 소품(map_props) 분류 — ADR 2026-10-31-second-map-from-planet(46) 4절, 기획 질문 125 기술 기본안(판정 소품 넷).
// 판정이 있는 소품(숲·큰 바위·덤불·갈대·쓰러진 나무)과, 2026-11-11부터 엄폐 0 장식 소품(선인장·키 큰 풀·꽃밭·돌무더기·떠밀려 온 나무 등,
// 바이옴·환경 곡선으로 그 땅다운 모습을 만든다. ADR 46 "바뀜 (2026-11-11)")을 둔다. 칸마다 작은 풀포기·자갈은 기기 장식이라 팩에 없다.
// - forest: 숲 칸(행성 숲 밀도와 노이즈로 차폐·은폐를 정한 칸, ADR 35 질문 27 기본안)의 나무 그림을 고른다. 엄폐 값은 숲 나누기가 정한다.
// - scatter: 자기 엄폐 값(0 없음·1 은폐·2 차폐)으로 흩어 놓는다. 차폐는 지나갈 수 없다(D-227 ①).
// - 비중: 바이옴마다 기본 비중(천분율) × 환경 곡선 값(0 ~ 1000)의 곱. scatter는 배치 칸 가운데 그 소품이 놓일 천분율,
//   forest는 숲 칸에서 나무 그림끼리의 상대 비중이다.
// - 곡선 {min, idealMin, idealMax, max}: min 이하·max 이상 0, idealMin ~ idealMax 1000, 그 사이는 곧게 잇는다.
// 이름표(그림 종류·곡선 축·덩이 크기)는 @terra/shared mapProps(생성기와 같은 것)에서 가져온다. 지금 데이터는 임시값이다.
import { MAP_PROP_ARTS, MAP_PROP_CLUMP_CELLS, MAP_PROP_CURVE_AXES } from "@terra/shared";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

/** 환경 곡선 하나: 축의 값 범위 안 정수, min ≤ idealMin ≤ idealMax ≤ max, min < max */
function curve(low: number, high: number) {
  const value = z.int().min(low).max(high);
  return z
    .strictObject({ min: value, idealMin: value, idealMax: value, max: value })
    .refine((c) => c.min <= c.idealMin && c.idealMin <= c.idealMax && c.idealMax <= c.max && c.min < c.max, {
      error: "곡선은 min ≤ idealMin ≤ idealMax ≤ max이고 min < max여야 합니다.",
    });
}

const curves = z.strictObject({
  temperatureC: curve(...MAP_PROP_CURVE_AXES.temperatureC).optional(),
  humidity: curve(...MAP_PROP_CURVE_AXES.humidity).optional(),
  precipitationMm: curve(...MAP_PROP_CURVE_AXES.precipitationMm).optional(),
  realAltitudeM: curve(...MAP_PROP_CURVE_AXES.realAltitudeM).optional(),
  slopePct: curve(...MAP_PROP_CURVE_AXES.slopePct).optional(),
  absLatitude: curve(...MAP_PROP_CURVE_AXES.absLatitude).optional(),
  waterDistance: curve(...MAP_PROP_CURVE_AXES.waterDistance).optional(),
});

/** 그림 종류("none"은 쓰지 않는다) */
const ART_HINT = `그림 종류는 ${MAP_PROP_ARTS.filter((name) => name !== "none").join(", ")} 가운데 하나입니다.`;
const art = z.enum(MAP_PROP_ARTS, { error: ART_HINT }).refine((name) => name !== "none", { error: ART_HINT });

const biomeWeight = z.strictObject({ biome: ref("biomes"), weight: z.int().min(1).max(1000) });

const common = {
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  art,
  biomes: z.array(biomeWeight).min(1, { error: "바이옴 비중을 하나 이상 적으세요." }),
  curves: curves.optional(),
};

const forestProp = z.strictObject({ ...common, placement: z.literal("forest") });

const scatterProp = z.strictObject({
  ...common,
  placement: z.literal("scatter"),
  cover: z.union([z.literal(0), z.literal(1), z.literal(2)], {
    error: "엄폐 값(cover)은 0(없음)·1(은폐)·2(차폐) 가운데 하나입니다.",
  }),
  /** 덩이: 노이즈 격자 간격(배치 칸)과 문턱(천분율, 이 위만 덩이 안). 없으면 고르게 흩는다 */
  clump: z
    .strictObject({
      cells: z.int().refine((cells) => (MAP_PROP_CLUMP_CELLS as readonly number[]).includes(cells), {
        error: `덩이 크기(cells)는 ${MAP_PROP_CLUMP_CELLS.join(", ")} 가운데 하나입니다.`,
      }),
      threshold: z.int().min(0).max(999),
    })
    .optional(),
  /** 한 2차맵 안 몫 상한(배치 칸 천분율). 넘으면 그 2차맵 전체의 비중을 같은 비율로 줄인다 */
  maxShare: z.int().min(1).max(1000).optional(),
});

export const mapPropEntrySchema = z
  .discriminatedUnion("placement", [forestProp, scatterProp], {
    error: (issue) =>
      issue.code === "invalid_union" ? '배치 방식(placement)은 "forest"나 "scatter"입니다.' : undefined,
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불리므로(Zod 4.6.7) 모양을 다시 보고 틀리면 건너뛴다
    if (!Array.isArray(entry.biomes)) return;
    const seen = new Set<string>();
    entry.biomes.forEach((item: unknown, index: number) => {
      const biome: unknown =
        item !== null && typeof item === "object" && "biome" in item ? item.biome : undefined;
      const id = biome !== null && typeof biome === "object" && "id" in biome ? biome.id : undefined;
      if (typeof id !== "string") return;
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["biomes", index, "biome"],
          message: `바이옴 ${id}이(가) 두 번 나옵니다. 한 번만 적으세요.`,
        });
      }
      seen.add(id);
    });
  });

export type MapPropEntry = z.output<typeof mapPropEntrySchema>;

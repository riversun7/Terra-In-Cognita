// 2차맵 원자재 오브젝트(gather_objects) 분류 — docs/adr/2026-11-07-gather-objects.md, 사용자 답(2026-11-07) "원자재 오브젝트를 통해 자원을 채집".
// 오브젝트 종류 하나 = 2차맵에 놓이는 채집 자리 한 가지(예: 침엽수 → 소나무 원목). 자리는 서버가 2차맵 지형에서 결정적으로 정한다:
// - source "prop": 소품 그림 층(map_props가 놓은 나무·큰 바위·덤불 등)의 그림 종류(arts)가 있는 칸.
// - source "rock": 바위 지표 칸(산비탈) 가운데 천분율 chancePm만큼(광맥).
// 채집 한 번 = 일 workMs(주 스탯 진행 속도로 나눔, 49 N32) → 아이템 lots 묶음 × 수확량(보조 스탯, 옛 1차 생산 규칙 D-507). uses번 캐면 떨어지고
// regrowMs 뒤 다시 자란다(D-112 채집 지점마다 다시 자라는 시각, D-5030 실제 시간, D-5032 개발자 패널 설정값). facility = 이 오브젝트를 맡는
// 시설(벌목장·광산): 반경 안이면 그 시설에 바로 넣고 버프를 받는다. 작물·가축은 오브젝트가 아니라 농장·목장 시설로만 얻는다(사용자 답).
// - source "plot"(밭·목초지·물터, docs/adr/2026-11-11-city-catchment.md): 지표 칸 묶음(16×16 배치 칸) 가운데 surfaces 지표가 minCells칸
//   이상인 곳. material이 있으면 그 2차맵(1차맵 칸)의 행성 값에 그 원자재가 있어야 선다(@terra/shared/catchment cellMaterials — 기후·고도).
//   direct = false면 유닛이 직접 캐지 못하고 맡는 시설의 일꾼만 쓴다(사용자 답 D-519 "일부 원자재는 목장이나 농장 같은 시설을 통해 작업").
// - source "outcrop"(노두, 기획 D-534 — 질문 1083 나 "낮은 땅 플레이어도 서버가 놓는 노두에서 석재·구리"): 16×16 배치 칸 묶음 가운데 surfaces
//   지표가 있는 묶음에서 (2차맵 키, 묶음, 종류) 굴림이 chancePm × 그 2차맵 광석 고도 몫(@terra/shared/catchment oreSharePm) ÷ 1000 안이면 선다
//   — 낮은 땅은 드물고 산지는 많다(NPC 배후지와 같은 고도 몫). art = 기기가 그 자리에 세우는 소품 그림(지형 파일에는 없다 — 생성기 판 그대로).
//   share = "wood"면 광석 몫 대신 그 2차맵 목재 몫(@terra/shared/catchment woodSharePm — 숲·목재 바닥)을 곱한다(사용자 결정 2026-11-12 "건축시
//   목재와 석재는 필수이다" — 숲이 없는 땅의 관목·나뭇가지 더미).
// - source "site"(지형별 오브젝트, 기획 D-536 — 모든 지형 5종 이상, 42 §5 표): 노두 뒤에 16×16 배치 칸 묶음마다, 그 2차맵(1차맵 칸) 바이옴의
//   천분율(biomes)로 선다. 자리 = surfaces 지표 지형 칸 가운데 묶음 가운데에 가까운 빈 칸(shore면 물가, coast면 바닷가 2차맵만).
//   물 위 자리(surfaces = water만)는 배로만 닿는다(배는 아직 없다).
// - source "school"(움직이는 어군, 기획 D-536 "심해는 배로 이동하여 어군같이 물고기떼"): 바이옴마다 2차맵 하나에 count개. 서버가 물 칸 위
//   닫힌 길(집 자리 둘레 range 안)을 결정적으로 정하고, 자리는 시각의 함수다(@terra/shared/fishSchool). reach 안 물가에 선 유닛이 낚고,
//   0이면 배로만 닿는다.
// - 나오는 아이템(기획 D-540 1222): 기본은 item 하나. table(굴림표)이면 그 가운데 하나를 가중치로, ladder면 맡는 시설의 사다리에서
//   유효 스탯 띠로 티어를 뽑는다(어군 = 낚시 사다리).
// 지금 값은 모두 [임시]다(D-515).
import { MAP_PROP_ARTS } from "@terra/shared";
import { CATCHMENT_MATERIALS } from "@terra/shared/catchment";
import { z } from "zod";
import { PRIMARY_STAT_CODES } from "./combat.ts";
import { contentId, localizedText, ref } from "./common.ts";

const ART_HINT = `그림 종류는 ${MAP_PROP_ARTS.filter((name) => name !== "none").join(", ")} 가운데 하나입니다.`;
const art = z.enum(MAP_PROP_ARTS, { error: ART_HINT }).refine((name) => name !== "none", { error: ART_HINT });

const common = {
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  /** 한 번 캘 때 나오는 아이템(기존 아이템만) */
  item: ref("items"),
  /** 한 번 캘 때 묶음 수(레시피·거래소와 같은 묶음 단위. 원장은 기본 단위 = 묶음 × 묶음 크기) */
  lots: z.int().min(1).max(100),
  /** 채집 한 번의 기본 일(ms). 걸리는 시간 = ⌈workMs ÷ 진행 속도⌉(진행 속도 = max(1, ⌊주 스탯 ÷ N32⌋)) */
  workMs: z.int().min(1000).max(3_600_000),
  /** 떨어지기까지 캘 수 있는 번수(옛 resource_tile_state max_hp 기본 5) */
  uses: z.int().min(1).max(1000),
  /** 떨어진 뒤 다시 자라는 시간(ms, 실제 시간. 옛 30분) */
  regrowMs: z
    .int()
    .min(60_000)
    .max(30 * 86_400_000),
  /** 이 오브젝트를 맡는 시설(벌목장·광산). 없으면 창고·도시 창고로만 나른다 */
  facility: ref("facilities").optional(),
  /** 진행 속도를 정하는 주 스탯·수확량을 정하는 보조 스탯(43 §4: 벌목 DEX + STR, 광산 STR + VIT, 약초 INT + WIS) */
  primary: z.enum(PRIMARY_STAT_CODES),
  secondary: z.enum(PRIMARY_STAT_CODES),
  /** 유닛이 직접 캘 수 있나(없으면 true). false = 맡는 시설의 일꾼만 쓴다(밭·목초지·물터) */
  direct: z.boolean().optional(),
  /**
   * 굴림표(기획 D-540 1222 나 — 난파선): 한 번 캘 때 이 아이템들 가운데 하나를 가중치(‰, 합 1000)로 뽑는다. 있으면 item은 대표 아이템(판에
   * 보이는 이름)이고 표 안에 있어야 한다(2단계 검사 gather_table_*). ladder와 함께 쓰지 않는다
   */
  table: z
    .array(z.strictObject({ item: ref("items"), weightPm: z.int().min(1).max(1000) }))
    .min(2)
    .max(16)
    .optional(),
  /**
   * 사다리 굴림(기획 D-540 1222 다 — 어군): 한 번 캘 때 맡는 시설(facility)의 채집 사다리에서 캐는 유닛의 유효 스탯(주 + 보조) 띠로 티어를
   * 뽑는다(다른 1차 생산과 같은 띠 표 — 사다리 띠 표). 있으면 item은 대표 아이템. 맡는 시설에 추첨 방식 채집 칸이 있어야 한다(2단계 검사)
   */
  ladder: z.literal(true).optional(),
};

/** 2차맵 지형 칸 지표 이름(@terra/protocol TERRAIN_SURFACE 차례 — 서버 시험이 같은지 본다) */
export const GATHER_PLOT_SURFACES = [
  "water",
  "grass",
  "dirt",
  "rock",
  "sand",
  "gravel",
  "snow",
  "ice",
  "mud",
  "ash",
  "shallow_water",
] as const;

const propObject = z.strictObject({
  ...common,
  source: z.literal("prop"),
  /** 이 오브젝트가 서는 소품 그림 종류(하나 이상. 다른 종류와 겹치면 팩 차례로 앞의 종류가 맡는다) */
  arts: z.array(art).min(1, { error: "소품 그림 종류(arts)를 하나 이상 적으세요." }),
});

const rockObject = z.strictObject({
  ...common,
  source: z.literal("rock"),
  /** 바위 지표 칸 묶음(8×8 배치 칸) 가운데 이 오브젝트가 설 천분율 */
  chancePm: z.int().min(1).max(1000),
});

const plotObject = z.strictObject({
  ...common,
  source: z.literal("plot"),
  /** 이 자리가 서는 지표(하나 이상) */
  surfaces: z.array(z.enum(GATHER_PLOT_SURFACES)).min(1, { error: "지표(surfaces)를 하나 이상 적으세요." }),
  /** 묶음(16×16 배치 칸 = 지형 칸 8×8 = 64칸) 가운데 그 지표가 이만큼 이상이면 선다 */
  minCells: z.int().min(1).max(64),
  /** 그 2차맵의 행성 값에 있어야 하는 원자재(없으면 지표만 본다) */
  material: z.enum(CATCHMENT_MATERIALS).optional(),
});

const outcropObject = z.strictObject({
  ...common,
  source: z.literal("outcrop"),
  /** 이 노두가 서는 지표(하나 이상) */
  surfaces: z.array(z.enum(GATHER_PLOT_SURFACES)).min(1, { error: "지표(surfaces)를 하나 이상 적으세요." }),
  /** 몫 1000일 때 묶음(16×16 배치 칸) 하나에 설 천분율. 실제 = chancePm × 그 2차맵 몫(share) ÷ 1000 */
  chancePm: z.int().min(1).max(1000),
  /** 곱하는 몫: 광석 고도 몫(기본) 또는 목재 몫 */
  share: z.enum(["ore", "wood"]).optional(),
  /** 기기가 그 자리에 세우는 소품 그림(없으면 표시 단추만) */
  art: art.optional(),
});

/** 2차맵(1차맵 칸) 바이옴마다 값 하나(site: 묶음마다 설 천분율, school: 2차맵 하나의 어군 수) */
const biomeChance = z.strictObject({ biome: ref("biomes"), chancePm: z.int().min(1).max(1000) });
const biomeCount = z.strictObject({ biome: ref("biomes"), count: z.int().min(1).max(32) });

/** 바이옴 목록에 같은 바이옴이 두 번 나오지 않는다 */
function uniqueBiomes(list: readonly { readonly biome: { readonly id: string } }[]): boolean {
  const ids = list.map((item) => item.biome.id);
  return new Set(ids).size === ids.length;
}

const siteObject = z.strictObject({
  ...common,
  source: z.literal("site"),
  /** 이 자리가 서는 지표(하나 이상). 물(water)만이면 배로만 닿는다(배는 아직 없다 — 기획 D-536 질문 1221) */
  surfaces: z.array(z.enum(GATHER_PLOT_SURFACES)).min(1, { error: "지표(surfaces)를 하나 이상 적으세요." }),
  /** 2차맵(1차맵 칸) 바이옴마다 묶음(16×16 배치 칸) 하나에 설 천분율 — 개발자 페이지에서 고치는 "양"(D-398) */
  biomes: z
    .array(biomeChance)
    .min(1, { error: "바이옴 천분율을 하나 이상 적으세요." })
    .refine(uniqueBiomes, { error: "같은 바이옴을 두 번 적지 마세요." }),
  /** 물가: 자리 지형 칸에서 물(물·얕은 물 지표)까지 이 지형 칸 수 안이어야 한다(없으면 보지 않는다) */
  shore: z.int().min(1).max(8).optional(),
  /** 바닷가만: 그 2차맵 칸의 행성 물 비트에 바다나 해안이 있어야 한다(호숫가·강가는 빼기) */
  coast: z.boolean().optional(),
  /** 기기가 그 자리에 세우는 소품 그림 */
  art,
});

const schoolObject = z.strictObject({
  ...common,
  source: z.literal("school"),
  /** 2차맵(1차맵 칸) 바이옴마다 그 2차맵에 둘 어군 수 — 개발자 페이지에서 고치는 "양"(D-398) */
  biomes: z
    .array(biomeCount)
    .min(1, { error: "바이옴 어군 수를 하나 이상 적으세요." })
    .refine(uniqueBiomes, { error: "같은 바이옴을 두 번 적지 마세요." }),
  /** 헤엄 빠르기(배치 칸 ÷ 분) */
  speed: z.int().min(1).max(240),
  /** 헤엄 범위: 집 자리에서 이 배치 칸 안의 물 칸들을 돈다 */
  range: z.int().min(2).max(96),
  /** 물가에서 낚을 수 있는 거리(배치 칸). 0 = 배로만(배는 아직 없다 — 질문 1221) */
  reach: z.int().min(0).max(16),
  /** 기기가 그리는 어군 그림(움직이는 인스턴스) */
  art,
});

export const gatherObjectEntrySchema = z.discriminatedUnion(
  "source",
  [propObject, rockObject, plotObject, outcropObject, siteObject, schoolObject],
  {
    error: (issue) =>
      issue.code === "invalid_union"
        ? '자리 종류(source)는 "prop"·"rock"·"plot"·"outcrop"·"site"·"school" 가운데 하나입니다.'
        : undefined,
  },
);
export type GatherObjectEntry = z.output<typeof gatherObjectEntrySchema>;

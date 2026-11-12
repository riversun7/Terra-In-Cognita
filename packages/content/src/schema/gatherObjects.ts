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

export const gatherObjectEntrySchema = z.discriminatedUnion(
  "source",
  [propObject, rockObject, plotObject, outcropObject],
  {
    error: (issue) =>
      issue.code === "invalid_union"
        ? '자리 종류(source)는 "prop"·"rock"·"plot"·"outcrop" 가운데 하나입니다.'
        : undefined,
  },
);
export type GatherObjectEntry = z.output<typeof gatherObjectEntrySchema>;

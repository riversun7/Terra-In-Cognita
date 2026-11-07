// 2차맵 원자재 오브젝트(gather_objects) 분류 — docs/adr/2026-11-07-gather-objects.md, 사용자 답(2026-11-07) "원자재 오브젝트를 통해 자원을 채집".
// 오브젝트 종류 하나 = 2차맵에 놓이는 채집 자리 한 가지(예: 침엽수 → 소나무 원목). 자리는 서버가 2차맵 지형에서 결정적으로 정한다:
// - source "prop": 소품 그림 층(map_props가 놓은 나무·큰 바위·덤불 등)의 그림 종류(arts)가 있는 칸.
// - source "rock": 바위 지표 칸(산비탈) 가운데 천분율 chancePm만큼(광맥).
// 채집 한 번 = 일 workMs(주 스탯 진행 속도로 나눔, 49 N32) → 아이템 lots 묶음 × 수확량(보조 스탯, 옛 1차 생산 규칙 D-507). uses번 캐면 떨어지고
// regrowMs 뒤 다시 자란다(D-112 채집 지점마다 다시 자라는 시각, D-5030 실제 시간, D-5032 개발자 패널 설정값). facility = 이 오브젝트를 맡는
// 시설(벌목장·광산): 반경 안이면 그 시설에 바로 넣고 버프를 받는다. 작물·가축은 오브젝트가 아니라 농장·목장 시설로만 얻는다(사용자 답).
// 지금 값은 모두 [임시]다(D-515).
import { MAP_PROP_ARTS } from "@terra/shared";
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
};

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

export const gatherObjectEntrySchema = z.discriminatedUnion("source", [propObject, rockObject], {
  error: (issue) =>
    issue.code === "invalid_union" ? '자리 종류(source)는 "prop"이나 "rock"입니다.' : undefined,
});
export type GatherObjectEntry = z.output<typeof gatherObjectEntrySchema>;

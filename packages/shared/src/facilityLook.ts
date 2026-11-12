// 시설의 2차맵 겉모습 자료(콘텐츠 팩 facilities.look) — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)".
// 그림 자료라 판정에 쓰지 않는다. 팩 스키마(@terra/content), 건물 편집기(/dev/buildings 2차맵 모습), 서버 겉모습 조회(facilities.mapLooks),
// 2차맵 엔진(packages/engine buildings/)이 같은 이름표를 쓴다. 이름표 하나 = 엔진의 모델 종류·색 이름 하나(엔진 시험이 맞춰 본다).
// 한 번 쓴 이름은 다른 뜻으로 다시 쓰지 않는다(팩·덮어쓰기 줄에 남는다). 새 것은 끝에 더한다.

/** 모델 종류(엔진 BuildingArtKind와 같다). 시설 여럿이 한 모델을 쓸 수 있다(창고 넷은 크기만 다르다) */
export const FACILITY_LOOK_MODELS = [
  "farm",
  "lumber",
  "mine",
  "smelter",
  "kitchen",
  "workshop",
  "sawmill",
  "kiln",
  "stockpile",
  "storehouse",
  "warehouse",
  "temple",
  "lab",
  "government",
  "hospital",
  "house",
  // 1차 생산 채집소 전용 모델(2026-11-12, 그 전에는 농장·벌목장 모델을 색만 바꿔 썼다)
  "herb",
  "ranch",
  "fishing",
] as const;
export type FacilityLookModel = (typeof FACILITY_LOOK_MODELS)[number];

/** 벽·지붕에 고를 수 있는 색 이름(엔진 색 표 buildingPalette.ts의 한 색). 세계 색이라 화면 테마와 상관없다(D-070) */
export const FACILITY_LOOK_COLORS = [
  "cream",
  "wood",
  "stone",
  "white",
  "brick",
  "barn",
  "lab",
  "terracotta",
  "brown",
  "slate",
  "moss",
  "thatch",
  "teal",
  "metal",
  "gold",
] as const;
export type FacilityLookColor = (typeof FACILITY_LOOK_COLORS)[number];

/** 높이 배율(‰): 바닥 판 위 모든 조각의 높이에 곱한다 */
export const FACILITY_LOOK_LIMITS = {
  heightPm: { min: 500, max: 2000 },
} as const;

/** 높이 배율이 없을 때(‰) */
export const FACILITY_LOOK_HEIGHT_DEFAULT = 1000;

/**
 * 팩 facilities.json 한 줄의 look 칸(JSON 모양). 모두 선택: model이 없으면 엔진이 시설 ID로 고른다(모르는 ID는 일반 집),
 * wall·roof가 없으면 그 모델의 기본 색, heightPm이 없으면 1000‰
 */
export interface FacilityLookJson {
  readonly model?: FacilityLookModel | undefined;
  readonly wall?: FacilityLookColor | undefined;
  readonly roof?: FacilityLookColor | undefined;
  readonly heightPm?: number | undefined;
}

const MODEL_SET: ReadonlySet<string> = new Set(FACILITY_LOOK_MODELS);
const COLOR_SET: ReadonlySet<string> = new Set(FACILITY_LOOK_COLORS);

export const isFacilityLookModel = (value: unknown): value is FacilityLookModel =>
  typeof value === "string" && MODEL_SET.has(value);
export const isFacilityLookColor = (value: unknown): value is FacilityLookColor =>
  typeof value === "string" && COLOR_SET.has(value);

/** 빈 칸(undefined)을 뺀 look(팩 줄과 같은 칸 차례: model·wall·roof·heightPm). 칸이 하나도 없으면 undefined */
export function cleanFacilityLook(look: FacilityLookJson | undefined): FacilityLookJson | undefined {
  if (!look) return undefined;
  const out: FacilityLookJson = {
    ...(look.model === undefined ? {} : { model: look.model }),
    ...(look.wall === undefined ? {} : { wall: look.wall }),
    ...(look.roof === undefined ? {} : { roof: look.roof }),
    ...(look.heightPm === undefined ? {} : { heightPm: look.heightPm }),
  };
  return Object.keys(out).length === 0 ? undefined : out;
}

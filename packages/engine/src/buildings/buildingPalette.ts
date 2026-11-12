// 2차맵 건물 색 표(3D) — 순수 코드(three를 쓰지 않는다). 건물 모델 만들기(buildingModels.ts)가 이 이름만 쓴다(색 값을 흩어 쓰지 않는다).
// 세계 색은 화면 테마와 상관없다(D-070): 파스텔·다크 테마 모두 같은 색이고, 밤은 장면 빛 + 건물 밤 빛 + 창문 불빛이 맡는다.
// 톤은 "새싹 장난감"(ADR 2026-10-28-design-system): 채도를 조금 낮춘 밝은 색, 지붕은 벽보다 한 단계 짙게.
import { type FacilityLookColor, isFacilityLookColor } from "@terra/shared/facilityLook";
import type { Rgb } from "../terrain/terrainTextures.ts";

export type { Rgb } from "../terrain/terrainTextures.ts";

/** 이름 붙인 색(0~1) */
export const BUILDING_COLORS = {
  /** 바닥 판(다진 흙)·돌 기단 */
  pad: [0.74, 0.66, 0.54],
  padStone: [0.72, 0.71, 0.68],
  /** 벽: 크림·나무·돌·흰 벽·벽돌 */
  wallCream: [0.96, 0.89, 0.76],
  wallWood: [0.76, 0.56, 0.38],
  wallStone: [0.8, 0.78, 0.73],
  wallWhite: [0.96, 0.96, 0.93],
  wallBrick: [0.8, 0.5, 0.4],
  wallBarn: [0.86, 0.46, 0.4],
  wallLab: [0.9, 0.95, 0.96],
  /** 지붕: 붉은 기와·밤색·청회색 돌판·이끼·짚 */
  roofTerracotta: [0.86, 0.45, 0.36],
  roofBrown: [0.55, 0.4, 0.32],
  roofSlate: [0.47, 0.53, 0.63],
  roofMoss: [0.48, 0.62, 0.42],
  roofThatch: [0.88, 0.75, 0.46],
  roofTeal: [0.38, 0.66, 0.66],
  /** 문·창틀·기둥 받침(짙은 나무) */
  trim: [0.38, 0.29, 0.23],
  /** 쇠(밝은·어두운), 금 장식 */
  metal: [0.6, 0.63, 0.67],
  metalDark: [0.32, 0.34, 0.38],
  gold: [0.96, 0.79, 0.32],
  /** 바위·광석·석탄·광산 입구 */
  rock: [0.58, 0.57, 0.55],
  ore: [0.7, 0.52, 0.38],
  coal: [0.24, 0.23, 0.24],
  shaft: [0.16, 0.14, 0.13],
  /** 통나무 껍질·널빤지 */
  log: [0.56, 0.41, 0.28],
  plank: [0.86, 0.7, 0.5],
  /** 밭: 흙 이랑·잎·익은 곡식 */
  soil: [0.55, 0.42, 0.3],
  crop: [0.52, 0.74, 0.36],
  wheat: [0.93, 0.8, 0.42],
  /** 약초원: 짙은 잎·보랏빛 꽃(라벤더)·말린 다발 */
  herbLeaf: [0.34, 0.6, 0.4],
  herbBloom: [0.68, 0.56, 0.84],
  herbDry: [0.72, 0.66, 0.4],
  /** 목장: 울타리·가축(흰 털·밤색 털)·물통 물 */
  fence: [0.92, 0.88, 0.8],
  hideLight: [0.95, 0.93, 0.88],
  hideDark: [0.42, 0.3, 0.24],
  water: [0.42, 0.66, 0.82],
  /** 낚시터: 배 몸통·그물 */
  hull: [0.36, 0.52, 0.62],
  net: [0.7, 0.68, 0.6],
  /** 상자·통 */
  crate: [0.8, 0.62, 0.4],
  barrel: [0.6, 0.42, 0.3],
  /** 병원 십자·흰 판 */
  crossRed: [0.88, 0.25, 0.28],
  white: [0.98, 0.98, 0.97],
  /** 연구소 둥근 지붕(엷은 유리) */
  glassDome: [0.76, 0.9, 0.95],
  /** 짓는 중 비계(밝은 나무)·무너진 돌 */
  scaffold: [0.86, 0.72, 0.5],
  rubble: [0.5, 0.47, 0.44],
  /** 차양 줄무늬(주방) */
  awning: [0.95, 0.6, 0.55],
} as const satisfies Record<string, Rgb>;

export type BuildingColorName = keyof typeof BUILDING_COLORS;

/**
 * 겉모습 자료(팩 facilities.look.wall·roof)의 색 이름 → 이 색 표의 색. 이름표는 @terra/shared FACILITY_LOOK_COLORS(건물 편집기·팩 스키마와
 * 같다). 벽·지붕 어느 쪽에도 쓸 수 있다
 */
export const LOOK_COLORS: Readonly<Record<FacilityLookColor, BuildingColorName>> = {
  cream: "wallCream",
  wood: "wallWood",
  stone: "wallStone",
  white: "wallWhite",
  brick: "wallBrick",
  barn: "wallBarn",
  lab: "wallLab",
  terracotta: "roofTerracotta",
  brown: "roofBrown",
  slate: "roofSlate",
  moss: "roofMoss",
  thatch: "roofThatch",
  teal: "roofTeal",
  metal: "metal",
  gold: "gold",
};

/** 색 이름 → 색(이름이 없거나 모르면 null = 모델 기본 색) */
export function lookColor(name: string | null | undefined): Rgb | null {
  return isFacilityLookColor(name) ? BUILDING_COLORS[LOOK_COLORS[name]] : null;
}

/**
 * 국가 색(깃발·용마루) — 지도 CSS의 국가 색 번호 0~5(data-nation, `--color-stat-*` 여섯을 국가 차례대로)와 같은 차례:
 * 0 STR 빨강, 1 INT 파랑, 2 AGI 초록, 3 WIS 보라, 4 DEX 황토, 5 VIT 주황. 세계 색이라 테마와 상관없이 낮·밤 모두 읽히는 중간 밝기로 둔다
 */
export const NATION_ACCENTS: readonly Rgb[] = [
  [0.86, 0.27, 0.36],
  [0.29, 0.5, 0.88],
  [0.27, 0.68, 0.42],
  [0.6, 0.4, 0.86],
  [0.9, 0.7, 0.22],
  [0.94, 0.52, 0.24],
];

/** 국가 색 번호 → 색(번호가 없거나 범위 밖이면 null = 깃발 없음) */
export function nationAccent(index: number | null | undefined): Rgb | null {
  if (index === null || index === undefined || !Number.isInteger(index) || index < 0) return null;
  return NATION_ACCENTS[index % NATION_ACCENTS.length] ?? null;
}

/**
 * 창문(빛나는 면) 색: 재질 색 = 낮 유리 ~ 밤 불빛 사이(밤 정도로 옮긴다), 인스턴스 색 = 그 창의 밝기(켜짐 1, 꺼짐 어둡게).
 * 용광로 입구처럼 다른 빛은 인스턴스 색을 그 빛 색으로 준다(낮에는 어두운 입구, 밤에는 주황 불빛)
 */
export const WINDOW_DAY: Rgb = [0.42, 0.55, 0.66];
export const WINDOW_NIGHT: Rgb = [1, 0.84, 0.5];
export const WINDOW_LIT: Rgb = [1, 1, 1];
export const WINDOW_DARK: Rgb = [0.3, 0.3, 0.32];
export const FURNACE_GLOW: Rgb = [1, 0.55, 0.22];

/** 건물 몸 밤 빛(자기 색 × 밤 정도 × 이 값) — 유닛(0.3)보다 낮게: 건물은 크고 창문 불빛이 따로 있다 */
export const BUILDING_NIGHT_LIFT = 0.16;

/** 상태별 색 곱(손상 = 조금 어둡게, 멈춤 = 더, 폐허 = 그을림) */
export const STATE_SHADE = {
  building: 1,
  ok: 1,
  damaged: 0.82,
  disabled: 0.66,
  ruin: 0.52,
} as const;

// 시설 종류별 로우폴리 모델 표 — 순수 코드(three를 쓰지 않는다). buildingModels.ts가 종류마다 이 함수를 부른다.
// 모든 종류는 각 분야 파일(Gather·Process·Storage·Civic·Transport·Commerce·Military)에 나눠 600줄 아래를 지킨다.
import type { BuildingArtKind } from "./buildingLook.ts";
import { government, hospital, house, lab, lodging, temple } from "./buildingKindsCivic.ts";
import { goods_exchange, fx_exchange, stock_exchange, unit_exchange } from "./buildingKindsCommerce.ts";
import { farm, fishing, herb, lumber, mine, ranch } from "./buildingKindsGather.ts";
import { beacon, wall } from "./buildingKindsMilitary.ts";
import { kiln, kitchen, sawmill, smelter, workshop } from "./buildingKindsProcess.ts";
import { grand_warehouse, logistics, stockpile, storehouse, warehouse } from "./buildingKindsStorage.ts";
import { dock, shipyard, trade_dock } from "./buildingKindsTransport.ts";
import type { Rgb } from "./buildingPalette.ts";
import type { PartList } from "./buildingParts.ts";

/** 본채 자리(로컬 m): 뼈대·폐허·비계가 이 자리를 쓴다 */
export interface Rect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

/** 종류 모델이 받는 것 */
export interface KindContext {
  readonly list: PartList;
  readonly W: number;
  readonly D: number;
  readonly level: number;
  /** 본채 벽 높이에 더할 층(레벨 3부터 한 층씩) */
  readonly extraH: number;
  readonly random: () => number;
  readonly ridge: Rgb | null;
  readonly main: Rect;
  /** 본채 벽 색: 겉모습 자료(팩 look.wall)가 있으면 그 색, 없으면 모델 기본 색(fallback) */
  readonly wall: (fallback: Rgb) => Rgb;
  /** 지붕 색: 겉모습 자료(팩 look.roof)가 있으면 그 색, 없으면 모델 기본 색 */
  readonly roof: (fallback: Rgb) => Rgb;
}

/** 종류마다 본채 자리(바닥 크기 비율) */
export function mainRectOf(kind: BuildingArtKind, W: number, D: number): Rect {
  const r = (x: number, z: number, w: number, d: number): Rect => ({
    x: x * W,
    z: z * D,
    w: w * W,
    d: d * D,
  });
  switch (kind) {
    case "farm":
      return r(-0.2, -0.22, 0.42, 0.4);
    case "lumber":
      return r(-0.25, -0.24, 0.36, 0.36);
    case "mine":
      return r(0.2, -0.14, 0.34, 0.34);
    case "herb":
      return r(-0.22, -0.26, 0.36, 0.34);
    case "ranch":
      return r(0.18, -0.26, 0.46, 0.38);
    case "fishing":
      return r(-0.04, -0.24, 0.42, 0.36);
    case "dock":
    case "trade_dock":
      return r(-0.22, -0.24, 0.36, 0.32);
    case "shipyard":
      return r(-0.26, -0.22, 0.3, 0.38);
    case "smelter":
      return r(-0.12, -0.12, 0.56, 0.5);
    case "sawmill":
      return r(0, -0.12, 0.72, 0.52);
    case "kiln":
      return r(0, -0.06, 0.62, 0.62);
    case "stockpile":
      return r(0, -0.16, 0.62, 0.44);
    case "storehouse":
      return r(0, -0.12, 0.72, 0.6);
    case "warehouse":
    case "grand_warehouse":
      return r(0, -0.14, 0.8, 0.54);
    case "logistics":
      return r(-0.22, -0.24, 0.38, 0.32);
    case "temple":
      return r(0, -0.02, 0.5, 0.56);
    case "government":
    case "goods_exchange":
    case "fx_exchange":
      return r(0, -0.16, 0.66, 0.48);
    case "hospital":
      return r(0, -0.12, 0.72, 0.54);
    case "lodging":
      return r(0, -0.12, 0.72, 0.52);
    case "unit_exchange":
    case "stock_exchange":
      return r(0, -0.1, 0.64, 0.56);
    case "beacon":
      return r(0, 0, 0.44, 0.44);
    case "wall":
      return r(0, 0, 0.88, 0.64);
    default:
      return r(0, -0.08, 0.66, 0.6);
  }
}

export const KIND_MODELS: Readonly<Record<BuildingArtKind, (ctx: KindContext) => void>> = {
  farm,
  lumber,
  mine,
  smelter,
  kitchen,
  workshop,
  sawmill,
  kiln,
  stockpile,
  storehouse,
  warehouse,
  temple,
  lab,
  government,
  hospital,
  house,
  herb,
  ranch,
  fishing,
  dock,
  beacon,
  grand_warehouse,
  logistics,
  lodging,
  wall,
  shipyard,
  trade_dock,
  goods_exchange,
  fx_exchange,
  unit_exchange,
  stock_exchange,
};

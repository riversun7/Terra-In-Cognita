// 건물 겉모습 입력 — 순수 코드(시험 대상). 화면이 건물마다 시설 ID·레벨·상태·국가 색 번호를 주면(BuildingFootprint.look)
// 엔진이 시설 종류에 맞는 로우폴리 모델을 만든다(buildingModels.ts). 없으면 일반 집이다(지금 서버 자료만으로도 그린다).
// 시설 ID는 콘텐츠 팩 facilities(content/core/facilities.json)의 ID다. 모르는 ID(새 콘텐츠)는 단계(stage) 없이 일반 집으로 그린다.
// ADR 2026-11-08-building-art. 겉모습 자료(팩 facilities.look: 모델 종류·벽·지붕 색·높이 배율)가 오면 그것을 먼저 쓴다("바뀜 (2026-11-09)").
import {
  FACILITY_LOOK_HEIGHT_DEFAULT,
  FACILITY_LOOK_LIMITS,
  FACILITY_LOOK_MODELS,
  type FacilityLookJson,
  type FacilityLookModel,
  isFacilityLookModel,
} from "@terra/shared/facilityLook";
import { type Rgb, lookColor } from "./buildingPalette.ts";

/** 상태: 짓는 중(처음 짓기, 레벨 0)·정상·손상(70% 아래)·멈춤(30% 아래)·폐허(0) — @terra/shared ConditionState + 짓는 중 */
export type BuildingCondition = "building" | "ok" | "damaged" | "disabled" | "ruin";

export const BUILDING_CONDITIONS: readonly BuildingCondition[] = [
  "building",
  "ok",
  "damaged",
  "disabled",
  "ruin",
];

export interface BuildingLook {
  /** 시설 ID(콘텐츠 팩). 없거나 모르면 일반 집 */
  readonly facility?: string | null | undefined;
  /** 다 지은 레벨(0 = 처음 짓는 중). 없으면 1 */
  readonly level?: number | undefined;
  /** 상태. 없으면 레벨 0이면 짓는 중, 아니면 정상 */
  readonly state?: BuildingCondition | undefined;
  /** 레벨을 올리는 중(비계를 두른다) */
  readonly upgrading?: boolean | undefined;
  /** 국가 색 번호(지도 국가 색 0~5와 같은 차례). null·없음 = 깃발 없음 */
  readonly accent?: number | null | undefined;
  /** 겉모습 자료(실효 팩 facilities.look). 없으면 시설 ID로 모델을 고르고 모델 기본 색·높이 */
  readonly art?: FacilityLookJson | null | undefined;
}

/** 모델 종류 — 시설 ID 여럿이 한 모델을 쓸 수 있다(창고 넷은 크기만 다르다). 이름표는 @terra/shared FACILITY_LOOK_MODELS(팩 look.model) */
export type BuildingArtKind = FacilityLookModel;

export const BUILDING_ART_KINDS: readonly BuildingArtKind[] = FACILITY_LOOK_MODELS;

/** 시설 ID → 모델 종류(겉모습 자료가 없을 때 — 팩 core@58까지·옛 덮어쓰기 줄. 팩 core 51의 시설 16개, 영토 비콘은 2차맵에 서지 않는다) */
const FACILITY_ART: Readonly<Record<string, BuildingArtKind>> = {
  farm: "farm",
  lumber_camp: "lumber",
  mine: "mine",
  // 1차 생산 여섯 가지(팩 core@62): 전용 모델이 없어 가장 가까운 것을 쓴다(건물 그림 후속 — docs/adr/2026-11-11-production-six.md)
  herb_field: "farm",
  ranch: "farm",
  fishing_spot: "lumber",
  smelter: "smelter",
  kitchen: "kitchen",
  workshop: "workshop",
  sawmill: "sawmill",
  kiln: "kiln",
  stockpile: "stockpile",
  storehouse: "storehouse",
  warehouse: "warehouse",
  grand_warehouse: "warehouse",
  temple: "temple",
  biotech_lab: "lab",
  government_hall: "government",
  hospital: "hospital",
};

/** 시설 ID → 모델 종류. 모르는 ID·없음이면 일반 집 */
export function artKindOf(facility: string | null | undefined): BuildingArtKind {
  if (typeof facility !== "string") return "house";
  return Object.hasOwn(FACILITY_ART, facility) ? (FACILITY_ART[facility] ?? "house") : "house";
}

/** 그릴 때 쓰는 레벨(1~5). 높은 레벨은 5와 같은 모양 */
export const MAX_ART_LEVEL = 5;

export interface ResolvedLook {
  readonly kind: BuildingArtKind;
  readonly level: number;
  readonly state: BuildingCondition;
  readonly upgrading: boolean;
  readonly accent: number | null;
  /** 벽·지붕 색(null = 모델 기본 색) */
  readonly wall: Rgb | null;
  readonly roof: Rgb | null;
  /** 높이 배율(‰, 500~2000) */
  readonly heightPm: number;
}

/** 높이 배율 ‰ → 범위 안 정수(없거나 틀리면 1000) */
function heightPmOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FACILITY_LOOK_HEIGHT_DEFAULT;
  const { min, max } = FACILITY_LOOK_LIMITS.heightPm;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 빠진 값을 채운다: 레벨 0이면 짓는 중, 레벨은 1~5로 자른다 */
export function resolveLook(look: BuildingLook | undefined): ResolvedLook {
  const rawLevel = look?.level;
  const level = typeof rawLevel === "number" && Number.isFinite(rawLevel) ? Math.floor(rawLevel) : 1;
  const state: BuildingCondition =
    look?.state !== undefined && BUILDING_CONDITIONS.includes(look.state)
      ? look.state
      : level <= 0
        ? "building"
        : "ok";
  const accent = look?.accent;
  const art = look?.art ?? undefined;
  return {
    kind: isFacilityLookModel(art?.model) ? art.model : artKindOf(look?.facility),
    level: Math.min(MAX_ART_LEVEL, Math.max(1, level)),
    state,
    upgrading: look?.upgrading === true && state !== "building" && state !== "ruin",
    accent: typeof accent === "number" && Number.isInteger(accent) && accent >= 0 ? accent : null,
    wall: lookColor(art?.wall),
    roof: lookColor(art?.roof),
    heightPm: heightPmOf(art?.heightPm),
  };
}

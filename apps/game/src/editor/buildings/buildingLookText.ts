// 건물 편집기 "2차맵 모습" 문구 표 — 모델 종류·색 이름 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 이름표는 @terra/shared FACILITY_LOOK_MODELS·FACILITY_LOOK_COLORS(팩 look 칸과 같다). 이 조각에만 든다.
import { artKindOf } from "@terra/engine/buildingArt";
import type { FacilityLookColor, FacilityLookModel } from "@terra/shared/buildingEditor";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

export const MODEL_TEXT: Readonly<Record<FacilityLookModel, Text>> = {
  farm: m.dev_buildings_look_model_farm,
  lumber: m.dev_buildings_look_model_lumber,
  mine: m.dev_buildings_look_model_mine,
  smelter: m.dev_buildings_look_model_smelter,
  kitchen: m.dev_buildings_look_model_kitchen,
  workshop: m.dev_buildings_look_model_workshop,
  sawmill: m.dev_buildings_look_model_sawmill,
  kiln: m.dev_buildings_look_model_kiln,
  stockpile: m.dev_buildings_look_model_stockpile,
  storehouse: m.dev_buildings_look_model_storehouse,
  warehouse: m.dev_buildings_look_model_warehouse,
  temple: m.dev_buildings_look_model_temple,
  lab: m.dev_buildings_look_model_lab,
  government: m.dev_buildings_look_model_government,
  hospital: m.dev_buildings_look_model_hospital,
  house: m.dev_buildings_look_model_house,
  herb: m.dev_buildings_look_model_herb,
  ranch: m.dev_buildings_look_model_ranch,
  fishing: m.dev_buildings_look_model_fishing,
  dock: m.dev_buildings_look_model_dock,
};

export const COLOR_TEXT: Readonly<Record<FacilityLookColor, Text>> = {
  cream: m.dev_buildings_look_color_cream,
  wood: m.dev_buildings_look_color_wood,
  stone: m.dev_buildings_look_color_stone,
  white: m.dev_buildings_look_color_white,
  brick: m.dev_buildings_look_color_brick,
  barn: m.dev_buildings_look_color_barn,
  lab: m.dev_buildings_look_color_lab,
  terracotta: m.dev_buildings_look_color_terracotta,
  brown: m.dev_buildings_look_color_brown,
  slate: m.dev_buildings_look_color_slate,
  moss: m.dev_buildings_look_color_moss,
  thatch: m.dev_buildings_look_color_thatch,
  teal: m.dev_buildings_look_color_teal,
  metal: m.dev_buildings_look_color_metal,
  gold: m.dev_buildings_look_color_gold,
};

/** look.model이 없을 때 엔진이 시설 ID로 고르는 모델(모르는 ID는 일반 집) */
export const defaultModelOf = (facilityId: string): FacilityLookModel => artKindOf(facilityId);

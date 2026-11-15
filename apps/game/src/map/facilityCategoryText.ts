// 시설 분류 이름(기획 D-560 시설 분류표, @terra/shared/facilityCategory) — 도시 화면 거르기 칩·건물 편집기 분류 고르기가 같이 쓴다.
// 메시지 키는 계산해서 읽지 않는다(oxlint import(namespace)) — 분류마다 한 줄.
import type { FacilityCategory } from "@terra/shared/facilityCategory";
import { m } from "../paraglide/messages.js";

export const FACILITY_CATEGORY_TEXT = {
  administration: () => m.facility_category_administration(),
  gathering: () => m.facility_category_gathering(),
  processing: () => m.facility_category_processing(),
  storage: () => m.facility_category_storage(),
  housing: () => m.facility_category_housing(),
  public: () => m.facility_category_public(),
  commerce: () => m.facility_category_commerce(),
  transport: () => m.facility_category_transport(),
  military: () => m.facility_category_military(),
} satisfies Record<FacilityCategory, () => string>;

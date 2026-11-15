// 가문 소속 도시 글자(기획 D-565) — 도시 이름(없으면 "도시 #ID")과 나라 이름(지금 언어, 없으면 "세력 #ID"). 창설 단계·"내 가문" 칸이 같이 쓴다.
import type { HouseHomeCity } from "@terra/shared/house";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";

/** 도시 이름 */
export function homeCityName(city: HouseHomeCity): string {
  return city.name ?? m.fid_home_city_unnamed({ id: city.id });
}

/** 나라 이름(지금 언어) */
export function homeNationName(city: HouseHomeCity): string {
  if (city.nation === null) return m.fid_home_nation_unnamed({ id: city.nationId });
  return getLocale() === "en" ? city.nation.en : city.nation.ko;
}

/** 고르기 목록 한 줄: "도시 · 나라" */
export function homeChoiceText(city: HouseHomeCity): string {
  return m.fid_home_choice({ city: homeCityName(city), nation: homeNationName(city) });
}

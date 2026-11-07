// 경제 화면의 도시 표시 — 도시 이름(서버 economy.cityNames, 팩 도시 이름 — 번역하지 않는다 D-476, 기획 답 510 다·601 나), 이름 없는 도시는
// "#<도시 ID>"(거래창·폐허 카드와 같은 대체). docs/adr/2026-11-07-play-flow.md "WP12 특산·이름 마무리"
import { useMemo } from "react";
import { NO_ARGS, useCityNames } from "./queries.ts";

/** 도시 ID → 화면 글 */
export type CityText = (cityId: number) => string;

/** 이름 표 → 도시 글(이름, 없으면 "#ID") */
export function cityTextOf(names: ReadonlyMap<number, string>): CityText {
  return (cityId) => names.get(cityId) ?? `#${cityId}`;
}

/** 경제 칸에서 쓰기: 이름을 받기 전이거나 받지 못했으면 "#ID" */
export function useCityText(): CityText {
  const { data } = useCityNames(NO_ARGS);
  return useMemo(() => cityTextOf(new Map((data?.cities ?? []).map((city) => [city.id, city.name]))), [data]);
}

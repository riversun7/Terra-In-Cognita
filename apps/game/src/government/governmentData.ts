// 정부(행정 건물) 판 자료 받기·글 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도 없음").
// tRPC world.government(읽기만, 서버 src/government/reads.ts). 고용은 구인 판(economy/RecruitPanel.tsx)이 WebSocket recruit_hire로 보낸다.
// 엔진·React를 가져오지 않는다(시험 대상, governmentData.test.ts).
// 바뀜("WP-NPC3", 기획 정리 742 나·743 나): 지도자 창구(world.leaderGovernment — 누른 지도자의 나라 수도 정부 판)·도시 하루 값 글.
import type {
  GovernmentCity,
  GovernmentLeader,
  GovernmentNation,
  GovernmentResponse,
} from "@terra/shared/government";
import type { LocalizedName } from "@terra/shared/roster";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

/** 정부 판 응답을 기다리는 상한(ms) */
const REQUEST_TIMEOUT_MS = 10_000;

/** 누른 건물의 정부 판(행정 건물이 아니면 status not_government) */
export function loadGovernment(buildingId: number, signal?: AbortSignal): Promise<GovernmentResponse> {
  return api.world.government.query(
    { buildingId },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 누른 NPC 국가 지도자의 정부 판(그 나라 수도, 742 나). 시야 밖·지도자가 아니면 status unknown_unit */
export function loadLeaderGovernment(
  mapKey: number,
  unitId: number,
  signal?: AbortSignal,
): Promise<GovernmentResponse> {
  return api.world.leaderGovernment.query(
    { mapKey, unitId },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 두 언어 이름 → 지금 언어(없으면 fallback) */
export function nameIn(name: LocalizedName | null, fallback: string, locale: Locale = getLocale()): string {
  if (!name) return fallback;
  return locale === "en" ? name.en : name.ko;
}

/** 도시 이름(번역 안 함 D-476). 없으면 "도시 #ID" */
export function cityTitle(city: Pick<GovernmentCity, "id" | "name">): string {
  return city.name ?? m.government_city_number({ id: city.id });
}

/** 나라 이름(팩 프리셋 → 코드 → "나라 #ID") */
export function nationTitle(nation: Pick<GovernmentNation, "id" | "code" | "name">, locale?: Locale): string {
  return nameIn(nation.name, nation.code ?? m.government_nation_number({ id: nation.id }), locale);
}

/** 지도자 글(없으면 "없음", 이름이 없으면 "지도자") */
export function leaderTitle(leader: Pick<GovernmentLeader, "name"> | null, locale?: Locale): string {
  if (leader === null) return m.government_leader_none();
  return nameIn(leader.name, m.government_leader_unnamed(), locale);
}

/** 거래세(만분율) → "2%"(소수 둘째 자리까지). 모르면 "모름" */
export function taxText(taxBp: number | null, locale: Locale = getLocale()): string {
  if (taxBp === null) return m.government_tax_unknown();
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(taxBp / 10_000);
}

/** 휴먼·주거 한 줄 */
export function populationText(
  city: Pick<GovernmentCity, "humans" | "housing">,
  locale: Locale = getLocale(),
): string {
  const count = new Intl.NumberFormat(locale);
  return m.government_population({ humans: count.format(city.humans), housing: count.format(city.housing) });
}

/** 0~100 하루 값(만족도·발전도) → "62 / 100". 모르면 "—"(743 나 — 값이 아직 없다) */
export function pointsText(value: number | null, locale: Locale = getLocale()): string {
  if (value === null) return m.government_value_unknown();
  return m.government_points({ value: new Intl.NumberFormat(locale).format(value) });
}

/** 생필품 충족 ‰ → "87.5%". 도시 경제가 없거나 오늘 셈 전이면 "—" */
export function necessitiesText(necessitiesPm: number | null, locale: Locale = getLocale()): string {
  if (necessitiesPm === null) return m.government_value_unknown();
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
    necessitiesPm / 1000,
  );
}

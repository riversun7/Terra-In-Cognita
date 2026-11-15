// 시설 분류(콘텐츠 팩 facilities.category) — 기획 D-560 시설 분류표(1236 "분류 칸을 기획이 정함", 사용자 "일단은 알아서").
// 도시 화면 건물 무리·지도 위 누른 건물 이름표 색·건물 편집기 분류 고르기가 이 이름표를 쓴다. 판정에 쓰지 않는다(화면 묶음).
// 한 번 쓴 이름은 다른 뜻으로 다시 쓰지 않는다(팩·덮어쓰기 줄에 남는다). 새 것은 끝에 더한다.
// - 행정(정부) administration / 채집 gathering / 가공·제작 processing / 저장·물류 storage / 주거 housing / 공공·서비스 public /
//   상업 commerce(거래소·상점 — 지금 시설 없음, D-561 거래소 건물은 다음 줄기) / 교통·항만 transport / 군사·방어 military
// - 팩 항목에 분류가 없으면(옛 덮어쓰기 줄·편집기로 만든 시설) 생산 단계(stage)에서 고른다(facilityCategoryOf).

/** 분류 이름표(차례 = 도시 화면 무리 차례) */
export const FACILITY_CATEGORIES = [
  "administration",
  "gathering",
  "processing",
  "storage",
  "housing",
  "public",
  "commerce",
  "transport",
  "military",
] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

/** 이름표인가 */
export function isFacilityCategory(value: unknown): value is FacilityCategory {
  return typeof value === "string" && (FACILITY_CATEGORIES as readonly string[]).includes(value);
}

/** 생산 단계 → 분류(팩 항목에 분류가 없을 때). 모르는 단계는 공공 */
const CATEGORY_OF_STAGE: Readonly<Record<string, FacilityCategory>> = {
  gather: "gathering",
  process: "processing",
  part: "processing",
  finish: "processing",
  territory: "military",
  storage: "storage",
  religion: "public",
  biotech: "public",
  government: "administration",
  medical: "public",
  living: "housing",
  defense: "military",
  transport: "transport",
};

/** 시설의 분류: 팩 칸 → 생산 단계에서 고른 값 */
export function facilityCategoryOf(facility: {
  readonly category?: FacilityCategory | undefined;
  readonly stage: string;
}): FacilityCategory {
  if (facility.category !== undefined) return facility.category;
  return Object.hasOwn(CATEGORY_OF_STAGE, facility.stage)
    ? (CATEGORY_OF_STAGE[facility.stage] ?? "public")
    : "public";
}

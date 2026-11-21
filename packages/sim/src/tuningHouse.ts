// 플레이어 가문 설정 칸 값 ↔ 계수표 — 질문 926~935 답(기획 정리 D-529 포인터), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)".
// 이름 대기·약어 길이는 49 S20(D-328), 나머지는 49에 칸이 없어 코드를 비운다. 모두 [임시] 출발값이다(D-515). 판정 코드는 읽지 않고 서버가
// 가문 창설·정체성 저장·신고·마크 내리기 때마다 읽는다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path,
  structural: false,
  ko,
  en,
});

/** 도시 등급 이름(D-104 표 차례 — tuningTerritory.ts와 같다) */
const CITY_GRADES = [
  ["마을", "village"],
  ["읍", "town"],
  ["소도시", "small city"],
  ["도시", "city"],
  ["대도시", "metropolis"],
  ["거대도시", "megacity"],
] as const;

export const HOUSE_TUNING_KEYS: readonly TuningKey[] = [
  // 가문 창설 비용 칸(house_found_cost)은 지웠다 — 창설은 무료(기획 D-565, 팩 core@106)
  k("s20_short_min", "S20", "house.shortMin", "세력 약어 최소 글자 수", "Faction tag minimum length"),
  k("s20_short_max", "S20", "house.shortMax", "세력 약어 최대 글자 수", "Faction tag maximum length"),
  k(
    "house_rename_wait_ms",
    "S20",
    "house.renameWaitMs",
    "세력 이름·약어 변경 대기(ms)",
    "Faction rename wait (ms)",
  ),
  k(
    "house_report_daily",
    "",
    "house.reportDaily",
    "하루 신고 횟수(계정마다)",
    "Reports per day (per account)",
  ),
  k(
    "house_takedown_block",
    "",
    "house.takedownBlock",
    "마크를 몇 번 내리면 올리기 자동 막기(0 = 끔)",
    "Takedowns before uploads are blocked (0 = off)",
  ),
  // 가문 가입(질문 985 다) — 49에 칸이 없다
  k(
    "house_member_max",
    "",
    "house.memberMax",
    "가문 인원 상한(가문장 포함)",
    "House member limit (incl. leader)",
  ),
  k(
    "house_pending_max",
    "",
    "house.pendingMax",
    "가문마다 대기 중인 초대·신청 상한",
    "Pending invites and applications per house",
  ),
  k(
    "house_apply_max",
    "",
    "house.applyMax",
    "사람마다 동시에 보낼 가입 신청 수",
    "Open house applications per player",
  ),
  k(
    "house_request_ttl_ms",
    "",
    "house.requestTtlMs",
    "가문 초대·신청 유효 시간(ms)",
    "House invite and application lifetime (ms)",
  ),
  // 이름 되돌리기 자동 막기(질문 1006 나)·가문 마을(질문 1005 가) — 49에 칸이 없다
  k(
    "house_name_reset_block",
    "",
    "house.nameResetBlock",
    "이름을 몇 번 되돌리면 이름 바꾸기 자동 막기(0 = 끔)",
    "Name resets before renames are blocked (0 = off)",
  ),
  k(
    "house_village_cost",
    "",
    "house.villageCost",
    "가문 마을 세우기 값(최소 단위)",
    "House village founding cost (minor units)",
  ),
  k("house_village_housing", "", "house.villageHousing", "가문 새 마을 주거 수", "House new village housing"),
  // 가문 소속 도시 바꾸기 대기(기획 D-565, 질문 1741) — 49에 칸이 없다
  k(
    "house_home_wait_ms",
    "",
    "house.homeWaitMs",
    "가문 소속 도시 바꾸기 대기(ms)",
    "House home city change wait (ms)",
  ),
  // 소속 도시 바꾸기 공고 기간(D-570)
  k(
    "house_home_notice_ms",
    "",
    "house.homeNoticeMs",
    "가문 소속 도시 바꾸기 공고 기간(ms)",
    "House home city move notice (ms)",
  ),
  // NPC 나라의 가문 이동 정책(D-570·D-323 성향 규칙식, 질문 2018 답)
  k(
    "house_entry_npc_fee_max",
    "",
    "house.npcEntryFeeMax",
    "NPC 나라 가문 이동 가입비 최대(최소 단위)",
    "NPC nation house entry fee max (minor units)",
  ),
  k(
    "house_entry_npc_grant_max",
    "",
    "house.npcEntryGrantMax",
    "NPC 나라 가문 이동 지원금 최대(최소 단위)",
    "NPC nation house entry grant max (minor units)",
  ),
  // 가문세 상한·가문 도시 짓기 기본값·NPC 지배 가문 금고 국고 돌려보내기(D-574 2150·2124, 2223 고침) — 49에 칸이 없다
  k("house_tax_max_pm", "", "house.taxMaxPm", "가문세율 상한(‰)", "House tax rate cap (‰)"),
  k(
    "house_city_build_default",
    "",
    "house.cityBuildDefault",
    "가문 도시에 같은 나라 다른 가문 짓기 기본값(1 = 허용)",
    "Other houses may build in a house city by default (1 = yes)",
  ),
  k(
    "house_npc_vault_return_min_pm",
    "",
    "house.npcVaultReturnMinPm",
    "NPC 지배 가문 금고 → 국고 몫 최소(‰, 상업 성향 높음)",
    "NPC ruling house vault to treasury min (‰, high commerce)",
  ),
  k(
    "house_npc_vault_return_max_pm",
    "",
    "house.npcVaultReturnMaxPm",
    "NPC 지배 가문 금고 → 국고 몫 최대(‰, 상업 성향 낮음)",
    "NPC ruling house vault to treasury max (‰, low commerce)",
  ),
  // NPC 지배 가문장 꺼내기·쓰기(D-576 꺼내기를 NPC에도 — D-555 1509·D-212, 쓰는 몫은 D-554 성향) — 49에 칸이 없다
  k(
    "house_npc_vault_take_pm",
    "",
    "house.npcVaultTakePm",
    "NPC 지배 가문장 금고 꺼내기 몫(‰)",
    "NPC ruling house head vault withdrawal (‰)",
  ),
  k(
    "house_npc_spend_dividend_pm",
    "",
    "house.npcSpendDividendPm",
    "NPC 가문장 꺼낸 돈 → 가문원 배당 몫(‰)",
    "NPC house head withdrawal to member dividend (‰)",
  ),
  k(
    "house_npc_spend_invest_pm",
    "",
    "house.npcSpendInvestPm",
    "NPC 가문장 꺼낸 돈 → 도시 건설 투자 몫(‰)",
    "NPC house head withdrawal to city building (‰)",
  ),
  // NPC 도시의 가문 수(D-573 — 도시 등급마다)
  ...CITY_GRADES.map(([ko, en], index) =>
    k(
      `house_npc_city_houses_l${index + 1}`,
      "",
      `house.npcCityHouses.${index}`,
      `NPC 도시 가문 수: ${ko}`,
      `NPC city houses: ${en}`,
    ),
  ),
];

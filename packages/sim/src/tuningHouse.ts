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

export const HOUSE_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "house_found_cost",
    "",
    "house.foundCost",
    "가문 창설 비용(최소 단위)",
    "House founding cost (minor units)",
  ),
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
];

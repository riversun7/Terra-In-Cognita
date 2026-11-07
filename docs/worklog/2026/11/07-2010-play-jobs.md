# 직무 위치·피로·임대 상한(플레이 흐름 WP8): 같은 2차맵 조건·직무 없는 동안 쉼·임대형 몫 건물 창고 상한

- 일시: 2026-11-07 20:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP8 직무 위치·피로·임대 상한 (play-jobs)"(상태 제안), 질문 `docs/questions/2026-11-07-play-produce.md` 520~525(답 D-518)·580~582(새, 확인 대기), 기획 D-518·D-430(48 §7.1)·414(D-121)·D-144·D-515, 가지 `work/play-jobs`(시작점 main `d5a320b`)

## 한 일
- 기획 정리 D-518이 답한 WP3 질문 가운데 다음 줄기로 남은 522·523·525를 넣었다. 520·521·524는 지금 코드 그대로임을 확인했다(Verified: 코드 — `cyborg/service.ts` 시작 재료 `start_goods`, `labor/service.ts assign`은 원장을 건드리지 않음, `labor/gatherWork.ts` 유닛마다 진행).
- **522 ① 같은 2차맵**: 직무 배치·노동 계약 맺기·구인 받기는 유닛이 그 시설과 같은 2차맵에 있어야 한다 → 새 결과 코드 `wrong_map`(프로토콜 15, 최소 14 — 14판 연결은 `invalid_terms`). 정산 때 떠났으면 배치는 풀고 계약은 "유닛 사라짐"(지금은 2차맵 사이 이동이 없어 일어나지 않음). 화면: 일꾼 칸·새 계약 폼은 같은 2차맵 유닛만 고르고 다른 2차맵 유닛 수를 한 줄로, 구인 게시판은 고른 유닛과 다른 2차맵 일자리를 막고 까닭을 단다, 짓기 폼의 처음 2차맵 = 내 사이보그 본체 2차맵.
- **525 ① 직무 없는 동안 쉼**: 시뮬 `settleJob`이 직무 없음 유닛을 구간 내내 쉬게 한다(`restIdle`, 직무 쉼과 같은 [임시] 2분/점, 0이면 일 단계). 직무를 바꿀 때 `switchJob`(피로·단계 그대로, 진행 0). 서버 직무 켜기·끄기가 이것을 쓴다 → 풀었다 다시 배치해도 피로가 지워지지 않고 시간만큼만 풀린다. `SIM_VERSION` 17.
- **523 ② 임대형 몫만 건물 창고 상한**: 팩 채집 시설 `storageKg`(414 옛 상한 농장 300·벌목장·광산 200kg, core@49). 임대형 임차인 몫 산출은 그 건물 창고 상한 − 든 무게(모든 주인)까지만 나온다(정산 하나 안에서 같은 건물 몫을 함께 줄임, 넘친 양은 나오지 않음). 건물 카드에 든 무게.
- 고친 것: 창고 무게 셈이 묶음 무게(weight × lotSize)로 원장 잔고(기본 단위)를 곱해 광석 무게를 1,000배로 셌다 → 기본 단위 무게로(`catalog.unitWeightOf`).
- [임시] 설정 칸은 더하지 않았다(회복 값은 기존 시험 규칙 `TEST_JOB_RULES.restStepMs`, 상한은 팩 시설 `storageKg`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/settle/settle.ts`·`owner.ts`·`index.ts`, 시험 `settle.test.ts`(4개 더함)·`owner.test.ts`(1개 더함) | 525: `restIdle`·`switchJob`, 정산이 직무 없음 유닛을 쉬게 함 |
| `packages/sim/src/version.ts` | `SIM_VERSION` 17(직무 없음 유닛의 정산 결과가 바뀜, 시뮬 출력은 그대로) |
| `packages/protocol/src/labor.ts`·`index.ts`·`version.ts`, 시험 `labor`·`cyborg`·`facilities`·`market`·`ruins` | 522: 결과 코드 `wrong_map`, `LABOR_MAP_PROTOCOL_VERSION` 15, 판 15(최소 14) |
| `packages/shared/src/labor.ts`·`facilities.ts` | 화면 자료에 유닛·시설·구인 `mapKey`, `storedKg` 설명 |
| `apps/server/src/labor/service.ts`·`jobBoard.ts` | 522: 같은 2차맵 확인(맺을 때·정산 때), 화면 자료 `mapKey`, 523 임대형 남은 자리 |
| `apps/server/src/labor/workBook.ts` | 525 `switchJob`, 523 `leaseRooms`·물건 줄 자르기 |
| `apps/server/src/labor/gateway.ts`·`session.ts`·`gateway.test.ts`(1개 더함) | 14판 연결은 `wrong_map` 대신 `invalid_terms` |
| `apps/server/src/facilities/storage.ts`·`world.ts`·`places.ts`·`catalog.ts`·`views.ts` | 523: 건물 창고 남은 자리(`roomGrams`), 기본 단위 무게, 채집 시설 든 무게·유닛 `mapKey` |
| `apps/server/src/labor/produce.db.test.ts`(DB 2개 더함)·`labor.db.test.ts` | wrong_map·쉼·다시 배치, 임대형 상한 / 화면 자료 `mapKey` |
| `content/core/facilities.json`·`manifest.json`, `packages/content/src/schema/economy.ts`(설명) | 채집 시설 `storageKg`, core@49 |
| `apps/game/src/economy/WorkerParts.tsx`·`LaborPanel.tsx`·`LaborJobs.tsx`·`FacilityPanel.tsx`·`FacilityCards.tsx`·`laborText.ts` | 같은 2차맵 유닛만, 결과 문구, 처음 짓기 2차맵, 든 무게 |
| `apps/game/messages/{ko,en}.json` | 문구 4개 더함(`labor_error_wrong_map`·`labor_units_other_map`·`labor_job_other_map`·`facility_workers_other_map`), 1개 고침(`facility_workers_note`: 빼면 쉬며 풀림) |
| `docs/adr/2026-11-07-play-flow.md`("WP8" 절), `docs/questions/2026-11-07-play-produce.md`(상태·580~582), `docs/PLAN.md`(14장 한 줄), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 작업 중(Verified): 시뮬·프로토콜·공용·콘텐츠 141파일, 프로토콜 17파일 100개, DB(`TEST_DATABASE_URL`) 노동 계약·플레이어 생산·건물·정산·앱·구인·사이보그 17파일 76개 통과.
- 끝 검사: (아래 "끝 검사 결과"에 적는다)

## 함께 바꿔야 하는 파일
- 프로토콜 판을 다른 줄기와 합칠 때: `packages/protocol/src/version.ts`(15 설명 한 줄씩 합침), 판을 세는 시험 `cyborg`·`facilities`·`market`·`ruins`·`labor`.
- `SIM_VERSION` 17 설명(`packages/sim/src/version.ts`)도 다른 줄기와 합칠 때 번호를 맞춘다.
- 팩 판(core@49)·`content/core/facilities.json`도 합칠 때 한 판으로.

## 건드리지 말 것
- `settleJob`의 직무 없음 길은 나눠 정산해도 같아야 한다(`settle.test.ts` 무작위 자르기). 진행을 바꿀 때 넘기지 않는 `switchJob`을 거치지 않으면 덤 주기가 생긴다.

## 미검증·TODO·알려진 문제
- 회복 값은 직무 쉼과 같은 시험 값(2분/점)이고 D-430 배율(주거·만족도·노숙)은 아직 없다(질문 581).
- 넘친 임대 몫은 나오지 않는다(질문 580). 2차맵 사이 이동이 생기면 떠난 유닛의 계약이 끝난다(질문 582).
- 원장 물자 수량을 건물 재료(materials.ts "묶음 단위")와 경제(기본 단위)가 다르게 읽는 것은 광석에서만 어긋난다(이 줄기는 창고 무게 셈만 고침, 재료 수량은 그대로).

## 사용자 결정 대기
- 없음(질문 580~582는 기획 세션 몫, 답이 없으면 지금 코드).

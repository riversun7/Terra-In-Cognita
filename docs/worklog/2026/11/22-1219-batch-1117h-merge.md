# 2026-11-22 묶음 1117h 합치기 (주거 층·집세 / 쿠데타 병력 실제 이동 / 호감·서열·재선출·거래소 이용료·국고 집행 / D-592 옮기기) + 미러 5d78b7a — 리셋 필요 없음

- 일시: 2026-11-22 12:19~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1030-residence-3`·`22-1050-no-teleport`·`22-1120-gov-fix-4`·`22-1130-fixes-d592`,
  질문 `docs/questions/2026-11-22-residence-3.md`(2671~2678)·`2026-11-22-no-teleport.md`(2651~2659)·`2026-11-22-gov-fix-4.md`(2661~2668)·`2026-11-22-fixes-d592.md`(2681~2685),
  ADR `2026-11-15-business-ledger.md`·`2026-11-07-buildings-runtime.md`(residence-3), `2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md`(no-teleport·gov-fix-4·fixes-d592),
  `2026-11-21-diplomacy-treaties.md`·`2026-11-21-share-market-2.md`(gov-fix-4·fixes-d592), `2026-11-21-credit.md`(fixes-d592), 기획 D-591·D-592(이번 미러에 있음)

## 한 일
- main 5706cd0fd9(묶음 1117g 기록) 위에 줄기 넷을 차례로 합쳤다(합치기 커밋 `--no-ff`, 기본 메시지).
  1. `work/residence-3`(5a22c6e1ea, 바탕 14537f2649): 주거 건물 층(`world_facilities.floors`)·층 올리기 공사(작업 종류 `floor`, `facilities/floors.ts`), 집세(`residence_rents`)·
     미리 내는 숙박비(`unit_residences.paid_until_ms`, `residence/rent.ts`), 화면 `ResidenceOwner.tsx`.
  2. `work/no-teleport`(35cc916ee8, 바탕 14537f2649): 쿠데타 병력 실제 파견(`governance/coupDispatch.ts`), 건물 공격 유닛 32칸 조건, 순간이동 점검 기록.
  3. `work/gov-fix-4`(3c9b85c45a, 바탕 14537f2649): 세력 쌍 호감(`diplomacy_affinity`), 가문 서열 기여도, 해임 뒤 자율 출마 재선출, 지분 이용료는 주문한 거래소로(`exchangeId`),
     국고 지분 집행 기간(`treasury_share_runs`).
  4. `work/fixes-d592`(7abb108259, 바탕 6a6d0cb50e — 조정자 지시로 이 묶음에 더함): NPC의 드문 같은 나라 치기(`travel/npcStrike.ts`), 같은 가문원 공격 → 추방
     (`factionIdentity/houseExpel.ts`, `members.ts expel`), 쿠데타 중 맞선 편 공격 신용 벌점 없음(`credit/coupTruce.ts`·`governance/coupTruce.ts`), 재건 전쟁의 어긴 쪽,
     위반 잊기(`dip_breach_expire_ms`), 제재 명분 = 피해 나라와 그 동맹.
- 충돌과 푼 방법:
  - `packages/protocol/src/version.ts`·`content/core/manifest.json`·`docs/WORKLOG.md`: 판 다시 매김·목차 다시 만들기로 풂.
  - `docs/adr/2026-11-21-governance.md`: fixes-1117e(main) → no-teleport → gov-fix-4 "바뀜" 절을 차례로 모두 남김. `2026-11-15-unloaded-second-maps.md`(no-teleport → fixes-d592),
    `2026-11-21-diplomacy-treaties.md`(gov-fix-4 → fixes-d592)도 두 절 모두.
  - fixes-d592 × gov-fix-4: `diplomacy/service.ts` 틱 머리 = `const book = await breachBook(); await affinityBook();` + 동맹 쌍 모으기(둘 다 남김). `governance/rules.ts`(칸·읽기),
    `tuning/scope.ts`, `packages/sim` `governanceCoefficients.ts`·`tuningGovernance.ts`, `content/core/tuning.json`: gov-fix-4의 `dip_*_affinity`·`gov_share_exec_ms` 넷 뒤에
    fixes-d592의 `dip_breach_expire_ms`를 둠. `factionIdentity/attach.ts`: league-2(main)의 연맹 조항 고리 뒤에 추방 고리.
  - no-teleport × gov-fix-4의 `governance/port.ts`·`view.ts`, no-teleport의 `portCoup.ts`·`attach.ts`는 저절로 합쳐졌고 타입 검사·시험 통과(Verified).
- 쿠데타 이동(no-teleport) × 쿠데타 중 공격 벌점 없음(fixes-d592) — 함께 본 동작(Verified: 코드 읽기 `governance/coupTruce.ts refreshCoupTruce`·`coupStore.ts`·`coupDispatch.ts`):
  no-teleport는 쿠데타 상태를 더하지 않았다(`gathering → won·lost·cancelled` 그대로). 병력은 참가 받기(`gathering`) 동안 걸어가고, 전투는 참가 받기 끝 틱의 `resolve`에서
  한 번 빨리감기로 돈 뒤 상태가 바뀐다. 편 표는 의결 틱마다 `gathering` 쿠데타에서 다시 만들므로, 걸어가는 동안 맞선 편끼리의 일부러 치기·건물 공격은 벌점이 없다.
  쿠데타 전투 자체는 신용 고리를 지나지 않는다(원래 벌점 없음). 쿠데타가 끝난 뒤 늦게 닿은 유닛끼리 치면 편 표가 비어 다시 벌점이 붙는다 [임시 — 질문 2682·2652와 같은 자리].
- 파일 나누기: `apps/server/src/world/persist/tables.ts`가 residence-3·gov-fix-4의 칸으로 1,001줄(상한 1,000)이 돼 사업장 표 넷(`business_states`·`business_prices`·
  `business_share_orders`·`business_share_rounds`)을 `apps/server/src/business/table.ts`(`BUSINESS_TABLES`)로 옮기고 같은 자리에 펼쳤다(credit·cityShares와 같은 꼴, 키 차례 그대로,
  동작 바뀜 없음). tables.ts 962줄.

## 미러 동기화
- AntiGravt01 `claude/sweet-wright-4ubb2u` `docs/GDD_v4/` 76fd3b6 → **5d78b7a**를 그대로 복사(`00_README.md`·`02_Decision_Log.md`·`03_Planning_Rules.md` 바뀜, 지운 파일 없음 —
  `diff -rq` 같음, README만 우리 것). 새 결정 **D-591**(88eda2d)·**D-592**(5d78b7a). 커밋 `docs(design): 미러 5d78b7a (D-591~D-592)`.
- `49_Settings.md` 바뀜 없음 → `settings:cells` 다시 만들 일 없음(`--check` 통과). `pnpm check:wiki --stale` 26건 — 동기화 전과 같은 수(새로 낡은 항목 없음, 보고만).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 66(최소 65) | residence-3 145(144), no-teleport 125(124), gov-fix-4 135(134), fixes-d592 그대로 | **67(최소 66)** |
| 팩 core | 145 | residence-3 223, gov-fix-4 213, fixes-d592 234 | **146** |
| SIM_VERSION | 75 | 넷 모두 그대로 | **75** |

- 프로토콜: `version.ts` 67 항목 하나(세 줄기)·지원 목록 줄, `facilities.ts FLOOR_PROTOCOL_VERSION`·`residence.ts RESIDENCE_RENT_PROTOCOL_VERSION`·`governance.ts COUP_DISPATCH_PROTOCOL_VERSION` = 67,
  시험 `residence.test.ts`·`governance.test.ts` `toBe(67)` + `PROTOCOL_VERSION ≥`, 주석(`cityShares.ts`·`business.ts` "판 67부터", `facilities/gateway.ts`·`session.ts`·게임 앱 `residenceData.ts`).
- 팩: `manifest.json` 146. `id-changes.json`의 residence-3 이름 바꿈 기록(tuning `residence_capacity_per_level` → `residence_capacity_per_floor`) since 223 → **146**(그 밖은 더하기만 —
  다른 줄기는 `id-changes.json`을 바꾸지 않았다). 설정 칸: residence-3 넷(+이름 바꿈 하나), gov-fix-4 넷, fixes-d592 둘(`encounter_npc_same_nation_ppm`·`dip_breach_expire_ms`).
- SIM: 시뮬 설정 칸 표(`tuningBusiness.ts`·`tuningGovernance.ts`·`tuningEncounter.ts`·계수 기본값)만 바뀌고 판정은 그대로 — 합친 트리에서 `@terra/sim` 골든 통과(아래 전체 검사).
- ADR 판 줄: 묶음 판 + 괄호에 줄기 판(`business-ledger.md`·`buildings-runtime.md`·`governance.md`·`diplomacy-treaties.md` 두 절·`share-market-2.md`). 줄기 작업 기록·질문 파일은 줄기 판 그대로.

## 마이그레이션
- 새 마이그레이션 둘, 고치지 않고 그대로 합쳤다. 둘 다 prevIds = 1117e 끝 `7e79264e-c94f-43c1-b1a3-9e2f1ba61755` — main의 세 끝(1117f·1117g)과 같은 부모의 형제 다섯:
  - `20261122012636_residence3_floors_rent`(스냅숏 `58acae9a-00f8-4cfc-9eed-fe370f769b8e`) — 표 `residence_rents`, 칸 `unit_residences.paid_until_ms`·`world_facilities.floors`(+체크), `facility_jobs_kind`에 `floor`,
    손으로 더한 `UPDATE … floors = level`(숙소).
  - `20261122014315_gov_fix4_affinity_runs`(스냅숏 `79f15f68-68dc-45b0-b490-2cc41e6757fa`) — 표 `diplomacy_affinity`·`treasury_share_runs`, 칸 `exchange_id`(두 지분 주문)·`house_members.contribution`·`governance_state.vacancy_cause`.
  - fixes-d592·no-teleport는 마이그레이션 없음.
- 겹침 확인(Verified: SQL 읽기): `facility_jobs_kind`는 residence-3만 바꾼다. 다섯 형제가 같은 표·같은 체크를 건드리지 않는다. `db:generate` = "No schema changes"(Verified, 충돌 알림 없음).
- 다음 마이그레이션 `prevIds` = 다섯 끝 모두: **2110cf87-ab35-4e1e-9369-214a912806a9**, **dd3656c0-8f69-4d66-9e59-8428866e0b8b**, **a74a580d-0e90-4570-86de-a4d25e13f18a**,
  **58acae9a-00f8-4cfc-9eed-fe370f769b8e**, **79f15f68-68dc-45b0-b490-2cc41e6757fa**.

## 질문 번호
- 2651~2659(no-teleport), 2661~2668(gov-fix-4), 2671~2678(residence-3), 2681~2685(fixes-d592) — main(2645까지)·서로와 겹치지 않아 옮기지 않았다.

## 파일 크기
- 나눈 파일: 위 `world/persist/tables.ts` → `business/table.ts`. 그 밖 가장 큰 것(wc -l): `simulator/society.ts`·`app.ts` 999, `secondMapEngine.ts`·`world.ts`·`npc/runtime.ts` 998,
  `sim/src/index.ts`·`npc/economy.ts`·`labor/service.ts`·`facilities/service.ts` 997, `travel/encounterWorld.ts` 991 — 모두 상한 안(`check:size` 통과).

## 리셋 필요 여부: 필요 없음
- 마이그레이션 둘 다 더하기 + 숙소 층 채우기(층 = 레벨 → 정원 그대로)라 직전 판 앱이 그대로 돈다.
- **배포 뒤 첫 훑기(1분)**: 배정받은 숙소를 사는 곳으로 골라 둔 유닛은 residence-3 규칙대로 한 기간 숙박비를 미리 낸다. 지갑이 모자라면 그 유닛은 쉬기를 멈추고 처리할 일(받은 편지)이 뜬다
  (줄기 기록 "판·마이그레이션·리셋", Assumed — 운영에서 확인).
- 호감은 모두 0에서 시작, 기여도는 이 판부터 쌓인다, 이미 승인된 국고 주문은 집행 줄 없이 옛 길대로(gov-fix-4 기록). 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0).
- 프로토콜 67(최소 66): 1117g 기기(66)는 그대로 들어온다. 새 메시지(`facility_floor`·`residence_rent`)·칸(`exchangeId`)은 67 기기만 보낸다. `gov_coup_join unitIds`는 낮은 판에도 같은 뜻으로 처리.

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `apps/server/src/diplomacy/service.ts`, `governance/rules.ts`, `tuning/scope.ts`, `factionIdentity/attach.ts`, `packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`, `content/core/tuning.json` | 충돌 풀기(gov-fix-4 × fixes-d592·league-2, 둘 다 남김) |
| `docs/adr/2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md`·`2026-11-21-diplomacy-treaties.md` | 충돌 풀기(절 모두), 판 줄 |
| `docs/adr/2026-11-15-business-ledger.md`·`2026-11-07-buildings-runtime.md`·`2026-11-21-share-market-2.md` | 판 줄 |
| `packages/protocol/src/version.ts`·`facilities.ts`·`residence.ts`·`governance.ts`·`cityShares.ts`·`business.ts`(+ `residence.test.ts`·`governance.test.ts`), `apps/server/src/facilities/gateway.ts`·`session.ts`, `apps/game/src/map/building/residenceData.ts` | 프로토콜 67(최소 66) |
| `content/core/manifest.json`, `content/core/id-changes.json` | 팩 core@146, 이름 바꿈 기록 since 146 |
| `apps/server/src/world/persist/tables.ts`, `apps/server/src/business/table.ts`(새) | 1,000줄 상한 — 사업장 표 나누기 |
| `docs/design/*`(README 빼고 원본 그대로), `docs/design/README.md` | 미러 5d78b7a |
| `docs/worklog/2026/11/22-1000-batch-1117f-merge.md`·`22-1118-batch-1117g-merge.md` | "## 배포 (Verified)" 덧붙임(조정자 배포 확인 메모) |
| `docs/worklog/2026/11/22-1219-batch-1117h-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 68(최소 67), 팩 147, SIM 76. 다음 마이그레이션 `prevIds` = 위 다섯 끝.
- 1117f의 TODO 그대로: 이 판이 운영에서 확인된 뒤 `world/persist/load.ts`의 부팅 때 종류 6 → 4 바꾸기와 `LEGACY_UNIT_KIND_GUARDIAN` 읽기를 지운다.

## 건드리지 말 것
- 마이그레이션 `20261122012636_residence3_floors_rent`·`20261122014315_gov_fix4_affinity_runs`(이제 올라간다 — 고치지 않는다). 갈래는 다시 만들지 않는다.
- `id-changes.json`은 뒤에 더하기만 한다(since 146 기록은 이제 올라간다).

## 검사 (Verified)
- 네 줄기를 합치고 판을 다시 매긴 뒤 최종 트리에서 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 첫 판 **통과**: 포맷(3,402파일)·린트·타입·모듈 경계·파일 크기·
  다국어(9,004키)·디자인 값(746쌍)·콘텐츠(core@146 48ce7a3c0906), 시험 파일 **899/899**, 시험 **6,420/6,420**(`@terra/sim` 골든 포함). 흔들리는 DB 시험도 이번엔 한 번에 통과.
  (fixes-d592를 더하기 전 트리에서 돌리던 전체 검사는 지시를 받고 중간에 멈췄다 — 결과로 치지 않음.)
- `pnpm check:content`(호환 포함, core@146 48ce7a3c0906, 단계 1·2·4a·4b 기준 5706cd0 — fixes-d592 줄기에서 나던 호환 오류 넷은 1117g 칸이 줄기에 없어서였고 합친 트리에서 사라짐),
  `pnpm check:docs`, `pnpm docs:index --check`, `pnpm wiki:index --check`(항목 40개), `pnpm settings:cells --check`, `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 258항목), `pnpm check:bundle` 첫 화면 JS **110,814 B** / 상한 131,416 B(1117g 110,802 B에서 +12 B, 파일 7개).
- 화면 시험(빌드한 앱, 다섯 파일 한 번에, 24.7분 — 다른 검사와 기계를 나눠 느림): `building-screen.spec.ts` **11/11**, `governance.spec.ts` **11/11**, `facilities.spec.ts` **5/5**,
  `diplomacy.spec.ts` **6/6**, `share-market.spec.ts` **9/9** — 합 **42/42**. 흔들림·다시 돌림 없음. 결과·사진 폴더는 지웠다.

## 미검증·알려진 문제
- 운영 첫 훑기의 숙박비 선납 수·멈춘 유닛 수, 쿠데타 이동(쿠데타 꺼짐), NPC 같은 나라 치기 빈도(`encounter_npc_same_nation_ppm`), 추방 빈도, 호감 변화는 재지 않았다(Unknown — 줄기 기록).
- NPC 병력은 2차맵 사이로 보내는 길이 없어 쿠데타 도시에 이미 있는 것만 든다(질문 2651 [임시]). 쿠데타가 끝난 뒤 닿은 유닛끼리의 공격은 다시 벌점(위 "함께 본 동작").
- 운영 DB의 마이그레이션은 배포 때 확인.

## 사용자 결정 대기
- 질문 2651~2659, 2661~2668, 2671~2678, 2681~2685, 그리고 앞 기록의 남은 대기(2621, 2641~2645 …).

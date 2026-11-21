# 2026-11-22 묶음 1117a 합치기 (DB 시험 g 단위 / 나라 의결 5·한 점수 신용 / 사는 곳 고르기) — 리셋 필요 없음

- 일시: 2026-11-22 01:10~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0100-dbtest-fix`·`21-2230-governance-5`·`21-2205-residence`, 질문 `docs/questions/2026-11-21-governance-5.md`(**2491~2500**, 줄기 번호 2471~2480에서 옮김)·
  `docs/questions/2026-11-21-residence.md`(2481~2486), ADR `2026-11-21-governance.md`·`2026-11-21-credit.md`·`2026-11-15-business-ledger.md` "바뀜" 절

## 한 일
- main 3ed55a4756(묶음 1116z 기록) 위에 세 줄기를 차례로 합쳤다.
  1. `work/dbtest-fix`(3d1730307f, 바탕 3ed55a4756 — 빨리감기): 5cf0d2d89a(광석 1g 기본 단위) 뒤 DB 시험의 돌·잔해 수량을 g 단위로. 시험만.
  2. `work/governance-5`(a6be7d8fa2, 안에 main 6a91da1ad9 합침): 빈자리 → 누구나 나서는 선출(빈자리 도시 독립 없앰), 쿠데타 병력 + 팩 전투 자료, 강화 안건, 지도자 나라 거래세
     (`nation_taxes.trade_tax_bp`), 화폐 단계 안건(`nation_monetary`, `currency_stage`), 쿠데타 보호 칸, 신용 한 점수(`credit_standings`), 가문 독립(지분 50% 이상), 지도자 신임도
     자리(`governance_approval`), 쿠데타 성공 = 차지한 도시만 새 나라.
  3. `work/residence`(edc9079728, 안에 main 6a91da1ad9 합침): 유닛 사는 곳 고르기(`unit_residences`, WS `residence_set`/`residence_result`, tRPC `gather.residence`, 건물 판 [사는 곳] 카드),
     주민세 주기 고르기 목록(`invalid_period`), D-304 나눔 [임시] 표시, 폐허가 주민세 빚을 지우지 않음(D-585).
- 사용자 답 **D-587**(코디네이터 전달)을 이 묶음에 넣었다: `credit_tenure_per_day` 10 → **5**, `credit_business_daily` 2 → **10**, `credit_start` 100·`credit_tenure_cap` 300 확정(설명 칸
  출처에 D-587). 코드 기본값(`packages/sim/src/society/businessCoefficients.ts`)과 `apps/server/src/credit/book.test.ts` 기대값을 맞췄고 신용 ADR "바뀜 (governance-5)"에 값 줄을 더했다.
  지도자 신임도 시작값(`gov_approval_player_start` 300·`gov_approval_npc_start` 500)은 [임시] 그대로.
- 1116z 묶음 기록(`21-2308-batch-1116z-merge.md`) 끝에 "배포 (Verified)" 절을 붙였다(코디네이터 배포 메모).
- 최종 판:
  - 프로토콜 **61**(최소 **60**): 두 줄기 모두 줄기 판 99(최소 98) → 묶음 판 하나. `GOVERNANCE5_PROTOCOL_VERSION`·`RESIDENCE_PROTOCOL_VERSION`·`NATION_TAX_PERIOD_PROTOCOL_VERSION` = **61**.
    `version.ts` 61 절에 두 줄기를 함께 적었다.
  - 팩 **core@139**(main core@138 + 1, 줄기 판 176·177 → 묶음 판). `tuning.json` 칸 935 → **948**(governance-5 +16·−3: `credit_resident_city`·`credit_business_city`·`gov_vacancy_split_ms` 뺌,
    residence는 설명만, D-587 값 둘). `id-changes.json`은 governance-5가 더한 세 줄만 `since` 176 → **139**(다른 줄 그대로).
  - `SIM_VERSION` **71** 그대로(시뮬 출력 형식 그대로 — governance-5의 새 고리 `bankOverride`·`rebellionThresholdShift`는 시뮬이 붙이지 않는다. 코드 기본값 둘만 바뀜 — 아래 검사 절 골든).
  - 마이그레이션: 줄기 것 그대로. `20261121130732_governance5_credit_standing`(스냅숏 id `e44a1520-def3-4dd0-85f2-a97fe6a8e2fb`)·`20261121131627_unit_residences`(`8ccb7e3f-9488-45bf-8137-a0bfbba826db`),
    둘 다 prevIds = 1116y 끝 둘 `ee4d36aa`·`ace6aeb5`(1116z `20261121125203_city_share_market` `90e99c42`와 형제 갈래). 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified).
    다음 마이그레이션 `prevIds` = 끝 셋 **90e99c42-2912-427e-b53e-b00329f24354**·**e44a1520-def3-4dd0-85f2-a97fe6a8e2fb**·**8ccb7e3f-9488-45bf-8137-a0bfbba826db**.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표(`credit_standings`·`nation_monetary`·`governance_approval`·`unit_residences` 등)와 새 칸(`nation_taxes.trade_tax_bp`·`governance_coup_sides.units`), 검사 넓히기(안건 종류·신용 종류)뿐이다.
  직전 판 앱은 새 표·칸을 모른 채 돈다(새 종류 안건은 모르는 종류로 읽음 — 줄기 ADR Assumed).
- 팩은 설정 칸 더하기·빼기(뺀 셋은 `id-changes.json`에 기록)와 값 둘(D-587). 프로토콜은 메시지·칸·코드 더하기뿐이고 최소 60이라 60판 기기는 그대로 들어온다.
- 신용: 옛 `credit_marks` 줄은 `nation_points`만 읽는다(옛 줄 호환). 소속 줄(`credit_standings`)은 비어 시작해 첫 소속 훑기가 만든다 — 모두 소속 기간 0부터.

## NAS 첫 켬 동작 (Assumed — 코드 읽기·줄기 DB 시험, NAS에서는 아직 못 봄)
- 소속 훑기(의결 1분 틱)가 주인마다 `credit_standings` 줄을 만들고, 하루에 한 번 돌아가는 사업장 수 × 10을 더한다(D-587). 신용 카드 점수는 100 + 소속 하루 5씩.
- 빈자리 나라는 바로 자동 선출을 연다(`gov_vacancy_election_ms`). 열려 있던 빈자리 도시 독립 안건은 취소된다.
- `governance_approval`은 지배 가문이 바뀔 때 시작값을 적는다. 폭 칸 출발값 0이라 해임·반란 문턱은 그대로.
- `unit_residences`는 비어 시작한다(고른 사람이 없으면 옛 길 — 숙소 배정이 사는 곳).
- 배포 뒤 볼 것: 위 표들의 행 수, `governance.*` 감사 기록, 서버 경고·오류, 1분 지표.

## 손으로 푼 곳
- governance-5: `db/schema.ts`(신용 `creditStandings` + main 도시 지분 시장 둘 다), `world/persist/tables.ts` 쓰기 차례(`creditStandings` 다음 `cityShareOrders`·`cityShareRounds`),
  `governance/service.ts` 머리 주석(main의 지분 시장 고리 문장 + 줄기의 governance-5 바뀜 문단), `version.ts`·`manifest.json`·`id-changes.json` 판 번호. `docs/WORKLOG.md`는 들어오는 쪽 + `pnpm docs:index`.
- residence: `protocol/src/messages.ts`·`index.ts`(도시 지분 + 사는 곳 둘 다 — `index.ts`는 `export {` 줄이 빠진 채 합쳐져 다시 넣음), `db/schema.ts`(`unitResidences` 더함), `BuildingPanel.tsx`
  (거래소 판 + 사는 곳 카드, 머리 주석 두 줄), `mapFeed.ts`(`city_share_result`·`residence_result` 둘 다 걸러냄), 신용 ADR(두 "바뀜" 절 다 — governance-5 뒤 residence).
- **residence × governance-5 신용·폐허**: 시뮬 `society.ts ruinCity`는 residence 대로 `payouts.cityMoved(도시)`만 부른다(`from` 없음 → `cancelResidentDebts` 안 부름) — 폐허는 빚을 지우지 않는다(D-585).
  나라가 바뀔 때(`cityMoved(도시, 옛 세력, 시각)`)만 지운다. governance-5 한 점수 신용의 회복은 "빚 계정이 0이 될 때만"(다 갚음)이라 그대로 맞물린다. `credit/book.ts` 머리 주석의
  "도시가 넘어가거나 폐허가 되어 탕감"을 "다른 나라로 넘어가 탕감(폐허는 탕감하지 않는다 — D-585)"으로 고쳤고, 신용 ADR residence 절 끝에 합친 메모 두 줄(사는 곳으로 소속 나라를 정하는 잇기는 남은 일).
- 판 번호: governance-5·residence 코드 주석의 "줄기 판 99"·"묶음 때 다시 붙인다"를 프로토콜 61로, `residence.test.ts`·`nationTax.test.ts`의 "판 = 지금 판" 기대를 `toBe(61)` + `PROTOCOL_VERSION ≥`로
  (다음 묶음에서 판을 올려도 깨지지 않게). ADR `2026-11-21-governance.md` governance-5 판 줄, `2026-11-15-business-ledger.md` residence 판 줄을 묶음 판으로. 줄기 기록은 줄기 판 그대로 두었다.
- **질문 번호 옮김**: governance-5 질문 2471~2480이 main의 share-market 질문 2471~2480과 겹쳐 **2491~2500**으로 옮겼다. governance-5가 더한 줄만 바꿨다(질문 파일·코드 주석 —
  `credit/book.ts`·`hooks.ts`·`table.ts`, `db/governanceSchema.ts`, `governance/approval.ts`·`coup.ts`·`leaderAgendas.ts`·`leaderStore.ts`·`service.ts`, `shared/credit.ts`, `sim/.../governanceCoefficients.ts`·`tuningGovernance.ts` —,
  ADR 둘의 governance-5 절, 질문 `credit.md`·`governance-4.md`의 답 표시 줄, 줄기 기록 `21-2230-governance-5`). 질문 파일 머리에 옮긴 까닭 한 줄.
- 저절로 합쳐진 곳: 메시지 ko·en(8,786키씩 — paraglide 다시 만듦), `tuning.json`(governance-5가 뺀 세 칸 빠진 채), 서버 `app.ts`·`session.ts`, 경제 화면.
- 파일 크기: 넘은 파일 없음. 큰 파일: `sim/src/simulator/society.ts` 998, `world/persist/tables.ts` 997, `sim/src/index.ts` 996, `governance/service.ts` 983. 시장 새는 규칙: 새 코드에 `cityMap.get` 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `governance.ts`, `residence.ts`, `nationTax.ts`, `messages.ts`, `index.ts`, 시험 `governance.test.ts`·`residence.test.ts`·`nationTax.test.ts` | 프로토콜 61(최소 60), 줄기 상수 61, 합친 메시지 |
| `content/core/manifest.json`, `id-changes.json`, `tuning.json` | 팩 core@139, governance-5 뺀 칸 since 139, D-587 값 둘 |
| `packages/sim/src/society/businessCoefficients.ts`, `apps/server/src/credit/book.test.ts` | D-587 코드 기본값·시험 기대값 |
| `apps/server/src/db/schema.ts`, `world/persist/tables.ts`, `governance/service.ts`, `credit/book.ts` | 충돌 풀기, 폐허 주석 |
| `apps/game/src/map/building/BuildingPanel.tsx`, `apps/game/src/map/mapFeed.ts` | 충돌 풀기(거래소 판 + 사는 곳 카드) |
| `docs/questions/2026-11-21-governance-5.md` 외 governance-5 줄(위) | 질문 번호 2471~2480 → 2491~2500 |
| `docs/adr/2026-11-21-credit.md`, `2026-11-21-governance.md`, `2026-11-15-business-ledger.md` | 두 바뀜 절, 판 줄, D-587 값 줄 |
| `docs/worklog/2026/11/21-2308-batch-1116z-merge.md` | 1116z 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/22-0110-batch-1117a-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 62(최소 61), 팩 140, SIM 72. 다음 마이그레이션 `prevIds` = 끝 셋 `90e99c42…`·`e44a1520…`·`8ccb7e3f…`(위).
- `sim/src/simulator/society.ts`(998)·`world/persist/tables.ts`(997)·`sim/src/index.ts`(996)·`apps/server/src/app.ts`·`world/world.ts`·`npc/economy.ts`를 늘리면 새 모듈로 나눈다.
- 신용 소속 나라를 사는 곳으로 정할 때 `residence/book.ts`의 `residenceCityOf`·`ownerResidenceCities`를 `credit/standing.ts`에 잇는다(신용 ADR residence 절).
- 줄기 기록 셋의 "함께 바꿔야 하는 파일"·"건드리지 말 것"을 따른다.

## 건드리지 말 것
- 마이그레이션 `20261121130732_governance5_credit_standing`·`20261121131627_unit_residences`(올라간 뒤 고치지 않는다).
- 폐허 → 주민세 빚 남김(D-585)을 되돌리지 않는다(`society.ts ruinCity`가 `cityMoved`에 옛 세력을 넘기지 않는 것).

## 검사 (Verified)
- 합친 판(판 손질·D-587 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,785키)·디자인 값(746쌍)·콘텐츠
  (core@139 3a95409cb272) 통과, 시험 파일 **867/867**, 시험 **6,215/6,215**(건너뜀 0 — dbtest-fix로 1116z의 DB 시험 실패 24개가 다시 통과, `@terra/sim` 골든 포함 — D-587 코드 기본값은 시뮬 출력에 안 닿음).
- `pnpm check:content origin/main`(core@139 3a95409cb272, 단계 1·2·4a·4b 기준 3ed55a4), `pnpm check:docs origin/main`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌어(사는 곳 카드·주민세 주기 고르기·신용 카드) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,784 B** / 상한 131,416 B(1116z 110,768 B에서 +16 B).
- 화면 시험(한 번씩, 빌드한 앱): `governance.spec.ts` **6/6**(23초), `government.spec.ts` **9/9**(8.8분), `building-screen.spec.ts --grep "사는 곳"` **2/2**(2.3분), `economy.spec.ts` **25/27**(4.1분).
  economy 실패 둘은 main 5cf0d2d89a(광석 1g·화석·이탄·소금 제거) 뒤 낡은 기대값이다 — 거래소 행 수 163 → 160(뺀 아이템 셋), 광산 레시피 일꾼 효과 "한 번에 2개" → 100개(설정 칸 `n44_ore_grams` 1000 → 1).
  이 묶음이 바꾼 곳이 아니다(Assumed — 팩 차이로 맞춤, origin/main에서 따로 돌려 보지는 않음). 결과 폴더는 읽은 뒤 지웠다.

## 미검증·알려진 문제
- governance-5: 강화·화폐 단계·가문 독립·거래세·쿠데타 병력 **화면은 만들지 않았다**(서버·프로토콜만). 2차맵 유닛끼리 같은 나라 교전은 신용 벌점에 들지 않는다(건물·비콘 공격만 — 질문 2496).
  쿠데타로 나라가 갈라지는 길은 결정적으로 다시 돌려 보지 않았다(DB 시험 한 경로). 신용·신임도 크기는 [임시] 설정 칸(D-587 넷 빼고).
- residence: 주민세가 0이 아닌 세계에서 사는 곳에 따른 주민세를 돌려 보지 않았다(시험 세계는 주민세 0). 정부 주민세 주기 고르기 화면은 화면 시험이 없다.
- dbtest-fix: 돌 g 단위 뒤 NPC 건설이 느려질 수 있다(필요 g 수 × 채집 속도 — 기획 질문으로 남김, Assumed).
- 신용 소속 나라는 아직 가문 소속 나라 → 시민권이다(사는 곳 잇기는 남은 일).
- `e2e/economy.spec.ts` 낡은 기대값 둘(위 검사 절 — main 5cf0d2d89a 뒤): 고칠 일로 남긴다.
- NAS 첫 켬 동작은 위 절 그대로 Assumed.

## 사용자 결정 대기
- 질문 2491~2500(governance-5), 2481~2486(residence), 2471~2480(share-market), 2461~2467(npc-houses), governance-4에서 남은 2456·2458·2459, 앞 묶음의 2431~2440·2421~2427·2381~2385·2401~2410·2371~2375·
  2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.

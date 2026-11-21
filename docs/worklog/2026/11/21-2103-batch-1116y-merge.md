# 2026-11-21 묶음 1116y 합치기 (의결 3 — 쿠데타·지분 따라가기·빈자리 독립 / 신용 점수) — 리셋 필요 없음

- 일시: 2026-11-21 21:03~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-2030-governance-3`·`21-1745-credit`, 질문 `docs/questions/2026-11-21-governance-4.md`(2451~2460)·`docs/questions/2026-11-21-credit.md`(2441~2448),
  ADR `2026-11-21-governance.md` "바뀜 (governance-3)"(제안)·`2026-11-21-credit.md`(제안)

## 한 일
- main 39ed60bae9(묶음 1116x 4d5e42ac56 위에 다른 세션 커밋 여섯 — 강 폭(생성기 2판)·누르는 곳 44px → 24px·NPC 자율행동 7축 성향·/dev/npc-ai·2차맵 높이 과장 ×4·
  가파른 비탈 느린 길(SIM 68)) 위에 두 줄기를 차례로 `--no-ff`로 합쳤다.
  1. `work/governance-3`(0a0eafe7b6, 안에 main 290241aa68·53f4350c3a 합침): 점령 몰수 = 옛 통치자 지분만(2431), 수도 이전·쿠데타 때 지배 가문 지분 따라가기(2432, 새 표
     `governance_share_houses`), 지분 과반 사서 독재가 되면 국고 지분은 국고에 남김(2432), 자본주의 독립 투표에 가문 지분(2435), 선출 플레이어 지도자·빈자리 나라의 NPC 나라 단위
     판단 멈춤(2440·2434), 빈자리 → 도시마다 독립 투표(D-583), 군사 쿠데타 전체 흐름(`gov_coup_enabled` 0 = 꺼짐), 독재 지배 가문 지분 팔기(2439), 국고 지분 팔기 안건(2438, 시장 TODO),
     쿠데타 화면 칸.
  2. `work/credit`(5e0dcd5734, 바탕 옛 main ed25b71a3c): 신용 점수(도시·나라 신용, `apps/server/src/credit/`, `@terra/shared/credit`, 화면 `CreditCard.tsx`, tRPC `economy.credit`),
     원장 듣기 `observeLedger`, 주민세 빚·사업장 적자로 깎고 갚으면 바로 회복, 폐허 도시 주민세 빚 탕감(2427 나).
- 최종 판:
  - 프로토콜 **59**(최소 **58**): governance-3 줄기 판 98(최소 97) → 묶음 판. `COUP_PROTOCOL_VERSION` 98 → **59**. credit은 프로토콜 바뀜 없음.
  - 팩 **core@135**(main core@134 + 1, 줄기 판 173·172 → 묶음 판 하나). `tuning.json`은 저절로 합쳐졌다(칸 902 → **919**, 같은 ID 없음): credit 일곱(`credit_min`·`credit_max`·
    `credit_start`·`credit_resident_city`·`credit_resident_nation`·`credit_business_city`·`credit_business_nation`), governance-3 열(`gov_coup_enabled`·`gov_coup_cooldown_ms`·
    `gov_coup_gather_ms`·`gov_coup_fail_cost`·`gov_coup_fail_satisfaction_drop`·`gov_coup_npc_score`·`gov_coup_npc_power_pm`·`gov_coup_battle_units`·`gov_coup_merit_renown`·
    `gov_coup_credit_reward`). `id-changes.json` 바뀜 없음.
  - `SIM_VERSION` **68**(main이 올린 값 그대로 — 두 줄기는 시뮬 출력을 바꾸지 않았다, 골든 시험 통과). 시뮬 출력 형식 그대로.
  - 마이그레이션: 줄기 둘 그대로. `20261121112634_governance_coups`(스냅숏 id `ee4d36aa-5559-4825-ab82-9ce79bf8db2c`, prevIds = main 끝 `1efb9fa9`(npc_unit_traits)),
    `20261121083913_credit_marks`(스냅숏 id `ace6aeb5-b447-493e-affb-6e24cd0be200`, prevIds = 옛 세 끝 74cfa5b9·8ba706b5·6429529b — Drizzle 갈래, 이름으로만 적용하므로 그대로 둔다).
    합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified). 다음 마이그레이션 `prevIds` = 끝 둘 **ee4d36aa**·**ace6aeb5**.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표 넷(`governance_coups`·`governance_coup_sides`·`governance_share_houses`·`credit_marks`)과 안건 종류 검사 넓히기(`treasury_share_sale`·`city_independence`)뿐이다.
  직전 판 앱은 표를 모른 채 그대로 돈다(되돌리면 새 종류 안건을 모르는 종류로 읽는다 — 줄기 ADR, Assumed 해 없음). 모두 세계 표라 시험 세계 새로 시작에서 지워진다(남길 표 목록에 넣지 않음).
- 팩은 설정 칸 17개 더하기. 프로토콜은 메시지·종류·코드 더하기뿐이고 최소 58이라 58판 기기는 그대로 들어온다(59판 앱은 PWA로 받는다).

## NAS 첫 켬 동작 (Assumed — 코드 읽기·줄기 DB 시험, NAS에서는 아직 못 봄)
- 독재 나라마다 `governance_share_houses`에 지금 지배 가문 한 줄을 적는다. 지분은 옮기지 않는다(지배 가문이 바뀔 때만 옛 가문 계정 → 새 가문).
- 쿠데타는 꺼져 있다(`gov_coup_enabled` 0): NPC도 플레이어도 일으키지 못한다(`coup_disabled`).
- 빈자리 도시 독립 투표는 빈자리가 설정 기간(`gov_vacancy_split_ms`, 14일)을 넘은 뒤에만 열린다 — 1116x에서 생긴 빈자리라도 첫 켬에는 열리지 않는다.
- 선출된 플레이어 지도자 나라·빈자리 나라는 NPC 나라 단위 판단(새 선포·강화·봉신 독립·거래세)을 하지 않는다.
- 신용: 켤 때 깎은 몫은 없다(새 표). 주민세 빚은 다음 주민세 주기에, 사업장 적자는 다음 적자 거래부터 깎는다. 깎는 크기 칸은 출발값대로.
- 배포 뒤 볼 것: `governance_share_houses` 행 수(독재 나라 수와 같아야), `credit_marks` 행 수, 서버 경고·오류, 1분 지표.

## 손으로 푼 곳
- `content/core/manifest.json`: credit 합칠 때 충돌(172 ↔ 135) → **135**.
- `docs/WORKLOG.md`: 들어오는 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤 다시).
- 판 번호: `packages/protocol/src/version.ts` 59 절(줄기 판 98)·`PROTOCOL_VERSION` 59·MIN 설명 "59부터 57판 이하"·`MIN_SUPPORTED_PROTOCOL_VERSION` 58, `governance.ts`
  `COUP_PROTOCOL_VERSION` 59(주석 "묶을 때 묶음 판으로" 지움), `governance.test.ts` 시험 이름, ADR `2026-11-21-governance.md` "바뀜 (governance-3)" 판 줄(프로토콜 59/58·core@135).
  줄기 기록은 고치지 않았다(줄기 판 그대로, 이 기록이 묶음 판 — 1116x와 같은 방식).
- 저절로 합쳐진 곳: 메시지 ko·en(8,691키씩, 같은 키 없음 — paraglide 다시 만듦), `tuning.json`, 서버 `tables.ts`·`schema.ts`·`session.ts`·`npc/economy.ts`. credit은 옛 main 바탕이지만
  다른 충돌은 없었고 타입·시험 모두 통과했다.
- `rewardCredit` 고리(쿠데타 이긴 편 신용 보상)는 **잇지 않았다**: 신용 장부는 "시작값(= 최대 1000) − 갚지 않은 빚마다 깎은 몫"이라 더할 길이 없다. 보상을 넣으려면 빚과 무관한 새 줄 종류
  (음수 몫 또는 따로 쌓는 보상 몫), 저장 표 뜻 바꿈, `check()` 불변 조건, 범위(도시·나라) 결정, 시작값 < 최대 조건이 필요해 작은 고침이 아니다. 고리와 설정 칸 `gov_coup_credit_reward`(출발값 0)는
  그대로 TODO(`apps/server/src/governance/coup.ts`).
- 파일 크기: 넘은 파일 없음. 큰 파일: `world/persist/tables.ts` 992, `sim/src/simulator/society.ts` 991, `npc/economy.ts` 990, `db/schema.ts` 958, `session.ts` 932,
  `governance/service.ts` 917. 시장 새는 규칙: 새 코드에 `cityMap.get` 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@135 |
| `packages/protocol/src/version.ts`, `governance.ts`, `governance.test.ts` | 프로토콜 59(최소 58), `COUP_PROTOCOL_VERSION` 59 |
| `docs/adr/2026-11-21-governance.md` | "바뀜 (governance-3)" 판 줄 |
| `docs/worklog/2026/11/21-1842-batch-1116x-merge.md` | 1116x 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/21-2103-batch-1116y-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 60(최소 59), 팩 136, SIM 69. 다음 마이그레이션 `prevIds` = **ee4d36aa-5559-4825-ab82-9ce79bf8db2c**·**ace6aeb5-b447-493e-affb-6e24cd0be200**(끝 둘).
- `world/persist/tables.ts`(992)·`sim/src/simulator/society.ts`(991)·`npc/economy.ts`(990)·`apps/server/src/app.ts`(999)를 늘리면 새 모듈로 나눈다.
- 줄기 기록 `21-2030-governance-3`·`21-1745-credit`의 "함께 바꿔야 하는 파일"·"건드리지 말 것"을 따른다. 앞 묶음 TODO 그대로: 거래소를 읽기만 할 때는 `peekMarket`, 다음 배포에서 옛
  `exchange_lockers` 표를 지운다(1116n TODO).

## 건드리지 말 것
- 마이그레이션 `20261121112634_governance_coups`·`20261121083913_credit_marks`(올라간 뒤 고치지 않는다, 갈래도 다시 만들지 않는다).

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,691키)·디자인 값(746쌍)·콘텐츠
  (core@135 fbef3fdf224a) 통과, 시험 파일 **849/849**, 시험 **6,133/6,133**(`@terra/sim` 골든 포함 — SIM 68).
- `pnpm check:content 39ed60bae9`(core@135 fbef3fdf224a, 단계 1·2·4a·4b), `pnpm check:docs 39ed60bae9`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌어(쿠데타 칸·신용 카드) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,735 B** / 상한 131,416 B(파일 7개, 1116x 110,522 B에서 +213 B).
- 화면 시험(한 번씩): `e2e/governance.spec.ts` **6/6 통과**(26.3초). `e2e/economy.spec.ts` **25/27 통과**(4.0분) — 실패 2개는 시세 색(D-442) 둘: 호가창 매수 색
  `rgb(184, 29, 56)` ≠ 기대 `rgb(184, 40, 63)`(영어는 `rgb(22, 101, 52)` ≠ `rgb(34, 107, 51)`). 이 묶음은 토큰·호가창을 바꾸지 않았고 credit 줄기도 옛 main에서 같은 두 실패를 봤다
  (Assumed: main에 이미 있는 실패). 1116x까지 실패하던 `smallTapTargets`는 main의 24px 규칙(53f4350c3a)으로 모두 통과. 바꾼 시험("한눈에·거래·환전" — [신용] 시작값 줄)은 통과.

## 미검증·알려진 문제
- **쿠데타 전투는 시험 전투 자료로 돈다**: `app.ts`가 999줄이라 전투 자료를 넘기지 못했다(줄기 기록). 쿠데타가 꺼져 있어 운영 영향은 없다.
- 의결 NPC 규칙식이 main의 7축 가문 성향(290241aa68)을 아직 쓰지 않는다(옛 성향 값).
- 지도자 명령 빠짐: 강화·통화·거래세(질문 2452·2453·2460).
- 국고 지분 팔기 안건은 승인까지만, 시장에 내놓는 길은 TODO(2438).
- 신용 점수를 쓰는 곳(은행·대출·국가 채권·세금 등급)이 없다 — 조회만. 대출 연체 깎기 TODO. 질문 2445·2448 추천과 지금 코드가 다르다(답에 따라 고침).
- `rewardCredit` 고리 잇지 않음(위 "손으로 푼 곳").
- 시세 색 e2e 두 실패(위 검사 절) — 원인 미확인.
- 쿠데타 칸·신용 카드 사진은 이 묶음에서 따로 보지 않았다(e2e 사진은 찍힘, 줄기 기록 참고).
- NAS 첫 켬 동작은 위 절 그대로 Assumed.

## 사용자 결정 대기
- 질문 2451~2460(governance-4), 2441~2448(credit), 앞 묶음의 2431~2440·2421~2427·2381~2385·2401~2410·2371~2375·2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·
  2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.

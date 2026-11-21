# 2026-11-21 묶음 1116t 합치기 (NPC 알박기 시뮬 + 가문 10) — 리셋 필요 없음

- 일시: 2026-11-21 13:45~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1400-npc-claim`·`21-1315-house-10`, 질문 2331~2336(`docs/questions/2026-11-21-npc-claim.md`)·2341~2348(`docs/questions/2026-11-21-house-10.md`)·
  2351~2365(`docs/questions/2026-11-21-governance.md`), ADR "바뀜" 절(`2026-11-01-npc-brain-r5.md`·`2026-11-14-second-map-build.md`·`2026-11-07-ranking.md`·
  `2026-11-11-faction-identity.md`·`2026-11-16-logistics-center.md`)

## 한 일
- main 835fee6(묶음 1116s) 위에 두 줄기를 차례로 `--no-ff`로 합쳤다(둘 다 바탕 835fee6).
  1. `work/npc-claim`(767a6e9) — NPC 빈 2차맵 알박기 1·2단계(빈틈 2243): 판단 틀 행동 `claim`(`packages/sim/src/npc/brain.ts`), 시뮬 짓는 중 정부·다 지으면 가문 마을 모양 새 도시
     (`packages/sim/src/simulator/npcClaim.ts`), 도시 자리 함수를 `simulator/simGrid.ts`로 옮김(값 그대로), 설정 칸 `npc_claim_*` 15개. 서버(3단계)는 하지 않았다.
  2. `work/house-10`(04e0574, 커밋 넷) — 랭킹 가문 자산에 가문 금고·지배 가문장 지갑·걸어 둔 주문 몫(2313), 유닛 판(전투력·자산, 2316 — 화면·메시지 ko·en), NPC 지배 가문장 투자 몫을
     수도 사업장 금고로(2312 나), NPC 물류센터 운반꾼·증축(2301), 마이그레이션 `20261121035044_ranking_worth_units`, governance 질문 문서.
- 최종 판:
  - 프로토콜 **55**(최소 **54**) 그대로.
  - 팩 **core@129**(줄기 판 npc-claim 166·house-10 170 → 묶음 한 번 올림). `tuning.json`은 칸 ID로 3방향 합침 — 자동으로 합쳐졌고 두 줄기 칸이 모두 있다(npc-claim 15개,
    house-10 `logistics_npc_build_waits`·`logistics_npc_build_humans` + `house_npc_spend_invest_pm` 설명 고침). 칸 808개, 같은 ID 두 번 없음(Verified). `id-changes.json` 그대로.
  - `SIM_VERSION` **66**(줄기 판 106 — npc-claim이 판단 차례를 바꿔 시뮬 결과가 바뀐다). house-10은 sim 계수표 칸 둘만 더해 판정 그대로. `version.ts` 주석 "66: (묶음 1116t 합친 판,
    줄기 npc-claim의 106)".
  - 시뮬 출력 형식 **23**(npc-claim 줄기가 이미 main 다음 판으로 올림 — 요약 `npc.actions.claim`·`npc.claims`).
  - 마이그레이션: house-10의 `20261121035044_ranking_worth_units` 그대로(prevIds = 41cf0481·ae46b32c·269797c2). 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema
    changes"(Verified). 다음 마이그레이션 `prevIds` = **65053bfd**(이 마이그레이션 스냅숏 id).
- `docs/worklog/2026/11/21-1230-batch-1116s-merge.md` 끝에 "## 배포 (Verified)" 절(1116s CI 371·NAS 배포·nas-metrics·푸시 전 훅 결과, 조정 담당이 보낸 값)을 넣었다.

## 리셋 필요 여부: 필요 없음
- 프로토콜 그대로. 마이그레이션은 `ranking_worth`에 열 둘(`owner_id`·`name`) 더하기 + kind 검사 넓히기(0~3)뿐이라 지우는 것이 없다. 직전 판 앱은 kind 0·1만 쓰고 표를 통째로 지우고
  쓰므로 새 열·검사와 함께 그대로 돈다. 팩은 설정 칸 더하기·설명 고침.
- npc-claim은 시뮬만 바꾼다 — 서버 NPC는 아직 알박기하지 않는다(서버 세계에는 새 설정 칸만 보인다).
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **랭킹**: 다음 집계(UTC 0시)부터 가문 판 전투력·자산 칸에 가문 금고·NPC 지배 가문장 몫·걸어 둔 주문 몫이 더해지고, 판 고르기에 "유닛"(전투력·자산)이 생긴다. 집계 전에는 유닛 판이 비어
    있다. 가문 판 점수(경로 점수 합)는 그대로.
  - **NPC 가문장 투자**: 꺼낸 돈의 투자 몫이 국고 대신 그 나라 수도 사업장 금고로 간다(사업장이 없거나 NPC 장부가 꺼졌으면 옛 길 = 국고).
  - **NPC 물류센터**: 물류센터가 있는 NPC 도시는 일 없는 휴먼을 운반꾼으로 쓰고, 기다리는 운반 일이 쌓인 도시는 물류센터를 증축 목표에 넣는다.

## 손으로 푼 곳
- `content/core/manifest.json`(충돌): 166·170 → **129**.
- `docs/WORKLOG.md`(충돌): house-10 쪽을 받은 뒤 이 기록을 더하고 `pnpm docs:index`.
- `packages/sim/src/version.ts`: `SIM_VERSION` 106 → **66**, 주석 머리 바꿈.
- 판 번호 설명(줄기 판 괄호): `docs/adr/2026-11-01-npc-brain-r5.md`(SIM 66·core@129), `docs/adr/2026-11-16-logistics-center.md`·`docs/adr/2026-11-11-faction-identity.md`(core@129),
  `docs/questions/2026-11-16-alpak-2.md`(SIM 66). 줄기 작업 기록의 줄기 판(106·166·170)은 줄기 기록이라 그대로 둔다.
- 겹친다던 `npcRun.ts`·`npc/coefficients.ts`·`tuningNpc.ts`는 house-10이 건드리지 않아 충돌이 없었다(house-10의 sim 바뀜은 `society/logisticsCoefficients.ts`·`tuningLogistics.ts`).
- 메시지 ko·en은 house-10만 바꿔 충돌 없음 — paraglide 다시 컴파일.
- 파일 크기: 넘은 파일 없음. 999줄 그대로: `packages/sim/src/index.ts`·`apps/server/src/world/world.ts`·`apps/server/src/app.ts`(늘지 않음).
- 거래소 표 누수 규칙: 합친 서버 바뀜에 `cityMap.get`·`registry.get` 새 호출 없음(house-10 주문 몫은 DB 표에서 읽는다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@129 |
| `packages/sim/src/version.ts` | SIM_VERSION 66 |
| `docs/adr/2026-11-01-npc-brain-r5.md`, `docs/adr/2026-11-16-logistics-center.md`, `docs/adr/2026-11-11-faction-identity.md`, `docs/questions/2026-11-16-alpak-2.md` | 판 번호 설명(줄기 판 괄호) |
| `docs/worklog/2026/11/21-1230-batch-1116s-merge.md` | 1116s 배포 결과 절 |
| `docs/worklog/2026/11/21-1345-batch-1116t-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 56, 팩 130, SIM 67, 시뮬 출력 형식 24. 다음 마이그레이션 `prevIds` = 65053bfd.
- 앞 묶음들의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, 국가 지도자 지갑은 npc-wage 지갑 옮기기·상속 밖, **다음 배포에서 옛 `exchange_lockers` 표를
  지운다**(1116n TODO).
- npc-claim 3단계(서버)를 넣을 때: 시뮬 재료(국고 값 [임시], 질문 2331)를 서버와 같은 규칙으로 바꾸면 SIM 판을 다시 올린다. `apps/server/src/npc/runtime.ts`(995줄)·`facilities/service.ts`
  (989줄)는 새 모듈로.
- 줄기 기록 둘의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 설정 칸 ID `npc_claim_*` 15개·`logistics_npc_build_waits`·`logistics_npc_build_humans`.
- 판단 틀 후보 차례(claim은 맨 끝 — 다른 행동의 점수·차례를 바꾸지 않으려고).
- 랭킹 주문 몫은 표에서 읽는다(거래소 메모리 표를 만들지 않게).
- 줄기 기록 둘의 "건드리지 말 것".

## 검사 (Verified)
- 합친 판(버전 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,504키)·디자인 값(746쌍)·콘텐츠
  (core@129 a777dc8cfd58) 통과, 시험 파일 **811/811**, 시험 **5,966/5,966**(`@terra/sim` 골든 포함 — SIM 66 판정 그대로 시험이 받음).
- `pnpm check:content 835fee603b`: core@129 (a777dc8cfd58) 단계 1·2·4a·4b 통과. `pnpm check:docs 835fee603b` 통과. `pnpm settings:cells --check` 최신, `pnpm wiki:index --check`
  최신(항목 40개). `pnpm --filter @terra/server db:generate` = "No schema changes".
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS **110,487 B** / 상한 131,416 B(1116s 110,517 B, −30 B — 유닛 판은 지연 조각 랭킹 화면 안).
- 화면 시험 `e2e/ranking.spec.ts`만(빌드한 앱, 헤드리스, 새 DB, 잠금 안): **7 통과·3 실패**(55.1초). 실패 셋은 모두 `smallTapTargets`("본문으로 건너뛰기" 148×43px·"뒤로" 86×38px·
  "도시"·"외교" 58×38px 등 — main `--control-h-sm` 38px 탓, 줄기 결과와 같음)이고 그 앞의 내용 단언은 통과했다. 새 유닛 판 시험·나쁜 자료 390(ko·en)·사진 시험은 통과.

## 미검증·TODO·알려진 문제
- **서버 npc-claim 3단계 안 함**(질문 2333, 다음 줄기 `npc-claim-3` 제안): 빈 이웃 2차맵 띄우기·NPC 행정 건물 짓기 길·도시 없는 2차맵 건물 자리·DB 시험. 지금 운영 세계 NPC는 알박기하지
  않는다.
- **랭킹 화면 시험 누르는 곳 38px**: `e2e/ranking.spec.ts`의 `smallTapTargets` 실패 셋은 main 토큰 `--control-h-sm` 44 → 38px 바뀜 탓(1116r부터, 사용자 결정 대기 — 토큰 되돌리기 또는
  시험 문턱 고치기). 이 묶음은 토큰·그 단추를 건드리지 않았다.
- 줄기 미검증(줄기 기록에 자세히): npc-claim — 시뮬 재료 = 국고 값 [임시](2331), 플레이어 자리 덮기 못 봄(2332), 배후지가 알박기 도시를 모름, 행정 건물 Lv1 짓는 시간 실제 ms Unknown.
  house-10 — NPC 물류센터 운반꾼 실제 세계 모습 미실행(단위 시험만), 운반꾼이 NPC 자기 짐 운반꾼 수에서 안 빠짐(2347), 유닛 판에 규모 시험 봇 듦(2345), 랭킹 집계 부하 Unknown(값 표가
  유닛 수만큼 는다 — 서버 기록 `ranking snapshot`의 `worthRows`·`ms`로 본다), 가문 판 점수는 금고를 모름(2341).
- 시뮬(econ16 등)은 합친 판에서 다시 돌리지 않았다 — npc-claim 줄기가 같은 바탕에서 전·후 표를 쟀고, house-10의 sim 바뀜은 계수표 칸 둘뿐이다.

## 사용자 결정 대기
- 질문 2331~2336(npc-claim), 2341~2348(house-10), 2351~2365(governance), 앞 묶음의 2321~2327·2311~2317·2301~2306·2291~2295·2251~2259·2261~2270·2271~2278·2281~2285,
  1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224. 화면 누르는 곳 38px.

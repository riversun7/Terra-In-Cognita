# 좌표 이동 3 — 띄운 2차맵 조우·AI 판단(회피·약탈·전투)·실제 지형 조우 전투맵·강·비탈 감속·조우 뒤 다시 판단 (map-coords-3)

- 일시: 2026-11-16 10:14 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-564(1641·1643)·D-570(사용자 답 1901~1908 — D-570은 미러에 아직 없다, `docs/design`은 건드리지 않음)·D-172·D-173·D-210·D-146, ADR `docs/adr/2026-11-15-unloaded-second-maps.md` "바뀜 (D-570, 좌표 이동 3)", 앞 줄기 `docs/worklog/2026/11/16-0410-map-coords-2.md`, 앞 질문 `docs/questions/2026-11-16-map-coords-2.md`(1901~1908), 새 질문 `docs/questions/2026-11-16-map-coords-3.md`(2021~2038), 가지 `work/map-coords-3`(바탕 `work/territory-3` 2cc2edc)

## 한 일
1. **띄운 2차맵 위 자동 조우(1901 가, D-564 1641)** — 서버에 없던 2차맵 위 조우 판정을 만들었다(`travel/clash.ts`). 같은 조우 틱에 띄운 2차맵마다 다른 나라 두 유닛이 체비쇼프 `encounter_radius_cells`칸 안이면 만남. 한쪽은 판단하는 유닛(봇 아닌 전투 유닛 — 사이보그 본체·휴먼·사이보그 유닛, 직무 없음)이어야 한다. 싸우면 두 편의 길을 멈추고(`travel.haltOn`이 이제 띄운 2차맵을 걷는 길도 멈춘다 — stop `encounter`) 길이 없는 유닛도 그 자리에 세운 뒤 그 자리에서 세계 전투를 연다. 결과까지 그 2차맵을 붙잡는다(`holdMap`).
2. **조우 전투맵 = 실제 지형(1902 가, D-570·D-172)** — 열린 64칸을 대체(`travel/encounterArena.ts`·`encounterInit.ts`): 두 편 가운데 점 둘레 `encounter_map_size`칸을 그 2차맵에서 잘라(sim `arenaFromSecondMap` — 지형 비용·엄폐·높이, 다시보기·공성과 같은 셈) 창 안 건물 칸은 막힘. 유닛은 2차맵 지금 칸을 창 틀로 옮긴 자리, 들어오는 변 = 편 무게중심 쪽. 좌표 조우도 2차맵을 띄운 뒤 같은 셈. 편 1 = 먼저 건 공격 편, 편 2 = 수비 편(D-210).
3. **좌표 지형 감속에 강·비탈(1903 가, D-564 1643)** — `travel/coordPace.ts`: 하천 등급 1~2 = 등급 × 3% 얕은 물, 3 이상 = 등급 × 4% 돌아감. 비탈 = 이웃 2차맵 넷과의 고도 차 가장 큰 값 ÷ 576m 몫이 바위. 이웃 키는 `stepMapCell`(면 경계 넘음).
4. **조우 상대·AI 판단(1904, D-570)** — 전쟁 중 나라만이 아니라 다른 나라면 모두 만난다(좌표 유닛 = 같은 2차맵, 띄운 2차맵 = 거리 안). 편마다 판단(`travel/clashDecide.ts`): 전쟁 상대면 전력 비 ≥ 0.8이면 전투, 전쟁이 아니면 상대가 짐을 지녔고 전력 비 ≥ 1.5면 약탈(진 유닛 짐 몫을 이긴 편이 — 기존 D-173 탈취·D-555 1511 루팅 결과 규칙), 아니면 회피. NPC 공격 성향(D-327)이 문턱을 옮긴다. 플레이어는 행동 설정이 없어 **기본 회피**(`encounter_player_policy` 0, 1이면 성향 500 NPC처럼 — 질문 2021). 전력 = 전투 몸(입은 장비·버프)의 (HP + 아머 + 쉴드) × 공격력 ÷ 공격 간격(좌표 유닛은 유닛 수). 둘 다 회피면 그 2차맵·나라 짝은 쉬는 시간. 시가지(안전지대) 안이면 싸우지 않는다.
5. **조우 수치 설정 칸(1905 가)** — 팩 `tuning` `encounter_*` 12칸(간격·쉬는 시간·한 번 수·전투맵 크기·거리·한 편 상한·전쟁/약탈 문턱·성향 세기·플레이어 정책·짐 몫·재정비 HP 몫), 계수표 `encounter.*`, 개발자 패널 전투 코어 페이지, 서버가 틱마다 읽음(`SERVER_LIVE_PATHS`). 조우 틱 간격도 매번 다시 읽는다.
6. **1906·1907** — 지금대로(바꾸지 않음).
7. **조우 뒤 다시 판단(1908, D-570)** — `travel/afterEncounter.ts`: 멈춘 길(보낸 사용자·명령 종류·출발 자리·목표, `HaltedTrip`)을 메모리에 두고 전투 끝 + 2초에: 서 있지 않았거나(퇴각·포로·안전한 곳) 움직일 수 없으면 그대로, 짐 ≥ 운반 상한(`gather_carry_grams`) × 85%면 출발한 자리로(전리품 정리), 남은 HP < 50%이거나 부상이면 출발한 자리로(재정비), 아니면 같은 목표·같은 명령으로 다시 간다.
8. 1분 지표에 `encounterScans`·`encounterScanMs`·`encounterContacts`·`encounterAvoided`·`encounterBattles`·`encounterSafe`(앱 지표 줄).

## 부하 측정 (Verified — 실행함, 공유 기계 CPU 4개를 다른 일과 나눠 씀, Node 24.22.1)
- 띄운 2차맵 만남 찾기(`findClashes`, 2차맵 55장 × 봇 59명(도시 둘레 64칸) + 판단하는 유닛, 거리 10칸, 200회): 판단하는 유닛 없음(지금 NAS와 비슷) 유닛 3,245 → p50 0.025ms·p95 0.088ms / 2차맵마다 3명(유닛 3,410, 만남 45) → p50 0.36ms·p95 0.47ms / 2차맵마다 30명(유닛 4,895, 만남 319) → p50 3.1ms·p95 4.8ms·최대 8.2ms. 스크립트 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/mc3bench/clash-bench.mjs`(저장소 밖).
- 띄운 2차맵 유닛 모으기(움직임 → 칸, 3,297 유닛, 300회): p50 0.15ms·p95 0.51ms(`collect-bench.mjs`).
- 그래서 조우 틱(기본 10초) 하나는 NAS 규모에서 1ms 안팎으로 본다(Assumed — 나라 찾기·`forEachUnit` 몫은 따로 재지 않음. 실제 값은 배포 뒤 1분 지표 `encounterScanMs`로 본다). 만남이 있을 때만 전투 몸(전력)·원장 짐 훑기·영토 시가지 묻기를 한다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/clash.ts`(새) | 띄운 2차맵 만남 찾기(칸 격자, 순수) |
| `apps/server/src/travel/clashDecide.ts`(새) | 편마다 회피·약탈·전투 판단, 공격 편 고르기, 몸 전력(순수) |
| `apps/server/src/travel/encounterArena.ts`·`encounterInit.ts`(새) | 실제 지형 조우 전투맵·자리·들어오는 변, 시작 자료(공격 편 = 편 1) |
| `apps/server/src/travel/afterEncounter.ts`(새) | 조우 뒤 다시 판단(순수 고르기 + 이동 명령) |
| `apps/server/src/travel/cargo.ts`(새) | 유닛 짐 있음·무게(원장 화물 위치) |
| `apps/server/src/travel/encounter.ts` | 좌표 유닛: 전쟁 짝 대신 나라별 편 모으기·짝 목록(1904) |
| `apps/server/src/travel/encounterWorld.ts` | 조우 틱(좌표·띄운 2차맵), 판단·시가지·멈춤·띄움·실제 지형 전투·다시 판단 예약, 설정 칸 읽기, 지표, 비탈 이웃 값 |
| `apps/server/src/travel/coordPace.ts` | 강·비탈(1903), 이웃 2차맵 키 |
| `apps/server/src/travel/service.ts`·`serviceParts.ts`·`serviceTypes.ts` | `haltOn`이 띄운 2차맵을 걷는 길도 멈추고 `HaltedTrip`을 돌려준다(986줄) |
| `apps/server/src/app.ts` | 1분 지표에 조우 지표(+1줄 → 992줄) |
| `apps/server/src/tuning/scope.ts` | `encounter.*` 서버가 읽는 경로 |
| `packages/sim/src/society/encounterCoefficients.ts`(새)·`coefficients.ts`·`index.ts` | 계수표 `encounter`(시뮬은 읽지 않음) |
| `packages/sim/src/tuningEncounter.ts`(새)·`tuning.ts`·`tuningPages.ts` | 설정 칸 12개 등록, 전투 코어 페이지 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 12개, 팩 core@120 |
| 시험: `travel/clash.test.ts`·`clashDecide.test.ts`·`encounterArena.test.ts`·`afterEncounter.test.ts`(새), `encounter.test.ts`·`encounterWorld.test.ts`·`coordPace.test.ts`·`service.test.ts` | 새 규칙 |
| `docs/adr/2026-11-15-unloaded-second-maps.md` | "바뀜 (D-570, 좌표 이동 3)" |
| `docs/questions/2026-11-16-map-coords-3.md`(새) | 2021~2038 |

## 함께 바꿔야 하는 파일
- 판: 팩 **core@120**(설정 칸 12개 — 다른 줄기 114~119와 겹치지 않음). 프로토콜·`SIM_VERSION` 그대로(WebSocket 메시지·결과 코드 바뀜 없음, 전투 판정은 있는 세계 전투, `packages/sim`은 계수표 칸만 더했고 판정은 읽지 않는다).
  - main(묶음 1116j)에서는 팩 **core@116**으로 합쳤다(`16-1200-batch-1116j-merge.md`).
- 마이그레이션 없음.
- 조우 상대 규칙을 바꾸면 `clash.ts`(띄운 2차맵)와 `encounter.ts`(좌표 유닛)를 같이 본다. 판단은 둘 다 `clashDecide.ts` 하나.
- 플레이어 행동 설정(질문 2021 다)이 생기면 `clashDecide.ts`의 `player` 분기와 설정 칸 `encounter_player_policy`를 그 설정으로 바꾼다.

## 건드리지 말 것
- `travel.holdMap` 붙잡기(띄운 2차맵 조우도) — 지우면 전투가 끝나기 전에 2차맵이 내려가 결과가 적용되지 않는다.
- 조우 쉬는 시간은 싸움을 열기 전에 건다(`open` 첫 줄) — 시가지·띄우기 실패로 돌아가도 같은 짝을 매 틱 다시 보지 않게.
- 판단하는 유닛 = 봇 아닌 종류(`DECIDER_KINDS`). 봇을 넣으면 NPC 시민이 지나가는 사람을 털고, 도시 2차맵마다 격자를 만든다(부하).

## 리셋 필요 여부
- **리셋 필요 없음.** 저장 모양(표·칸)이 그대로다. 새 설정 칸은 팩 값(없으면 계수표 출발값)으로 읽는다. 다시 판단 자료는 메모리라 배포 중이던 조우 전투의 멈춘 유닛은 그 자리에 선다(옛 동작과 같다). 가는 중인 좌표 길은 저장한 나타날 시각 그대로 잇고 강·비탈 배율은 다음 구간부터.

## 미검증·TODO·알려진 문제
- 실제 월드·DB·NPC 런타임에서 띄운 2차맵 조우 → 전투 → 다시 판단을 끝까지 돌린 시험은 없다(미실행 — 단위 시험은 가짜 월드 몫). 지금 세계에는 NPC 나라의 봇 아닌 전투 유닛이 거의 없고 플레이어는 기본 회피라 운영에서 실제 조우 전투는 드물다(Assumed). 운영자가 `encounter_player_policy`를 1로 켜면 플레이어끼리도 판단한다.
- 화면은 바꾸지 않았다(새 문구 없음 — 멈춘 까닭 `encounter`는 앞 줄기 문구). 그래서 화면 시험·빌드·`check:bundle`은 돌리지 않았다.
- 강·비탈 수치는 [임시](질문 2031·2032), 비탈 576m 기준은 Assumed.
- 채집 줄 유닛은 조우로 멈추면 줄이 끝난다(질문 2035).

## 사용자 결정 대기
- 질문 2021~2038(추천안으로 만듦). 특히 2021(플레이어 기본 회피 → 전쟁 중 플레이어끼리도 저절로 싸우지 않음).

## 검사 (Verified — 실행함, 공유 기계)
- `pnpm check`(TEST_DATABASE_URL, 잠금 안): 포맷·린트(타입 인식)·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 748파일 5,624개 모두 통과. 첫 번째 돌림은 린트 1개(`unbound-method`)·경고 3개(시험의 타입 단언 주석 자리)로 실패 → 고친 뒤 다시 돌려 통과.
- `pnpm check:content 2cc2edc`(호환 포함): core@120 통과.
- 이 줄기 시험만 따로: 서버 `travel/`·`tuning/` 20파일(DB 시험 3파일은 그때 건너뜀 — 전체 검사에서 DB와 함께 통과), sim `tuning*` 47개 통과.
- 화면 바뀜 없음 → `pnpm build`·`check:bundle`·화면 시험은 돌리지 않았다.

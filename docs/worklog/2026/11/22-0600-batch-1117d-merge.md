# 2026-11-22 묶음 1117d 합치기 (NPC 투자·가문 연맹 / NPC 계승·쿠데타 고침 / 유닛 일부러 치기·조약 어긴 나라 / 거래소 보증금 손질) — 리셋 필요 없음

- 일시: 2026-11-22 06:00~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0420-npc-invest-2`·`22-0440-gov-fix-2`·`22-0500-fixes-1117c`·`22-0520-escrow-fix`, 질문 `docs/questions/2026-11-22-npc-invest-2.md`(2561~2569)·
  `2026-11-22-gov-fix-2.md`(2571~2576)·`2026-11-22-fixes-1117c.md`(2581~2585)·`2026-11-22-escrow-fix.md`(2591~2594)·`2026-11-21-share-market-2.md`·`2026-11-21-gov-coup.md`(상태 줄),
  ADR `2026-11-21-npc-needs-drives.md`·`2026-11-21-share-market-2.md`·`2026-11-21-governance.md`·`2026-11-15-business-ledger.md`·`2026-11-21-diplomacy-treaties.md`·`2026-11-21-credit.md`·
  `2026-11-15-unloaded-second-maps.md`의 각 "바뀜" 절

## 한 일
- main 3c6fbcdd50(묶음 1117c 기록) 위에 네 줄기를 차례로 합쳤다(모두 바탕 3c6fbcdd50, 합치기 커밋 `--no-ff`).
  1. `work/npc-invest-2`(7842645abf): NPC 투자 판단을 짓기·레벨 올리기·구인 카드로 넓힘(시뮬 판정 바뀜), 가문 연맹 표·명령(`house_league`)·NPC 가문 연맹 판단·대표 투표,
     옛 연맹 기금 되돌리기, NPC 가문 지분 사기. 설정 칸 +2(`house_npc_league_found_score`·`house_npc_league_join_score`).
  2. `work/gov-fix-2`(7709c05279): NPC 지배 가문 계승, 독재 과반 도시마다(가장 낮은 도시), 도시 운영비 금고(원장 계정 `cityfund:…`), 쿠데타 고침(그 도시만 떨어져 나감·플레이어 가문 나라도
     대상·편든 쪽 병력은 어디서든). 프로토콜·팩·SIM 그대로. 줄기가 훅을 건너뛰고 시험 파일만 고친 뒤 전체 검사를 다시 돌리지 않았던 `governance3.db.test.ts`는 아래 전체 검사에서 통과.
  3. `work/fixes-1117c`(a3c7f0dc3e): 같은 나라 유저 유닛도 일부러 치는 명령(`unit_attack` → `travel_result`, 2543), 조약 어긴 나라 기록(`diplomacy_treaties.broken_by`)·세력 신뢰·제재 명분(2558).
     설정 칸 +3(`dip_breach_trust_penalty`·`dip_sanction_window_ms`·`dip_sanction_cause_bonus`). SIM 판정 그대로(선택 고리 `SimHooks.warDeclared`·`causeBonus`만).
  4. `work/escrow-fix`(d18fb6df6c): 운영 경고 "market escrow differs after restore"(물건 보증금)의 원인과 부팅 손질. 원인 = 광석 묶음 크기 바뀜(core@137) 전에 걸린 팔 주문이 새 묶음 크기로
     되살아나 메모리 검사가 어긋나고, 그 주문이 취소·체결되면 묶은 양의 10배(잡석·석재 1만 배)를 옮겨 물건이 생긴다. 고침:
     - 켤 때(`market/books.ts`) 팔 주문 줄의 `locked`가 남은 묶음 × 지금 묶음 크기와 다르면 되살리지 않고 **저장된 `locked` 그대로** 주인에게 돌려준 뒤 취소로 끝낸다.
     - 그 뒤에도 물건 보증금 ≠ 걸린 팔 주문 합이면 차이를 시스템 계정 `reconcile:escrow:<물건>`과 맞바꾼다(`market/escrowRepair.ts`, 거래 종류 `escrow_reconcile`). 멱등 — 맞춘 뒤 다시 켜면 아무것도 안 한다.
     - 서버 기록 경고 한 줄 "market escrow repaired after restore"(돌려준 주문 수·물건 합·맞춘 거래소 수). 돈 보증금은 손대지 않는다(경고만 그대로).
     - 체결 알림·이용료 고리가 던져도 주문 줄 쓰기는 `finally`에서 한다(원인 후보 다). 프로토콜·팩·SIM·마이그레이션 바뀜 없음(`goodsMarket.ts`에 `goodsEscrowCode` 내보내기만 — 동작 그대로).
- 손으로 푼 충돌: `docs/WORKLOG.md`(매번 `pnpm docs:index`로 다시 만듦), ADR `2026-11-21-share-market-2.md`(npc-invest-2·gov-fix-2 "바뀜" 절을 차례로), 질문 `2026-11-21-share-market-2.md` 상태 줄(둘 다),
  질문 `2026-11-21-gov-coup.md` 상태 줄(fixes-1117c의 "2543 고침" 표시 + gov-fix-2의 답 줄), `content/core/manifest.json`, `packages/protocol/src/version.ts`(64 절 하나에 두 줄기).
  `cityShares/service.ts`·`governance/port.ts`·`npc/rulingVault.ts`·`content/core/tuning.json`·메시지 ko·en은 저절로 합쳐졌다.
- 겹치는 길(코드 읽기, Assumed 문제 없음): NPC 가문 지분 사기(`cityShares/port.ts npcHouses`)는 `cityHouses.controlOf(나라) === "npc"`인 나라의 도시 가문만 보고 이윤 성향은 각 가문의 가문장(`headOf`)에서
  읽는다. gov-fix-2 계승은 지배 가문장을 `setRuling` 셋째 칸으로 바꿀 뿐 도시 가문 목록·가문장은 그대로다. fixes-1117c의 의결 선전포고 한 줄(`governance/port.ts declareWar` → 위반 장부)과 gov-fix-2의
  `applyRuling` 바꿈은 다른 함수다. 네 줄기의 시험이 한 나무에서 함께 통과했다(아래).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 63(최소 62) | npc-invest-2 103/102, fixes-1117c 123/122, 나머지 그대로 | **64(최소 63)** — 두 줄기를 한 판에. `HOUSE_LEAGUE_PROTOCOL_VERSION`·`UNIT_ATTACK_PROTOCOL_VERSION` = 64 |
| 팩 core | 141 | npc-invest-2 181, fixes-1117c 201, 나머지 그대로 | **142** |
| SIM_VERSION | 72 | npc-invest-2 112, 나머지 그대로 | **73** |

- 프로토콜: `version.ts` 64 절에 두 줄기(줄기 판은 괄호), 최소 63. 시험 `toBe(64)` + `PROTOCOL_VERSION ≥`(`travel.test.ts`, 새 `league.test.ts` — 가문 연맹 메시지 시험이 없어 판·왕복·가문 열쇠 꼴을 더함).
  코드 주석의 "프로토콜 123"(`UnitAttack.tsx`·`travelCommands.ts`·`travelData.ts`·`travel/gateway.ts`·`session.ts`·`travel.ts`)도 64로.
- 팩: `manifest.json` 142. `tuning.json`은 npc-invest-2 +2, fixes-1117c +3. `id-changes.json` 안 건드림.
- SIM: `sim/version.ts` 73 절(줄기 판 112는 괄호). gov-fix-2의 시뮬 쪽(`residentTax.ts` 도시 금고, `cityIndependence` coup 인수)과 fixes-1117c의 선택 고리는 시뮬 판정에 닿지 않는다 —
  네 줄기를 합친 나무에서 `@terra/sim` 골든이 그대로 통과해 골든을 다시 만들지 않았다(Verified: 전체 검사).
- ADR 판 줄을 묶음 판으로(줄기 판은 괄호): `2026-11-21-npc-needs-drives.md` 제목·절 제목, `2026-11-21-diplomacy-treaties.md`·`2026-11-21-credit.md`·`2026-11-15-unloaded-second-maps.md`의
  fixes-1117c 판 줄, 질문 `2026-11-22-npc-invest-2.md` 표. 줄기 작업 기록은 줄기 판 그대로 두었다.

## 마이그레이션
- 형제 갈래 셋, 모두 prevIds = `1e0baccb…`, 겹치는 대상 없음 — 그대로 합쳤다(고치지 않음):
  - `20261121191854_house_leagues`(스냅숏 `7fd1b408-df42-4c3e-8eca-54ca7f942491`) — 새 표 셋(`house_leagues`·`house_league_members`·`house_league_votes`).
  - `20261121193105_treaty_breaker`(스냅숏 `1b52711f-f437-4ebf-975f-5a44f622f2ac`) — `diplomacy_treaties.broken_by` bigint(null 허용).
  - `20261121193646_gov_fix2_npc_head`(스냅숏 `8279a039-89b4-4d54-b4be-e0486d58e334`) — `governance_state.npc_head_unit_id` bigint(null 허용).
- `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified, 네 줄기를 다 합친 뒤).
- 다음 마이그레이션 `prevIds` = 끝 셋 **7fd1b408-df42-4c3e-8eca-54ca7f942491**, **1b52711f-f437-4ebf-975f-5a44f622f2ac**, **8279a039-89b4-4d54-b4be-e0486d58e334**.

## 질문 번호
- 2561~2569·2571~2576·2581~2585·2591~2594 — main(2560까지)과도 서로도 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표와 null 허용 칸 둘뿐이다. 프로토콜은 더하기만이고 최소 63이라 63판 기기는 그대로 들어온다(연맹 명령·유닛 공격만 못 보냄).
- 켤 때 한 번씩 도는 것: 옛 연맹 기금 되돌리기(멱등, `leagueRefund.ts`), 거래소 보증금 손질(멱등 — 옛 묶음 크기 팔 주문 돌려주기, 남은 차이 맞추기, 경고 한 줄).
  NPC 나라 빈자리가 있으면 첫 틱에 그 가문원이 잇는다. 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0). 조약 위반 기록은 이 판부터 적는다(옛 위반 조약의 어긴 쪽은 null).

## 파일 크기 — 나눈 파일 하나
- `apps/server/src/session.ts`: npc-invest-2(+가문 연맹 판 고르기)와 fixes-1117c(+유닛 공격)가 둘 다 늘려 합친 뒤 **998줄**. 가문 소켓으로 가는 여덟 case 묶음(가문 창설·나라 세금·가문 가입·가문 도시·
  구인·의결·지분/조약/연맹)을 한 case로 모으고, 판 문턱(`houseMessageNeed` — 메시지마다 표, 묶음 판은 `Math.max`로 옛 조건과 같게)과 준비 전 busy 답(`houseBusyReply`)을 새
  `apps/server/src/sessionHouse.ts`(161줄)로 덜어 냈다. 동작 그대로(같은 판 문턱·같은 결과 메시지), 시험 `sessionHouse.test.ts`. session.ts **851줄**.
- 그 밖에 넘은 파일 없음. 큰 파일: `sim/simulator/society.ts` 999·`app.ts` 999·`npc/runtime.ts` 998·`sim/src/index.ts` **997**(escrow-fix +1)·`world/persist/tables.ts` 997·
  `npc/economy.ts` 993·`governance/service.ts` 974.

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `league.ts`, `travel.ts`, `travel.test.ts`, 새 `league.test.ts` | 프로토콜 64(최소 63) |
| `apps/game/src/map/UnitAttack.tsx`·`travelCommands.ts`·`travelData.ts`, `apps/server/src/travel/gateway.ts` | 주석의 판 번호 |
| `apps/server/src/session.ts`, 새 `apps/server/src/sessionHouse.ts`·`sessionHouse.test.ts` | 1,000줄 상한 — 가문 소켓 판 고르기 덜어 냄 |
| `content/core/manifest.json` | 팩 core@142 |
| `packages/sim/src/version.ts` | SIM_VERSION 73 |
| ADR `2026-11-21-npc-needs-drives.md`·`2026-11-21-diplomacy-treaties.md`·`2026-11-21-credit.md`·`2026-11-15-unloaded-second-maps.md`, 질문 `2026-11-22-npc-invest-2.md` | 판 줄 |
| ADR `2026-11-21-share-market-2.md`, 질문 `2026-11-21-share-market-2.md`·`2026-11-21-gov-coup.md` | 줄기 절·상태 줄 합치기 |
| `docs/worklog/2026/11/22-0340-batch-1117c-merge.md` | 1117c 배포 확인(배포 절) |
| `docs/worklog/2026/11/22-0600-batch-1117d-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 65(최소 64), 팩 143, SIM 74. 다음 마이그레이션 `prevIds` = 끝 셋(위).
- 가문 소켓으로 가는 새 메시지는 `session.ts` case 목록과 `sessionHouse.ts`(`HOUSE_SOCKET_TYPES`·판 표·busy 답)에 함께 넣는다(표가 `Record`라 빠지면 타입 검사가 막는다).
- `society.ts`(999)·`app.ts`(999)·`npc/runtime.ts`(998)·`sim/src/index.ts`(997)·`tables.ts`(997)·`npc/economy.ts`(993)를 늘리면 새 모듈로 나눈다.

## 건드리지 말 것
- 마이그레이션 `20261121191854_house_leagues`·`20261121193105_treaty_breaker`·`20261121193646_gov_fix2_npc_head`(이제 올라간다 — 고치지 않는다).
- 시뮬 판정: `cityIndependence`의 `coup` 인수·도시 금고·`SimHooks.warDeclared`·`causeBonus`는 시뮬이 붙이지 않는다.
- 거래소 보증금 손질(`escrowRepair.ts`)은 돈 보증금을 건드리지 않는다.

## 검사 (Verified)
- 네 줄기를 다 합치고 판 손질·session.ts 나누기를 한 뒤 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷(3,364파일)·린트·타입·모듈 경계·파일 크기·다국어(8,908키)·
  디자인 값(746쌍)·콘텐츠(core@142 bd30757c68f4) 통과, 시험 파일 **885/885**, 시험 **6,321/6,321**(건너뜀 0, `@terra/sim` 골든 포함). escrow-fix 줄기에서 부하로 흔들렸던 DB 시험
  (`cyborg.db`·`facilities.db`·`nationTiers.db`)은 이번에 흔들리지 않았다.
  (앞서 두 줄기만 합친 나무에서도 한 번 돌았다: 882/882·6,306/6,306 — 그 뒤 두 줄기가 더해져 위 결과가 최종.)
- `pnpm check:content origin/main`(호환 포함, core@142 bd30757c68f4, 단계 1·2·4a·4b 기준 3c6fbcd), `pnpm check:docs`, `pnpm docs:index --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm settings:cells --check`, `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 257항목), `pnpm check:bundle` 첫 화면 JS **110,785 B** / 상한 131,416 B(1117c 110,778 B에서 +7 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번, 31.3분): `governance.spec.ts` **6/6**, `faction.spec.ts` **28/28**, `share-market.spec.ts` **9/9**, `diplomacy.spec.ts` **6/6**, `unit-control.spec.ts` **20/21** —
  합 **69/70**. 실패 1 = "지도에서 남의 유닛을 누르면 정보 판(고르지 않음), 내 유닛이 이 맵에 없으면 땅을 눌러도 판만 닫고 보내지 않는다"(땅 누르기 고리에서 `view_only`가 오지 않아
  `expect(viewOnly).toBe(true)` 실패). fixes-1117c 줄기가 main 3c6fbcdd50에서도 똑같이 실패함을 확인한 것(2026-11-15 뒤로 이어진 문제)이라 이 묶음에서 고치지 않았다 — 다시 돌리지 않음.
  (앞서 두 줄기만 합친 나무에서 governance·faction·share-market 43/43.) 결과 폴더는 지웠다.

## 미검증·알려진 문제
- npc-invest-2: 연맹 화면 없음(명령·조회만), 들기 절차·투표 규칙 [임시](2561·2562), 군사 카드 투자 길은 단위 시험만(시나리오 경비대 0).
- gov-fix-2: 플레이어 가문 나라 쿠데타는 단위 시험(가짜 포트)만, 쿠데타 병력 고르기 화면 없음(2571).
- fixes-1117c: 신뢰가 오르는 길 없음(2583), 선포 비용 그대로(2585).
- escrow-fix: 운영 DB를 보지 않아 19:18 재시작에서 새로 생긴 시장들의 원인은 Unknown — 이 판을 켠 뒤 "market escrow repaired after restore" 줄(손질한 거래소·잔고·묶음 크기)로 가린다. 두 번째 재시작부터는
  두 경고 모두 없어야 한다. 이미 생긴 물건은 받은 쪽에 남는다(2593).
- 운영 DB 적용은 배포 때 확인.

## 사용자 결정 대기
- 질문 2561~2569(npc-invest-2), 2571~2576(gov-fix-2), 2581~2585(fixes-1117c), 2591~2594(escrow-fix), 그리고 1117c 기록의 대기 목록(2541~2560 …).

## 배포 (Verified)

- CI `ci` 391 성공(main `f8d26305db`, 22:08~22:11 UTC). 앱 컨테이너 22:10:46 UTC 시작, 이미지 `sha-f8d26305db08`, 팩 core@142(nas-metrics 94, 22:37 UTC, 창 35분, 재시작 뒤 26분).
- 마이그레이션 오류 줄 없음, dbFailures 0(26줄 모두). 적용 줄은 로그에 없어 직접 확인 못 함(Unknown).
- 보증금 부팅 손질 1회: "market escrow repaired after restore" — relottedOrders 0(옛 묶음 크기 주문은 이미 모두 끝나 있었음), adjustedMarkets 84(로그 상세 50곳: 잡석 29·돌 13·구리 광석 6·철 광석 2, 50곳 중 41곳이 보증금 음수 = 옛 묶음 주문이 끝날 때 더 풀려나간 몫, 가장 큰 차이 시장 189 잡석 −499,950g). 모자란 몫은 정산 계정 `reconcile:escrow:<asset>`에서 채움. "market escrow differs after restore" 경고는 사라짐(0건). 연맹 기금 반환 줄은 없음(돌려줄 기금 없음으로 봄, Assumed).
- RSS 579.1~598.6MB(26분 +15MB, 끝 10분 596.8~598.6으로 평평해짐), 루프 p99 1.0~1.7ms(첫 분 6.4), 최대 6.5~53.5ms(첫 분 230.2), DB 커밋 최대 205~494ms(첫 분 609), 기기 오류 0.
- NPC: 휴먼 2,098, 세력 16, 도시 49, 건물 1,041, npcNextDecideMin 41.2 → 16.2(이어짐).

# NPC 투자 판단 넓히기(짓기·레벨 올리기·구인 카드)·가문 연맹 저장·명령·NPC 가문 연맹·투표·옛 기금 되돌리기·NPC 가문 지분 사기

- 일시: 2026-11-22 04:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-npc-needs-drives.md` "바뀜 (npc-invest-2)", `docs/adr/2026-11-21-share-market-2.md` "바뀜 (npc-invest-2)", 질문 `docs/questions/2026-11-22-league-fix.md`
  (2502·2503·2505·2506·2508 상태 갱신)·`2026-11-21-share-market-2.md`(2521·2522·2524·2525·2527·2529·2530)·`2026-11-22-stone-balance.md`(2511 가)·새 질문 `docs/questions/2026-11-22-npc-invest-2.md`
  (2561~2569). 줄기 판: SIM_VERSION **112**, 팩 core **181**, 프로토콜 **103**(받는 가장 낮은 판 **102**) — 묶음이 다시 매긴다. 바탕 main `8fc76aee7c`, 중간에 main `3c6fbcdd50`(1117c)을 합침.

## 한 일
1. **2508 나 + 다 — 투자 판단 넓히기(판정 바뀜)**: 연구에만 있던 틀(비용 몫·수요·자본 도전 굴림)을 시설 짓기·레벨 올리기·구인 카드에도 붙였다. 도전 확률에 성향 배율(500~1500‰)을 곱한다
   (군사 카드 = 공격 성향, 짓기·일꾼 카드 = 상업 성향). 굴림 흐름 11에서 둘째 = 구인, 셋째 = 짓기(첫째 연구는 옛 값 그대로). 시뮬·서버가 같은 함수(`decide`·`recruitPolicy`·`buildPolicy`).
2. **2502 — 연맹 저장·명령·NPC 가문**: 표 셋(마이그레이션 `20261121191854_house_leagues`), 서비스(`leagueService.ts`), 표 읽기·쓰기(`leagueStore.ts`), 명령 `house_league`(found·join·leave·delegate·vote)
   → `house_league_result`(가문·의결·지분·조약 소켓에 하나 더 묶음 — `leagueGateway.ts withLeagues`), 조회 tRPC `factionIdentity.leagues`. NPC 가문 판단(`npcLeague.ts`) 한 시간마다. 들기 절차는 [임시]
   (가문장이 고르면 바로) — 질문 2561.
3. **2522 나 — NPC 가문 지분 사기**: `npcBuyOrders`에 NPC 가문(가문 금고·이윤 성향 배율), 포트 `npcHouses`. 2522 다·라는 기술 기본값(제 나라 먼저 아님, 꼴은 나라와 같음).
4. **2503 — 투표로 대표 바꾸기**: `voteHouseLeague`·`electHouseLeague`([임시] 든 가문 과반, NPC는 표 없음) — 질문 2562.
5. **2505 나 — 옛 기금 되돌리기**: `leagueRefund.ts`(켤 때 한 번, 원장 균형, 멱등, 기록 없는 기금은 남김) + DB 시험.
6. **기술 기본값 기록**: 2506 가(코드 확인 — `stewardExemption`이 남의 시설 열린 임금형 계약을 누가 맺었든 본다), 2511 가, 2521 가, 2524 가, 2527 가, 2529 가, 2530 가, 2525 가(국고 지분 사기는 그 도시
   나라 화폐 — `buyCheck`·`approvedBuy`가 `port.currencyOf` 사용, 코드 확인). 코드 안 바꿈.

## 시뮬 전·후 (Verified — 실행, 30일, main `8fc76aee7c` 판 72 → 줄기)
| 시나리오 시드 | 새 건물 | 레벨 올리기 | 모듈 | 구인 | 연구 | 기술 오름 | 도시 | 휴먼 | 위반 |
|---|---|---|---|---|---|---|---|---|---|
| econ16 1 | 918 → 914 | 579 → 574 | 815 → 833 | 1,955 → 2,036 | 24 → 22 | 22 → 22 | 78 → 77 | 2,340 → 2,421 | 0 → 0 |
| econ16 2 | 862 → 864 | 520 → 498 | 760 → 745 | 2,135 → 2,192 | 23 → 21 | 21 → 20 | 78 → 79 | 2,572 → 2,629 | 0 → 0 |
| econ16 3 | 903 → 931 | 555 → 470 | 808 → 768 | 1,898 → 1,899 | 22 → 22 | 19 → 21 | 86 → 86 | 2,295 → 2,296 | 0 → 0 |
| build16u 1 | 721 → 704 | 252 → 206 | 550 → 533 | 1,267 → 1,231 | 26 → 27 | 22 → 22 | 72 → 74 | 1,652 → 1,616 | 0 → 0 |

- 새 건물 ±3%. 10% 넘게 바뀐 것은 레벨 올리기 econ16 시드 3(−15%)·build16u(−18%) — 그 도시에서 처음 다다르는 레벨이 도전 굴림에 걸린 몫(ADR 표 아래 설명, 질문 2564). 첫 시도(자리가 남는 올리기를
  모두 도전으로)는 −18~−41%라 "이미 다다른 레벨까지는 수요"로 좁혔다. 경비대 채우기는 네 실행 모두 0(시나리오 등급 값 0) — 군사 카드 길은 단위 시험만.
- 기준 실행은 main 판 그대로 따로 꺼낸 작업 트리에서 돌렸다(줄기 코드가 섞이지 않게).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/invest.ts`·`invest.test.ts` | 성향 배율·성향 곱한 도전 확률·투자 문(`investTemperPm`·`investTemperedChallengePm`·`investGate`) |
| `packages/sim/src/npc/build.ts`·`build.test.ts` | 짓기 후보 비용 몫·도전(rules.invest), 레벨 올리기 수요 `upgradeDemand` |
| `packages/sim/src/npc/policy.ts`·`policy.test.ts` | 구인 카드 투자 판단(invest) |
| `packages/sim/src/simulator/npcBuild.ts` | 재료 값 `materialsValue`, 짓기 invest·레벨 올리기 도전 |
| `packages/sim/src/simulator/npcRun.ts` | 판단 하나의 투자 굴림 셋(`investRollsOf`), 구인·짓기에 넘김 |
| `packages/sim/src/version.ts` | SIM_VERSION 72 → 112(줄기 판) |
| `packages/sim/src/society/coefficients.ts`, `tuningHouse.ts`, `content/core/tuning.json`, `manifest.json` | 설정 칸 `house_npc_league_found_score`·`house_npc_league_join_score`(+2), 팩 181 |
| `apps/server/src/db/leagueSchema.ts`·`schema.ts`, `drizzle/20261121191854_house_leagues/` | 연맹 표 셋 |
| `apps/server/src/factionIdentity/{houseLeague,leagueStore,leagueService,leagueGateway,npcLeague,leagueRefund}.ts`(+시험) | 연맹 규칙(투표)·저장·명령·소켓·NPC 판단·옛 기금 되돌리기 |
| `apps/server/src/factionIdentity/{attach,rules,services}.ts`, `apps/server/src/trpc/factionIdentity.ts` | 연결(소켓 묶기·NPC 타이머·되돌리기 한 번), 문턱 규칙, 조회 |
| `apps/server/src/session.ts` | `house_league` 받기(지분·조약과 같은 칸) |
| `apps/server/src/npc/runtime.ts` | `unitTraits`(가문장 성향) 내보냄 — 줄 수 그대로(998, 주석 두 줄 합침) |
| `apps/server/src/cityShares/{npcTrade,port,service}.ts`·`npcTrade.test.ts` | NPC 가문 지분 사기 |
| `packages/protocol/src/league.ts`·`messages.ts`·`index.ts`·`version.ts` | `house_league`·`house_league_result`, 판 103/102 |
| 문서(ADR 두 "바뀜", 질문 상태 셋, 새 질문) | 결정·질문 |

## 함께 바꿔야 하는 파일
- 합칠 때 판 다시 매기기: `packages/protocol/src/version.ts`(103·102), `league.ts HOUSE_LEAGUE_PROTOCOL_VERSION`(103), `packages/sim/src/version.ts`(112 절), `content/core/manifest.json`(181).
- 마이그레이션 prevIds = main 끝 `1e0baccb-fd0f-4de9-b479-ad67274e5a40`. 그 사이 main에 새 마이그레이션이 들어오면 갈래로 그대로 합친다(다시 만들지 않는다).
- 질문 번호 2561~2569가 main과 겹치면 옮긴다(질문 파일·ADR·코드 주석).

## 건드리지 말 것
- 연구 투자 판단의 첫 굴림(흐름 11 첫 값) — 바꾸면 연구 결과가 또 바뀐다.
- 연맹에 효과(우호 기능)를 지어 붙이지 않는다(질문 2501).
- `apps/server/src/governance/*`(다른 줄기).

## 미검증·TODO·알려진 문제
- 연맹 화면 없음(명령·조회만) — 다음 줄기. 메시지 키도 없다.
- 서버 실제 세계의 NPC 짓기·구인 변화, NPC 연맹 수, NPC 가문 지분 사기 쌓임은 재지 않았다(Unknown).
- 옛 기금 되돌리기는 운영 DB에서 돌리지 않았다(DB 시험만). 기록이 없는 기금은 남는다(질문 2567).
- 연맹 줄은 가문이 사라져도 남는다(질문 2568).

## 검사 (Verified — 실행함)
- 작업 중: 시뮬 꾸러미 시험 129파일 1,082 통과, 서버 연맹·지분 시험(`leagueService.db`·`leagueRefund.db`·`houseLeague`·`cityShares/*`), 서버·게임 타입 검사.
- 끝에 전체 `TEST_DATABASE_URL=… pnpm check`(잠금 안) 한 번: 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠(core@181) 통과, 시험 파일 **878/878**, 시험 **6,291/6,291**.
  (앞 두 번은 게임 `mapFeed.ts`의 서버 메시지 걸러내기에 `house_league_result`가 빠진 것과 린트 경고로 실패 — 고친 뒤 통과.)
- `pnpm check:content`(호환 포함), `pnpm check:docs`, `pnpm --filter @terra/server db:generate` = "No schema changes", `pnpm docs:index`.
- 화면 시험·빌드는 돌리지 않았다(게임 화면을 바꾸지 않았다 — `mapFeed.ts` 걸러내기 한 줄뿐).

## 사용자 결정 대기
- `docs/questions/2026-11-22-npc-invest-2.md` 2561~2569, 앞 질문 2501·2504·2507, 2523·2526·2528.

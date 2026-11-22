# 2026-11-22 묶음 1117e 합치기 (NPC 투자 기대 수익·연맹 표 / 쿠데타·일부러 치기 회피·명분 선포·금고 화폐·선포 저장 / 유닛 조작 화면 시험) — 리셋 필요 없음

- 일시: 2026-11-22 08:25~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0750-npc-fix-3`·`22-0740-gov-fix-3`·`22-0740-unit-control-fix`, 질문 `docs/questions/2026-11-22-npc-fix-3.md`(2601~2604)·`2026-11-22-gov-fix-3.md`(2611~2614)와
  상태 줄(`2026-11-22-npc-invest-2.md`·`2026-11-22-gov-fix-2.md`·`2026-11-22-fixes-1117c.md`·`2026-11-22-escrow-fix.md`), ADR `2026-11-21-npc-needs-drives.md`·`2026-11-21-governance.md`·
  `2026-11-21-diplomacy-treaties.md`·`2026-11-15-business-ledger.md`·`2026-11-15-unloaded-second-maps.md`의 각 "바뀜" 절

## 한 일
- main f8d26305db(묶음 1117d 기록) 위에 세 줄기를 차례로 합쳤다(모두 바탕 f8d26305db, 합치기 커밋 `--no-ff`).
  1. `work/npc-fix-3`(79fb674d6f): NPC 투자 판단에 기대 수익·유지비(`npc/invest.ts`, 새 `simulator/npcReturn.ts` — 시뮬 판정 바뀜), NPC 가문 연맹 표·나가기·사라진 가문 빼기,
     투표 기간·정족수(`leagueService.ts npcSweep` 꼴 `{ houses, liveNpcHouses }` → `{ joined, left, votes, pruned }`). 설정 칸 +7. 프로토콜·마이그레이션 없음.
  2. `work/gov-fix-3`(c153f6e3ce): 쿠데타로 떨어져 나간 도시는 시작 도시 표시를 잃음, 일부러 치기(`unit_attack`)의 수비 편 회피(`travel/clashDecide.ts resolveStrike`, 결과 코드 `escaped`),
     명분 있는 선포는 비용 없음(NPC 고리 `SimHooks.warCause`·의결 `warCauseOf`), 나라 화폐가 바뀐 도시 금고 옮기기(켤 때 `npc/cityFundFx.ts`), 선출 뒤 계승 기록 유지,
     선포 기록 저장(새 표 `diplomacy_declarations`). 팩·SIM 그대로.
  3. `work/unit-control-fix`(4798827b1f): 화면 시험만(`e2e/unit-control.spec.ts` — 시간 상한 150초, 땅 자리 10개, 건물 판 닫기 `dispatchEvent`). 제품 회귀가 아니었다.
     **기록 바로잡기**: 1117c·1117d 기록의 "마지막 통과 2026-11-15"는 틀렸다. 실제 마지막 통과는 `938601280c`(2026-11-21, 작업 기록 `21-2000-e2e-tap-size-peek-line`, 27/27)다.
- 손으로 푼 충돌: `docs/WORKLOG.md`만(매번 `pnpm docs:index`로 다시 만듦). 두 줄기가 함께 바꾼 `packages/sim/src/simulator/npcRun.ts`(npc-fix-3 일꾼 카드 문 + gov-fix-3 `warCause` 고리)는 저절로 합쳐졌다.
- 합친 나무에서 흔들린 시험 하나를 고쳤다(시험만): `apps/server/src/diplomacy/diplomacy.db.test.ts` "선포 기록은 다시 켜도 남아 어긴 나라를 안다(2582)…". 다시 켤 때 `boot()`가 NPC 틱 넷을 먼저
  돌리는데, 그때는 지도자 나라 고리(`attach` — NPC가 지도자 나라에 강화를 맺지 않게 하는 `nationLocked`)가 아직 없다. 세계 시드가 무작위라(`npc/runtime.ts` — 새 DB면 `randomInt`) 시드에 따라
  NPC 강화가 그 사이 전쟁을 끝내 `wars.has(...)` 단언이 실패했다(Verified: 줄기 gov-fix-3 끝 `c153f6e3ce`에서도 같은 실패를 재현, 디버그 줄로 둘째 틱의 강화·불가침 확인 — 디버그 줄은 지움).
  다시 켜는 `boot(0)`은 틱을 돌리지 않는다. 고친 뒤 그 파일 3번 연속 3/3.

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 64(최소 63) | gov-fix-3 114/113, 나머지 그대로 | **65(최소 64)** — `UNIT_ATTACK_ESCAPE_PROTOCOL_VERSION` = 65 |
| 팩 core | 142 | npc-fix-3 182, 나머지 그대로 | **143** |
| SIM_VERSION | 73 | npc-fix-3 113, gov-fix-3 그대로 73 | **74** |

- 프로토콜: `version.ts` 65 절(줄기 판 괄호)·최소 64·지원 줄, `travel.ts` 상수·결과 코드 주석, 시험 `toBe(65)` + `PROTOCOL_VERSION ≥`(`travel.test.ts`). 코드 주석의 "프로토콜 114"
  (`travel/gateway.ts`·`travel/encounterWorld.ts`·`apps/game/src/map/travelData.ts`)도 65로.
- 팩: `manifest.json` 143. `tuning.json`은 npc-fix-3 +7. `id-changes.json` 안 건드림.
- SIM: `sim/version.ts` 74 절(줄기 판 113은 괄호). gov-fix-3의 시뮬 쪽(`declareWar`의 `caused`, `SimHooks.warCause`, `convertCityFunds`, `SimCity.start` 쓰기)은 시뮬이 붙이지 않는다 —
  두 줄기를 합친 나무에서 `@terra/sim` 골든이 그대로 통과해(npc-fix-3도 골든 파일을 바꾸지 않았다) 골든을 다시 만들지 않았다(Verified: `pnpm vitest run packages/sim packages/protocol` 166파일 1,304 통과, 그리고 전체 검사).
- ADR 판 줄을 묶음 판으로(줄기 판은 괄호): `2026-11-21-npc-needs-drives.md` "바뀜 (npc-fix-3)" 제목·절 제목, `2026-11-15-unloaded-second-maps.md`의 gov-fix-3 프로토콜 줄.
  줄기 작업 기록·질문 파일은 줄기 판 그대로 두었다.

## 마이그레이션
- 새 마이그레이션은 gov-fix-3의 하나뿐: `20261121223106_gov_fix3_declarations`(스냅숏 `7e79264e-c94f-43c1-b1a3-9e2f1ba61755`, prevIds = 1117d 끝 셋 `8279a039…`·`1b52711f…`·`7fd1b408…`) —
  새 표 `diplomacy_declarations` 하나(세력 FK cascade). 고치지 않고 그대로 합쳤다.
- `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified, 세 줄기를 다 합친 뒤).
- 다음 마이그레이션 `prevIds` = **7e79264e-c94f-43c1-b1a3-9e2f1ba61755**.

## 질문 번호
- 2601~2604·2611~2614 — main(2594까지)과도 서로도 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표 하나뿐이다(직전 판 앱은 모른 채 돈다). 프로토콜은 더하기만이고 최소 64라 64판 기기는 그대로 들어온다(`escaped` 대신 `out_of_reach`를 받음).
- 켤 때 한 번 도는 것: 지금 화폐가 아닌 도시 금고 옮기기(없으면 아무것도 안 함, 서버 기록 한 줄). 선포 기록은 이 판부터 쓴다(옛 선포는 모른다). NPC 연맹 빼기 타이머는 한 시간마다.

## 파일 크기 — 나눈 파일 없음
- 넘은 파일 없음(`pnpm check:size` 통과 — 이 검사는 끝 빈 줄까지 세어 `wc -l`보다 1 많다). 검사 값으로 큰 파일: `app.ts` 1000·`sim/simulator/society.ts` 1000·`facilities/service.ts` 1000·
  `npc/runtime.ts` 999·`world/world.ts` 999·`engine/secondMapEngine.ts` 999·`labor/service.ts` 998·`world/persist/tables.ts` 998·`sim/src/index.ts` 998·`npc/economy.ts` 997·
  `shared/battleReport.ts` 996. `npcBuild.ts`는 891(`wc -l`). 위 파일은 한 줄도 더 늘리면 안 된다 — 다음 줄기는 새 모듈로 나눈다.

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `travel.ts`, `travel.test.ts` | 프로토콜 65(최소 64) |
| `apps/server/src/travel/gateway.ts`·`encounterWorld.ts`, `apps/game/src/map/travelData.ts` | 주석의 판 번호 |
| `content/core/manifest.json` | 팩 core@143 |
| `packages/sim/src/version.ts` | SIM_VERSION 74 |
| ADR `2026-11-21-npc-needs-drives.md`·`2026-11-15-unloaded-second-maps.md` | 판 줄 |
| `apps/server/src/diplomacy/diplomacy.db.test.ts` | 다시 켜기 시험이 세계 시드에 따라 흔들리지 않게(위) |
| `docs/worklog/2026/11/22-0600-batch-1117d-merge.md` | 1117d 배포 확인(배포 절) |
| `docs/worklog/2026/11/22-0825-batch-1117e-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 66(최소 65), 팩 144, SIM 75. 다음 마이그레이션 `prevIds` = `7e79264e-c94f-43c1-b1a3-9e2f1ba61755`.
- `npcSweep`을 부르는 새 코드는 새 꼴(`{ joined, left, votes, pruned }`)에 맞춘다.
- `diplomacy.db.test.ts`에 다시 켜는 시험을 더하면 `boot(0)`을 쓴다(지도자 고리 전 NPC 틱이 전쟁·조약을 바꿀 수 있다).

## 건드리지 말 것
- 마이그레이션 `20261121223106_gov_fix3_declarations`(이제 올라간다 — 고치지 않는다).
- 시뮬 판정: `SimHooks.warCause`·`declareWar`의 `caused`·`convertCityFunds`·`SimCity.start` 쓰기는 시뮬이 붙이지 않는다. 투자 굴림 흐름(STREAM_INVEST 11)과 차례.
- 화면 시험 `unit-control.spec.ts`의 기대값(`view_only`, 판 닫힘, `move_unit` 0개).

## 검사 (Verified)
- 세 줄기를 다 합치고 판 손질을 한 뒤 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 첫 판: 시험 파일 887/888·시험 6,350/6,351 — 실패 1 = 위 `diplomacy.db.test.ts` 다시 켜기 시험
  (따로 돌려도 재현, 줄기 끝에서도 재현). 시험을 고친 뒤 전체 `pnpm check` 둘째 판 **통과**: 포맷(3,369파일)·린트·타입·모듈 경계·파일 크기·다국어(8,909키)·디자인 값(746쌍)·
  콘텐츠(core@143 b4fca593700f), 시험 파일 **888/888**, 시험 **6,351/6,351**(`@terra/sim` 골든 포함).
- `pnpm check:content`(호환 포함, core@143 b4fca593700f, 단계 1·2·4a·4b 기준 f8d2630), `pnpm check:docs`, `pnpm docs:index --check`, `pnpm wiki:index --check`(항목 40개), `pnpm settings:cells --check`,
  `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 257항목), `pnpm check:bundle` 첫 화면 JS **110,771 B** / 상한 131,416 B(1117d 110,785 B에서 −14 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번에 세 파일, 19.1분): `unit-control.spec.ts` **21/21**(1117d에서 실패한 "내 유닛이 이 맵에 없으면 땅을 눌러도 보내지 않는다" 통과 — unit-control-fix),
  `diplomacy.spec.ts` **6/6**, `governance.spec.ts` **6/6** — 합 **33/33**. 흔들림·다시 돌림 없음. 결과 폴더는 지웠다.

## 미검증·알려진 문제
- npc-fix-3: 서버 실제 세계의 NPC 짓기·구인 변화, NPC 연맹 표·나가기·빼기 빈도는 재지 않았다(Unknown). 시설 기대 수익은 어림(2604). 연맹 화면 없음.
- gov-fix-3: 게이트웨이의 낮은 판 바꿔 주기(`escaped` → `out_of_reach`)는 시험이 없다. 빠져나가기 장면 화면 시험 없음. 위반 장부는 첫 외교 틱(켠 뒤 1분 안) 전 선포를 여전히 모른다.
  영토 분쟁·약탈 보복·종주권 명분은 판정 자료가 없다. 쿠데타로 잃은 시작 도시를 다시 켤 때 옛 나라에 채움(2612, Assumed).
- 운영 DB 적용은 배포 때 확인.

## 사용자 결정 대기
- 질문 2601~2604(npc-fix-3), 2611~2614(gov-fix-3), 그리고 1117d 기록의 대기 목록(2561·2562 가·다·2568 대표 승계, 2571·2574·2575, 2581 (1)(4)·2583 (2)·2584 …).

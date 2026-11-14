# 걷기 속도 = 실효 AGI 계산식(D-540)

- 일시: 2026-11-14 09:45 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-540(질문 1251), 48 §3.2, ADR `2026-11-01-formula-editor.md` "바뀜 (2026-11-14, 걷기 속도 칸 walk_speed)", 질문 `docs/questions/2026-11-13-walk-agi.md`(1261~1267), 줄기 `work/walk-agi`(바탕 main 9c5035c)

## 한 일
- 계산식 칸 `walk_speed`(변수 AGI, 단위 `speed` = 단위/초)를 더했다. 기본 식 `base = 397.3`, `min(floor(base * 4), floor(base + max(0, AGI) * base * 0.01))` — 처음 AGI 10 = 437(지금 서버 걷기, D-120), 옛 CHR §13 비율(기울기 기본 × 1%, 상한 × 4 = 1,589). 팩 core@81.
- 실효 AGI = 전투와 같은 몸의 AGI(`walkAgiOf` = `bodyParts(...).loadout.primaries.agi`, 바탕 = `worldBodyBase` 사이보그 본체/기본 몸). 더 나은 "세계 이동용 실효 스탯" 함수는 없었다(보유 물건 `primariesOf`도 같은 몸 셈).
- 서버: 2차맵이 이동을 시작할 때(`requestRoute`) 유닛 speed를 몸에서 다시 읽는다(`walkSpeed.ts` — 지문 캐시·60초 TTL·계산식 결과 메모·계수표 5초 TTL, 기본 몸은 몸 셈 없음). 탈것 봇·땅이 아닌 유닛은 그대로. 운영자 빠르기는 그 speed × 100. 길 예상 시간은 `refreshSpeed` 뒤 셈. 플레이어 일꾼 숙소 요금 바퀴의 오감도 그 일꾼 speed.
- 사이보그 판 기동 묶음 이동 속도 줄: "걷기 속도 = 기본 + AGI × 가중치(상한) — 계산식 walk_speed", "AGI n → 빠르기 ÷ 1,024 = 칸/초", "기본(AGI 0)·상한", "차·배는 수단 속도". 옛 서버(agi 없음)는 옛 풀이.
- 계산식 탭(밸런스·2차 스탯 편집기)의 식 묶음·미리 보기에 칸을 더했다. 2차 스탯 편집기 파생 목록·아이템 무기 미리 보기에서는 뺀다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formulaSlots.ts` | 칸 `walk_speed`, 단위 `speed`, 기본 식, `walkSpeedScope` |
| `packages/shared/src/formulaSample.ts` | 미리 보기 값(판정과 같은 변수) |
| `packages/shared/src/roster.ts` | `RosterMove`에 `agi`·`walkBase`·`walkCap` |
| `packages/sim/src/combat/formulas.ts`, `index.ts` | `walkSpeedOf`(1 ~ 0x10_0000로 자름) |
| `packages/sim/src/society/logistics.ts` | `walkMsPerCell`·`restPeriodMs`에 빠르기 인수(기본 `WALK_SPEED`, 결과 그대로) |
| `content/core/formulas.json`, `manifest.json` | 팩 식 칸, core@81 |
| `apps/server/src/world/walkSpeed.ts` (새) | 걷기 빠르기 서비스(실효 AGI → 식, 캐시) |
| `apps/server/src/world/secondMap.ts` | 옵션 `walkSpeed`, 이동 시작 때 다시 읽기, `refreshSpeed`, NPC 휴먼 몸 판정을 탈것 빠르기 밑으로 |
| `apps/server/src/world/secondMapRows.ts` | `unitRowOf`(secondMap.ts 1,000줄 상한 때문에 나눔) |
| `apps/server/src/world/mapFactory.ts`, `world.ts` | `attachWalk` 고리, 월드가 잇는다 |
| `apps/server/src/world/battleBodies.ts` | `worldBodyBase` 내보냄(걷기와 전투가 같은 바탕) |
| `apps/server/src/roster/unitBody.ts`, `cyborgBody.ts`, `preview.ts` | `rosterMoveOf(catalog, agi)`, `walkAgiOf` |
| `apps/server/src/travel/service.ts` | 길 예상 전에 `refreshSpeed` |
| `apps/server/src/labor/workerRest.ts` | 오감 시간에 일꾼 speed |
| `apps/server/src/itemEdit/previewWeapon.ts` | 무기 미리 보기에서 `walk_speed` 뺌 |
| `apps/game/src/cyborg/CombatAttack.tsx`, `messages/{ko,en}.json` | 이동 속도 풀이, 단위 문구 |
| `apps/game/src/editor/balance/formulaModel.ts`, `formulaMessages.ts`, `secondaryStats/secondaryStatsModel.ts` | 식 묶음·단위 표 |
| 시험: `walkSpeed.test.ts`(sim·server 새), `unitBody.test.ts`, `formulaSample.test.ts`, `secondaryStatsParity.test.ts`, `secondaryStatsSim.test.ts`, `formulaState.test.ts`, `formulas.db.test.ts`, `e2e/cyborg.spec.ts` | 칸 수 14 → 15, 걷기 풀이 |

## 걷기 표 (실제 코드, 팩 core@81, K 1000‰, 맨손·장비 없음)
| 유닛 | Lv | AGI | 단위/초 | 칸/초 | 2차맵 한 장(256칸) |
|---|---|---|---|---|---|
| 공격특화(STR·VIT 14, DEX·AGI 8) | 1 | 8 | 429 | 0.419 | 611초(10.2분) |
| | 10 | 15 | 456 | 0.445 | 575초(9.6분) |
| | 30 | 31 | 520 | 0.508 | 504초(8.4분) |
| 재능특화(DEX·AGI 14, 나머지 8) | 1 | 14 | 452 | 0.441 | 580초(9.7분) |
| | 10 | 26 | 500 | 0.488 | 524초(8.7분) |
| | 30 | 54 | 611 | 0.597 | 429초(7.2분) |
| 골고루 10 | 1 | 10 | 437 | 0.427 | 600초(10.0분) |
| | 10 | 19 | 472 | 0.461 | 555초(9.3분) |
| | 30 | 39 | 552 | 0.539 | 475초(7.9분) |

## 함께 바꿔야 하는 파일
- 계산식 칸을 더하거나 빼면: `formulaSlots.ts`·`formulaSample.ts`·sim `formulas.ts setOf`·게임 `formulaModel.ts`·`secondaryStatsModel.ts`·두 2차 스탯 파리티 시험의 식 표·칸 수 시험(`formulaSample.test.ts`·`formulaState.test.ts`·`formulas.db.test.ts`).
- 걷기 판정을 바꾸면 `walkSpeed.ts walksOnFoot`(배 줄기 boats-b1이 물 유닛을 더할 때 domain이 "land"가 아니면 그대로 둔다).

## 건드리지 말 것
- 전투맵 걸음(1칸 1,000ms) — D-223, 질문 1265.
- 시뮬 `WALK_SPEED`(437) — 기본 식의 AGI 10 값과 같아야 한다(`walkSpeed.test.ts`).

## 미검증·TODO·알려진 문제
- `secondMap.ts` 999줄·`world.ts` 999줄(파일 크기 검사 상한 바로 밑). 다음에 더할 줄기는 먼저 나눈다.
- 계산식 결과가 탈것 문턱(2,000)을 넘게 고치면 봇 걷기가 탈것으로 보일 수 있다(지금 상한 1,589라 해당 없음, Assumed).
- 저장된 행의 speed는 다음 이동 때 새 값이 된다(서 있는 유닛은 옛 값 — 움직이지 않으니 쓰이지 않는다, Verified: 코드 읽음).

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 켬): 테스트 파일 675·테스트 5,122 통과(DB 시험 포함 — 건너뜀 없음).
- Verified `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,280 B / 상한 131,416 B.
- Verified `pnpm check:docs origin/main` 통과, `pnpm check:content --no-compat` core@81 통과.
- Verified e2e `cyborg.spec.ts`·`play-map.spec.ts`·`operator-speed.spec.ts`·`unit-control.spec.ts`: 65개 가운데 64 통과, 1 실패(`unit-control.spec.ts:285` 첫 땅 누르기 뒤 정보 판이 남음 — 걷는 휴먼을 누른 것으로 보임). 그 시험만 `--repeat-each 2`로 다시 돌려 2/2 통과 → 흔들리는 시험으로 본다(Assumed: 기본 몸 휴먼은 걷기 437 그대로라 이 줄기와 상관없음).
- 사진: 사이보그 판 기동 묶음(390 파스텔·다크) — e2e 플레이어 AGI 13 → 448 단위/초 = 0.437칸/초.

## 사용자 결정 대기
- 질문 1261~1267(`docs/questions/2026-11-13-walk-agi.md`), 모두 추천안으로 구현.

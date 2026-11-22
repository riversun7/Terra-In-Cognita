# 수호신을 유닛 종류에서 빼고 휴먼의 상태로 (guardian-kind)

- 일시: 2026-11-22 09:40 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 2026-11-22("4종류는 고정이라고 했다 왜 마음대로 늘리냐"), 기획 D-589(기획 커밋 `270e3a4`, 미러 동기화 전 — 근거 D-018),
  D-311·D-5059, 기획 답 456·470~473. ADR `docs/adr/2026-11-07-temple-religion.md` "바뀜 (guardian-kind, 사용자 결정 2026-11-22)".
  질문 `docs/questions/2026-11-22-guardian-kind.md`(2631·2632). 가지 `work/guardian-kind`(main `14537f2` 위).

## 한 일
- 팩 unit_kinds의 다섯째 종류 `guardian`(2026-11-07 기술 추천 456으로 더함, 사용자 결정 아님)을 지웠다. 유닛 종류는 넷(사이보그·휴먼·안드로이드·크리쳐).
- 수호신은 휴먼(세계 종류 코드 4)의 상태가 됐다: `world_units.guardian` 칸 + 메모리 유닛 `guardian` + 판정 `isGuardianUnit`. 규칙(머묾·방어 참전·
  웨이브 전투 열기·도시 버프·상한·일 안 함·수명 없음·잡히지 않음·유지비)은 그대로 상태로 돈다.
- 옛 수호신 유닛(종류 6) 바꾸기: 마이그레이션이 칸을 더하고 `kind 6 → 4, guardian true`. 직전 판 앱이 배포 사이에 다시 쓴 6은 새 앱 부팅이 같은
  문장으로 바꾼다. 세계 새로 시작은 필요 없다.
- 종류 목록·고르기에서 수호신을 뺐다: 팩(편집기 종류 고르기 — 전투 실험실 유닛 종류 목록 등), `@terra/shared` `UNIT_TYPES`·`MAP_UNIT_KINDS`·
  `WorldMyUnitKind`, 운영 화면 종류 이름(`ops_unit_kind_6`), 시뮬 시험 카탈로그. 화면 이름은 상태로 "수호신 #번호" 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/unit_kinds.json`·`id-changes.json`·`manifest.json` | `guardian` 종류 지움, 지운 기록(보상 = human) 뒤에 더함, core@183 |
| `packages/sim/src/combat/catalog.ts` | 시험 카탈로그의 `guardian` 종류 지움(판정 바뀜 없음) |
| `apps/server/src/db/schema.ts`, `drizzle/20261122002529_guardian_state/` | `world_units.guardian` 칸 + 옛 종류 6 줄 바꾸기(prevIds = `7e79264e…`) |
| `apps/server/src/world/unitKinds.ts` | `UNIT_KIND_GUARDIAN` → `LEGACY_UNIT_KIND_GUARDIAN`(다시 쓰지 않음) + `isGuardianUnit` |
| `world/persist/load.ts`·`persist/tables.ts`·`secondMapRows.ts`·`secondMap.ts`·`secondMapTypes.ts`·`travel/serviceParts.ts` | 상태 칸 읽기·저장·넘기기, 부팅 때 옛 6 바꾸기, `markGuardian` |
| `temple/service.ts`·`overview.ts`·`cityDefense.ts`, `battleReport/worldCity.ts`, `world/battleResults.ts`·`unitControl.ts`, `boats/service.ts`, `gather/service.ts`, `travel/planner.ts` | `kind === 6` 자리를 상태 판정으로. 수호신 몸의 팩 종류 = `human`(값은 옛 `guardian`과 같다) |
| `fusion/service.ts`·`geneCommands.ts`, `travel/encounterWorld.ts`, `tactics/store.ts`, `market/lockers.ts`·`exchangeDesk.ts`, `labor/offlineSteward.ts`, `gather/world.ts` | 종류 4가 된 수호신이 휴먼 규칙(융합·유전자·조우·작전·창고·대리 배치·운반꾼)에 새로 끼지 않게(종류 6일 때와 같게) |
| `roster/worldUnits.ts`·`services.ts`, `worldMap/travelReads.ts` | 화면 종류 `guardian` 대신 상태 칸 `guardian` |
| `packages/shared/src/roster.ts`·`mapUnits.ts`·`worldMap.ts`·`temple.ts`, `packages/protocol/src/temple.ts` | 종류 목록에서 `guardian` 빼고 상태 칸 더함, 주석 |
| `apps/game/src/roster/rosterText.ts`, `map/mapUnits.ts`·`PlanetUnitsPanel.tsx`·`CityOverlay.tsx`·`unitModels.ts`·`commandTarget.ts`, `ops/opsUi.tsx`, `messages/{ko,en}.json` | 상태로 "수호신 #번호"·아이콘, 종류 목록에서 빼기, 메시지 키 `unit_guardian_label` 하나로 |
| `e2e/battleLab.spec.ts` | 유닛 종류 고르기 = 넷 확인 |
| 시험(`guardianState.db.test.ts` 새로, `temple.db.test.ts`, `cityDefense.test.ts`, `gateway.test.ts`, `mapUnits.test.ts`×2, `commandTarget.test.ts`, `battleLab.db.test.ts`) | 상태로 고침, 부팅 바꾸기·다시 켜기 시험 |
| ADR·질문·PLAN 1023줄 | 위 바뀜 기록 |

## 함께 바꿔야 하는 파일
- 다음 배포(이 판이 운영에 올라간 뒤): `persist/load.ts`의 부팅 바꾸기 문장과 `LEGACY_UNIT_KIND_GUARDIAN` 읽기를 지운다(정리 단계).
- 기획 미러 동기화 때 D-589를 받으면 ADR "바뀜 (guardian-kind)"의 원문 인용을 미러와 맞춘다.

## 건드리지 말 것
- 전투 직업 `guardian`(가디언, `content/core/combat_classes.json`·`replayDemo.ts`)은 유닛 종류와 다른 것이다.
- 세계 종류 코드 6은 다시 쓰지 않는다.
- 올라간 마이그레이션(`20261107…_temple*`)은 고치지 않았다.

## 검사
- `pnpm check`(TEST_DATABASE_URL 포함): 통과 — 시험 파일 889개, 시험 6,352개 모두 통과(Verified).
- `pnpm check:content`: core@183 통과(기준 `14537f2`).
- 화면 시험 `pnpm e2e e2e/temple.spec.ts e2e/battleLab.spec.ts e2e/units.spec.ts e2e/unit-control.spec.ts`: 59개 통과(22.8분, 부하 큰 기계).
  전투 실험실 유닛 종류 고르기가 넷(사이보그·휴먼·안드로이드·크리쳐)만 보이는지 확인을 `battleLab.spec.ts`에 더했다.

## 미검증·TODO·알려진 문제
- 되돌림(직전 판 앱으로 복귀) 때는 바뀐 수호신을 그 앱이 휴먼 행 없는 휴먼으로 본다(수호신 규칙을 잃는다, 앱은 돈다). 미실행(추정, 코드 읽기).
- 운영 DB의 마이그레이션은 시험 DB(새 DB)에서만 돌았다. 옛 종류 6 줄 바꾸기는 같은 문장을 부팅 길로 DB 시험에서 봤다.
- [임시] 질문 2631(남에게는 휴먼으로 보임)·2632(유닛 화면 휴먼 거르기에 듦).

## 사용자 결정 대기
- 질문 2631·2632(추천 = 지금 코드).

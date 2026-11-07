# 전투·건물: 세계 전투 결과 → 시설·영토 비콘 상태, 건물 공격 명령, 비콘 재료 = 가장 가까운 세력 도시 창고

- 일시: 2026-11-07 16:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-buildings-runtime.md` "바뀜 (전투·건물)", 질문 381(`docs/questions/2026-11-07-buildings-runtime.md`)·410 ①(`docs/questions/2026-11-07-storage-jobs.md`)·새 질문 440~443(`docs/questions/2026-11-07-battle-buildings.md`), 기획 D-516·기획 커밋 52afc21(미러 동기화 전, 조정자 전달)·D-146·D-174·D-175·D-184·D-224·D-305·D-5043·336 ③, 가지 `work/battle-buildings`

## 한 일
- 사용자 지시 D-515("정확한 수치는 밸런싱 단계에서 하는거고 빠르게 시스템을 구축해라"): 수치는 [임시] 상수, 모양이 빈 것은 옛 규칙(D-507)이나 가장 단순한 기본값 + 질문 440~443(모양만). 콘텐츠 켬·끔 스위치는 만들지 않았다.
- **차이 목록 먼저**(ADR "바뀜" 표): 서버 세계 전투(정원사 웨이브)의 넥서스는 추상 시청이라 세계 시설·비콘 상태를 줄이는 고리·결과의 건물 끝 내구도가 없고, 건물을 치는 길(명령)이 없으며, 비콘 재료는 모든 자리 [임시].
- **미러에서 찾아 읽은 것(묻지 않음)**: 336 ③ 비콘 부수기 = 다른 건물 공격과 같다(D-5043, 전쟁·악명 D-290·D-305), D-174 시가지 밖은 누구나·선공 = 악명, D-184·기획 45 "시가지 안의 시설은 공성 시간에 공격받는다", D-146 시가지 = 영향권 ÷ 3(49 M4), D-175 건물은 공격으로만, D-305 악명은 벌점(막지 않음)·전쟁 상대끼리는 없음, D-224 공성 시민군(건물 하나 공격에 쓰는지는 미정 → 441).
- **381 고리**(`world/battleTargets.ts`·`battleApply.ts`): 시작 자료 `targets`(전투 건물 → 세계 시설·비콘), 전투 서비스 결과에 건물 끝 내구도(`buildings`). 결과 적용을 한 곳으로 모아(world.ts에서 뗌, 985 → 974줄) 결과 기록과 같은 동기 처리·같은 커밋으로 상태 ppm −= ⌈잃은 점 × 가득 ÷ 최대⌉(끝 0이면 0). 0 = 폐허 = 기능 정지(칸 그대로, 수리로 되돌림 — 366), 비콘은 30% 미만이면 꼭짓점이 아니고 0이어도 지우지 않음(380). 짓는 중 받은 피해는 다 지어도 남는다(짓기 끝이 가득으로 되돌리지 않음).
- **치는 길** `facility_attack`(프로토콜 12, `facilities/attack.ts`): 남의 시설·다른 세력 비콘을 넥서스(지금 내구도 점)로 하는 공성 전투([임시] 열린 맵 64칸, 정원사 웨이브와 같은 틀, 몸은 세계 전투와 같은 길). 공격 = 그 2차맵의 내 유닛(작업·계약·중태·포로 아님), 수비 = 주인(비콘은 그 세력 사람) 유닛 32칸 안 16 [임시]. 내 것·내 세력 것 `own_target`, 도시 시가지 안 `safe_zone`(공성 선포가 없어 늘 막음), 폐허 `target_ruined`, 다른 2차맵 `out_of_reach`, 전쟁 중인 세력끼리면 포로. 악명은 아직 없음.
- **410 ①**: 비콘 짓기·수리 재료 = 그 세력에서 비콘 칸과 가장 가까운 도시(`@terra/shared/territory nearestFactionCity`)의 내 도시 창고 → 그 도시의 내 창고 시설(`places.ts beaconMaterialScope`, 화물 없음). 화면 비콘 카드에 재료 자리 줄·그 자리 물자로 단추 막기.
- **416 공격 파괴의 창고 물건**: 가장 단순한 기본안 = 그대로(넣기만 막힘·꺼내기 됨) → 질문 440(옛 폐허 전리품과 비교).
- **화면**: 경제 → 생산 "건물" 칸에 "칠 수 있는 건물"(`AttackParts.tsx`, 상태 막대·내구도·[공격(n명)], 공격 유닛 = 고른 일꾼 가운데 그 2차맵에 있는 것), 비콘 재료 자리 줄. 문구 ko·en 14개 더함.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/territory.ts`·`.test.ts` | 가장 가까운 세력 도시(410 ①)·시가지 판정(D-146, `URBAN_RADIUS_DIVISOR` 3) |
| `packages/shared/src/goodsPlaces.ts`·`.test.ts`, `facilities.ts` | 화물 없는 재료 자리(mapKey null), 비콘 `supplyCityId`, 공격 대상 `FacilityTargetView`·`targets` |
| `packages/protocol/src/facilities.ts`·`index.ts`·`version.ts`, `facilities.test.ts`·`cyborg.test.ts` | `facility_attack`·새 코드 넷, 프로토콜 12(최소 11) |
| `apps/server/src/world/battleTargets.ts`(새)·`battleApply.ts`(새)·`battles.ts`·`battleBodies.ts`·`world.ts` | 목표 칸·끝 내구도·피해 적용, 결과 적용 한 곳, 세계 전투 여는 한 길(`startWorldBattle`), 유닛 사양 만들기(`build`) |
| `apps/server/src/facilities/attack.ts`(새)·`targets.ts`(새)·`service.ts`·`places.ts`·`world.ts`·`materials.ts`·`views.ts`·`screen.ts`·`appSource.ts`·`gateway.ts` | 공격 명령·대상 목록, 시설 피해·짓기 끝 상태 유지·비콘 수리 재료 자리, 비콘 재료 자리, 화면 자료, 연결 |
| `apps/server/src/territory/service.ts` | 비콘 짓기 재료 도시·`supplyCity`·`damageBeacon`·`urbanCity` |
| `apps/server/src/session.ts`·`app.ts` | 12판 메시지 길·공격 서비스 연결 |
| 시험: `facilities/attack.db.test.ts`(새, 2개)·`gateway.test.ts`(1개 더), `territory/territory.db.test.ts`·`gateway.test.ts` | 새 동작·바뀐 재료 자리·인터페이스 |
| `apps/game/src/economy/AttackParts.tsx`(새)·`FacilityPanel.tsx`·`FacilityCards.tsx`·`facilityText.ts`·`facilityCommands.ts`, `messages/{ko,en}.json` | 화면 |
| `e2e/facilities.spec.ts` | "칠 수 있는 건물" 칸 제목 |
| `docs/adr/2026-11-07-buildings-runtime.md`, `docs/questions/2026-11-07-battle-buildings.md`(새)·`2026-11-07-buildings-runtime.md`·`2026-11-07-storage-jobs.md`, `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 판 수: 프로토콜 11 → 12(최소 11), 팩 core@42 그대로, `SIM_VERSION` 14 그대로(`packages/sim`·`content/` 안 바꿈 — 판정은 `targets`를 읽지 않는다), 마이그레이션 없음.
- 작업 중(Verified): 공용 `territory.test.ts` 15개·`goodsPlaces.test.ts`, 프로토콜 91개(14개 파일), 서버 타입 검사·게임 타입 검사, oxlint(바꾼 폴더) 통과, DB(`TEST_DATABASE_URL`) 건물·영토·전투(`battles`·`battleResults`·`battleItems`) 8개 파일 24개 통과, 새 `attack.db.test.ts` 2개 통과(처음 돌림: 비콘 시험이 다시 켜기 전 세계의 영토 서비스를 잡고 있어 실패 → 시험을 고침, 그다음 시각을 늦추는 짓기 차례 때문에 내구도 기대 15/14가 어긋나 시가지 안 야적장을 먼저 짓게 고침).
- 화면 시험(Verified, `pnpm e2e facilities.spec.ts`, 빌드한 앱·서버, 헤드리스 Chromium): 처음 돌림에서 4개 모두 실패 — 칸 제목 "건물"을 찾는 시험이 새 칸 제목 "칠 수 있는 건물"까지 잡아 strict mode 위반 → 시험에 `exact: true`를 넣고 다시 돌려 4개 통과(22.5초). 사진(파스텔 한국어 390·1440, 다크 영어 390·1440): "칠 수 있는 건물" 칸(설명·빈 목록)이 장비 수리 아래·내 창고 위에 넘침 없이 보인다. 대상이 있는 줄(상태 막대·[공격])은 화면 시험에 없다(DB 시험이 판정을 본다).
- 끝 검사(Verified, 무거운 잠금 안): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어 4,016키·대비·콘텐츠 core@42·시험 437개 파일 3,590개, DB 시험 포함). 파일 크기 경고에 `facilities/service.ts` 722줄(실패 아님). `pnpm check:docs`는 커밋 뒤(아래).

## 함께 바꿔야 하는 파일
- 시작 자료 `targets` 모양을 바꾸면 `world/battleTargets.ts`(읽기·적용)·`facilities/attack.ts`(만들기)를 함께 본다.
- 재료 자리 규칙은 서버 `places.ts materialScope`·`beaconMaterialScope`와 화면 `materialStockAt`(mapKey null = 화물 없음)이 같은 `isMaterialSource`를 쓴다.
- 시가지 판정(`urbanCityAt`)은 공격 명령과 화면 대상 목록이 같이 쓴다. 공성 선포(D-185·D-200)가 생기면 공성 시간 중인 도시만 풀어 준다(`attack.ts` safe_zone).
- 프로토콜 12는 이 가지의 판이다. 같이 도는 줄기가 먼저 12를 쓰면 합칠 때 판 목록·`facilities.test.ts`·`cyborg.test.ts` 판 시험을 맞춘다.

## 건드리지 말 것
- 랭킹(`work/ranking`)·신전(`work/temple`) 줄기 파일, 정원사 웨이브 전투 틀(`npc/gardener*` — 웨이브 넥서스는 세계 건물이 아니라 `targets`가 없다).
- 올라간 마이그레이션.

## 미검증·TODO·알려진 문제
- 전투맵은 [임시] 열린 맵이다(ADR 35 2차맵 구역 복사 전): 둘레 건물·지형이 없다.
- 악명·현상금·신규 보호(D-307)·공성 선포(D-185·D-200)·참전(D-176)이 없다 → 시가지 안 건물은 칠 수 없고, 수비는 자동으로 든 주인 유닛뿐.
- 정원사 웨이브는 도시 시설에 피해를 주지 않는다(D-325 "웨이브는 건물 피해도 받는다"는 구역 복사 전투맵 때).
- 같은 건물에 전투 둘이 겹치면 둘 다 그때 내구도로 시작한다(0에서 멈춤). 전투 중에도 유닛은 세계에서 움직인다(전투 ADR 8절 그대로).
- 수비 범위·인원·맵 크기는 코드 상수 [임시](설정 칸 아님 — 정원사 웨이브 상수와 같은 자리).
- `facilities/service.ts` 722줄(600줄 경고, 실패 아님). 장비 수리 명령을 따로 떼면 줄일 수 있다.
- 410 외 411~415 답(기획 52afc21)은 미러를 다시 동기화할 때 질문 파일에 고친다.

## 사용자 결정 대기
- 질문 440~443(모양만, 답이 없으면 지금 코드).

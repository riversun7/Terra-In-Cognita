# 배 체계 개편 구현: 조선소·정박장·교역 부두·내구도·옛 배 지우기, 해상 전투·항로 설계안

- 일시: 2026-11-15 09:40 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-545·D-547(1481~1500)·D-548·D-553(1327·1329, 기획 커밋 ae888e9 — 미러 전), ADR `docs/adr/2026-11-15-shipyard-harbor.md`(제안 → 확정 + "바뀜 (2026-11-15)"),
  `docs/adr/2026-11-15-sea-combat-routes.md`(새, 제안), `docs/adr/2026-11-13-boats.md`("바뀜 (2026-11-15)"), 질문 `docs/questions/2026-11-14-boats-impl.md`(1521~1545), 줄기 `work/boats-impl`

## 리셋 필요 여부
**필요 없음 — 배·부두만 지움(1499).** 사용자 답 1499 "배·부두만 지움"대로, 새 판 서버가 켤 때 한 번(`boat_resets` 표지로 멱등) 옛 배·부두·조선소 작업 줄만 지우고 새 규칙으로 시작한다.
세계 생성 때 한 번 정하는 것(행성·도시 배치·국가·지형)은 건드리지 않는다. 지우기 전에 배의 승객은 배 둘레 땅에 내리고, 부두 건물 창고의 물건은 주인 도시 창고로·돈은 주인 지갑으로 옮긴다.
만들던 배·짓던 부두 레벨업 재료는 돌려주지 않는다(D-545 1405와 같은 뜻 — 질문 1526). 무엇을 지웠는지는 감사 기록 `world.boat_reset`(보고 JSON)과 `boat_resets.report`에 남는다.
NAS 세계에 옛 배·부두가 몇 개 있는지는 **Unknown**(운영 DB를 읽지 않았다 — 배포 뒤 서버 기록 "boat reset: legacy boats and docks removed"의 수로 본다).

## 한 일
- 사용자 답 D-547 전부를 ADR "바뀜 (2026-11-15)" 표로 정리하고 구현했다(제안과 다른 답: 1483 도크 1 + 모듈, 1484 배 종류 표, 1485 정박 자리 없이도 만듦, 1488·1489 교역 부두 따로·시간 사기·초과 요금, 1491 사업장 금고, 1499 지우기).
- WP1(데이터): 팩 core@96 — `shipyard`(배 종류 `rowboat`·`cargo_boat` [임시])·`trade_dock` 새 시설, `dock` = 정박장(`harbor: berth`), 시설 칸 `harbor`·`boats` + 2단계 검사, 설정 칸 20개.
  마이그레이션 `20261115000251_boats_harbor`(더하기만: `boat_states`·`boat_facilities`·`boat_resets`, `boat_jobs.kind·type_id·boat_id`).
- WP2(1499): `boats/purge.ts` — 켤 때 한 번 옛 배·부두·작업 지우기(DB 시험).
- WP3(서버 규칙): 조선소 도크·모듈·배 종류별 만들기·수리(멀면 배가 가서 시작), 집 정박장(받기 범위·자리·정박료 → 정박장 금고, 체납·범위 좁힘·폐허면 집 잃음), 교역 부두(시간 사기·초과 요금·떠나면 끝),
  배 내구도(정박 중 < 밖 < 집 없음, 수리 중 0), 내구도 0이면 아주 느리게, 운행 정지(내구도 기준 아래 새 배·작업 막음). 프로토콜 30(최소 29).
- WP4(NPC, 1497): NPC 정박장마다 같은 2차맵 NPC 조선소에서 배를 만들고 정박장에 넣고 낡으면 고치러 보냄(같은 서비스). 바닷가 NPC 도시 목표 = 정박장 + 조선소. 어부 직무는 아직 아님(질문 1530).
- WP5(화면): 건물 판의 배 시설 판(`HarborPanel.tsx`), 배 줄의 내구도·집, 결과 문구(ko·en).
- D-553(코디네이터가 전한 사용자 답): 먼 바다 건너뛰기 없앰 — 배는 지나는 바다 2차맵을 닿을 때 띄우고 항해(`travel/service.ts`). 해상 전투(화포·도주·기뢰·과열·백병전·우주 전함)와 항구 사이 항로 설계안 ADR + 질문 1531~1545.
  전투 제외는 규칙(SC1)까지 코드 그대로 둔다(사용자 "해상 전투 규칙 먼저"). 1317 "실제로 느려짐(지금)"·1341 "길 밖에서 느림(길 기능 때)"은 건드리지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/{facilities,tuning,manifest}.json` | 조선소·교역 부두·정박장, 배 종류 표, 설정 칸 20개, core@96 |
| `packages/content/src/schema/{boats,economy}.ts`, `validate/facilities.ts` | 시설 칸 `harbor`·`boats`와 검사 |
| `packages/shared/src/harbor.ts`(새), `gather.ts`·`mapUnits.ts`·`buildingEditor.ts`, `package.json` | 배 시설 이름·범위·판 모양, 건물 판 `harbor` 칸, 배 줄 내구도·집, 편집기 칸 보존 |
| `packages/sim/src/society/boatCoefficients.ts`, `tuningBoats.ts` | 계수표 `boats.*` 새 칸(서버만 읽음 — SIM_VERSION 그대로) |
| `packages/protocol/src/{boats,index,version}.ts` | 프로토콜 30: 새 메시지 4개·결과 코드 12개·29판 낮춤 |
| `apps/server/src/db/boatSchema.ts`, `schema.ts`, `drizzle/20261115000251_boats_harbor/` | 표·열 더하기 |
| `apps/server/src/boats/{core,rules,harbor,shipyard,service,store,purge,hooks,world,gateway,npcFleet}.ts` | 배 체계 서버 |
| `apps/server/src/world/{world,walkSpeed}.ts`, `persist/tables.ts` | 배 고리(빠르기 배율·표시 정보), 쓰기 표 |
| `apps/server/src/{session.ts,gather/reads.ts,worldMap/*,facilities/{catalog,storage}.ts,buildingEdit/views.ts,npc/cityBuild.ts,travel/service.ts}` | 새 메시지 길, 판 칸, 배 줄, 시설 정의, 건물 위치 화폐 → 주인 지갑(D-548), 편집기 칸, NPC 목표, 먼 바다 항해 |
| `apps/game/src/map/boats/*`, `map/gather/GatherPanel.tsx`, `editor/buildings/buildingModel.ts`, `messages/{ko,en}.json` | 배 시설 판·배 상태·문구, 편집기가 배 칸을 지우지 않게 |
| `e2e/boats.spec.ts` | 조선소 → 배 → 정박장 집 → 정박장 판 사진 → 교역 부두 시간 → 수리 hull_full |
| `docs/adr/*`, `docs/questions/*` | 위 ADR·질문 |

## 함께 바꿔야 하는 파일
- 배 종류 칸을 더하면: `packages/content/src/schema/boats.ts`·`packages/shared/src/harbor.ts`(BOAT_TYPE_LIMITS)·`apps/server/src/facilities/catalog.ts`·`buildingEdit/views.ts`.
- 결과 코드를 더하면: `packages/protocol/src/boats.ts`(`legacyBoatCode`도)·`apps/game/src/map/boats/boatText.ts`·메시지 ko·en.
- 세계 밖 표가 아니므로 `cli/resetWorld.ts` 남길 표 목록에는 넣지 않았다(세계를 새로 시작하면 배 표도 비워진다 — 맞다).

## 건드리지 말 것
- `boat_resets` 줄을 지우지 않는다(지우면 다음 부팅이 그때 있는 배·정박장(`dock`)을 모두 지운다).
- `apps/server/src/app.ts`(999줄)는 고치지 않았다. 판 원본은 옛 고리 이름 `dockJob`으로 그대로 흐른다.

## 미검증·TODO·알려진 문제
- 시험: 결과는 아래 "검사" 줄.
- 정박 중 판정은 배 몸이 집 정박장 둘레 `harbor_reach_cells` 안인가로 본다. 닳음은 60초 살피기마다 그때의 처지로 셈한다(살피기 사이에 처지가 바뀌면 근사).
- 띄우지 않은 2차맵에 있는 배는 닳음·정박료를 셈하지 않는다(다시 띄우면 그때의 처지로 지난 시간을 셈).
- 남의 조선소 수리(1522)·요금 화폐(1524)·금고 꺼내기(1525)·집 잃음 알림(1528)·연료(1529)·NPC 어부 직무(1530)는 [임시]/미구현.
- 해상 전투 SC1~SC6·항로 R1은 설계만(ADR `2026-11-15-sea-combat-routes.md`).
- 정박장·교역 부두 둘레의 배 자리는 물 칸을 차례로 고른다(배끼리 겹칠 수 있음 — 1496 가).

## 검사
(아래 채움)

## 사용자 결정 대기
- 질문 `docs/questions/2026-11-14-boats-impl.md` 1521~1545.

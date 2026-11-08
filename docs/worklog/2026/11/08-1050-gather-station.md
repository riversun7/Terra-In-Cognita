# 채집소 기능(벌목장·광산: 일꾼·반경 오브젝트·버프·채집소 창고·옮기기·판)

- 일시: 2026-11-08 10:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-gather-objects.md` "바뀜 (2026-11-08 사용자 지적: 채집소 기능)", 질문 `docs/questions/2026-11-08-gather-station.md`(750~757), 가지 `work/gather-station`

## 한 일
- 사용자 지적(2026-11-08, 원문) "원자재채집소의 기능도 필요"(NAS에서 벌목장·광산이 보이지만 쓸 수 있는 기능이 없다)와 D-519 채집 답을 넣었다.
- 서버 채집소(`gather/station.ts`): 직무 배치·노동 계약 일꾼의 정산 산출(WP3 `gatherLots`)이 묶음마다 반경 안 오브젝트 번수를 하나씩 쓴다(가까운 것부터, 없으면 못 냄 — 질문 664 ②). 레벨 수확 버프를 곱하고(‰ 나머지는 결정적 굴림) 산출을 채집소 창고(그 건물 창고, 상한 storageKg × 레벨)에 넣는다. 창고가 가득이면 묶음을 끝내지 않는다. 정산 뒤 피로를 레벨 배율만큼 덜어 준다(막혀 하나도 못 끝낸 구간은 모두). 정시 자동 옮김(설정 칸, 10분 [임시])이 주인 몫을 그 도시 창고로 옮긴다.
- 레벨 버프(`rules.ts` stationBuffs): 반경·수확·피로·다시 자람. 직접 채집 줄(채집 서비스)·들어가기도 같은 레벨 버프와 채집소 창고를 쓴다(넣는 곳이 도시 창고 → 채집소 창고).
- 노동 계약 쪽 고리(`labor/workBook.ts` StationHook·`gatherWork.ts` maxLots): 채집소면 묶음 상한·수량 배율·채집소 창고(몫에 상관없이 그 건물 창고 상한)·정산 뒤 피로 덜기. 고리가 없으면(DB 없는 세계·채집 세계 준비 전) 예전과 같다.
- 조회 tRPC `gather.station`(`stationReads.ts`, 응답 `@terra/shared/gatherStation`).
- 화면: 2차맵 건물 판 안 채집소 판(`map/gather/StationPanel.tsx`, 반경 고리 `stationRing.ts`), 건물 화면 채집 시설 카드의 채집소 칸(`economy/StationParts.tsx`). 명령은 기존 WebSocket 명령만 쓴다(labor_assign·labor_unassign·facility_upgrade·storage_move·gather_start).
- 설정 칸 5개 [임시](`gather_obj_station_radius_step` 4칸, `gather_obj_station_fatigue_step_pm` 50‰, `gather_obj_station_regrow_step_pm` 50‰, `gather_obj_station_floor_pm` 200‰, `gather_obj_station_haul_ms` 600,000ms), 팩 core@52.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/gather/station.ts` (새) | 채집소 런타임: 자리·반경 안 오브젝트·산출 계획(묶음 상한·배율·오브젝트 쓰기·일꾼 상태)·피로 덜기·자동 옮김 |
| `apps/server/src/gather/stationReads.ts` (새) | 채집소 판 조회 |
| `apps/server/src/gather/rules.ts` | 레벨 버프 stationBuffs, 피로·다시 자람이 채집소 레벨을 받음 |
| `apps/server/src/gather/deposit.ts`·`enter.ts`·`service.ts` | 채집소 반경이 레벨로, 시설 넣기 = 채집소 창고(가득이면 창고·도시로) |
| `apps/server/src/gather/world.ts`·`reads.ts`·`apps/server/src/trpc/gather.ts` | 채집소 런타임을 만들어 노동 계약에 잇고 조회를 연다 |
| `apps/server/src/labor/workBook.ts`·`gatherWork.ts`·`service.ts` | StationHook(묶음 상한·채집소 창고·피로 덜기), gatherLots maxLots, 정산 하나의 창고 자리를 모든 몫에 넘김 |
| `packages/shared/src/gatherStation.ts` (새)·`package.json` | 채집소 판 응답 모양 |
| `packages/sim/src/society/gatherObjects.ts`·`tuningGather.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 5개 [임시], 팩 52 |
| `apps/game/src/map/gather/StationPanel.tsx`·`stationData.ts`·`stationRing.ts` (새), `GatherPanel.tsx`·`gatherState.ts`·`gatherOverlay.ts`·`gather.css` | 2차맵 채집소 판·반경 고리 |
| `apps/game/src/economy/StationParts.tsx`·`station.css` (새), `FacilityCards.tsx` | 건물 화면 채집소 칸 |
| `apps/game/messages/{ko,en}.json` | 채집소 문구(ko·en 함께), 일꾼 산출 문구에 채집소 창고를 더함 |
| 시험: `gather/station.test.ts`·`station.db.test.ts` (새), `objects.test.ts`, `labor/gatherWork.test.ts`·`gateway.test.ts`, `e2e/gather-station.spec.ts` (새) | 버프·계획·피로 덜기·자동 옮김·정산 연결·화면 |
| ADR·질문·PLAN 14장 | 결정과 확인 대기 750~757 |

## 함께 바꿔야 하는 파일
- 설정 칸을 더하면 `packages/sim/src/society/gatherObjects.ts`·`tuningGather.ts`·`content/core/tuning.json`을 함께(팩 판 올림).
- 채집소 판 응답을 바꾸면 `packages/shared/src/gatherStation.ts` → `stationReads.ts` → `StationPanel.tsx`·`StationParts.tsx`.
- 노동 계약 산출(`labor/workBook.ts` goodsFor)을 바꾸면 StationHook 계약(plan → gatherLots maxLots → scale → commit)을 지킨다.

## 건드리지 말 것
- `gatherLots`의 묶음 차례 난수(유닛·seq)와 사다리 규칙 — 시뮬과 같은 규칙이고 나눠 정산해도 같아야 한다.
- 일꾼 피로는 시뮬 직무 규칙대로 쌓이고 정산 뒤에만 덜어 준다(직무 규칙 자체를 바꾸지 않았다 — `SIM_VERSION` 그대로).

## 미검증·TODO·알려진 문제
- 정산이 길게 밀리면(오프라인, 최대 1시간마다) 그 사이 다시 자란 번수는 세지 못한다(정산하는 때의 남은 번수만).
- 일꾼 상태·끝낸 묶음 수·피로 나머지는 메모리(다시 켜면 0부터, 질문 757).
- 반경 안에 오브젝트가 없는 곳의 기존 벌목장·광산은 일꾼이 있어도 내지 않는다(NAS의 기존 시설 — 판이 "원자재 없음"을 알린다, 질문 750).
- 지도 반경 고리는 반경(40칸 ≈ 235m)이 확대한 화면보다 커서 사진에는 거의 보이지 않는다(시험은 고리가 그려졌는지·닫으면 지우는지만 본다). 멀리 보면 점선 원으로 보인다(눈으로 확인 안 함 — Unknown).
- 화면 시험 사진의 사각형 빈 땅(지도 색 배경)은 탐사하지 않은 시야 칸이다(DOM 요소 없음, 캔버스가 비움 — 채집소 판과 무관, 시험 안 조사로 확인).

## 검사
- `TEST_DATABASE_URL=… pnpm check`: 통과(시험 파일 508·시험 3,940, DB 시험 포함). `pnpm check:docs origin/main`·`pnpm check:content origin/main`(core@52): 통과.
- 화면 시험(`pnpm e2e`): `gather.spec`·`produce.spec`·`facilities.spec`·`labor.spec` 16개 통과(첫 실행). `gather-station.spec` 5개 통과(마지막 실행 — 첫 실행에서 다크·영어 채집소 표시가 성능 줄에 가려 누르지 못해 실패 → 가리지 않은 표시만 누르고 휠로 멀리 보게 고침).
- 사진(390, E2E_SHOTS_DIR = 세션 임시 폴더, 저장소 밖): 채집소 판 `gather-station-390-{pastel-ko,dark-en}.png`·`gather-station-sheet-390-…`, 건물 화면 채집소 칸 `gather-station-card-390-{pastel-ko,dark-en}.png`. 파스텔·다크 모두 넘침·작은 누르는 곳 없음.

## 사용자 결정 대기
- 질문 750~757(`docs/questions/2026-11-08-gather-station.md`).

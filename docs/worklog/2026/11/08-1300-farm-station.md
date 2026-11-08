# 농장 채집소(756 ②: 채집소 창고·수확·피로 버프·자동 옮김)

- 일시: 2026-11-08 13:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-gather-objects.md` "바뀜 (756 ②)", 질문 `docs/questions/2026-11-08-farm-station.md`(810~813), 기획 정리 D-523 포인터(756 ②), 앞 작업 `docs/worklog/2026/11/08-1050-gather-station.md`, 가지 `work/farm-station`

## 한 일
- 기획 정리 756 ②("농장도 창고·버프")를 넣었다. 채집소 줄기(벌목장·광산)에서 판만 보이던 농장(오브젝트가 맡지 않는 채집 시설, `station.ts` kind `facility`)도 채집소다.
- 서버(`gather/station.ts`): 채집소 고리 `plan`이 농장에도 계획을 준다 — 묶음 상한은 창고가 가득일 때만 0(오브젝트 상한 없음 = `maxLots` undefined), 레벨 수확 배율 굴림, 일꾼 상태(일함·창고 가득), 정산 뒤 피로 덜기(벌목장·광산과 같은 레벨 배율). 오브젝트 번수는 쓰지 않는다. 그래서 일꾼 산출이 그 농장 창고(상한 storageKg 300kg × 레벨)로 간다(`labor/workBook.ts` goodsFor는 계획이 있으면 채집소 창고로 — 바꾸지 않음). 정시 자동 옮김(`haulNow`)이 농장 창고의 주인 몫도 그 도시 창고로 옮긴다.
- `labor/workBook.ts`: `StationPlan.maxLots`를 `number | undefined`로(undefined = 상한 없음), 주석.
- 조회(`gather/stationReads.ts`, 응답 `@terra/shared/gatherStation`): 농장도 버프(수확·피로 — 반경·다시 자람은 null)·다음 레벨 버프·자동 옮김 다음 시각을 준다. `GatherStationBuffs.radiusCells`·`regrowPm`을 null 가능으로. 정산 전 일꾼 상태는 두 종류 모두 "정산 기다림".
- 화면: 2차맵 농장 판(`StationPanel.tsx`)에 수확·피로 버프·자동 옮김·시설 일꾼 안내·다음 레벨 버프(반경 없이). 반경 고리·원자재·[직접 캐기]는 반경이 있을 때만. 건물 화면 채집소 칸(`StationParts.tsx`)이 농장 카드에도 보인다(제목 "채집소 · 시설 안 생산", `data-kind`). 일꾼 상태 "일하는 중"(농장), 일꾼 산출 안내 "산출 → 채집소 창고 → 도시 창고".
- 시뮬레이터는 그대로다(시뮬 시설 생산은 벌목장·광산도 채집소 버프·창고를 쓰지 않는다 — 서버만). 새 설정 칸 없음(벌목장·광산 칸을 함께 씀).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/gather/station.ts` | 농장 계획(묶음 상한 없음·수확 배율·상태·피로 덜기), 자동 옮김에 농장 |
| `apps/server/src/gather/stationReads.ts` | 농장 버프(반경·다시 자람 null)·다음 레벨 버프·자동 옮김 시각, 정산 전 상태 |
| `apps/server/src/labor/workBook.ts` | `StationPlan.maxLots` undefined 허용, 주석 |
| `packages/shared/src/gatherStation.ts` | 버프 두 칸 null 가능, 종류 설명 |
| `apps/game/src/map/gather/StationPanel.tsx`·`stationData.ts` | 농장 판(버프 줄·자동 옮김·안내·다음 레벨), 반경 있을 때만 고리 |
| `apps/game/src/economy/StationParts.tsx` | 농장 카드 채집소 칸 |
| `apps/game/messages/{ko,en}.json` | 새 키 6개(농장 버프·상태·안내·다음 레벨·칸 제목·일꾼 수), 농장 안내·일꾼 산출 문구 고침 |
| `apps/server/src/gather/station.test.ts`·`station.db.test.ts` | 농장 계획·창고 가득·배율·피로 덜기·자동 옮김, DB: 농장 직무 배치 → 농장 창고·판·자동 옮김 |
| `e2e/gather-station.spec.ts` | 농장 판(2차맵)·농장 카드(건물 화면) 사진·검사 |
| ADR·질문(새 `2026-11-08-farm-station.md`, `2026-11-08-gather-station.md` 상태 답함)·PLAN 14장 | 결정과 확인 대기 810~813 |

## 함께 바꿔야 하는 파일
- 채집소 판 응답을 바꾸면 `packages/shared/src/gatherStation.ts` → `stationReads.ts` → `StationPanel.tsx`·`StationParts.tsx`·`stationData.ts`.
- 채집소 고리 계약(`StationPlan`)을 바꾸면 `labor/workBook.ts` goodsFor와 `labor/gatherWork.ts` gatherLots maxLots를 함께.
- 목장·약초원 시설을 팩에 더하면: 오브젝트 종류가 맡으면 오브젝트 채집소, 아니면 시설 채집소로 저절로 나뉜다(질문 812).

## 건드리지 말 것
- 농장 산출 규칙(선택 모드 D-507·해금 티어·`gatherLots` 묶음 차례 난수) — 시뮬과 같은 규칙이다.
- 일꾼 피로는 시뮬 직무 규칙대로 쌓이고 정산 뒤에만 덜어 준다(`SIM_VERSION` 그대로).

## 미검증·TODO·알려진 문제
- 도시 밖 농장은 예전에 상한 없이 그 건물 창고에 쌓였는데 이제 창고 상한(300kg × 레벨)에서 멈춘다(손으로 꺼냄, 질문 811).
- NAS 세계의 기존 농장: 다음 정산부터 산출이 농장 창고로 가고 10분마다 도시 창고로 옮겨진다(마이그레이션 없음 — 이미 도시 창고에 있는 작물은 그대로). NAS에서는 확인하지 않았다(Unknown).
- 일꾼 상태·끝낸 묶음 수·피로 나머지는 메모리(757 지금 코드).

## 검사
- `TEST_DATABASE_URL=… pnpm check`: 통과(시험 파일 522·시험 4,002, DB 시험 포함). `pnpm check:content origin/main`(core@52 그대로): 통과. `pnpm check:docs origin/main`: 통과(커밋 뒤).
- 작업 중: `apps/server` `src/gather`·`src/labor` 시험 9파일 43개 통과(DB 포함, 농장 단위 시험 3개·DB 시험 1개 더함).
- 화면 시험(`pnpm e2e gather-station.spec.ts`): 9개 모두 통과(첫 실행, 1.4분) — 기존 5개 + 농장 판 2개(파스텔 한국어·다크 영어) + 농장 카드 2개.
- 사진(390, E2E_SHOTS_DIR = 세션 임시 폴더, 저장소 밖): 농장 판 `gather-station-farm-390-{pastel-ko,dark-en}.png`·`gather-station-farm-sheet-390-…`, 농장 카드 `gather-station-farm-card-390-{pastel-ko,dark-en}.png`. 눈으로 봄: 농장 판에 "채집량 +0% · 피로 −50%"·채집소 창고 0/300kg·자동 옮김 줄, 반경 고리 없음. 벌목장 판·카드는 예전과 같다. 넘침·작은 누르는 곳 없음(시험이 본다).

## 사용자 결정 대기
- 질문 810~813(`docs/questions/2026-11-08-farm-station.md`).

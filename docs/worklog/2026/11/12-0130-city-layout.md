# 도시 건물 전략 배치·숙소·이미 선 도시 다시 놓기

- 일시: 2026-11-12 01:30 ~ 03:20 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/city-layout`(통합 머리 `0f9ba0dd27`에서), ADR `2026-11-11-city-building-layout.md`(새, 제안), `2026-11-11-city-catchment.md`·`2026-11-07-play-flow.md`·`2026-11-07-buildings-runtime.md` "바뀜 (2026-11-11 …)", 질문 `docs/questions/2026-11-12-city-layout.md`(1046~1055)

## 사용자 요청(2026-11-11, 원문)
"건물들도 바둑판 배열이 아닌 전략적으로 배치하도록하자. 정부건물은 파괴시 함락되니 중앙에 두고 주변 건물이 시간을 벌수있게, 숙소는 노동자 회복 루트, 창고와 원자재채집소와의 관계도 고려"

## 한 일
1. 진단(Verified: 코드 읽기 + 측정 스크립트 `apps/server/bench/cityLayout.ts`)
   - NPC 시작 도시 기본 시설은 도시 칸 둘레 마당(반경 5) 밖 고리를 위 → 오른쪽 → 아래 → 왼쪽으로 돌며 처음 맞는 자리에 목록 차례(행정 → 창고 → 채집 시설)로 섰다 → 행정 건물이 늘 도시 칸 9칸 위, 창고가 옆, 채집소가 다음 고리. 땅·원자재를 보지 않아 같은 건물 수의 도시는 모두 같은 모양.
   - 숙소 건물이 없었다(주거는 수). NPC 휴먼은 밤에 시청 칸 둘레 32칸으로.
   - 공성·건물 공격 전투는 2차맵 배치를 쓰지 않는 열린 전투맵(넥서스 하나) → 배치는 지금 전투 안에서 시간을 벌지 못한다(2차맵을 걸어오는 길만 막는다). 채집소 → 도시 창고 옮김은 거리와 상관없는 거래.
2. 배치 함수 하나(`facilities/cityLayout.ts`): 행정 건물 가운데 + 광장, 채집 구역(창고 수) → 채집소(원자재 많은 바깥 띠, 구역 가운데로 모임) → 창고(구역 길 75%) → 숙소(길 35%, 남는 것은 빈 방향) → 기타(빈 방향). 땅·물가·오브젝트·유닛·지형 비용을 보고 시드로 흔든다. 지표 셈(`cityLayoutMetrics.ts`).
3. NPC 시작 도시 씨앗이 이 함수를 쓴다(설정 칸 `city_layout_mode` 1, 0 = 옛 배치). 원자재 오브젝트 = 채집과 같은 함수.
4. 팩 core@71 숙소(`lodging`, 새 단계 `living`) + `npc_seed_lodgings` 3. NPC 일꾼은 밤에 일터에서 가장 가까운 숙소 둘레에서 쉰다.
5. 이미 선 NPC 도시 다시 놓기: 미리 보기(읽기만) → 예약(표 `world_city_layout_requests`) → 다음 서버 시작 때 NPC 건물만 같은 ID로 옮김(플레이어가 걸린 건물·플레이어 건물·가문 도시 제외, 도시 단위 되돌림, 감사 기록).
6. 운영자 화면 `/dev/world-layout` "도시 건물 배치" 판(표·그림·지금/뒤·예약), tRPC `worldLayout.cityLayout·requestCityRelayout·cancelCityRelayout`.

### 정한 것([임시], 질문으로 넘김)
- 숙소 3채, 광장 3칸, 채집소 띠 20~42칸, 원자재 반경 14칸, 창고 = 길 75%, 숙소 = 길 35%, 기타 고리 9칸, 흔들기 2칸.
- 채집 구역 수 = 창고 수(적어도 1). 채집소가 둘레로 흩어지면 창고 1~2채로는 옮김 거리가 길어져서(측정: 흩기 가중 1600 → 옮김 22.6칸), 채집소를 구역에 모으고 구역끼리만 각도를 벌렸다(옮김 8.4칸).
- 다시 놓기는 부팅 때만(경로 서비스·전송 전) — 같은 ID로 칸만 바꿔도 다른 상태와 어긋나지 않는다.

### 측정: 옛 → 전략 (Verified: `pnpm --filter @terra/server bench:city-layout 16`, S2 시험 행성 F9, 빈 세계 등급 배치의 국가 8곳 × 수도·지방 도시 = 16도시, 같은 지형·원자재·국가 씨앗)
| 평균 | 옛 | 전략 |
|---|---|---|
| 행정 건물 치우침(칸) | 9.0 | 0.1 |
| 둘레 덮임(16방위 중 30칸 안 건물) | 3.1 | 4.1 |
| 가림(64줄 중 48칸 안 건물에 닿는 ‰) | 197 | 191 |
| 행정 ↔ 숙소 · 창고 · 채집소(칸) | 15.8 · 5.9 · 18.7 | 9.7 · 21.4 · 29.4 |
| 옮김: 채집소 → 가장 가까운 창고(칸) | 16.7 | 8.4 |
| 출퇴근 돌아감(‰, 1000 = 숙소가 길 위) | 1652 | 1027 |
| 갇힌 건물 | 0 | 0 |
| 채집소 14칸 안 맡는 원자재 합 | 169 | 264 |
| 씨앗 시간(16도시 합) | 17ms | 286ms |
- 옛 줄은 같은 건물 수(7·9·10)의 도시마다 값이 똑같다(도장). 전략 줄은 도시마다 다르다.
- 숙소 수 비교(같은 16도시 아닌 12도시 실행): 2채 둘레 덮임 3.7 · 3채 4.2 · 4채 5.2/16.
- 표 원본: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/citylayout-bench.md`(이 세션 임시 폴더).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/cityLayout.ts`(새)·`cityLayout.test.ts` | 배치 함수(순수), 시험 7(결정성·겹·옮김·출퇴근·갇힘·땅 조건·옛 건물 피함·각도 묶음) |
| `apps/server/src/facilities/cityLayoutGround.ts`(새) | 2차맵 → 계획 땅(격자 복사·오브젝트·물가·유닛), 설정 칸 → 규칙, 도시 시드 |
| `apps/server/src/facilities/cityLayoutMetrics.ts`(새) | 지표(측정·시험·화면 같은 셈) |
| `apps/server/src/facilities/npcSeed.ts`(+시험·DB 시험) | 전략 배치 길, 숙소 수, 옛 배치는 모드 0 |
| `apps/server/src/facilities/cityRelayout.ts`(새)·`cityRelayout.db.test.ts` | 다시 놓기 계획·적용·예약·부팅 적용·감사 |
| `apps/server/src/facilities/cityLayoutView.ts`(새) | tRPC 조회·예약 서비스 |
| `apps/server/src/facilities/world.ts`, `app.ts` | 팩 원자재 오브젝트 종류(`gatherKinds`)를 건물 세계로, 조회 서비스 잇기 |
| `apps/server/src/world/world.ts` | 부팅 때 다시 놓기 예약 적용(씨앗 직전, 2줄) |
| `apps/server/src/world/secondMap.ts` | `placeBuilding(…, reuseId)`, `unitInRect` |
| `apps/server/src/world/placementService.ts`, `trpc/worldLayout.ts`(+시험) | `cityLayout` 서비스·tRPC 셋 |
| `apps/server/src/npc/humanPlaces.ts`(+시험), `npc/runtime.ts`, `npc/economy.ts`, `market/worldInput.ts`, `world/bots.ts` | 일꾼 집 = 가장 가까운 숙소(`lodgingsIn`, `BotHome.homeRadius`) |
| `apps/server/src/db/worldPlacementSchema.ts`·`schema.ts`, `drizzle/20261111171114_city_layout_requests/` | 예약 표(더하기만) |
| `apps/server/bench/cityLayout.ts`(새), `package.json`(`bench:city-layout`), `tsconfig.json`·`bench/tsconfig.json` | 측정 스크립트 |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json` | 설정 칸 열(`city_layout_*` 아홉·`npc_seed_lodgings`) |
| `content/core/facilities.json`·`manifest.json`, `packages/content/src/schema/economy.ts`, `packages/shared/src/buildingEditor.ts` | 숙소 시설·단계 `living`, core@71 |
| `packages/shared/src/worldPlacementApi.ts` | 조회 모양 |
| `apps/game/src/editor/worldLayout/WorldCityLayoutPanel.tsx`(새)·`cityLayoutModel.ts`(새, +시험)·`WorldLayoutScreen.tsx`·`worldLayout.css` | 운영자 판 |
| `apps/game/src/editor/buildings/buildingMessages.ts`, `economy/economyText.ts`, `messages/{ko,en}.json` | 단계 이름 "생활"·판 문구(ko·en) |
| `e2e/city-layout.spec.ts`(새), `e2e/helpers/cityMap.ts`(새), `e2e/building-art.spec.ts` | 판·2차맵 사진, 도시 2차맵 도우미를 helpers로 |
| ADR·질문·PLAN 14장 | 위 관련 |

## 함께 바꿔야 하는 파일
- 시설 단계를 더하면 `packages/content` `FACILITY_STAGES`·`packages/shared` `FACILITY_STAGE_IDS`·`buildingMessages.ts`·`economyText.ts`·`cityLayoutGround.ts layoutRoleOf`.
- 다시 놓기가 지키는 "플레이어가 걸린 건물" 표(`cityRelayout.ts loadRelayoutInputs`) — 건물 ID를 쥐는 새 표가 생기면 거기 더한다.

## 건드리지 말 것
- NAS 세계(통합 줄기가 이 가지 전에 세계를 새로 시작한다 — 이 배치는 그 새 세계에 들지 않는다. 들이려면 이 판 배포 뒤 `/dev/world-layout` 예약 또는 다음 새로 시작).

## 검사
Verified = 이 작업 트리에서 실행해 결과를 봄.
- 단위: 서버 배치·씨앗·조회 관련 39파일 321개(DB 시험 제외), sim 93파일 741개, content 14파일 129개, shared 43파일 433개, 게임 editor·economy 50파일 471개 — 통과.
- DB: `npcSeed.db.test.ts` 4개, `cityRelayout.db.test.ts` 1개(옛 배치로 선 세계 → 예약 → 다시 켬: NPC 건물 같은 ID로 옮김, 임대 걸린 농장·주인 바꾼 창고 그대로, 행정 건물 도시 칸 4칸 안, 결과·감사 기록, 다시 켜도 한 번만) — 통과.
- `pnpm check:content --no-compat`: core@71 통과.
- 끝 검사: `TEST_DATABASE_URL=… pnpm check` 통과 — 627파일 4,833시험(DB 시험 포함, 첫 번에는 시험 파일 린트 경고 하나 → 고침). `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 108,784 B / 상한 131,416 B(상한 그대로). `pnpm check:docs origin/main`·`check:contrast`·`check:content --no-compat`(core@71) 통과.
- 화면(`pnpm e2e`): `city-layout.spec.ts` 3개(운영자 판 — 새 세계 15도시 모두 행정 치우침 3칸 안·갇힘 0·숙소 있음, 다시 놓기 미리 보기 옮길 건물 0; 시작 도시 2차맵 390 파스텔·다크 사진) + `building-art.spec.ts` 건물 누르기 1개(도우미를 `e2e/helpers/cityMap.ts`로 옮긴 뒤) 통과. 판 사진에서 좁은 화면 도시 이름이 한 글자씩 꺾여 고친 뒤 다시 찍음. building-art 사진 시험·world-layout spec은 돌리지 않았다.
- 사진(이 세션 임시 폴더 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/city-layout-shots/`): `city-layout-map-pastel-ko-390.png`·`city-layout-map-dark-ko-390.png`·`city-layout-panel-light-ko-390.png`.

## 미검증·TODO·알려진 문제
- 공성 전투는 2차맵 배치를 쓰지 않는다(질문 1046) — "시간을 번다"는 지금 2차맵 걷기에서만.
- 숙소는 쉼터 자리만(피로·요금·수용 없음, 질문 1047). 플레이어 짓기 목록에도 숙소가 보인다(효과 없음).
- 이 판으로 NAS(옛 세계)를 켜면 시작 도시마다 숙소 셋이 더해진다(Assumed: 자리가 있으면 — 옛 건물 둘레).
- 사람이 많은 도시 가운데는 다시 놓기 때 행정 건물이 몇 칸 비켜 설 수 있다(유닛 칸 피함).
- 49도시 부팅 씨앗 시간은 16도시 286ms로 어림(약 1초 안, Assumed).

## 사용자 결정 대기
- 질문 1046~1055(`docs/questions/2026-11-12-city-layout.md`). 급한 것: 1054(NAS 옛 세계에 예약을 쓸지), 1046(공성 전투가 배치를 쓰게 할지), 1048(성벽).

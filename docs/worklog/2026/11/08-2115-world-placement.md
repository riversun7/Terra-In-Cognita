# 세계 배치 2(D-528): 개발자·관리자가 고정 NPC 국가 자리를 놓는 화면, NPC 수도 고르기·옮기기

- 일시: 2026-11-08 21:15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-528(기획 커밋 1f57a02), ADR `docs/adr/2026-11-07-world-layout.md` "바뀜 (D-528)"(상태 → 확정 2026-11-08, 사용자 결정 — D-528 반영), 질문 `docs/questions/2026-11-08-world-placement.md` 860~868(새, 확인 대기), ADR `2026-11-02-dev-ui.md`·`2026-11-07-play-flow.md` "WP-NPC"·`2026-11-08-world-reset.md`, 가지 `work/world-placement`(시작점 main `8306207`, 통합 가지 `merge/integration` 합침 — 설정 칸 분야 페이지 core@56·식품 포장 프로토콜 19)

## 한 일
- **세계 배치 화면 `/dev/world-layout`**(dev·admin, 개발 화면 층): 행성 편집기 평면 미니맵(`FlatMap`)을 1차맵 타일(맵 레벨 F−3, 24장, 같은 바이옴 색 — 엔진 없이 같은 주소·해석기)로 칠하고 국가 도시·수도·놓은 자리·자동 제안 표시를 겹친다(`pointer-events: none`). 국가 고르기 → 지도 누르기 → [여기에 놓기]·[놓은 자리 지우기]·[자동 제안 보기]→[제안 모두 놓기]. 표 = 도시 수·수도(발전도)·자리 상태(자동·다음 시작 때 듦·적용됨·막힘 + 막는 것)·놓은 사람.
- **서버**: tRPC `worldLayout.view·suggest·place·clear`(권한 `worldLayout: read·place`, dev·admin), 서비스 `world/placementService.ts`(알맞은 땅으로 12칸 안 옮기기·국가 간격·시험 줄 둘레 검사, 이미 선 국가의 막는 것 미리 보기, 감사 기록 `world.place_nation`·`world.clear_nation_place`).
- **저장**: 표 `world_nation_placements`(행성 × 세력 코드, 수도 2차맵·놓은 사람·든 시각·막는 것) + 세력 열 `capital_city_id`, 마이그레이션 `20261108115023_world_placement`(더하기만). 세력 코드로 적어 `reset-world`가 지우지 않는다(`WORLD_RESET_KEEP`에 더함 — 새 세계가 처음부터 놓은 자리에 선다).
- **켤 때**(`world/worldBoot.ts`·`world/nationPlacement.ts`): 아직 들지 않은 자리마다 — 시작 도시가 없는 국가는 그 자리가 고정 수도(`worldLayout.ts` `LayoutNation.home`), 시작 도시가 선 국가는 옛 자리 옮기기(`relayout.ts`)와 같은 막는 것을 보고 막는 것이 없을 때만 국가째 옮긴다(감사 기록 `world.place_nation_city`, `applyRelayout`에 동작 이름 인자). 마을이 있으면 `other_cities`로 막는다. 막히면 `blocked`에 까닭.
- **지도자도 옮긴다**: 옛 자리 옮기기의 함께 옮기는 유닛에 그 2차맵의 그 나라 지도자를 더했다(`inspectLegacyCity`) — 빼면 옛 2차맵에 지도자가 남고 새 수도에 하나 더 섰다(DB 시험으로 확인한 문제).
- **NPC 수도**(`npc/capitals.ts`): 발전도 최고(같으면 시작 도시 → 작은 ID) [임시]. 런타임이 켤 때·하루 끝마다 다시 보고 다른 도시가 설정 칸 `npc_capital_switch_dev`(10점) 이상 앞서면 옮긴다(수도를 잃으면 바로). 저장 = 쓰기 대기열 `factionCapital`. 지도자(`npc/leaders.ts` `moveLeaderToCapital` — 켤 때 수도 아닌 2차맵의 지도자도 옮김)·정부 판 "수도"·지도자 창구(`government/reads.ts` 런타임 `capitalOf`)가 따른다.
- **D-341**: 그대로(처음 세운 시작 도시만 보호). "시작 = 시작 세력" 보호 범위는 질문 864.
- **설정 칸**: `npc_capital_switch_dev`(세력·사회 계수표 `worldSeed.capitalSwitchDev`, 출발값 10, 설명·출처 칸, 분야 페이지 = NPC). 팩 판은 core@56 그대로(같은 묶음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/db/worldPlacementSchema.ts`(새)·`schema.ts`·`drizzle/20261108115023_world_placement/`(새) | 국가 자리 표·세력 수도 열 |
| `apps/server/src/world/nationPlacement.ts`(새)·`nationPlacement.db.test.ts`(새) | 자리 읽기·든 표시·국가째 옮기기 계획, DB 시험 |
| `apps/server/src/world/placementService.ts`(새)·`trpc/worldLayout.ts`(새)·`trpc/worldLayout.test.ts`(새)·`trpc/router.ts`·`trpc/context.ts`·`trpc/createContext.ts`·`app.ts` | 화면 조회·놓기·지우기·제안, 권한·감사 기록, 맥락 잇기 |
| `apps/server/src/world/worldBoot.ts`·`worldLayout.ts`·`worldLayout.test.ts` | 켤 때 자리 들이기, 고정 수도 `home` |
| `apps/server/src/world/relayout.ts` | 지도자를 함께 옮김, 감사 기록 동작 이름 인자 |
| `apps/server/src/npc/capitals.ts`(새)·`capitals.test.ts`(새)·`runtime.ts`·`state.ts` | NPC 수도 고르기·하루 끝 다시 보기·저장 |
| `apps/server/src/npc/leaders.ts`·`leaders.test.ts`·`world/cities.ts`·`world/world.ts` | 지도자가 수도를 따라감(고른 수도 읽기·옮기기) |
| `apps/server/src/government/reads.ts` | 정부 판 수도 = 런타임 수도 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 `factionCapital` |
| `apps/server/src/npc/nations.ts` | 자리 함수에 세력 코드를 넘김 |
| `apps/server/src/auth/permissions.ts` | 권한 `worldLayout: read·place`(dev·admin) |
| `apps/server/src/cli/resetWorld.ts` | `world_nation_placements`는 남김 |
| `packages/shared/src/worldPlacementApi.ts`(새)·`package.json` | 응답 모양·코드 목록 |
| `packages/shared/src/routes.ts`·`routes.test.ts` | 주소 `dev_world_layout` |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json` | 설정 칸 `npc_capital_switch_dev` |
| `apps/game/src/editor/worldLayout/`(새: 화면·지도·모형·행성 받기·문구 표·CSS·시험) | 세계 배치 화면 |
| `apps/game/src/editor/DevHome.tsx`·`devIcons.tsx`·`shell/routeViews.tsx`·`sections/ComingSoon.tsx`·`scripts/pwa-build.mjs` | 개발자 도구 줄·지연 조각(`[Ww]orldLayout`, 미리 캐시 밖) |
| `apps/game/messages/{ko,en}.json` | 화면 문구 |
| `e2e/world-layout.spec.ts`(새) | 화면 시험·사진 |
| `docs/adr/2026-11-07-world-layout.md`, `docs/questions/2026-11-08-world-placement.md`(새), `docs/PLAN.md` | 기록 |

## 함께 바꿔야 하는 파일
- 막는 것 코드를 더하면 `world/relayout.ts` `RELAYOUT_REASONS`·`world/nationPlacement.ts`·`packages/shared/src/worldPlacementApi.ts` `WORLD_PLACE_BLOCKERS`·화면 문구 표(`worldLayoutMessages.ts`)·메시지 둘.
- 세계 밖 표를 더하면 `cli/resetWorld.ts` `WORLD_RESET_KEEP`(이번에 `world_nation_placements`).

## 건드리지 말 것
- `world_nation_placements`는 세력 코드 열쇠다(세력 행 ID로 바꾸면 세계 새로 시작 뒤 자리가 사라진다).
- 세력 상태 쓰기(`factionState`)에 `capital_city_id`를 넣지 않는다(직전 판 앱이 지운다).

## 검사
- (작업 끝에 채움)

## 미검증·TODO·알려진 문제
- 실행 중에는 자리가 들지 않는다(서버를 다시 켜야 함, 질문 861). 화면이 "다음 시작 때 듦"으로 알린다.
- NAS에서 화면을 눌러 본 적 없다(e2e 서버만). 빌드한 서버로 다시 켜 국가가 옮겨지는 것은 DB 시험만(Verified: DB 시험), 화면 시험은 다시 켜지 않는다.
- 평면 지도는 면마다 64칸이라 누른 픽셀이 2차맵 여러 칸에 걸친다(놓은 칸 = 누른 픽셀 가운데, 서버가 알맞은 땅으로 옮길 수 있음).
- 수도 표시는 정부 판에만(1차맵·세력 화면은 질문 868).

## 사용자 결정 대기
- 질문 860~868(`docs/questions/2026-11-08-world-placement.md`).

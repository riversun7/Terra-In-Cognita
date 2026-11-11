# 행성 범위: 편집기·모니터링의 범위 줄과 행성 고르기

- 일시: 2026-11-11 17:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-planet-scope.md`(제안), 질문 `docs/questions/2026-11-11-planet-scope.md`(936~945), 가지 `work/planet-scope`(기준 main `8370909`). 사용자 요청(2026-11-11, 원문): "문제1. 현재 행성을 선택이 필요한 에디터에 행성 선택하는 기능이 없어 어디에만 반영되는지 확인 불가. 모니터링도 행성별로 가능해야함. 현재는 행성이 하나이지만 최종적으로 하나의 은하를 범위로 할것이고 항성계(태양계)의 미래지구형 행성 하나를 시작으로 할것이고 태양계 행성들을 테라포밍하여 플레이 가능한 행성을 넓히는게 근접한 목표이다."

## 한 일
- **범위 줄**(`apps/game/src/scope/`): 개발·운영 화면 머리에 "범위" 표지와 한 줄 풀이. 틀이 보이는 화면은 주소 → 화면 표(`shell/routeViews.tsx`)가 화면 위에 한 번에 그리고(편집기 파일을 고치지 않음), 틀을 숨긴 화면 넷은 머리에 한 줄을 둔다.
  - 규칙·수치 편집기: 고정 표지 **모든 행성 공통** + "이 세계의 덮어쓰기 … 지금 플레이 행성 1개: S2 시험 행성".
  - 행성에 묶인 화면: **행성 고르기**(이름 · 상태 표지 플레이 중·편집 전용, 행성 ID). 고른 값은 주소 `?planet=`과 계정 기억(이 기기)에 남는다. 틀린 값은 대표 플레이 행성으로 고친다.
  - 행성 편집기·항성계: "보관함·초안에만 저장 — 플레이 중인 행성은 바뀌지 않습니다".
  - 담은 변경 막대에 **적용 대상**(공용 막대·설정 칸 = 모든 행성 공통, 세계 배치·영토 = 그 행성).
- **서버**: 플레이 행성 목록 도우미(`world/playablePlanets.ts`, 지금 하나), tRPC `planetScope.list`, `worldLayout.*`·`territory.*`의 `planetId`를 선택 입력으로(없으면 대표 행성), `recruit.board`에 선택 입력, 운영 조회(`ops.npcs.factions`·`npcs.cities`·`units.list`·`audit`)에 행성 거르기(없으면 전체), `ops.overview`에 행성별 합, 유닛 통제 감사 기록에 `meta.planetId`, 1분 지표에 행성 줄(`"metric":"planet"`), `nas-metrics`에 행성 구역.
- **운영자 콘솔**: 범위 줄에서 행성을 고르면 현황(행성별 합 표 + 고른 행성 값)·세력·도시·유닛·감사 기록이 걸러진다. 처음 값은 전체(`?planet=*`). 유저·화폐·경제 탭은 "세계 전체" 한 줄. 감사 기록 표에 범위 칸.
- 은하 층 자료·행성 사이 규칙·표 구조 바꾸기는 하지 않았다(ADR 6절에 나중에 행성 칸이 필요한 표 목록).

### 화면마다 범위(Verified: 코드 읽음 — 근거는 ADR 2절)
| 범위 | 화면 |
|---|---|
| 모든 행성 공통(표에 행성 칸 없음: `tuning_overrides`·`content_overrides`·계산식) | 설정 칸, 밸런스·계산식, 스킬, 아이템, 효과 사전, 건물, 1차 생산 티어 확률, 크리처, 시작 국가 설정(프리셋 = 팩 항목, [이 세계에 반영]은 세력 정체성·화폐 표시만) |
| 행성 하나(세계 표 `planet_id`) | 세계 배치, 영토 층, 구인 카드 시험, 2차맵 시험(편집 전용 행성도, 보기 전용), 운영자 콘솔의 현황·NPC 세력·도시·유닛·감사 기록 |
| 행성 보관함 / 항성계 초안(세계에 반영 안 됨) | 행성 편집기(`planet_library`) / 항성계 편집기(`star_systems`) |
| 행성과 무관 | 전투 다시보기(시범), 셰이더 측정(이 기기), 운영 권한 부여·관리자(계정), 운영자 콘솔의 유저·화폐·경제(세계 전체) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/planetScope.ts`(+시험), `package.json` exports | 범위 응답 모양·상태·주소 값 읽기·고른 행성 풀기·감사 기록 행성 읽기 |
| `apps/server/src/world/playablePlanets.ts`(+시험), `world/testMaps.ts`, `app.ts` | 플레이 행성 목록 도우미. 2차맵 행성·세계 행성 고르기가 이 도우미를 쓴다. 범위 목록·행성 지표 줄 잇기 |
| `apps/server/src/trpc/planetScope.ts`, `router.ts`, `context.ts`, `createContext.ts` | tRPC `planetScope.list`(맥락에 팩 행성 원본 접근자 하나) |
| `apps/server/src/trpc/worldLayout.ts`·`territory.ts`·`recruit.ts`·`ops.ts`(+시험) | `planetId` 선택 입력·검사 |
| `apps/server/src/ops/reads.ts`·`services.ts`·`world.ts`·`planetReads.ts`(새), `ops.db.test.ts` | 행성 거르기(세력·도시·유닛·감사 기록), 행성별 합, 감사 기록 `meta.planetId` |
| `apps/server/src/metrics.ts`(+시험), `.github/workflows/nas-metrics.yml` | 행성 지표 줄(서버 줄은 그대로), 지표 보기 구역 |
| `packages/shared/src/ops.ts` | `OpsPlanetTotals`, `OpsServerOverview.planets?` |
| `apps/game/src/scope/`(새: `ScopeBar.tsx`·`planetScopeStore.ts`·`scopeRoutes.ts`·`scope.css`, 시험 둘) | 범위 줄·행성 범위 저장소·화면 → 범위 표 |
| `apps/game/src/shell/routeViews.tsx` | 틀이 보이는 개발·운영 화면 위에 범위 줄(지연 조각, 화면과 같은 Suspense) |
| `apps/game/src/editor/worldLayout/WorldLayoutScreen.tsx`, `territory/TerritoryLabScreen.tsx`, `recruit/RecruitLabScreen.tsx`, `secondMapLab/SecondMapLabScreen.tsx`(+css 한 줄) | 행성 상수 대신 고른 행성(행성이 바뀌면 화면을 새로 만든다), 적용 대상 |
| `apps/game/src/editor/planet/PlanetEditorScreen.tsx`, `starSystem/StarSystemScreen.tsx`, `battleReplayLab/BattleReplayLabScreen.tsx` | 머리에 범위 줄 한 줄 |
| `apps/game/src/editor/content/contentEditorPending.tsx`, `tuning/TuningPendingBar.tsx` | 적용 대상 표지 |
| `apps/game/src/ops/OpsConsole.tsx`·`OverviewTab.tsx`·`FactionsTab.tsx`·`NpcTabs.tsx`·`UnitsTab.tsx`·`AuditTab.tsx` | 행성 거르기, 행성별 합 표, 감사 기록 범위 칸 |
| `apps/game/messages/{ko,en}.json` | `scope_*` 문구 41개(ko·en) |
| `e2e/planet-scope.spec.ts`(새), `e2e/dev.spec.ts`(끝에 범위 줄 표 시험), `e2e/recruit.spec.ts`(주소 끝 `&planet=` 허용), `e2e/ops.spec.ts`(화폐 줄을 받은 뒤 약어 읽기 — 경쟁 고침) | 화면 시험 |
| `docs/adr/2026-11-11-planet-scope.md`, `docs/questions/2026-11-11-planet-scope.md`, `docs/PLAN.md`(14장 표 한 줄), ADR `2026-11-07-world-layout.md`·`2026-11-08-operator-console.md`("바뀜 (2026-11-11)"), `AGENTS.md` 8장(새 개발 화면은 범위 표에 한 줄) | 문서 |

## 함께 바꿔야 하는 파일
- 새 개발 화면: `apps/game/src/scope/scopeRoutes.ts`에 범위 한 줄 + `e2e/dev.spec.ts` `TOOL_SCOPES` 한 줄.
- 플레이 행성을 더할 때: `apps/server/src/world/playablePlanets.ts` 목록 + 그 행성의 2차맵·지형 서비스·NPC 사회 런타임 띄우기(ADR 5절 3 — 지금 대표 행성 하나만 돈다).
- 행성에 묶인 새 조회·쓰기: `planetId` 입력(없으면 `primaryPlanetId()`), 감사 기록 `meta.planetId`.

## 건드리지 말 것
- 서버 1분 지표의 서버 줄(`"metric":"server"`) 모양: `ops/s3-ramp.sh`·`s3-ramp-summary.mjs`·`nas-metrics`가 읽는다. 행성 값은 행성 줄에 둔다.
- `ALL_PLANETS`("*")는 행성 ID 모양이 아니어야 한다(주소 `?planet=*`).
- 범위 줄 조각은 `src/editor/` 밖(`src/scope/`)에 둔다: 운영자 콘솔 조각(미리 캐시됨)이 같이 써서 개발 전용 소스 규칙(`DEV_ONLY_SOURCE`)에 넣으면 `check-pwa`가 실패한다.

## 미검증·TODO·알려진 문제
- 검사 결과는 아래 "검사" 절.
- 미룸(ADR 5·6절): 플레이어 화면의 행성 상수(`map/PlanetMapScreen.tsx`·`start/StartCityMap.tsx` `PLANET_ID`, 지도 줄기 몫), 전투의 행성별 수(`world_battles`에 행성 칸 없음), 행성마다 다른 설정 칸.
- 플레이 행성이 둘 이상일 때의 화면(행성 바꾸면 조회가 바뀜)은 시험하지 못했다(Unknown: 세계에 행성이 하나다). 서버 거르기는 다른 행성 ID로 빈 결과를 본다(DB 시험).
- 주소로 바로 연 화면이 아닌 앱 안 이동에서, 기억한 행성과 주소 행성이 다르면 조회가 한 번 더 나갈 수 있다(Assumed: 코드 읽기 — 행성이 하나라 재현 못 함).
- 고른 행성 기억은 기기 값이다(localStorage). 다른 기기에서는 대표 행성부터.

## 사용자 결정 대기
- 질문 936~945(행성 사이 경제, 국가 프리셋·설정 칸의 범위, 테라포밍이 행성을 여는 조건, 플레이어 화면의 행성 고르기, 상태 이름).
- ADR `2026-11-11-planet-scope.md` 확정(범위 줄·행성 고르기 화면을 본 뒤).

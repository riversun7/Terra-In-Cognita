# 건물 편집기 개편 2: 1차 생산 티어 확률 분리·2차맵 모습(3D 미리 보기·편집)·개발자 편의

- 일시: 2026-11-09 22:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-02-building-editor.md`·`2026-11-08-building-art.md` "바뀜 (2026-11-09)"(상태 줄 그대로), ADR `2026-11-02-dev-ui.md`, 가지 `work/building-editor-2`(바탕 main c296a43)

## 한 일
- 사용자 원문(2026-11-09, `/dev/buildings`를 보며): "건물편집기에 1차생산 티어확률이 왜 있냐 따로 존재해야한다. 건물편집기를 제대로 ux/ui, 개발자 편의 인터페이스로 만들라니까? 속성중에 2차맵에서 보여질 이미지,폴리곤 이미지도 보여지고 수정하는등 가능하게해라".
- **1차 생산 티어 확률 → 새 개발 도구 `/dev/gather-tiers`**(주소 줄 `dev_gather_tiers`, 개발자 홈 줄): 옛 카드 열두 장을 행렬 표 하나로(구간 × T0~T9 ‰, 합·분포 막대·줄 프리셋·[1000‰ 맞춤]·[팩 값으로]·[담기 취소], 칸마다 담음·팩과 다름 띠, ↑↓ = 위·아래 구간 같은 티어). 전체 프리셋·시설 주/보조 스탯 안내 유지. 박혀 있던 한국어·영어 글을 메시지 키로(`dev_gather_*`). 서버는 그대로(`buildings.*`). 건물 편집기에서 탭·`GatherProbTab.tsx`·담음 `gatherBands`를 뺐다. 미리 캐시 밖(`globIgnores` `[Gg]atherTier`, `DEV_ONLY_CHUNK`, `DEV_ONLY_SOURCE` `gatherTiers`).
- **시설 2차맵 겉모습 자료**(팩 core@59): `facilities.look = { model?, wall?, roof?, heightPm? }`(공용 이름표 `@terra/shared/facilityLook`, 스키마 `packages/content`). 출발값 = 엔진이 시설 ID로 고르던 모델(16개, 그림 그대로). 엔진 `resolveLook`이 먼저 쓰고(벽·지붕 색은 종류 모델의 집 벽·지붕 등, 높이 배율은 판 위 조각에 곱함), 서버 `facilities.mapLooks`가 실효 `look`을 `art`로 싣고, 화면 `buildingLooks.ts`가 엔진에 넘긴다(편집기 [적용] → 2차맵은 다음 조회 최대 30초).
- **건물 편집기 "2차맵 모습" 구역**: 3D 미리 보기(새 진입점 `@terra/engine/buildingPreview`, 2차맵과 같은 `BuildingView`·고정 낮 빛, 칸 금·앞면 화살표, 끌기·휠·키, 레벨 짓는 중·1~5·상태·레벨 올리는 중·국가 색·밤은 보기만) + 저장 칸(2차맵 칸 가로·세로 — 기본 구역에서 옮김, 모델 종류, 벽·지붕 색 견본, 높이 배율 ‰), 크기 글(칸 = m·높이·조각 수). 지도 아이콘·그림 파일은 없어서 "없음"이라고 적었다. 미리 보기 조각은 `buildingEditorPreview-*`로만 지연 로딩.
- **개발자 편의 개편**(건물 편집기만, 공용 부품에 선택 모드): 칸 풀이는 이름표 옆 [i]로 펼침(`FieldHintProvider mode="tip"`), 단위는 입력 칸 오른쪽, 범위는 title·펼친 풀이. 구역 풀이도 근거 한 줄 + [i]. 구역 바로 가기를 붙는 편집 판 머리 안으로. 이끄는 글 두 줄로. 짝 칸 격자(`be-grid-pair`).
- 결함 막음: 시설 다듬기·3방향 합치기에 `look`을 넣었다(빠지면 다른 칸만 고쳐도 덮어쓰기가 칸을 지운다).
- 스킬 순서: 디자인 시스템·개발 화면 층이 정해져 있어 1·2단계는 건너뛰었다. `web-design-guidelines` 규칙으로 본 것: 캔버스 키 조작(tabIndex·role img·aria-label·aria-describedby 키 안내), 색 견본은 라디오 묶음(숨긴 이름·초점 띠), [i]는 aria-expanded·aria-controls, 접힌 풀이는 aria-describedby로 그대로 읽힘, 누르는 곳 최소(--tap-size) 지킴. `break-ui`는 아래 390·1440 × ko·en 사진으로 대신했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityLook.ts`(새)·`package.json`, `buildingEditor.ts`, `mapLooks.ts` | look 이름표·모양, 편집기·조회 자료에 칸 |
| `packages/content/src/schema/economy.ts`, `validate/facilities.test.ts` | look 스키마·시험 |
| `content/core/facilities.json`·`manifest.json` | look 출발값 16개, core@59 |
| `packages/engine/src/buildings/buildingLook.ts`·`buildingModels.ts`·`buildingKinds.ts`·`buildingPalette.ts`·`buildingView.ts`·`buildingModels.test.ts` | look 반영(모델·색·높이), 이름표 시험 |
| `packages/engine/src/buildings/buildingPreview.ts`·`previewEntry.ts`·`artEntry.ts`(새), `package.json` | 미리 보기·순수 이름표 진입점 |
| `apps/server/src/buildingEdit/views.ts`, `facilities/catalog.ts`·`mapLooks.ts`·`mapLooks.test.ts`·`appSource.ts` | look 화면 JSON, 실효 look을 겉모습 조회에 |
| `apps/game/src/map/buildingLooks.ts`·`.test.ts` | art를 엔진에 |
| `apps/game/src/editor/gatherTiers/*`(새) | 티어 확률 화면·모델·표·문구·CSS·시험 |
| `apps/game/src/editor/buildings/BuildingLookSection.tsx`·`buildingLookText.ts`·`buildingEditorPreview.ts`(새), `BuildingDetail.tsx`·`BuildingEditorScreen.tsx`·`buildingModel.ts`·`.test.ts`·`buildingEditor.css`, `GatherProbTab.tsx`(지움), `CheckLater.tsx` → `content/contentEditorCheckLater.tsx` | 2차맵 모습 구역, 확률 탭 빼기, 개편 |
| `apps/game/src/editor/content/contentEditorFields.tsx`·`contentEditorLayout.tsx`·`contentEditorShell.css` | tip 풀이 모드·단위 붙임·머리 안 바로 가기(선택) |
| `apps/game/src/editor/DevHome.tsx`·`devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `packages/shared/src/routes.ts`·`.test.ts` | 새 주소·개발자 홈 줄 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`·`.test.mjs` | 새 개발 조각 미리 캐시 밖 |
| `apps/game/messages/ko.json`·`en.json` | 새 문구 약 114개, 바꾼 2개(이끄는 글·개발자 홈 풀이), 지운 3개(옛 탭) |
| `e2e/buildings.spec.ts`·`e2e/gather-tiers.spec.ts`(새)·`e2e/dev.spec.ts` | 2차맵 모습·티어 화면·개발자 홈 줄 수(13 → 15, 세계 배치 줄로 이미 어긋나 있던 것 포함) |

## 함께 바꿔야 하는 파일
- 모델 종류·색 이름을 더하면 `packages/shared/src/facilityLook.ts`(끝에만 더함)·엔진 `buildingKinds.ts`·`buildingPalette.ts` `LOOK_COLORS`·편집기 `buildingLookText.ts`·메시지를 같이(엔진 시험이 이름표를 맞춰 본다).
- 시설 칸을 더하면 `buildingModel.ts` `cleanFacility`·`mergeFacility`와 서버 `buildingEdit/views.ts`.

## 건드리지 말 것
- 프로토콜·시뮬·DB(겉모습은 tRPC 조회 칸 하나, 판 올림 없음). 아이템·스킬 편집기의 풀이 모양(기본 inline 그대로).

## 미검증·TODO·알려진 문제
- 미리 보기 프레임 시간은 헤드리스 SwiftShader라 휴대폰 값 아님(Unknown). 바뀔 때만 그린다.
- 배치 칸 크기는 미리 보기에서 5.86m 고정(행성마다 조금 다르다).
- 높이 배율 칸이 비었을 때 1000‰을 칸 안 글자로 보이지 않는다(풀이에만).
- 벽·지붕 색은 종류마다 쓰는 곳이 다르다(광산은 권양탑 지붕만, 바위는 그대로).
- 사용자 원문 "이미지"는 그림 파일이 없어(2차맵은 코드 로우폴리 모델만) 3D 미리 보기로 대신했다 — 따로 아이콘을 원하면 다음 줄기.

## 검사
- `TEST_DATABASE_URL=… pnpm check`: 통과(vitest 564파일·4,294시험, 포맷·린트·타입·경계·크기·다국어 5,678키·디자인 값·콘텐츠).
- `pnpm check:docs origin/main`·`pnpm check:content origin/main`(기준 c296a43, core@59): 통과.
- `pnpm build` → `node scripts/check-pwa.mjs` 통과(`GatherTierScreen-*`·`buildingEditorPreview-*`는 미리 캐시 밖, sw.js에 없음). `pnpm check:bundle` 첫 화면 JS 107,513 B / 131,416 B(첫 화면이 싣는 주소 표 `routes.ts`에 줄 하나 더함).
- `pnpm e2e e2e/buildings.spec.ts e2e/gather-tiers.spec.ts e2e/dev.spec.ts e2e/dev-stagebar.spec.ts`: 45시험 통과. 앞선 실행에서 고친 것: 미리 보기 "레벨 올리는 중" 체크 상자가 "편집 판에 켜기 칸 없음" 시험·누르는 곳 크기에 걸림 → 눌림 단추로, 확률 표 머리(붙는 `.dev-table` 머리)가 가로 스크롤 상자 안에서 첫 줄을 가림 → 공용 `.dev-table-wrap`, 시설 고리 누르는 곳 22px → 최소 폭, 휴대폰 사진이 목록 보기라 2차맵 모습이 안 찍힘 → 다시 열기, 개발자 홈 줄 수 13 → 15(세계 배치 줄로 이미 어긋나 있었다). 틀린 look을 서버가 막는지는 e2e 대신 팩 스키마 시험(`validate/facilities.test.ts`)으로 본다(`buildings.check`는 GET이라 시험 도우미가 못 부름).
- 사진(헤드리스 Chromium, 390 = 폭만·1440 = 데스크톱 프리셋, 개발 테마 둘 × 한국어·영어) 중 남긴 8장: 세션 임시 폴더 `bed2-shots/keep/`. 나머지와 `e2e/test-results`는 지웠다(디스크).

## 사용자 결정 대기
- 화면을 본 뒤 두 ADR "바뀜 (2026-11-09)" 확정(통합 담당).

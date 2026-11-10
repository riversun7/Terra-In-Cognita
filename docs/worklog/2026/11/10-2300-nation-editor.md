# 시작 국가 설정 편집기(/dev/nations) — 가상 이름·이름 만들기, 국가 마크(만들기·올리기·자르기), 국가마다 씨앗 값, 이 세계에 반영

- 일시: 2026-11-10 23:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-10-nation-editor.md`(제안), ADR `2026-11-09-faction-profiles.md`·`2026-11-01-npc-brain-r5.md` "바뀜 (2026-11-10)", 질문 `docs/questions/2026-11-10-nation-editor.md` 901~915, PLAN 14장, 가지 `work/nation-editor`
- 사용자 요청(2026-11-10, 원문): "시작 기본 npc국가세팅 에디터추가하고 반영하라. 임시국가, 임시화폐같은 명칭을 제대로 생성하나, 국가마크도 생성 및 유저는 업로드하여 일정 사이즈를 크롭?자를수있게 그외 사이보그나 유닛 수 등등 디테일한 조정"

## 한 일
- **팩 이름(core@61)**: 국가 프리셋 16개의 임시 국가·화폐·지도자 이름을 가상 이름으로 바꾸고(예: 01 메리데일 Meridale · 화폐 올더 Alder Ⱥ ALD · 지도자 졸란 하웰), 약어 3글자·화폐 약어 3글자·화폐 기호(획 그은 로마자 16개)를 서로 다르게 채웠다. 도시·사람 이름 목록은 프리셋 02~16을 말씨에 맞춰 다시 채웠다(01은 그대로). ID·화폐 코드는 그대로다. 프리셋마다 만든 마크 사양(`emblem`)·이름 말씨(`nameStyle`).
- **스키마**: `nation_presets`에 선택 칸 `emblem`(틀·나눔·상징·색 짜임)·`nameStyle`, 성격 칸에 국가마다 씨앗 값 여섯(`startHousing`·`startPopulationPm`·`startFarms`·`startLumberCamps`·`startMines`·`startStorehouses`). 팩 검사 `checkNations`(약어·화폐 약어·화폐 코드 겹침, 도시 직무 레시피의 시설).
- **이름 만들기** `@terra/shared/nameGen`: 말씨 16 × 종류 6, 시드 난수, 로마자 = 한글 음절 짝, 길이 규칙(D-5046)·욕설 조합·막은 이름 거르기.
- **국가 마크** `@terra/shared/nationEmblem` + `apps/game/src/ui/NationEmblem.tsx`: 사양 + 시그니처 컬러 → SVG(상징은 바탕과 대비 3 이상). 세력 화면(`/faction`) 세력 카드에 마크.
- **서버**: 덮어쓰기 층에 분류 `nation_presets`(마이그레이션 `20261110123352_nation_editor` — 분류 검사 넓힘 + 표 `nation_emblems`). tRPC `nations.list·check·save·history·uploadEmblem·removeEmblem·applyToWorld`. 그림 길 `GET /api/nation-emblems/<sha256>.png`. 서버가 읽는 프리셋 = 실효 값(`createLivePresets`, 저장하면 제자리에서 바뀜), 세계 씨앗은 덮어쓰기를 실은 뒤에 차린다. 국가마다 씨앗 값을 주거·기본 시설·처음 인구 씨앗이 읽는다.
- **화면** `/dev/nations`(개발자 홈 "시작 국가 설정", dev·admin): 국가 16줄 목록 + 편집 판(미리 보기, 정체성·화폐·시작 조건·인구·유닛·성격), [이름 만들기] 후보 다섯, 색 고르기(읽기 쉬운 색 20 + 대비 알림), 마크 [다시 만들기]·고르기, 그림 올리기 → 자르기(끌기·확대·화살표 키, 24·48·128px 미리 보기) → 256 × 256 PNG, [생성 마크로 되돌리기], [이 세계의 NPC 국가에 반영](미리 보기 → 반영), 담기 → 검사 → 적용·내보내기·최근 바꿈은 공용 부품 그대로.
- 문서: ADR 새로 하나(제안), ADR 둘에 바뀜 절, 질문 901~915, PLAN 14장 줄.

## 정한 것(기획에 없어 [임시])
- 프리셋 01~16을 30 §5.3의 모티프 차례에 그대로 맡겼다(질문 901). 옛 특산(성격 칸)은 건드리지 않았다.
- 화폐 기호는 실제 화폐 기호를 피해 획 그은 로마자(질문 907).
- 사용자 원문의 "유저는 업로드" = 편집기를 쓰는 사람(dev·admin)으로 읽었다(질문 905).
- "사이보그나 유닛 수": 지금 세우는 것(지도자 1·도시마다 행정 건물 1·휴먼·시설)만 칸으로 냈고, NPC 사이보그·경비 유닛은 규칙이 없어 만들지 않았다(질문 903).
- 프리셋 켬·끔·더하기·빼기, 화폐 코드 바꾸기는 편집기에서 막았다(국가 차례·원장 자산이 어긋난다, 질문 911).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/nation_presets.json`, `manifest.json` | 가상 이름·마크 사양·말씨, 판 60 → 61 |
| `packages/content/src/schema/economy.ts` | 프리셋 선택 칸(`emblem`·`nameStyle`·씨앗 값 여섯) |
| `packages/content/src/validate/nations.ts`(+시험), `validate/pack.ts`, `tuningDiff.ts` | 국가 프리셋 팩 검사, 내보내기 분류 |
| `packages/shared/src/nameGen.ts`·`nationEmblem.ts`·`nationEditor.ts`(+시험), `package.json`, `contentEdit.ts`, `faction.ts`, `routes.ts` | 이름 만들기·마크 조각·편집기 공용 모양, 분류·화면 주소, 세력 요약에 마크 |
| `apps/server/src/nationEdit/*` | 편집기 서비스·화면 자료·PNG 검사·마크 저장과 그림 길·이 세계에 반영(+시험, 시험용 PNG) |
| `apps/server/src/trpc/nations.ts`, `router.ts`, `context.ts`, `createContext.ts`, `app.ts` | 라우터·맥락, 그림 길 등록(app.ts는 두 줄) |
| `apps/server/src/contentEdit/core.ts`·`state.ts`, `db/contentEditSchema.ts`·`schema.ts`, `drizzle/20261110123352_nation_editor/` | 분류 `nation_presets`, `subscribe`, 표 `nation_emblems` |
| `apps/server/src/npc/presets.ts`·`nations.ts`·`runtime.ts`, `facilities/npcSeed.ts`, `world/world.ts`, `main.ts` | 실효 프리셋 목록, 국가마다 씨앗 값, 씨앗 전에 덮어쓰기 기다림 |
| `apps/server/src/economyView/catalog.ts`, `ranking/paths.ts`, `factionScreen/source.ts`·`overview.ts`, `worldMap/reads.ts` | 나라 화폐 이름·랭킹 세력 이름이 실효 값을 따름, 세력 화면 마크 |
| `apps/server/src/cli/resetWorld.ts` | `nation_emblems`를 남길 표에 |
| `apps/game/src/editor/nations/*`, `ui/NationEmblem.tsx`·`nationEmblem.css` | 편집기 화면·모델·문구, 마크 그리기 |
| `apps/game/src/editor/DevHome.tsx`·`devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `faction/FactionSide.tsx`, `messages/{ko,en}.json` | 개발자 홈 줄·경로·세력 카드 마크·메시지 216개 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`(+시험), `scripts/apply-tuning-diff.mjs` | 개발 조각 미리 캐시 제외(`[Nn]ationEditor`·`nations`), `tuning:apply`가 `nation_presets`를 받음 |
| `e2e/nations.spec.ts`, `e2e/dev.spec.ts`, `e2e/faction.spec.ts` | 화면 시험, 도구 17줄, 세력 화면 이름(칼루누이·말라니 켈레와이) |
| `docs/adr/*`, `docs/questions/2026-11-10-nation-editor.md`, `docs/PLAN.md` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 프리셋 칸을 더하면: `nationPresetEntrySchema` · `@terra/shared/nationEditor` `NationPresetJson` · `apps/server/src/nationEdit/views.ts nationJsonOf` · `apps/server/src/npc/presets.ts nationPresetsFrom` · `apps/game/src/editor/nations/nationModel.ts cleanNation`(칸 차례 = 팩 파일 차례).
- 덮어쓰기 분류를 더하면: `CONTENT_EDIT_CATEGORIES` · `contentEdit/core.ts rawOf` · `state.ts parseEffective` · `db/contentEditSchema.ts` 검사 둘(+ 마이그레이션) · `tuningDiff.ts ENTRY_DIFF_CATEGORIES` · `scripts/apply-tuning-diff.mjs ENTRY_FILES`.
- 마크 틀·나눔·상징 목록을 바꾸면: `nationEmblem.ts` 목록·길 · `nationText.ts` 표 · 메시지 ko·en.
- 올린 그림 크기·상한을 바꾸면: `NATION_EMBLEM_UPLOAD` · 표 검사 `nation_emblems_bytes`(마이그레이션) · tRPC 입력 길이.

## 건드리지 말 것
- 프리셋 ID(`placeholder_nation_NN`)와 화폐 코드(`placeholder_cur_NN`): 세력 코드·원장 자산 이름이다. 이름만 바꾼다.
- 켜진 프리셋의 차례·수(16): 국가 1 = 16번째 프리셋, 2번부터 차례(`npc/nations.ts`).
- 실효 프리셋 목록(`createLivePresets().list`)은 같은 배열을 제자리에서 바꾼다. 다른 곳에서 그 배열을 복사해 두면 저장이 들지 않는다.

## 미검증·TODO·알려진 문제
- (검사 결과는 아래 "검사"에 적는다.)
- 지도(1차맵·2차맵) 도시 이름표·정부 판 머리·운영자 콘솔에는 마크를 넣지 않았다(조회 모양·첫 화면 크기를 봐야 한다).
- 세력 화면 국고 줄의 나라 화폐는 여전히 자산 코드(`cur:placeholder_cur_16`)로 보인다(옛 동작 — 화폐 이름을 잇는 일은 이 줄기 밖).
- 이미 정해진 세계(NAS)의 세력·화폐 이름은 배포만으로 바뀌지 않는다: 편집기에서 [이 세계의 NPC 국가에 반영]을 눌러야 한다(질문 909). 정체성 줄이 아직 없는 세계는 처음 보일 때 새 이름으로 정해진다.
- 이름 만들기 후보는 실제 지명·인물과 우연히 겹칠 수 있다(막은 이름 목록은 작다). 팩에 넣은 이름은 사람이 다시 봐야 한다(Assumed: 겹치는 유명 지명이 없다고 보고 골랐다 — 검색으로 확인하지 않았다).
- 화폐 기호 16개가 모든 기기 글꼴에 있는지 재지 않았다(Unknown).
- 올린 그림은 팩 내보내기에 들지 않는다.
- 커밋 `fa6155dd56`("docs: …")에 편집기 화면·서버 시험 코드가 함께 들어갔다: 먼저 만든 feat 커밋이 커밋 전 포맷 검사에서 떨어진 것을 놓쳤다. 나눠 다시 올리려면 강제 푸시가 필요해 그대로 두었다.

## 사용자 결정 대기
- 질문 901~915(`docs/questions/2026-11-10-nation-editor.md`). 급한 것: 903(시작 유닛), 905(플레이어 마크 올리기), 909(NAS 반영을 누가 하나).

## 검사
- (끝에 채운다)

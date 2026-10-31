# 항성계 편집기: 궤도 배치, 생명 가능 지대, 기온 제안을 행성 작업 사본으로

- 일시: 2026-10-31 15:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-star-system-editor.md`(새, 제안), ADR `2026-10-29-planet-editor-stage1.md`(38) 1절·끝 "남은 틈" 바뀜 표시. 가지 `work/star-system`(main `b050300`에서)

## 한 일
사용자 요청(2026-10-31, 원문은 ADR): 항성계 단위로 행성을 골디락스 지대에 놓고, 가까우면 조금 덥게·멀면 춥게. 기획 D-350·D-353(우주 4층, 항성계는 나중 게임 화면)에 맞춰 게임 규칙 없이 개발자 편집기만 만들고, 계산·배치·그림은 나중 게임 화면이 쓰게 나눴다.
- 공용(`@terra/shared` `starSystem.ts`): 항성 종류 표(주계열 7개, 광도·유효 온도·표시 색), 생명 가능 지대(태양 0.99~1.70 AU × √L), 받는 빛 L/d², 지대 안팎, 기온 제안(누그러뜨림 0.5 [임시] × 255 K × (F^¼ − 1), 정수·범위·극 ≤ 적도), 항성계 정의 검사(판 1, 1/1000 AU 정수, 늘 커짐, 24개, 천체 4종), 이름 규칙·이유 코드.
- 서버: 표 `star_systems`(마이그레이션 `20261031052944_star_systems`, 표 하나 더하기만), tRPC `planetEditor.systems.list·get·create·save·rename·remove`(행성 보관함과 같은 권한 두 겹·속도 제한, 판 충돌, 지우기는 표시만·만든 사람·admin, 감사 기록 `star_system.*`).
- 기기: 주소 `/dev/star-system`(dev·admin, 틀 숨김), 개발자 홈 한 줄. 화면 = 항성계 고르기·[새 항성계]·[저장]·이름 바꾸기·지우기·충돌 [덮어쓰기]·저장 안 한 채 나가면 묻기, 2D SVG 그림(`space/StarSystemView.tsx`, 배치 `space/starSystemLayout.ts`: 제곱근 눈금·지대 띠·황금각), 항성 종류·궤도 판(거리·천체·보관함 행성·빼기), 궤도 카드(지대·거리·빛·제안 기온·지금 기온, [제안 적용]·[행성 편집기에서 열기]).
- [제안 적용]은 행성 편집기와 같은 작업 사본(localStorage)에만 쓴다(`applySuggestion.ts`). 서버 행성은 바꾸지 않는다.
- 미리 캐시: `DEV_ONLY_CHUNK`에 `[Ss]tarSystem`, `globIgnores`에 `assets/[Ss]tarSystem*.{js,css}`. 빌드 검사가 미리 캐시하는 JS의 소스 맵에 개발자 도구 소스가 있으면 실패한다(`DEV_ONLY_SOURCE`, ADR 38의 "남은 틈"을 막음).

## 정한 것 (ADR에 적음)
- 저장은 행성 보관함과 같은 팀 공용 표. 저장 판 기록은 두지 않았다(요청에서 선택 사항). 고치는 중인 항성계는 화면 메모리에만(새로고침하면 사라짐, 나갈 때 묻는다).
- 서버는 가리킨 보관함 행성이 있는지 보지 않는다(지운 행성은 화면이 "지운 행성").
- 정의 검사는 zod가 아니라 `packages/shared`에 손으로 썼다(이 꾸러미는 zod를 쓰지 않는다, 행성 보관함 이름 규칙과 같은 방식). tRPC 입력은 zod로 uuid·판 번호만 본다.
- 제안의 지구 기준은 보통 프리셋(적도 27°C·극 −24°C) 하나. 행성의 지금 프리셋은 보지 않는다(카드에 지금 기온을 같이 보인다).
- rolldown `codeSplitting` 무리로 같이 쓰는 개발자 조각 이름을 고정하려다 버렸다: 무리에 든 모듈이 가져오는 react·tRPC·설정 모듈까지 끌려가 미리 캐시가 59개로 줄었다(플레이어 화면이 미리 캐시되지 않은 조각을 받게 됨). 대신 소스 맵 검사를 넣었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/starSystem.ts`·`.test.ts`, `index.ts` | 항성 종류 표·지대·빛·제안·정의 검사·이름 규칙(시험 14) |
| `packages/shared/src/routes.ts`·`.test.ts` | 주소 `dev_star_system` |
| `apps/server/src/db/schema.ts`, `drizzle/20261031052944_star_systems/` | 표 `star_systems` |
| `apps/server/src/planetEditor/starSystems.ts`·`starSystems.db.test.ts`, `services.ts`, `types.ts` | 저장소·서비스·DB 시험(5) |
| `apps/server/src/trpc/planetEditor.ts`, `context.ts`, `planetEditorRouter.test.ts` | `planetEditor.systems.*`, 권한·제한 차례 시험(프로시저 6) |
| `apps/game/src/space/starSystemLayout.ts`·`.test.ts`, `StarSystemView.tsx`, `starSystemView.css` | 나중 게임 화면과 같이 쓸 배치·그림 |
| `apps/game/src/editor/starSystem/*` | 편집 화면·판·카드·편집 함수·제안 적용·호출·문구(시험 `systemEdit`·`applySuggestion`) |
| `apps/game/src/editor/DevHome.tsx`, `devIcons.tsx`, `shell/routeViews.tsx`, `shell/SideMenu.tsx`, `sections/ComingSoon.tsx` | 개발자 홈 줄·지연 로딩·사이드 메뉴 지금 화면 |
| `apps/game/messages/{ko,en}.json` | 문구 81개(ko·en) |
| `scripts/pwa-build.mjs`·`.test.mjs`, `apps/game/vite.config.ts` | 미리 캐시 규칙·소스 맵 검사 |
| `e2e/star-system.spec.ts`(새), `e2e/dev.spec.ts` | 화면 시험, 개발자 도구 세 줄 |
| `docs/adr/2026-10-31-star-system-editor.md`(새), `docs/adr/2026-10-29-planet-editor-stage1.md` | 결정, ADR 38 1절·남은 틈 바뀜 표시 |

## 함께 바꿔야 하는 파일
- 주소 표에 개발자 도구 줄을 더하면: `DevHome.tsx` `DEV_TOOLS`, `SideMenu.tsx` 지금 화면, `ComingSoon.tsx` 제외 목록, `routeViews.tsx`, `e2e/dev.spec.ts`(줄 수·경로).
- 개발자 도구 지연 조각을 더하면: 진입 파일 이름 앞머리를 `DEV_ONLY_CHUNK`에 맞추고 `globIgnores`도 같이. 새 개발자 폴더는 `DEV_ONLY_SOURCE`에 더한다.
- 항성 종류를 더하면 `STAR_TYPES`와 `systemMessages.ts` 이름 표, 메시지 `star_type_*`(타입 검사가 막는다).
- 정의 모양을 바꾸면 판(`v`)을 올리고 `parseStarSystemDefinition`이 옛 판을 어떻게 받을지 정한다(새 ADR).

## 건드리지 말 것
- `planetDefinition.ts`, 생성기, SettingsPanel 줄(대륙 작업이 맡음). 이 작업은 읽기만 했다.
- 올라간 마이그레이션은 고치지 않는다.

## 검사·측정 (Verified, 이 가지에서 실행)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 206개·시험 1,989개(DB 시험 포함).
- 전체 화면 시험 `pnpm e2e` 72개 통과(4.2분). 새 `star-system.spec.ts` 12개: admin 흐름(빈 목록 → [새 항성계] → 궤도 넷 → 그림의 행성 누름 → 카드 지대 "hot", 제안 적도 34·극 −17 → [저장] 판 1 → [제안 적용] → 행성 편집기가 그 행성을 저장 안 함(dirty)으로 열고 슬라이더 34·−17, 서버 판 1 그대로), 다시 열기, 사진 8, dev(admin 항성계를 만든 사람과 함께 보고 지우기 없음, 항성 종류 바꿔 저장 → 판 2, 새로고침해도 k0v), player(권한 없음, 항성계 조각을 받지 않음).
- 빌드(main `b050300`을 같은 방법으로 빌드해 비교):
  - 첫 화면 JS 127,357 → 127,532B(+175B: 주소 표 줄·화면 이름), 상한 131,416B 그대로.
  - 미리 캐시 62개 1,363.77KiB → 63개 1,364.81KiB. 늘어난 하나는 `fields-*.js`(행성 격자 모듈 7개 + detMath): main에서 `planet-*.js`(행성 지도 공용, 미리 캐시)에 있던 것이 따로 나왔다. 개발자 모듈은 미리 캐시에 없다(소스 맵 검사, `check-pwa.mjs` 통과).
  - 항성계 화면 조각 JS 28.9kB(gzip 9.3kB)·CSS 5.0kB. 두 편집기가 같이 쓰는 조각 `planetEditor-*.js` 22.9kB(gzip 8.1kB)·CSS 13.7kB(이름이 `DEV_ONLY_CHUNK`에 걸린다). 행성 편집기 조각 JS 113.0 → 91.1kB.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/star-system/shots/` — `star-system-390-{pastel,dark}-{ko,en}`(그림·카드·궤도 판), `star-system-1440-{pastel,dark}-{ko,en}`. 다른 화면 시험의 사진도 같은 폴더에 있다.

## 미검증·TODO·알려진 문제
- 수치: 항성 광도·온도는 Mamajek 표(2024.05.15, Pecaut & Mamajek 2013 확장판) 원문을 받아 확인했다(Verified). 생명 가능 지대 0.99~1.70 AU는 다른 논문의 인용과 검색 요약으로만 확인했다(Kopparapu 2013 원문은 이 세션이 arxiv.org에 닿지 못해 열지 못함). 표시 색은 확인하지 못했다(Assumed). 다시 확인하려면 세션 네트워크 설정에서 arxiv.org·vendian.org를 허용해야 한다.
- 실제 휴대폰에서 열어 보지 않았다(헤드리스 Chromium 390px·1440px만).
- 휴대폰에서 그림 아래 카드는 스크롤해야 보인다(그림이 화면 폭 정사각이라). 쓰면서 불편하면 카드를 띄우는 판으로 바꾼다.
- 거리 칸을 고쳐 Enter를 누르면 고치는 칸이 다시 만들어져 초점이 빠진다(거리로 다시 늘어놓기 때문).
- 항성계를 고치는 중 새로고침하면 바뀜이 사라진다(나갈 때만 묻는다. 브라우저 닫기·새로고침은 묻지 않는다).
- main이 이 가지를 만든 뒤 `ff141bb`까지 나아갔다. S3 가지도 마이그레이션을 더한다: 갈래는 그대로 합친다(AGENTS.md Drizzle 항목).

## 사용자 결정 대기
- 기획 질문 101: 누그러뜨림 몫(지금 0.5)과 지구 기준(보통 프리셋). 질문 100~103: 항성계 게임 규칙(공전·건물·워프 게이트) — 정해지면 정의 판 2.

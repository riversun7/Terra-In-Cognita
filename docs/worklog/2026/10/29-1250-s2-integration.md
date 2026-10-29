# S2 통합: 생성기·타일·서버·렌더러 합치기, 이음매 하나로, 실제 생성기 → 서버 굽기 → 타일 HTTP → 1차맵 화면

- 일시: 2026-10-29 12:50 (KST)
- 작업 도구: Claude Code (작업 트리 `worktree-wf_cf86e8da-f84-1`, main `e16b47e`에서 시작)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (통합)"을 더하고 절 순서를 생성기 → 타일·서버 → 렌더러 → 통합 → 결과로 맞춤), 작업 기록 `29-1020-s2-generator.md`·`29-0950-s2-tiles-server.md`·`29-1130-s2-renderer.md`, 기획 D-214·D-215, PLAN 5.2·5.6·5.7

## 한 일
1. 세 가지를 차례로 진짜 머지 커밋으로 합쳤다(다시 쌓거나 하나로 뭉치지 않음).
   - `worktree-wf_855dd1b7-352-1` @ `f59a8a7`(생성기) → `569fbb5`. 충돌은 `docs/WORKLOG.md`(`pnpm docs:index`로 다시 만듦).
   - `worktree-wf_855dd1b7-352-2` @ `76eac60`(타일·서버) → `e2b50bc`. 충돌은 `docs/WORKLOG.md`.
   - `worktree-wf_855dd1b7-352-3` @ `17a9f53`(렌더러) → `9650bfa`. 충돌은 `docs/WORKLOG.md`와 ADR 36(생성기·렌더러 절을 둘 다 남김). `pnpm-lock.yaml`은 저절로 합쳐졌고 `pnpm install`이 그대로 둔다(손으로 고치지 않음).
   - 머지마다 `pnpm typecheck`와 해당 묶음 시험을 돌렸다. 세 번째 머지 뒤 `pnpm check` 통과(시험 884개).
2. 이음매를 하나로 했다.
   - `PlanetFields`·`PlanetFieldsMeta`·물 비트·수심 등급 상수: `packages/planet/src/tiles/fields.ts` 하나(정수 진입점). 생성기 사본을 지우고 생성기가 가져다 쓴다(`18930cb`). 골든 해시 그대로.
   - 엔진: `WATER_BITS`·`WATER_DEPTH_SHIFT`·`waterDepthClass`와 셰이더의 물 비트 숫자를 `@terra/planet` 상수에서 만든다. `DecodedTile`은 protocol `PlanetTileData`에서 머리 값 두 개를 뺀 타입이다(`9baf2f1`). 경계 표는 그대로(엔진 → planet·protocol 허용).
3. 서버를 실제 생성기에 이었다(`7575bab`).
   - 콘텐츠 팩 `planets`마다 설명(`planetSpecsFromPack`): 생성기 입력 = `planetInputFromDefinition`, 범례 = 행성 biomes 순서의 `{index, id, colour, name}`.
   - 생성기가 받지 않는 정의면 시작하지 않는다(생성기에 `validatePlanetInput` 내보냄, 알고리즘 그대로).
   - 정의 해시 = 면 레벨·시드·푼 세부 수치·바이옴 표(ID·숲 밀도·규칙, 행성 순서)의 키 정렬 JSON SHA-256(이름·설명·색 제외). 캐시 키 동작은 그대로.
   - 굽기 워커가 생성기 단계마다 메모리를 잰다. `TEMP_S2_PLANET`·`synthetic.ts`와 그 시험을 지우고 `smallSource`는 팩 행성을 작은 면 레벨로 실제 생성기에 돌린다. `ops/s2-probe.mjs` 기본 행성 ID는 `s2_test_planet`.
4. 기기를 서버 타일에 이었다(`9baf2f1`, `8d5c93c`).
   - 엔진: 타일 원천이 받은 이진(`{kind: "encoded", bytes}`)을 주면 메시 워커가 `decodePlanetTile`로 풀고 모양·요청 칸 범위를 확인한다(워커가 없으면 화면 스레드). 워커는 새 진입점 `@terra/protocol/planetTile`에서 가져온다(`ProtocolError`는 `errors.ts`로).
   - 화면: [임시] `PLANET_ID = "s2_test_planet"`. 목록 정보 → 굽는 중이면 Retry-After(없으면 5초)마다 다시 묻기 → 행성 설명·서버 타일 원천(`planetSource.ts`) → 엔진. 401·404·409·429·네트워크·서버·읽지 못함 안내(문구 7개 ko·en), [다시 시도]. 바이옴 이름은 서버 범례. 가짜 행성은 엔진 단위 시험에만 남는다.
   - 같은 출처 검사는 `apps/game/src/net/sameOrigin.ts` 하나(2차맵 지형 받기와 같이 씀).
5. 화면 시험 중 찾은 문제를 고쳤다: 엔진이 생기기 전에 고른 레이어·고도 과장이 엔진에 넘어가지 않았다(목록 정보를 기다리는 동안 [기후]를 누르면 화면은 기후, 엔진은 지형). `8d5c93c`에 들어 있다(ref로 넘김, Playwright로 확인).
6. 통합 중에 main이 문서 커밋 4개만큼 나아가서(`a589078`, 기획 D-212~D-215) 머지했다(`dd0edce`, 충돌 없음).
7. 문서: ADR 36 "구현하며 정한 것 (통합)"과 절 순서, PLAN 5.2(생성기 면 레벨 4~10 한 줄), PROTECTED(생성기 행에 `src/tiles/fields.ts`), AGENTS 6장(1차맵 엔진·묶음 확인 사항, oxlint 규칙 한 줄)·7장(캐시 폴더·측정 명령 줄), 이 기록.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 일회용 DB, Playwright 1.63 Chromium)
최종 결과는 아래 "최종 확인" 표(문서 커밋 뒤 다시 돌림). 중간 결과:

| 명령 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm check` | 통과: 시험 파일 102개 통과·6개 건너뜀, 시험 900개 통과·40개 건너뜀(DB). 다국어 224개 키, 대비 136쌍, 콘텐츠 `core@2 (14495d30db2e)` |
| `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm test` | 시험 파일 108개, 시험 940개 모두 통과 |
| `pnpm build` | 통과(`dist/planetBakeWorker.js` 2.08kB, `dist/main.js` 129.49kB, 메시 워커 8.10kB) |
| `node scripts/check-pwa.mjs` | 통과 |
| `pnpm check:content origin/main` | 통과(1·2·4a·4b, 기준 `a589078`) |

최종 확인 (문서 커밋 뒤, main `a589078`을 머지한 상태에서 다시 돌림)

| 명령 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm check` | 통과: 시험 파일 102개 통과·6개 건너뜀, 시험 900개 통과·40개 건너뜀 |
| `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm test` | 시험 파일 108개, 시험 940개 모두 통과 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과 |
| `pnpm check:content origin/main` | 통과(1·2·4a·4b, 기준 `a589078`) |
| `node scripts/check-docs.mjs origin/main` | 통과 |
| `pnpm docs:index --check` | 통과 |

## 잰 값 (Verified: 개발 컨테이너 4 vCPU 공유, 빌드한 서버 + 빌드한 앱, 같은 기기 접속, 헤드리스 SwiftShader — NAS·휴대폰·4G 값이 아니다)
서버는 `NODE_ENV=` `PORT=4320` `S1_TEST_BOTS=1000` `PATH_WORKERS=1`, 새 DB(가짜 계정 4개), 캐시 폴더는 저장소 밖 임시 폴더.

| 항목 | 값 |
|---|---|
| 굽기 3번(빈 캐시, 실제 생성기 F = 9) | 워커 안 15,360.8·14,480.9·14,398.9ms(생성 14,795·13,900·13,786ms, 타일 237~269ms, gzip 318~334ms). 시작(로그 Server listening)부터 준비까지 15.47초 |
| 개발 실행(tsx, 봇 0) | 굽기 14,103ms, pack SHA-256 `7cf733c3…`가 빌드 서버와 같다 |
| 메모리 | 워커 힙 + 외부(단계 끝) 173.2·182.1·190.7MB(개발 실행 180.5). 프로세스 RSS 최대 427,644kB = 418MiB(VmHWM, 0.5초마다 기록). 준비 뒤 RSS 338MB(1분 지표), 그 뒤 295~417MB(화면 시험·2차맵 구독이 겹친 구간) |
| 굽는 동안 | `/health` 20ms 간격 637번 p50 2.4ms·p99 9.6ms·최대 64.8ms. 굽기가 든 1분 지표: eventLoopP50Ms 0.2·P99Ms 2.6·MaxMs 18.7, rssMb 337.8, cpuPercent 31.9, planetBakes 1, planetBakeMs 15,360.8, planetCacheMisses 1 |
| 크기 | 타일 2,046개, raw 17,141,388B, pack 2,962,453B, 캐시 목록 47,966B, 결과 해시 `07cb630b`(생성기 작업 기록 F9 값과 같다), 정의 해시 `e04dd3cb58134c67…` |
| 캐시로 다시 켜기 | 2번: cacheLoadMs 105.8·141.3, 시작부터 준비까지 929ms, RSS 최대 172,624kB(169MiB), 1분 지표 rssMb 167.5·cpuPercent 2.8·eventLoopP99Ms 3.1·planetCacheHits 1 |
| `ops/s2-probe.mjs`(`S2_ALL=1`) | 목록 정보 20.4ms(1번), 범례 14개. 맵 레벨별 gzip KB(raw): 5 21.8(49.1), 6 73(196.4), 7 229.6(785.4), 8 683(3,141.8), 9 1,885.6(12,567). 처음 화면 30개 134.2ms, 모두 2,046개 4,943ms, 타일 p50 10.6·p95 28.7·최대 104.3ms. 머리 값·이음매 어긋남 0, 종료 코드 0 |
| 화면 파스텔(ko) | 시험 21개 통과: [1차맵] 전에는 1차맵 조각·three·워커를 받지 않음, 서버 타일(`/api/planets/s2_test_planet/tiles/<키>?v=1.1.<16자>`) 86개 모두 200, 가짜 행성 워커 없음, 메시 워커 받음, 궤도 62/160(받기 끝, 빈 곳 없음, 오류 0), 누르기(사바나·높이 50m·강), 돌리기, 휠 6칸(150ms 간격) 내내 상한 이하 → 단계 5(142/160, 삼각형 345,216, GPU 추정 12.6MB), 1차맵 → 2차맵(유닛 1,000) → 1차맵, 콘솔 오류 0 |
| 화면 다크(ko)·파스텔(en) | 18개·8개 통과. 영어 칸 정보 "Savanna · height 50 m · River"(서버 범례 영어) |
| 굽는 중에 열기(ko) | 시험 10개 통과: "서버가 행성을 만드는 중입니다. 5초 뒤에 다시 확인합니다." → 기다리는 동안 [기후] → 엔진도 기후. 목록 정보 4번, 누름부터 준비까지 16.7~16.8초 |
| 시간 | 누름 → 준비 1,801~2,764ms, 첫 표시 1,307~2,204ms(엔진 생성 → 맵 레벨 5·6 + 첫 프레임), 다시 열기 첫 표시 983~1,494ms(브라우저 캐시) |
| 묶음 크기(gzip -9) | 첫 화면 JS: 합친 직후(`9650bfa`를 저장소 밖에서 빌드) 371,263B(114,588) → 통합 372,600B(115,427). 1차맵 조각 55,269 → 55,058B, 메시 워커 6,358 → 8,100B. 미리 캐시 30 → 29개(가짜 행성 워커가 빠짐), 1,110.07 → 1,107.44KiB |

사진(저장소 밖, 390×844 @3): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s2-int/shots/` — `pastel-orbit.png`, `pastel-orbit-picked.png`, `pastel-zoomed.png`, `pastel-picked.png`, `pastel-climate.png`, `pastel-second-map.png`, `pastel-reopened.png`, `dark-orbit.png`, `dark-orbit-picked.png`, `dark-zoomed.png`, `dark-picked.png`, `dark-climate.png`, `en-orbit.png`, `en-orbit-picked.png`, `generating-ko.png`, `generating-then-climate.png`, `*-account-bar.png`.

눈으로 본 것(Assumed: 사람 판단)
- 궤도: 큰 대륙 하나(가운데 사막, 남쪽 강줄기와 해안 숲, 북쪽 설산·빙상), 바다는 수심 등급에 따라 옅은 연안 → 짙은 심해, 대기 띠. 생성기 작업 기록의 그림과 같은 모양이다. 타일 사이 틈은 보이지 않았다.
- 가까이(단계 5): 해안선과 연안·대륙붕 띠가 칸 단위로 또렷하다. 이 시험의 휠 자리는 바다라 대부분 바다가 보인다.
- 다크: 판은 남색에 밝은 글씨, 눌린 [지형]은 초록. 세계 색은 테마와 같다(D-070). 영어: 제목·HUD·칸 정보·버튼 모두 영어, 넘침 없음.
- 굽는 중: 가운데 판에 안내 한 줄(두 줄로 감김), 지구본 없음, 아래 조작 판은 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/tiles/fields.ts`, `tiles/index.ts`, `tiles/testFields.ts` | 출력 모양·물 비트·수심 등급 정의 하나(메타 settings = `PlanetSettings`), 시험 도우미 `TEST_SETTINGS` |
| `packages/planet/src/generator/types.ts`, `index.ts`, `surface.ts`, `generate.ts`, `generate.test.ts` | 사본 삭제·가져오기, `WATER_DEPTH_SHIFT` 이름, `validatePlanetInput` 내보내기 |
| `packages/engine/src/planet/planetTypes.ts`, `planetMaterials.ts`, `index.ts` | 물 비트를 planet 상수로, `DecodedTile` = protocol 타입, `EncodedTile`·`isEncodedTile`, 셰이더 숫자 |
| `packages/engine/src/planet/tileDecode.ts`(새), `tileBuilder.ts`, `tileWorker.ts`, `tilePipeline.ts`, `*.test.ts` | 이진 타일 풀기(워커·화면 스레드), 푼 뒤 확인, 시험 |
| `packages/engine/package.json`, `pnpm-lock.yaml` | 엔진 → `@terra/protocol` 작업공간 의존 |
| `packages/protocol/src/errors.ts`(새), `codec.ts`, `terrain.ts`, `planetTile.ts`, `package.json` | `ProtocolError` 따로, 진입점 `./planetTile`, `PlanetTileData` 주석 |
| `apps/server/src/planet/sources.ts`, `bakeWorker.ts`, `testSupport.ts`, `bake.test.ts`, `baker.ts`, `synthetic.ts`(지움) | 생성기 원본·팩 설명·정의 해시·단계별 메모리, 합성 원본 삭제, 시험 |
| `apps/server/src/content.ts`, `main.ts` | 팩을 돌려주고 행성 원본을 팩에서 만든다(틀리면 시작 안 함) |
| `ops/s2-probe.mjs` | 기본 행성 ID |
| `apps/game/src/map/planetSource.ts`(새, + 시험), `PlanetMapScreen.tsx`, `planetText.ts`(+ 시험), `terrainLoader.ts`, `net/sameOrigin.ts`(새), `messages/{ko,en}.json`, `package.json`, `pnpm-lock.yaml` | 서버 원천·화면 상태·실패 문구, 같은 출처 검사 하나, 게임 앱 → `@terra/planet` 의존 |
| `docs/adr/2026-10-29-s2-planet-lod.md`, `docs/PLAN.md`, `docs/PROTECTED.md`, `AGENTS.md`, 이 기록, `docs/WORKLOG.md`(자동) | 결정·잰 값·위험, 확인 사항, 명령 |

## 함께 바꿔야 하는 파일
- 출력 모양·물 비트(`packages/planet/src/tiles/fields.ts`)를 바꾸면: 생성기(`GENERATOR_VERSION`, 결과 해시 바이트 순서 `generator/hash.ts`, 골든 해시), 타일 모으기(`tiles/aggregate.ts`)와 `PLANET_TILE_FORMAT_VERSION`, 엔진 셰이더·`apps/game/src/map/planetText.ts`. 엔진 `WATER_BITS`는 저절로 따라온다.
- 타일 이진 모양(`PlanetTileData`)을 바꾸면 엔진 `DecodedTile`이 저절로 따라오고, `tileMesh.ts` `decodedTileProblem`·`buildTileMesh`, `mock/mockPlanet.ts`를 본다.
- 행성 정의에 타일 내용을 바꾸는 필드가 늘면 `apps/server/src/planet/sources.ts` `planetDefinitionForHash`에 넣는다(빠지면 정의가 바뀌어도 다시 굽지 않는다).
- 시험 화면 행성을 바꾸려면 `PlanetMapScreen.tsx`의 `PLANET_ID`와 `ops/s2-probe.mjs` 기본값.

## 건드리지 말 것
- 생성기 알고리즘·골든 해시, 타일 형식, 렌더러 상한(이 통합은 바꾸지 않았다).
- 메시 워커는 `@terra/protocol/planetTile`에서만 가져온다(묶음 전체를 가져오면 워커가 103kB). 워커가 `tileBuilder.ts`의 값을 가져오지 않는다(그 안의 `new Worker(new URL(…))`).
- 엔진에 넘기는 이진은 복사해서 보낸다(넘기면 워커가 죽었을 때 화면 스레드 대체 경로가 빈 버퍼를 받는다).

## 미검증·TODO·알려진 문제
- NAS 굽기 시간·메모리, 휴대폰 첫 표시(4G)·프레임 p95는 재지 않았다(Unknown). 배포·휴대폰 확인은 메인 세션 몫이다.
  - 14:00 메인 세션: 배포(CI 79, 13:40 KST) 뒤 NAS 굽기를 쟀다. 18.4초, 단계 끝 최대 RSS 355MB, 그 뒤 RSS 약 255~262MB·CPU 약 1.6%(ADR 36 "NAS에서 잰 값"). NAS에서 캐시 쓰기가 권한(555)으로 실패했다 → 작업 기록 `2026/10/29-1405-nas-planet-cache-permission.md`. 휴대폰 확인은 남았다.
  - 15:00 메인 세션: 사용자 휴대폰(웨일)에서 1차맵 114~120fps, 프레임 p95 8.4ms, 첫 표시(HUD) 225ms, 타일 상한 도달 0, 기기 오류 0(ADR 36 "휴대폰에서 잰 값"). 사용자: "좋다 안끊긴다", "지형모델은 조금 마음에 안들지만 행성편집생성기가 나오면 다시 체크" → 다음은 행성 편집기 1단계(PLAN 5장 편집기 표·11장 S2 범위).
- 굽기가 끝난 뒤에도 RSS가 캐시로 켤 때보다 약 170MB 높다(338MB 대 168MB). 원인은 보지 않았다(Assumed: 할당기가 워커 메모리를 바로 돌려주지 않음).
- 첫 화면 JS가 렌더러 작업 기록보다 약 4kB 크다(합칠 때 2.7kB, 통합 1.3kB). 묶음 진입점 때문에 1차맵용 모듈이 첫 화면 조각에 들어간다(ADR 36 "남은 위험"). 줄이는 일은 하지 않았다.
- 기획 D-214: 특수 지형 레이어(후보·생성 조건 제안), 지형 판정 조건 정보창, 단순 반복 패턴 막기 — 다음 작업. 바이옴 기온·습도 범위는 Step 5라 팩은 임시 그대로.
- 17:10 다듬기 통합(작업 기록 `2026/10/29-1710-s2-polish-integration.md`): 세 원본 가지의 검토 수정과 NAS 권한 가지를 합쳤다(코드 충돌 없음, 문서만). 첫 화면 JS를 줄였고(`sideEffects: false`, 372,600 → 368,388B), Vite 개발 서버에서 1차맵 화면을 열어 봤다.
- 다른 세션이 세 원본 가지에서 검토·수정을 하고 있다. 그 수정은 이 가지에 따로 합쳐야 한다. 특히 `generator/types.ts`·`tiles/fields.ts`(정의를 옮김), `apps/server/src/planet/sources.ts`·`synthetic.ts`(지움), `packages/engine/src/planet/tileBuilder.ts`·`planetTypes.ts`를 고친 수정은 충돌이 난다.
- `pnpm dev:game`(Vite 개발 서버)에서 1차맵 화면은 미실행.
- 바이옴 이름은 화면을 열 때의 언어로 정해진다(화면을 연 채 언어를 바꾸면 다시 열어야 한다).

## 사용자 결정 대기
- 없음(ADR 36 확정은 NAS·휴대폰 측정 뒤).

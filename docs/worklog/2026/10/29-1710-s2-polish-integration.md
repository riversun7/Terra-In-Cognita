# S2 다듬기 통합: 검토 반영 가지 넷 합치기, 생성기 출력 판 2를 서버에 맞추기, 통합 검토 지적 처리

- 일시: 2026-10-29 17:10 (KST)
- 작업 도구: Claude Code (작업 트리 `.claude/worktrees/s2-polish`, 가지 `work/s2-polish`, main `e1e281b`에서 시작. 푸시하지 않음)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (다듬기 통합)"을 더하고 결정·생성기·타일·렌더러·통합 절의 해당 줄을 고침), 작업 기록 `29-1600-s2-renderer-review.md`·`29-1405-nas-planet-cache-permission.md`·`29-1415-s2-generator-review-fixes.md`·`29-1505-s2-webgpu-bench-review.md`·`29-1250-s2-integration.md`, 기획 D-214·D-215

## 한 일
1. 네 가지를 이 순서로 진짜 머지 커밋(`--no-ff`)으로 합쳤다. 다른 가지를 다시 쌓거나 강제로 바꾼 것은 없다.
   - `worktree-wf_855dd1b7-352-3` @ `86831bc`(렌더러 검토 반영) → `0b7d5d8`. 충돌은 `docs/WORKLOG.md`(`pnpm docs:index`로 다시 만듦).
   - `ops/nas-metrics-planet` @ `64aa76b`(NAS 행성 캐시 권한·지표) → `78cd56b`. 충돌은 ADR 36(휴대폰 절)·`29-1250` 작업 기록·목차. 가지의 문서 커밋은 main에 이미 있던 글의 앞판이라 main 쪽을 남겼다. 들어온 것은 `ops/deploy.sh`·`ops/compose.yml`·`ops/nas-setup.md`·워크플로 두 개.
   - `worktree-wf_855dd1b7-352-1` @ `fa1114d`(생성기 검토 반영, main보다 42커밋 뒤) → `a28858d`. 충돌은 `docs/PROTECTED.md`(main의 생성기 행 + 가지의 detMath·프리셋 수치표 행)와 목차. 코드는 저절로 합쳐졌다(main의 `tiles/fields.ts` 정의 하나, `WATER_DEPTH_*` 이름, 서버 생성기 원본 그대로).
     - main 쪽 후속을 이 머지에 넣었다(가지 작업 기록의 "함께 바꿔야 하는 파일"): `apps/server/src/planet/bake.test.ts` 팩 행성 F5 해시 `3321d859` → `5c984c77`, `cache.test.ts`가 생성기 버전 1을 가정하던 곳(파일 이름 → `GENERATOR_VERSION`, "다른 생성기 버전" → 지금 버전 + 1).
   - `worktree-wf_855dd1b7-352-4` @ `f3bb7e4`(셰이더 측정판, main보다 42커밋 뒤) → `26c2f09`. 충돌은 `apps/game/messages/{ko,en}.json`(양쪽이 끝에 덧붙인 키를 모두 남김)과 목차. ADR 36의 "셰이더 측정" 절이 "결과" 뒤에 붙어 "결과" 앞으로 옮겼다.
   - 머지마다 타입 검사·시험을, 셋째·넷째 머지 뒤에는 포맷·린트·경계·크기·다국어·콘텐츠·빌드·`check-pwa`까지 돌렸다.
   - 작업 중에 main이 문서 커밋 8개만큼 나아갔다(`e1e281b..c33f1a4`: 앱 뼈대 ADR 37 제안·조사·기획 질문·PLAN·PROTECTED, 기획 미러 동기화 D-232~D-259). 그래서 main을 다시 머지했다(`b22efa6`). 충돌은 PLAN ADR 목록 줄(36은 이 가지, 37은 main)과 목차. 코드 변경은 없다.
2. 서버와 기기를 생성기 출력 판 2에 맞췄다. 기기는 생성기 버전을 직접 보지 않고 목록 정보의 타일 주소 틀만 쓰므로 서버 쪽(위 시험 두 개)만 고치면 됐다. 화면 타일 요청이 모두 `?v=1.2.e04dd3cb58134c67`인 것을 확인했다.
3. 통합 검토 지적 17개(같은 내용 묶음 포함)를 처리했다. 지적별 처리는 ADR 36 "구현하며 정한 것 (다듬기 통합)"의 표에 있다.
   - 고침: 목록 정보 429 안내(`6e35008`), 엔진 만들기 실패 잡기(`6e35008`), 타일 실패 안내가 남던 것·404 뒤 다시 묻던 것(`6501445`), 목록 정보 `maxElevationM`(`d9e42f2`), 타일 ID 앞자리 0(`3494012`), 첫 화면 묶음(`6f71ea6`), 고도 축척 주석(`afcc018`), 문서 사소 지적(AGENTS·PLAN·ADR, 문서 커밋).
   - 이미 고쳐짐: F10 굽기 메모리 → 생성기 검토 가지의 상한 9. 서버 시작 검사 시험을 더했다(`555ad2a`).
   - 미룸: 윗 단계 바이옴 모으기가 물 종류와 따로라 땅 칸에 바다·호수 바이옴이 붙는 것. 고치면 타일 값 규칙이 바뀌어 `PLANET_TILE_FORMAT_VERSION`을 올려야 하고 옛 앱이 새 타일을 못 읽는다. 특수 지형을 더하는 타일 형식 2판(따로 하는 일)에서 함께 한다. ADR의 틀린 주의 문장만 바로잡았다.
   - 401 뒤 다시 받기는 그대로 뒀다: 세션이 끝났으면 세션 확인이 앱을 로그인 화면으로 바꾸고, 잠깐 401이면 다음 받기로 풀린다.
4. 캐시·주소 판: 타일 바이트를 바꾼 것은 생성기 출력 판 2뿐이고, `GENERATOR_VERSION` 2가 서버 캐시 파일 이름(`-g2-t1-`)과 타일 주소 판(`1.2.…`)에 들어간다. 나머지 고침은 타일 바이트를 바꾸지 않는다(목록 정보는 no-cache + ETag, 캐시 목록 형식 2는 목록 JSON만).
5. D-214 특수 지형 층과 타일 형식 2판은 시작하지 않았다.
6. 문서: ADR 36(위), PLAN 5.2(면 레벨 상한 9 + [V])·ADR 목록 줄(고도 1:12 D-215 확정), AGENTS 6장(rolldown `sideEffects` 한 줄, oxlint 규칙은 경고)·7장(캐시 폴더 줄의 출력 판 2), `29-1250` 작업 기록 TODO에 이 기록 줄, 이 기록, 목차.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 일회용 DB, Playwright 1.63 Chromium)
| 명령 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과("Already up to date"). 잠금 파일은 셰이더 측정판 가지가 넣은 `apps/game`의 `three`·`@types/three` 링크 두 줄만 늘었다(엔진과 같은 판, 새 꾸러미 없음) |
| `pnpm check` | 통과: 포맷·린트·타입·경계(결정성 검사에 `@terra/shared` 포함)·크기·다국어 291개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 109개 통과·6개 건너뜀, 시험 982개 통과·40개 건너뜀 |
| `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm test` | 시험 파일 115개, 시험 1,022개 모두 통과 |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과(미리 캐시 31개, 측정 조각 없음) |
| `node scripts/check-docs.mjs e1e281b`, `pnpm check:content e1e281b`, `pnpm docs:index --check` | 문서 커밋 뒤 실행(결과는 아래 "최종 확인") |

## 잰 값 (Verified: 개발 컨테이너 4 vCPU 공유, 다른 에이전트가 함께 돌아 부하 평균 1.2~1.5. NAS·휴대폰·4G 값이 아니다)
빌드한 서버: `NODE_ENV=` `PORT=4391` `S1_TEST_BOTS=1000` `PATH_WORKERS=1`, 일회용 DB(가짜 계정 2개: 일반·관리자), 캐시 폴더는 저장소 밖 임시 폴더.

| 항목 | 값 |
|---|---|
| 굽기 3번(빈 캐시, 출력 판 2, F = 9) | 워커 안 18,660.5·20,645.1·20,011.5ms(생성 17,998·19,872·19,294ms, 타일 279~335ms, gzip 343~397ms). 서버가 듣기 시작한 때부터 준비까지 18.72초(첫 번) |
| 같은 때 생성기 벤치 | `pnpm --filter @terra/planet bench 7 9`: F7 1.43초(해시 `5664ca15`), F9 18.41초(해시 `ac761e56`). 생성기 검토 기록(12.37초)의 1.5배라 굽기가 통합 때보다 긴 것은 기계 부하로 본다(Assumed) |
| 메모리 | 워커 힙 + 외부(단계 끝) 193.7·190.8·186.9MB. 프로세스 RSS 단계 끝 최대 423.1·393.8·397.3MB, VmHWM 433,344·403,784·407,972kB. 첫 1분 지표 rssMb 443.2(측정 클라이언트가 모든 타일을 받은 분)·288.5·287.4 |
| 굽는 동안 | `/health` 20ms 간격 761번 p50 2.7ms·p99 10.4ms·최대 174.9ms. 그 분 지표: eventLoopP99Ms 2.6·MaxMs 83.4, cpuPercent 46.6, planetBakes 1, planetCacheMisses 1 |
| 크기·결정성 | 타일 2,046개, raw 17,141,388B, pack 2,948,585B, 캐시 목록 47,986B(형식 2), 결과 해시 `ac761e56`, 가장 높은 땅 830m, 정의 해시 `e04dd3cb58134c67…`. 세 번의 pack SHA-256이 같다(`2afaf194ffdb6d21…`). 캐시 파일 이름 `s2_test_planet-g2-t1-e04dd3cb58134c67` |
| 캐시로 다시 켜기 | cacheLoadMs 116.4, 프로세스 시작부터 준비까지 약 1.19초, VmHWM 171,376kB, 1분 지표 rssMb 171.6·planetCacheHits 1·planetBakes 0·planetCacheMisses 0 |
| `ops/s2-probe.mjs`(`S2_ALL=1`) | 목록 정보 21.1ms(1번), 범례 14개. 맵 레벨별 gzip KB(raw): 5 21.8(49.1), 6 72.9(196.4), 7 228.6(785.4), 8 678(3,141.8), 9 1,878.3(12,567). 처음 화면 30개 166.1ms, 모두 2,046개 6,719ms, 타일 p50 14.8·p95 37.1·최대 181.1ms. 머리 값·이음매 어긋남 0, 종료 코드 0 |
| 화면(파스텔 한국어, 390×844 @3) | 시험 18개 통과: 기본 테마 파스텔, [1차맵] 전에는 1차맵 조각·워커·three·측정 코드를 받지 않음, 누름 → 준비 2,167ms, 첫 표시(`data-first-ms`) 1,620ms, 궤도 60/160(단계 3), 타일 82개 모두 200, 타일 오류 0(누적·지금), 가장 높은 땅 830m, 콘솔 오류 0. 관리자: 셰이더 측정판(방식 3개, [측정 시작])이 보이고 측정 조각은 받지 않음, 가로 넘침 0 |
| 실패 안내(`page.route`) | 시험 9개 통과: 목록 정보 429(Retry-After 3) → "요청이 너무 많습니다. 3초 뒤에 다시 확인합니다."(`data-load` rate_limited) → 준비. 타일 첫 3개 401 → 받기 끝, 안내·HUD 실패 줄 없음(누적 오류 3). 타일 모두 404 → 판이 바뀐 안내, 안내 뒤 10초 동안 타일 요청 0개(안내까지 6개), HUD 실패 줄 숨김 |
| Vite 개발 서버 | `apps/game`에서 `vite --port 4393`(서버는 빌드한 것, `BETTER_AUTH_URL`을 그 주소로): 같은 화면 시험 통과(첫 표시 1,846ms, 타일 82개 200, 콘솔 오류 0). 관리자 화면의 "측정 코드" 검사만 걸렸는데, 개발 서버는 측정판 화면이 가져오는 `gpuBenchSummary.ts`·`gpuBenchTypes.ts`·`gpuBench.css`를 모듈마다 받기 때문이다(빌드에서는 관리자 조각 안). three·측정 실행기는 받지 않았다 |
| 첫 화면 JS(파일마다 gzip -9 합) | main(`git archive`로 저장소 밖에서 빌드) 372,600B(115,550, 4파일) → 측정판 합친 직후 372,799B(116,518, 6파일) → `sideEffects` 뒤 368,388B(114,171, 4파일). 첫 화면 조각에서 `planetTile.ts`·`planetManifest.ts`·`detMath.ts`가 빠졌다(빌드 소스 맵) |
| 그 밖의 묶음 | 1차맵 조각 55,058 → 62,012B, 메시 워커 8,100B 그대로. 미리 캐시 29개 1,405.53KiB → 31개 1,459.81KiB(측정판 몫) |

사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s2-polish/shots/` — `pastel-orbit.png`, `pastel-admin-bench.png`, `pastel-manifest-429.png`, `pastel-tile401-recovered.png`, `pastel-tile404.png`. 개발 서버는 `…/s2-polish/shots-dev/`.

눈으로 본 것(Assumed: 사람 판단): 궤도 사진은 통합 때와 같은 큰 대륙(가운데 사막, 북쪽 설산·빙상, 남쪽 강줄기와 해안 숲)이고 틈은 보이지 않았다. 측정판은 파스텔 판에 방식 세 개와 [측정 시작]이 넘치지 않고 들어간다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| (머지) 가지 넷의 파일 | 위 "한 일" 1. 내용은 각 가지 작업 기록 |
| `apps/server/src/planet/bake.test.ts`, `cache.test.ts` | 생성기 출력 판 2 후속(F5 해시, 캐시 버전 가정), `maxElevationM`, 면 레벨 10 거부 |
| `docs/PROTECTED.md` | 머지 충돌: 생성기 행(main) + detMath·프리셋 수치표 행(가지) |
| `apps/game/messages/{ko,en}.json` | 머지 충돌(측정판 키 + main 키), 새 문구 `planet_rate_limited` |
| `packages/protocol/package.json`, `packages/shared/package.json`, 두 꾸러미 `src/index.ts`(주석) | `"sideEffects": false` — 첫 화면 묶음에서 쓰지 않는 모듈 빼기. 맨 위 코드를 두지 말라는 주석 |
| `apps/game/src/map/planetSource.ts`, `planetSource.test.ts` | 기다리는 이유(`onWaiting`), 404 뒤 묻지 않기, `onSuccess`, `maxElevationM` 넘기기, 시험 |
| `apps/game/src/map/PlanetMapScreen.tsx` | `rate_limited` 단계·문구, 엔진 만들기 실패 잡기, 401 안내 지우기(다음 타일·세션 재확인), HUD 줄 = 지금 실패한 타일, `data-tiles-failed` |
| `packages/engine/src/planet/tilePipeline.ts`, `planetTypes.ts`, `planetEngine.ts`, `tilePipeline.test.ts` | 지금 실패한 타일 수(`counts().failed`, `stats.tilesFailed`), 주석(목록 정보 `maxElevationM`, 생성기 4~9) |
| `packages/protocol/src/planetManifest.ts`, `planetManifest.test.ts` | 목록 정보 `maxElevationM`(선택, 0 이상 정수) |
| `apps/server/src/planet/bake.ts`, `cache.ts`, `service.ts`, `service.test.ts` | 가장 높은 칸 세기(`highestCell`), 캐시 목록 형식 2, 준비된 목록 정보에 싣기, "planet ready" 줄에 값 |
| `apps/server/src/planet/routes.ts`, `routes.test.ts` | 타일 ID 숫자 형식(앞자리 0 거부) |
| `packages/planet/src/generator/surface.ts` | 주석만: 고도 축척 D-215 확정 |
| `docs/adr/2026-10-29-s2-planet-lod.md`, `docs/PLAN.md`, `AGENTS.md`, `docs/worklog/2026/10/29-1250-s2-integration.md`, 이 기록, `docs/WORKLOG.md`(자동) | 위 "한 일" 6 |

## 함께 바꿔야 하는 파일
- 윗 단계 모으기 규칙(`packages/planet/src/tiles/aggregate.ts`)을 바꾸면 `PLANET_TILE_FORMAT_VERSION`(`packages/protocol/src/planetTile.ts`), 타일 골든(`buildTiles.test.ts` `52d326ee`), ADR 36 타일 절. 바이옴 모으기 고침은 타일 형식 2판과 함께 한다.
- 캐시 목록 모양(`apps/server/src/planet/cache.ts` `planetCacheIndexSchema`)을 바꾸면 `PLANET_CACHE_FORMAT`을 올린다(옛 목록은 스키마에서 틀려 다시 굽는다).
- 목록 정보 필드를 더하면 `packages/protocol/src/planetManifest.ts`(선택 필드로), 서버 `service.ts` `manifest()`, 기기 `planetSource.ts`. 스키마는 strict가 아니라 옛 기기는 모르는 필드를 버린다.
- `@terra/protocol`·`@terra/shared`에 모듈을 더하면 맨 위에서 부르는 코드를 두지 않는다(`sideEffects: false`, 두면 가져오지 않는 묶음에서 말없이 빠진다). 앱 뼈대(ADR 37)가 `packages/shared`에 더할 화면 주소 표·메뉴·카드 ID 모듈도 같다.
- 1차맵 실패 안내를 바꾸면 `PlanetMapScreen.tsx` `screenNotice`와 HUD 줄, `planetSource.ts`의 이유 코드, 문구 ko·en.

## 건드리지 말 것
- 서버 타일 원천의 "404 뒤 묻지 않기"(`outdated`): 엔진은 실패한 타일을 계속 다시 받으므로, 지우면 열린 화면마다 [다시 시도]를 누를 때까지 요청(로그인 조회 포함)이 이어진다.
- HUD "받지 못한 타일" 줄은 지금 실패한 타일 수(`tilesFailed`)로 띄운다. 누적 `tileErrors`로 되돌리지 않는다(잠깐의 409·429 뒤 영영 남는다).
- `sideEffects: false`를 지우지 않는다(첫 화면 JS가 다시 약 4kB 는다).
- 생성기 출력 판 2의 골든 값(`005378e0`·`5c984c77`·`215d9b32`, 서버 F5 `5c984c77`, F9 `ac761e56`)은 출력이 바뀔 때만 `GENERATOR_VERSION`과 함께 고친다.

## 미검증·TODO·알려진 문제
- 바이옴 모으기 고침은 미뤘다(위). 그때까지 맵 레벨 F−4~F−1의 땅 칸 몇 개(레벨마다 5~13개, 검토 측정)가 바다·호수 바이옴 색으로 보이고 칸 정보도 그 이름을 쓴다.
- NAS에서 판 2 굽기 시간·메모리와 캐시 쓰기(권한 고침 뒤 처음)는 재지 않았다(Unknown). 배포 뒤 `nas-metrics`로 본다.
- 휴대폰에서 새 실패 안내와 렌더러 검토 반영(메모리 상한 셈 변경)은 보지 않았다(Unknown).
- 이 기계의 굽기 시간은 다른 에이전트 부하로 흔들렸다(같은 때 벤치가 1.5배). 통합 때 값(14.4~15.4초)과 바로 견주지 않는다.
- 굽기 뒤 RSS가 캐시로 켤 때보다 약 116MB 높게 남는다(288MB 대 172MB). 원인은 보지 않았다(Assumed: 할당기).
- 셰이더 측정판의 측정 자체는 돌리지 않았다(판이 보이는 것만 확인). 셰이더 언어는 휴대폰 값을 본 뒤 사용자가 정한다.
- 화면 시험·사진·부하 스크립트는 저장소 밖이다(`/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s2-polish/tools/`).

## 사용자 결정 대기
- 셰이더 언어(WebGL2 + GLSL 유지 / WebGPU + TSL): 휴대폰 값을 본 뒤(셰이더 측정판 작업 기록 그대로).
- ADR 36 확정: NAS(판 2)·휴대폰 확인 뒤 메인 세션이 정한다.

# S2 행성 타일·서버 굽기·전송: 타일 만들기, TCPT 형식, 굽기 워커, 디스크 캐시, 목록 정보·타일 경로

- 일시: 2026-10-29 09:50 (KST)
- 작업 도구: Claude Code (서브에이전트, 작업 트리)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (타일·서버)"을 덧붙임), `2026-10-29-cell-key-layout.md`(34), `2026-10-28-map-delivery-and-rendering.md`(11), `2026-10-28-fog-and-map-visibility.md`(26), `2026-10-28-s1-second-map.md`(33, 지형 경로·워커 방식), PLAN 4.2·5.5~5.7
- 새 런타임 의존성 없음. 같은 시간에 생성기(packages/planet 생성 코드·콘텐츠), 렌더러(packages/engine), WebGPU 측정을 다른 에이전트가 한다. 이 작업은 그 사이의 이음매(타일·형식·서버)만 맡았다.

## 한 일
- 타일 만들기(`packages/planet/src/tiles/`, 정수 연산만, 경계 검사 대상)
  - 생성기 출력 모양 `PlanetFields`(ADR 36 그대로)와 water 비트 상수.
  - 맵 레벨 F−4 ~ F를 아래 2×2에서 모으기: 평균(고도·기온·습도·숲), 최빈(바이옴, 동점은 작은 번호), 물 규칙, 하천 최대.
  - 꼭짓점 높이: 나누는 칸들의 평균(면 경계 너머 4칸, 큐브 꼭짓점 3칸). 맵 레벨마다 행성 전체를 한 번 계산하고 타일은 잘라 쓴다.
  - 타일 32×32칸 자르기, 타일 ID = 셀 키(레벨 L − 5), 목록·개수·키 → 덮는 곳.
- 이진 형식 "TCPT" 1판과 목록 정보 스키마(`packages/protocol`): `encodePlanetTile`·`decodePlanetTile`, 주소 틀·버전·캐시 머리글, Zod 스키마. `PROTOCOL_VERSION`은 그대로(WebSocket 메시지 변화 없음).
- 서버(`apps/server/src/planet/`)
  - 원본 인터페이스(주입), [임시] S2 합성 원본(F = 9).
  - 굽기 워커(굽기마다 하나, 생성 → 타일 → gzip → pack transfer). 같은 스레드 굽기는 시험용.
  - 디스크 캐시(pack + 목록 JSON, 확인 후 읽기, 원자적 쓰기, 다른 버전 정리), 메모리에 압축한 타일.
  - `GET /api/planets/:id`, `GET /api/planets/:id/tiles/:tileKey?v=…`: 로그인 필요, 404·409·429, 속도 제한.
  - 실패하면 늦춰 다시 굽기, 1분 지표 `planet*`, 준비 로그 `planet ready`.
- 운영: `PLANET_CACHE_DIR`(기본 `apps/server/.planet-cache`, 이미지 `/app/planet-cache`), NAS 볼륨, deploy.sh 폴더 준비, 측정 클라이언트 `ops/s2-probe.mjs`.
- 문서: ADR 36 "구현하며 정한 것 (타일·서버)", PLAN 4.2(행성 굽기 워커 한 줄), AGENTS 6장(워커 메모리·fetch·compose 검사)·7장(캐시 폴더·측정 명령), `ops/nas-setup.md`.

## 정한 것 (ADR 36에 없던 것 — 자세한 내용은 ADR 36 "구현하며 정한 것 (타일·서버)")
| 항목 | 정한 값 | 이유 |
|---|---|---|
| 작은 행성 타일 ID | 면이 32칸보다 작은 맵 레벨(L < 5)은 면 전체 타일, ID = 그 레벨 (0, 0) 칸 키 | ADR 규칙(레벨 L − 5)은 L < 5에서 음수가 된다. 이 방법은 한 행성 안에서 겹치지 않고 F ≥ 9에는 영향이 없다 |
| 반올림 | 평균은 `Math.round`(.5는 +∞ 쪽), 단계마다 | 명세가 정한 함수, 정수 합을 4로 나눈 값은 정확하다 |
| 물 모으기 | 바다 ≥ 2칸 → 바다(수심은 바다 칸 최빈, 동점은 얕은 쪽), 아니면 호수 ≥ 2칸 → 호수, 강·해안은 하나라도, 비트 6~7은 0 | ADR "바다가 2칸 이상이면 바다"를 다른 비트까지 넓혔다 |
| 타일 순서 | 맵 레벨 오름차순 → 키 오름차순 | 처음 화면용 거친 단계가 pack 앞에 온다 |
| 형식 | 머리 56바이트, 칸 값은 필드별로 이어 붙임, 정의 해시 SHA-256 32바이트 | 머리 길이를 둬서 머리를 늘려도 옛 기기가 읽는다. 필드별 배치가 gzip에 유리하다 |
| 형식 버전 뜻 | 바이트 배치 + 타일 값 규칙(모으기·꼭짓점) | 규칙이 바뀌면 같은 주소에 다른 내용이 나가게 되므로 |
| 타일 주소 버전 | `<형식>.<생성기>.<정의 해시 앞 16자>` | 셋 중 하나라도 바뀌면 주소가 바뀐다(1년 immutable 캐시) |
| 정의 해시 | 타일 내용을 정하는 입력(이름 제외)의 키 정렬 JSON의 SHA-256 | 이름만 바꾸면 다시 굽지 않는다 |
| 목록 정보 상태 | generating·ready만. 굽기 실패도 generating(서버가 다시 굽는다) | 기기가 할 일이 같다 |
| 원본과 워커 | 워커에는 직렬화할 수 있는 설명(spec)을 보내고 `createPlanetSource`로 다시 만든다. 버전·해시가 다르면 굽지 않는다 | 함수는 스레드를 넘지 못한다. 캐시 키가 어긋나지 않게 |
| 굽기 워커 | 풀 없이 굽기마다 하나, 힙 상한 512MB, 행성은 한 번에 하나 | 시작할 때 한 번 하는 일이라 풀이 필요 없다. 끝나면 메모리를 돌려준다. Piscina(ADR 3)는 설치돼 있지 않고 새 의존성은 금지 |
| gzip 수준 | 6(기본) | 9는 0.3% 작고 1.6배 느렸다 |
| 캐시 파일 | `<ID>-g<생성기>-t<형식>-<해시 16자>.pack` + `.index.json`, 다른 버전은 최근 하나만 남김, 10분 넘은 임시 파일 정리 | 되돌림 배포 때 다시 굽지 않게 하나는 남긴다 |
| 캐시 확인 | 목록 스키마·키·타일 목록·길이 합·크기·SHA-256·첫 타일 머리 | 틀리면 다시 굽는다(캐시는 지워도 되는 데이터) |
| 실패 처리 | 굽기 실패 → 1분부터 두 배씩 1시간까지 다시. 캐시 쓰기 실패 → 경고 뒤 메모리로 | 서버는 계속 뜬다 |
| 목록 정보 캐시 | `private, no-cache` + ETag(304) | 상태가 바뀐다(굽는 중 → 완료) |
| 오류 코드 | 401 SIGN_IN_REQUIRED, 404 PLANET_NOT_FOUND·TILE_NOT_FOUND·TILE_VERSION_NOT_FOUND, 409 PLANET_NOT_READY(Retry-After 5), 429 RATE_LIMITED(Retry-After) | S1 지형 경로와 같은 방식(코드만, no-store). 확인 순서: 행성 → 버전 → 타일 ID → 준비 |
| 속도 제한(Assumed 출발값) | 주소별 6,000/분(로그인 확인 전), 사용자별 타일 2,048/분, 목록 정보 30·60/분, 서버 전체 타일 30,000/분 | 주소별은 DB 세션 조회를 지킨다. 사용자별은 행성 하나를 한 번에 받을 수 있게 |
| gzip을 받지 않는 요청 | 풀어서 준다 | 드물지만 HTTP 규칙대로 |

## 확인 (Verified: 이 컨테이너 4 vCPU 공유, Node 24.22.1, pnpm 11.28.9, TS 7.0.2, vitest 5.0.5, PostgreSQL 16)
| 명령·확인 | 결과 |
|---|---|
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm check` | 통과(마지막 실행 결과는 아래 "최종 확인") |
| `TEST_DATABASE_URL=… pnpm test` | 통과(아래 "최종 확인") |
| `node scripts/check-docs.mjs origin/main`, `pnpm docs:index --check` | 통과(아래 "최종 확인") |
| `pnpm build` | 통과. `dist/planetBakeWorker.js`(1.9kB) + 공용 조각 `dist/assets/sources-*.js`. `import.meta.url`은 `dist/main.js`·`migrate.js`에만 있다 |
| `docker compose -f ops/compose.yml config`(가짜 변수) | 통과. 앱에 `…/planet-cache:/app/planet-cache` 바인드. 이미지 빌드는 Docker 데몬이 없어 하지 못했다(Unknown) |
| 빌드한 서버(빈 캐시) | 굽기 → `planet ready`(from bake), 캐시 파일 2개 |
| 빌드한 서버 다시 켜기(같은 캐시) | `planet ready`(from cache), 굽지 않음, 1분 지표 `planetCacheHits` 1 |
| 개발 실행(tsx `src/main.ts`) | 워커가 `.ts` 진입 파일로 굽는다. pack SHA-256이 빌드 서버와 같다 |
| `ops/s2-probe.mjs`(실제 로그인 쿠키) | 처음 화면 30개·모두 2,046개, 머리 값·이음매 어긋남 0 |

시험이 보는 것
- 타일: 개수(F 4·6·9·10·14), ID 규칙과 되돌리기, 겹치지 않음·순서, 맵 레벨마다 면을 빈틈·겹침 없이 덮음, 첫 칸 검사.
- 모으기: 바이옴 최빈·동점, 물 비트 표 10가지, 평균 반올림(음수 .5 포함), 셀 키 계층(childKeys)으로 구한 자식에서 모은 값과 같음(F = 5 모든 칸), 레벨 F는 원본 그대로, 결정성, 틀린 입력.
- 꼭짓점·이음매: 독립 기준(3D 격자점)과 모든 꼭짓점이 같음(레벨 0~5), 큐브 꼭짓점 3칸·나머지 4칸, 같은 레벨 타일이 같은 3D 점에서 같은 높이(F 5·6), 점 수 6n² + 2, 큐브 꼭짓점 8곳은 서로 다른 면의 타일 3개, 면 모서리 점은 두 면 이상, 골든 해시, F = 9 타일 2,046개.
- 형식: 왕복(32칸·면 전체), 바이트 배치(작은 끝, i8 2의 보수), Buffer 일부 입력·결과 복사, 틀린 입력 14가지, 늘린 머리, 만들기 거절, 주소·버전. 목록 정보: 통과·모르는 필드 버림·거절 13가지, 형식 버전 확인.
- 서버: 상수 일치(protocol = planet = content), 합성 원본 결정성·바다·해안(면 경계 너머), 정의 해시(이름 무관·키 순서 무관), pack = 타일 만들기 결과, 워커 굽기 = 같은 스레드 굽기(SHA-256), 워커 원본 어긋남·spec 없음·닫기. 캐시: 왕복·이름, missing, invalid 8가지, 정리. 서비스: 굽는 중 → 완료, 캐시 다시 켜기(생성 0번), 틀린 캐시 다시 굽기, 쓸 수 없는 폴더, 실패 뒤 다시(늦춤 1·2), 닫으면 다시 굽지 않음, 원본 검사, 지표, 설정. 경로: 401·200·304·404·409·429(사용자·주소), gzip·풀어서, 머리글. DB 통합: 실제 세션 쿠키로 200, 없으면 401.

## 잰 값 (Verified: 위 컨테이너, 빌드한 서버, 같은 기기 접속 — NAS·4G 값이 아니다)
| 항목 | 값 |
|---|---|
| 합성 행성 F = 9 굽기(워커 안) | 3.73~3.76초: 생성 3.02~3.10초, 타일 256~283ms, gzip 384~413ms(개발 실행 3.41초) |
| 시작부터 준비까지 | 4.6초(빈 캐시), 0.88초(캐시) |
| 메모리 | 워커 힙 + 버퍼 최대 74.8~79.7MB, 프로세스 RSS 최대 245MB(봇 0)·252MB(봇 1,000), 준비 뒤 225~226MB. 캐시로 켜면 154MB |
| 굽는 동안 `/health`(20ms 간격) | 160번 p50 2.5ms·p99 16.4ms·최대 30.7ms(봇 0), 159번 p50 2.5ms·p99 9ms·최대 33ms(봇 1,000) |
| 봇 1,000개 + 굽기가 있던 1분 지표 | 이벤트 루프 p50 0.2ms·p99 1.1ms·최대 8.3ms, 경로 요청 31개/초 |
| 크기 | 타일 2,046개, 압축 전 17,141,388바이트, gzip 4,788,185바이트(28%), 캐시 목록 48,659바이트 |
| 맵 레벨별 gzip(압축 전) KB | 5: 29.2(49.1), 6: 100.1(196.4), 7: 326.9(785.4), 8: 1,028.9(3,141.8), 9: 3,190.8(12,567) |
| 캐시 읽기·확인 | 107.3ms(pack 4.8MB SHA-256·목록 확인·첫 타일 풀기) |
| 받기(측정 클라이언트, 동시 6, 로그인 조회 포함) | 처음 화면 30개 113.8~140.3ms(129.3KB), 모두 2,046개 4.97~5.46초, 타일 하나 p50 10.5~22.2ms·p95 26.5~46.6ms·최대 112~116ms |
| 모두 받은 뒤 1분 지표 | 이벤트 루프 최대 10.4ms, `planetTilesServed` 2,046, `planetTileBytesServed` 4,788,185 |
| gzip 수준(합성 행성) | 1: 5,094,520B, 6: 4,718,009B, 9: 4,704,984B — 9는 6보다 0.3% 작고 gzip 시간 1.6배 |

## 최종 확인 (Verified, origin/main 577f74d 위로 다시 쌓은 뒤 실행)
| 명령 | 결과 |
|---|---|
| `git rebase origin/main` | 충돌 2곳 해결: `ops/nas-setup.md` 9장(main의 nas-metrics·CPU 줄을 살리고 행성 줄을 더함), `docs/WORKLOG.md`(`pnpm docs:index`로 다시 만듦). `pnpm install --frozen-lockfile` 그대로 |
| `pnpm --filter @terra/game typecheck` → `pnpm check` | 통과. 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠, 시험 파일 85개 통과·6개 건너뜀(DB), 시험 733개 통과·40개 건너뜀 |
| `TEST_DATABASE_URL=postgres://…/postgres pnpm test` | 시험 파일 91개, 시험 773개 모두 통과 |
| `pnpm build` | 통과(`dist/planetBakeWorker.js` 1.92kB, `dist/main.js` 128.33kB) |
| `node scripts/check-docs.mjs origin/main` | 통과 |
| `pnpm docs:index --check` | 통과 |
| 다시 쌓은 빌드 서버(같은 캐시) + 측정 클라이언트 | 캐시 읽기 89.2ms, 처음 화면 30개 140.7ms, 어긋남 0. 1분 지표 한 줄에 main의 `cpuPercent`(1.4)와 `planet*`가 함께 나온다(그 분의 이벤트 루프 최대 44.6ms — 시작 직후 구간) |

## 연결 메모 (메인 세션이 생성기·렌더러를 붙일 때)
- 실제 생성기: `apps/server/src/planet/sources.ts`
  - `PlanetSourceSpec`에 종류를 더한다(예: `{ kind: "generator", id, name, definition }`).
  - `createPlanetSource`가 그 종류일 때 `generate: () => Promise.resolve(generatePlanet(definition))`, `generatorVersion: GENERATOR_VERSION`, `definitionHash: definitionHashOf(<타일 내용을 정하는 정의, 이름 제외>)`, `biomes: <콘텐츠 biomes → { index, id, colour "#rrggbb", name }>`를 준다.
  - `main.ts`의 `planets.sources`를 콘텐츠 팩 행성마다 `createPlanetSource(spec)`으로 바꾸고, `TEMP_S2_PLANET`·`synthetic.ts`는 지운다.
  - `PlanetFields`는 `packages/planet/src/tiles/fields.ts`에 있다. 생성기 쪽 정의와 하나만 남긴다. 타일 코드는 `meta.faceLevel`만 읽고, 서버는 `meta.hash`를 캐시 목록(`fieldsHash`)에 적는다.
- 렌더러
  - 목록 정보: `GET planetManifestPath(id)` → `planetManifestSchema.parse` → `canReadPlanetTiles(manifest)`. `status`가 generating이면 몇 초 뒤 다시 묻는다(서버 Retry-After 5).
  - 타일 ID: `planetTileKey(mapLevel, face, i0, j0)`(`@terra/planet`). 덮는 곳은 `planetTileIdFromKey(faceLevel, key)`, 목록은 `planetTileIds(faceLevel)`.
  - 주소는 `planetTilePath(manifest.tileUrlTemplate, key)`. 브라우저는 gzip을 스스로 푼다 → `decodePlanetTile(arrayBuffer)` → `PlanetTileData`(heightsM·biome·water·temperatureC·humidity·forest·river, 행 우선 j 다음 i).
  - 물 비트가 바다면 바이옴보다 먼저 본다. 꼭짓점 (ci, cj) = 그 면의 st 점 ((i0+ci)/2^L, (j0+cj)/2^L).
- 시험용 원본: `apps/server/src/planet/testSupport.ts`의 `smallSource`·`controlledSource`(같은 스레드 굽기 `createInlineBaker`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/tiles/*`(새), `packages/planet/src/index.ts`(내보내기 한 줄) | 생성기 출력 모양, 타일 ID, 모으기, 꼭짓점 높이, 타일 만들기, 시험·시험 도우미 |
| `packages/protocol/src/planetTile.ts`·`planetManifest.ts`(새, + 시험), `index.ts` | 이진 형식, 주소·버전, 목록 정보 스키마 |
| `apps/server/src/planet/*`(새) | 원본·합성 원본·굽기·워커·캐시·서비스·경로·시험 |
| `apps/server/src/app.ts` | 행성 서비스·경로 붙이기, 1분 지표에 행성 값 |
| `apps/server/src/main.ts`, `vite.config.ts` | 굽기 워커 진입 파일 찾기, 빌드 입력 `planetBakeWorker` |
| `apps/server/src/config.ts` | `PLANET_CACHE_DIR` 읽기, 기본 폴더 |
| `apps/server/tsconfig.api.json` | 시험 도우미(`src/planet/testSupport.ts`)를 게임 앱 선언 파일에서 뺀다 |
| `.gitignore` | 개발 캐시 폴더 `.planet-cache/` |
| `Dockerfile`, `ops/compose.yml`, `ops/deploy.sh`, `ops/nas-setup.md` | 이미지 캐시 폴더, NAS 볼륨, 폴더 준비, 설명 |
| `ops/s2-probe.mjs`(새) | S2 타일 측정 클라이언트 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | "구현하며 정한 것 (타일·서버)" |
| `docs/PLAN.md` | 4.2 행성 굽기 워커 한 줄 |
| `AGENTS.md` | 6장 워커 메모리·fetch·compose 검사, 7장 캐시 폴더·측정 명령 |

## 함께 바꿔야 하는 파일
- 타일 값 규칙(`packages/planet/src/tiles/aggregate.ts`·`cornerHeights.ts`·`buildTiles.ts`)이나 바이트 배치를 바꾸면 `PLANET_TILE_FORMAT_VERSION`(`packages/protocol/src/planetTile.ts`)을 올리고, 골든 해시(`buildTiles.test.ts`)와 ADR 36을 고친다.
- 생성기 출력이 바뀌면 생성기 버전을 올린다(캐시 키·타일 주소가 바뀐다). 합성 원본은 `SYNTHETIC_GENERATOR_VERSION`.
- 면 레벨 범위·타일 한 변·행성 ID 형식을 바꾸면 `packages/protocol`의 같은 상수도(시험 `bake.test.ts`가 같은지 본다).
- 캐시 목록 모양을 바꾸면 `PLANET_CACHE_FORMAT`(`apps/server/src/planet/cache.ts`).

## 건드리지 말 것
- 셀 키 배치·면 배치·면 경계 변환표(ADR 34, PROTECTED). 타일 ID와 이음매가 여기에 기댄다.
- 생성기 파일(packages/planet의 생성 코드), packages/shared·content·engine·sim, apps/game은 다른 작업 몫이라 건드리지 않았다.

## 미검증·TODO·알려진 문제
- Docker 이미지 빌드와 NAS 배포는 하지 않았다(이 컨테이너에 Docker 데몬이 없다, Unknown). 실행기가 root라서 deploy.sh의 `chown 1000:1000`이 될 것이다(Assumed: myoung34/github-runner 기본 RUN_AS_ROOT). 안 되면 경고만 남고 앱은 메모리로 준다.
- NAS(R1600)의 굽기 시간·메모리, 4G 첫 표시는 재지 않았다. 측정 클라이언트로 잰다.
- 실제 생성기는 메모리가 더 들 수 있다. 워커 힙 상한(512MB)은 타입 배열을 막지 않으므로 컨테이너 상한(1GB)과 `peakWorkerMb`로 본다.
- 타일 요청마다 로그인 조회(DB)가 한 번씩 있다. 모두 받기(2,046개)에서 타일 하나 p50 10ms 정도였다. 렌더러 연결 뒤 부담이 보이면 짧게 기억하기를 검토한다.
- 합성 행성은 임시다(빙상 비율이 크고 사막이 거의 없다). 기획·생성기 값이 아니다.

## 사용자 결정 대기
- 없음.

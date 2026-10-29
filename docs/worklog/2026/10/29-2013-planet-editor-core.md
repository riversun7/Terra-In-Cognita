# 행성 편집기 핵심(WP-C): 미리보기 워커·작업 줄·결과 기억·타일·칸 정보·초안 동기화

- 일시: 2026-10-29 20:13 (KST)
- 작업 도구: Claude Code
- 가지: `work/editor-core`(작업 트리 `.claude/worktrees/editor-core`, main `5b37544`에서 시작). 첫 구현 커밋 `aae9760`·`1586912`, 검토 뒤 고침(21:25 KST) `c234f01`·`9f1ac65`·`e9102e9`·`566fa56`·`597b3d0`과 이 기록의 문서 커밋. 푸시·머지하지 않음
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38, 제안) 3·4·5·6·7·9절, `2026-10-29-s2-planet-lod.md`(36), 작업 기록 `29-1920-planet-editor-decisions.md`, 설계 노트 D.2~D.7·E·F·J(저장소 밖)

## 한 일
- 행성 편집기의 화면 없는 핵심을 `apps/game/src/editor/planet/`에 넣었다. 화면(WP-D)이 이것을 잇는다.
  - 미리보기 워커: `planetEditorWorker.ts`(모듈 워커 진입, 조각 이름 `planetEditorWorker-<해시>.js`)와 순수 핵심 `previewWork.ts`. 생성 → 요약 자리(지금은 null) → 맵 레벨 F−4~F 모으기 + 꼭짓점 높이 → 결과를 넘긴다. 단계마다 알린다. 넘긴 바이트(`outputBytes`)는 겹침을 뺀 버퍼 크기의 합이다.
  - 말: `previewProtocol.ts`(일·단계·결과·실패, 넘길 목록은 `Set`으로 겹침 제거).
  - 작업 줄: `previewJobs.ts`(순수). 빠른 줄 F5, 본 줄 기본 F7(F6~상한 고르기). 줄마다 도는 일 하나 + 기다리는 초안 일 하나(새 것이 바꾼다). 본 줄의 낡은 초안 일은 기후 단계 전이면 워커를 끝내고 다시 띄우고, 지났으면 끝까지 두고 기억한다.
  - 결과 기억: `previewCache.ts`(순수, 바이트 LRU, 처음 32MiB, 고정, F9 버리기).
  - 관리자: `previewController.ts` + 바깥 모양 `previewTypes.ts`. 워커 둘을 만들기 함수로 받는다(시험은 가짜). 열 때 공개본 F5 → 초안 F7 → 공개본 F7. 상한은 min(정의 면 레벨, `PLANET_GENERATOR_FACE_LEVELS` 위쪽 값, 기기 상한). 열쇠는 면 레벨 + 키를 정렬한 생성기 입력 JSON(`stableJson.ts`).
  - 타일 원천: `previewTiles.ts`(요청마다 `buildPlanetTile`), 엔진 행성 설명, 바이옴 색.
  - 칸 정보: `cellReport.ts`(위도·경도 → 엔진과 같은 방향 식 → `xyzToCell` → 칸 번호 → 결과 값, 물 비트 풀기, 설명 묶음을 붙이는 자리).
  - 초안 모델: `editorModel.ts`(프리셋 + 덮어쓰기, 다시 배치 표시, 극 ≤ 적도, 시드 u32).
  - 서버 초안 동기화: `draftSync.ts`(ADR 38 9절. 주입한 client로 get·save(기대 판)·restore·remove·revisions).
  - 내보내기·가져오기: `draftExport.ts`. 꺼짐 감지: `crashSentinel.ts`. 레벨별 메모리 추정표: `memoryEstimate.ts`.
- 순수 모듈마다 시험을 넣었다(검토 뒤 고침까지 시험 파일 14개, 시험 137개 + `@terra/shared` 3개). 워커 통합은 vitest가 모듈 워커를 띄우지 않으므로 워커 핵심 함수를 바로 시험하고, 진짜 워커는 아래 측정으로 확인했다.
- 새 런타임 의존성은 없다. 게임 앱에 `@terra/content`를 더하지 않았다(키 정렬 JSON은 편집기 안에 따로 둠, 가져오기 검사는 공용 표 `@terra/shared`·생성기 입력 풀기로 손으로 한다). 서버와 같이 쓰는 초안 상한·받지 않음 코드는 `@terra/shared` `planetDraftApi.ts`(새)에 두었다. 엔진·생성기·서버는 고치지 않았다.

## 검토 뒤 고침 (2026-10-29 21:25 KST)
검토 지적 9개(주요 2, 작은 것 5, 자잘한 것 2)를 이 작업 트리에서 다시 확인했다(Verified: 검토 재현 스크립트를 고치기 전 코드로 돌려 같은 결과, 고친 뒤 다시 돌림). 모두 받아들였다. 받아들이지 않은 것은 없고, 자잘한 것 하나(칸 찾기 두 구현)는 WP-D 합칠 때 정할 일로 넘긴다.

| # | 지적 | 확인 | 고침 | 커밋 |
|---|---|---|---|---|
| 1 | 공개본 청이 초안 일(같은 열쇠)에 합쳐졌다가 그 일이 밀려나면 공개본 결과를 잃음(주요) | Verified: 공개본 = 초안으로 열고 기후 전에 프리셋 → 공개본 F7 `idle`, 줄 비어 있음. 무작위 차례 400회 중 5~7회 | 밀려난 일(끝낸 도는 일·바뀐 기다리는 일)의 열쇠를 아직 청하는 자리가 있으면 공개본 일로 공개본 차례 맨 앞에 다시 세운다(`previewJobs.ts` `requeue`, 관리자가 줄마다 `needed`를 넘긴다) | `c234f01` |
| 2 | 원하지 않는 공개본 일을 멈추지 않아 F8·F9 공개본이 초안 일을 막음, F9를 고르면 공개본 F9도 몰래 한 번 더(주요) | Verified: F9 → F7로 돌아가도 공개본 F9가 계속 돌고 다음 초안 F7이 그 뒤에 섬, 다시 열어도 같음, 틀린 초안이 돼도 F9 일이 계속 | 도는 일은 초안·공개본 모두 기후 전이면 새 초안 일에 자리를 내준다(아직 필요하면 다시 선다). 원하지 않게 된 도는 일도 기후 전이면 끝낸다. 틀린 초안(rejected)에서도 뺀다. F8·F9 공개본은 화면이 청할 때만(`requestBaseFinal`, 상태 `deferred`) | `c234f01` |
| 3 | 내보내기 checks가 버린 F9 해시를 잃음 | Verified: F9를 보인 뒤 F7로 돌아가면 checks가 레벨 7만 | 결과 해시를 결과 기억과 따로 기억(최근 128개 열쇠, 버릴 때 지움) | `c234f01` |
| 4 | 꺼짐 감지: 둘째 탭이 살아 있는 탭의 F9를 꺼짐으로 보고 표시를 지움 | Verified: 탭 A F9 중 탭 B가 열면 `tripped: 9`·A 표시 지워짐, B가 F8을 먼저 끝내면 `{"v":1}` | 탭마다 표시 열쇠 + 표시가 있는 동안 Web Locks 잠금, 열 때 잠금이 없는 다른 탭 표시만 꺼짐. 잠금을 못 쓰면 예전처럼 | `9f1ac65` |
| 5 | 답을 잃은 저장이 거짓 충돌이 됨 | Verified: 서버가 처리한 뒤 답을 잃으면 다시 보낸 저장이 `conflict` | CONFLICT면 서버 것을 읽어 이 기기가 보낸 것(답을 잃은 저장 포함)·지금 초안과 같으면 그 판을 받아들이고 이어 간다 | `e9102e9` |
| 6 | 동기화가 `retrying`에 멈춤, 받지 않음 뒤 새 편집을 안 보냄, 영구 실패도 끝없이 다시 시도 | Verified: 세 경우 모두 재현 | 타이머가 부른 저장이 할 일 없이 끝나도 알림, 보낼 것이 없어지면 다시 시도 지움, 받지 않음보다 새 편집이 있으면 이어 보냄, `DraftAccessError` → `denied`(다시 시도 안 함, `retryNow`로 잇기) | `e9102e9` |
| 7 | 가져오기 미리 검사가 서버보다 약함(8KiB·바이옴·행성 ID) | Verified: 9~64KiB 항목·팩에 없는 바이옴이 `parseDraftImport`를 통과 | 상한·코드를 `@terra/shared` 한 곳에, `entryProblem`(entry_too_large·invalid_entry)·`checkDraftForPack`(unknown_biome·unknown_planet·generator_rejected) | `566fa56` |
| 8 | 자잘한 것: `__proto__` 키, 넘길 목록을 이름으로 적음, 버린 뒤 결과를 붙잡음, 칸 찾기 두 구현 | Verified: 앞의 셋 재현. 넷째는 두 구현이 F5·F7·F9 모든 픽셀에서 같다(검토 측정) | `Object.fromEntries`, 배열 보기를 모두 모음, 버릴 때 자리·요약 비움(`c234f01`). 넷째는 WP-D에 넘김(아래 "함께 바꿔야 하는 파일") | `597b3d0`·`c234f01` |
| 9 | 작업 기록: 시각(커밋은 20:13 KST), 작업 도구 줄, 결정 15, 미리 캐시 대소문자 | Verified: 커밋 시각 11:13 UTC, `DEV_ONLY_CHUNK` 정규식은 대소문자를 가림 | 이 기록 이름·시각을 20:13으로, 작업 도구는 `Claude Code`만, 결정 15 고침, WP-D 할 일에 대소문자 | 이 기록 |

- 고친 뒤 검토 재현 스크립트(저장소 밖, 검토자 것): 공개본 F7이 다시 줄에 서서 돈다, F7로 돌아가면 공개본 F9를 끝내고 다음 초안 F7이 바로 간다, 다시 열기·틀린 초안도 같다, checks에 F9가 남는다, 동기화는 거짓 충돌 없이 판 2를 받아들이고(`get, save 1, save 1, get`) 되돌림 뒤 `saved`로 끝나며, 받지 않음 뒤 새 편집(시드 3)을 보낸다. 검토자의 무작위 차례 시험(3 × 400회)은 `idle` 자리 0개이고, 새 상태 `deferred`(F8·F9 공개본)만 그 시험이 모르는 상태로 센다.
- 저장소 안 시험: 검토 시나리오(`previewControllerLanes.test.ts`)와 고정 시드 무작위 차례(3 × 60회, 줄을 다 비운 뒤 청한 자리가 모두 ready·cancelled·deferred, 살아 있는 워커 ≤ 2, 감지 표시 짝). 고친 것을 하나씩 되돌려 보면 시험이 잡는다(Verified: 다시 세우기를 빼면 시나리오 3개와 무작위 차례 시험, 초안 일만 자리를 내주게 하면 시나리오 3개, rejected에서 빼지 않으면 시나리오 1개가 실패).

## 잰 값
### 브라우저 워커·관리자 (Verified: 헤드리스 Chromium 153.0.8010.12, Playwright 1.63, 저장소의 Vite 8.3.5로 묶은 저장소 밖 측정 페이지, 개발 컨테이너 4 vCPU 공유. 다른 에이전트가 함께 돌았다)
진짜 `planetEditorWorker.ts`와 `createPreviewController`로 잰 값이다. 시간은 화면 스레드에서 일을 보낸 때부터 결과를 받은 때까지(`elapsedMs`). 행성은 콘텐츠 팩 `s2_test_planet`(면 레벨 9), 시드만 바꿔 새 일을 만들었다.

| 항목 | 1회차(부하 평균 3.4) | 2회차(부하 3.9 → 6.5) |
|---|---|---|
| 열기: 공개본 F5(새 워커) | 307ms | 776ms |
| 열기: 초안 = 공개본 F7(새 워커) | 1,302ms | 2,154ms |
| 본 줄 F7, 따뜻한 워커 5번 | 733~1,136ms | 1,021~1,547ms |
| 빠른 줄 F5, 따뜻한 워커 5번 | 89~211ms | 117~218ms |
| 기후 전 낡은 일 → 다시 띄운 워커의 새 F7(보낸 때부터) | 1,074·1,510ms | 1,924·1,945ms |
| 기후 뒤 낡은 일 뒤에 선 새 F7(보낸 때부터, 낡은 결과는 기억됨) | 1,077ms | 1,940ms |
| 모든 F7 타일(138개): 미리보기 원천 = `buildPlanetTiles` | 138개 중 다른 것 0개, 합 12.4ms | 0개, 15.2ms |
| 넘긴 바이트 F5 / F7 | 95,676 / 1,512,060 B | 같음 |
| 결과 해시 F5 / F7 | Node와 같음(`5c984c77` / `5664ca15`) | 같음 |
| 측정 끝 결과 기억 / 화면 JS 힙 | 15.7MB / 18.1MiB | 15.7MB / 18.0MiB |

- 다시 띄우는 값은 따뜻한 F7과 견주어 약 0.3~0.4초로 보인다(Assumed: 같은 시드가 아니라 다른 시드끼리 견줌, 부하가 흔들림).
- 묶음 크기(측정 페이지, minify): 워커 조각 `planetEditorWorker-*.js` 35,875 B(gzip 13,571 B). 화면 쪽은 측정 코드까지 합쳐 31,535 B(gzip 11,256 B)라 편집기 몫만의 값은 아니다. 워커 조각에 `zod`·`three`·콘텐츠 패키지 문자열은 없었다.

### Node 메모리 (Verified: Node 24.22.1, `node --expose-gc`, 레벨마다 새 프로세스, 부하 평균 6~7. 저장소 밖 스크립트가 `previewWork.ts`를 그대로 불러 돌림)
단계 끝마다 `process.memoryUsage().arrayBuffers`(시작 값 뺌)를 GC 전·후로 쟀다. 표 `memoryEstimate.ts`는 GC 전 최댓값과 넘긴 바이트를 쓴다. 단계마다 GC를 불러 시간은 부풀었다(시간 값은 쓰지 않는다).

| 면 레벨 | 넘긴 바이트(결과가 화면에 남기는 것) | 타입 배열 최대 GC 전 / 후 | 최대 RSS | 해시 |
|---|---|---|---|---|
| F4 | 24,336 B | 0.56 / 0.20 MiB | 94 MiB | `918ce1e0` |
| F5 | 95,676 B | 1.20 / 1.08 MiB | 94 MiB | `5c984c77` |
| F6 | 379,548 B | 3.85 / 2.22 MiB | 97 MiB | `215d9b32` |
| F7 | 1,512,060 B | 11.36 / 8.85 MiB | 106 MiB | `5664ca15` |
| F8 | 6,036,156 B | 45.56 / 36.13 MiB | 137 MiB | `4499c8b2` |
| F9 | 24,120,636 B | 165.51 / 141.51 MiB | 280 MiB | `ac761e56` |

- 해시는 설계 때 잰 생성기 출력 판 2 값과 같다(워커 핵심이 생성기 출력을 바꾸지 않는다). 편집기 코드·시험에는 해시를 적지 않았다.
- 넘긴 버퍼는 레벨마다 41개다(결과 배열 8 + 꼭짓점 5 + 윗 단계 4 × 7. 맨 고운 단계는 결과 배열을 그대로 써서 겹침을 뺐다).

## 구현하며 정한 것 (ADR 38 "구현하며 정한 것"에 옮길 것)
1. 공개본 일은 본 줄에서 초안 일 뒤에 따로 줄 선다(차례: 기다리는 초안 일 → 공개본 일). 열 때 순서와 차이 열을 지키려고. 도는 공개본 일도 기후 전이면 새 초안 일에 자리를 내주고 공개본 차례 맨 앞에 다시 선다(검토 뒤 고침: 초안이 보는 것이고 F9 공개본은 약 15초다). 밀려난 일(끝낸 도는 일·바뀐 기다리는 일)의 열쇠를 아직 청하는 자리가 있으면 공개본 일로 다시 세운다(초안 = 공개본이라 청이 합쳐졌던 경우).
2. 낡은 일 규칙은 새 결과가 이미 기억돼 있을 때도 쓴다: 원하지 않게 된 도는 일(초안·공개본)이 기후 전이면 워커를 끝낸다. 틀린 초안(rejected)이 돼도 같다. 도는 일이 바로 새로 청한 열쇠면 기다리던 낡은 일만 뺀다. 기후를 지난 일은 원하지 않아도 끝까지 두고 기억한다(ADR 38 3절의 규칙 그대로).
3. 결과 기억 고정 = 공개본 빠른·본 결과 + 자리마다 지금 보이는 결과. 보이는 결과도 실제로 메모리에 남으므로 바이트 셈을 맞추려고. 고정한 것과 방금 넣은 것만으로 상한을 넘으면 넘은 채로 둔다.
4. F9 버리기: 본 줄 결과가 오거나 기억한 본 결과가 보이게 되면, 고정되지 않은 F9(레벨 9 이상) 결과를 버린다. 보이는 F9는 새 결과가 올 때까지 남는다. 결과 해시는 결과 기억과 따로 최근 128개 열쇠를 기억해서 버린 F9의 해시도 내보내기 checks에 남는다(검토 뒤 고침). 버리면(dispose) 결과·해시·자리·요약을 모두 놓는다.
5. 실패 코드: `rejected`(생성기가 받지 않는 입력. 화면 스레드 확인에서 걸리면 워커에 보내지 않는다), `failed`(워커 안 오류), `crashed`(워커 `error`·`messageerror`), `unavailable`(워커를 만들 수 없거나, 한 번도 답하지 않은 워커가 두 번 잇달아 죽음). 끝낸 워커의 늦은 답은 버린다.
6. 단계 이름 = 생성기 단계 + `summary` + `levels`. 기후 판단은 "climate를 알렸는가"로 본다(단계 순서표를 적지 않아 생성기에 단계가 늘어도 그대로).
7. 결과에 `maxElevationM`(가장 높은 칸)을 워커가 따로 싣는다(요약과 무관하게 엔진 설명에 쓴다). `summary`는 WP-A 전까지 null이고, 워커 핵심의 `summarize` 훅에 `summarizePlanet`을 건다.
8. 기억한 결과(`PreviewEntry`)는 그 결과를 만든 생성기 입력을 들고 있다(칸 정보가 바이옴 표를 읽는다). 보낸 때부터 받은 때까지의 시간(`elapsedMs`, 다시 띄운 값 포함)도 든다.
9. 면 레벨: 빠른 = min(5, 상한), 본 기본 = min(7, 상한), 고르기 = 6~상한(상한이 6보다 작으면 상한 하나). 상한은 생성기 아래쪽 값보다 낮아지지 않는다. 기기 상한은 관리자 `setDeviceMaxLevel`로 바꾼다.
10. 칸 정보는 위도·경도로 받는다(새 결과가 와도 같은 곳을 다시 읽는다). 칸 경계 바로 위 점은 위도·경도를 거친 1e-16 정도 오차로 엔진이 고른 칸과 이웃 칸으로 갈릴 수 있다(예: 경도 ±180°는 면 3의 칸 경계). 설명 묶음은 `explainers` 목록(제네릭)으로 붙인다.
11. 초안 모델: 쓰는 값을 표 범위로 묶고 정수로 반올림한다. 극 기온은 적도를, 적도 기온은 극을 넘지 않게 쓰는 값을 맞춘다. 되돌리기·프리셋 바꾸기로 극 > 적도가 되면 두 기온 덮어쓰기를 모두 지운다. 프리셋 값(프리셋이 정하지 않는 키의 기본값 포함)과 같은 덮어쓰기는 지우고, 비면 `overrides` 필드를 뺀다. 프리셋을 바꾸면 그 축의 어느 단계든 정하는 키를 지운다. 모델이 고치지 않는 필드(모르는 필드 포함)는 그대로 둔다.
12. 다시 배치 표시: 육지 %·대륙붕 %·판 개수·시드·해수면 프리셋·판 프리셋(설계 C.2 4).
13. 초안 동기화 client 모양: `get`, `save({ planetId, document, expectedRevision })` → 저장됨(판·시각) | 충돌 | 받지 않음(코드), `restore`, `remove`, `revisions`. 닿지 못함은 던진다(다시 시도). 로그인 안 됨·권한 없음·저장 말고 다른 호출의 잘못된 요청은 `DraftAccessError`(`unauthorized`·`forbidden`·`invalid_request`)를 던진다 → 다시 시도하지 않고 `denied`(요약 `deniedReason`). 저장에서 멈췄으면 편집은 받아 두고 [다시 시도](`retryNow`)가 잇는다. 기대 판 0 = 서버에 초안 없음. 서버에 초안이 없으면 공개본으로 시작하고 처음 바꿀 때 만든다. 읽기 실패도 같은 기다림(1초부터 두 배, 최대 30초, 끝없이)으로 다시 읽는다. CONFLICT면 서버 것을 읽어 이 기기가 보낸 것(던진 저장의 초안 최대 16개, 첫 것은 늘 남김)·지금 초안과 같으면 그 판을 받아들이고 이어 간다. 던진 저장이 있는 동안은 저장 안 됨으로 센다. 보내는 동안 더 바꿨는데 받지 않음이 오면 새 것을 이어 보낸다. 바쁜 일(불러오기·덮기·되돌리기·지우기)은 보내는 저장이 끝난 뒤 하나씩 하고, 그동안 편집을 받지 않는다. [이걸로 덮기] = 서버 지금 판을 읽어 그 판을 기대 판으로 다시 저장. 화면은 tRPC를 이 모양에 맞춘다(WP-D).
14. 가져오기: 바깥 묶음이 틀리면 `unknown_format`, 직렬화한 항목이 8KiB를 넘으면 `entry_too_large`, 행성 항목이 생성기가 받을 수 없는 모양이면 `invalid_entry`(ID·면 레벨 범위·시드·바이옴 ID 목록·프리셋 단계·덮어쓰기 키·범위·극 ≤ 적도를 공용 표로 본다). 초안을 바꾸기 전에 `checkDraftForPack`으로 서버 drafts.save와 같은 차례(바이옴 참조 `unknown_biome` → 행성 ID `unknown_planet` → 생성기 입력 `generator_rejected`)를 본다. 서버와 같이 쓰는 상한·코드는 `@terra/shared` `planetDraftApi.ts`(기기만의 코드는 `too_large`·`not_json`·`unknown_format`). planets.json 항목 하나만 붙여 넣어도 받는다(`bare`, 기준·해시 없음). 해시 모양은 16진수 8~64자로 받는다. 내보내기 `checks`는 면 레벨 오름차순, 레벨마다 하나. 파일 이름 `terra-planet-draft-<행성 ID>-<UTC YYYYMMDD-HHMM>.json`.
15. 꺼짐 감지: 표시는 탭(감지기)마다 열쇠 `terra.planetEditor.run.<탭 ID>` → `{ v: 1, level, startedAt }`, 기기 상한은 `terra.planetEditor.device` → `{ v: 1, maxLevel? }`. 탭은 자기 표시만 쓰고 지운다. 표시가 있는 동안 같은 이름의 Web Locks 잠금을 쥐고, 열 때(`open()`, 비동기) 쥔 잠금이 없는 다른 탭의 표시만 꺼짐으로 본다. 잠금을 못 쓰는 곳(보안 맥락이 아닌 LAN http)에서는 남은 표시를 모두 꺼짐으로 본다. F8 미만은 표시하지 않는다. pagehide는 표시를 지우고 잠금을 놓되 도는 일을 기억하고, pageshow(뒤로 가기 캐시)에서 다시 남긴다. 꺼진 탭이 여럿이면 상한은 min(지금 상한, 가장 낮은 꺼진 레벨 − 1). (첫 구현은 한 칸을 같이 써서 "이 탭이 남긴 표시만 지운다"가 탭 둘에서 거짓이었다 — 검토 뒤 고침)
16. 메모리 추정표는 F4~F9를 Node에서 잰 값으로 적고 출처 줄을 붙였다(위 표). 생성기 면 레벨 범위가 바뀌면 시험이 실패해 다시 재게 한다.
17. 무거운 레벨(F8 이상, `HEAVY_PREVIEW_LEVEL`, 꺼짐 감지 문턱과 같은 상수)의 공개본 본 결과는 화면이 청할 때만 만든다(`requestBaseFinal`, 그 전 자리 상태 `deferred`, 앞 공개본 결과를 낡은 것으로 보인다). 청은 그 레벨에 있는 동안만이다: 레벨을 바꾸거나 멈추거나 다시 열면 풀린다. 초안 = 공개본이면 초안 결과가 곧 공개본 결과다(한 번만 만든다). F9 확인 창이 말한 시간·메모리를 한 번으로 지키고, ADR 38 3절의 열 때 순서가 공개본은 F5·F7만 적은 것과 맞춘다(검토 뒤 고침).
18. 넘길 목록은 생성 결과·단계의 맨 위 값 중 배열 보기를 모두 모은다(필드 이름을 적지 않는다: 생성기가 출력 필드를 더해도 넘기고 바이트에 센다). 키 정렬 JSON은 `Object.fromEntries`로 만든다(`__proto__` 자기 키를 지킨다).

## 최종 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9)
| 명령 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과(잠금 파일 바뀜 없음) |
| `pnpm check`(첫 구현) | 통과(1분 1초, 부하 평균 2.6 → 4.1): 포맷·린트·타입·경계·크기·다국어 291개 키(바뀜 없음)·대비·콘텐츠 `core@2`, 시험 파일 121개 통과·6개 건너뜀(DB), 시험 1,091개 통과·40개 건너뜀 |
| `vitest run apps/game/src/editor`(첫 구현) | 시험 파일 12개, 시험 109개 통과(약 5초) |
| `pnpm check`(검토 뒤 고침, 커밋 `597b3d0` + 이 기록) | 통과(1분 6초, 부하 평균 8.1 → 6.0): 포맷 505개 파일·린트·타입·경계·크기·다국어 291개 키(바뀜 없음)·대비·콘텐츠 `core@2`, 시험 파일 124개 통과·6개 건너뜀(DB), 시험 1,122개 통과·40개 건너뜀 |
| 같은 고침의 앞선 `pnpm check`(부하 평균 5.6 → 15.9) | 이 작업이 건드리지 않은 시험 3개가 5초 제한에 걸림: `apps/server` 굽기 워커, `packages/sim` A* 결정성, `apps/game` 셰이더 측정 자료. 셋만 다시 돌리면 통과(부하 12.8, 6.2초). 부하 탓으로 본다(Assumed) |
| `vitest run apps/game/src/editor`(검토 뒤 고침) | 시험 파일 14개, 시험 137개 통과(약 4초). `packages/shared` `planetDraftApi.test.ts` 3개 |
| 시작 전 `pnpm check`(main 그대로, 부하 평균 약 15) | 시험 2개 실패: `packages/sim` A* 결정성(5초 제한), `apps/server` 지표 히스토그램(p50 5.3 > 5). 부하 탓으로 보이고(Assumed) 부하가 낮을 때 위 실행에서는 통과했다 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/planet/planetEditorWorker.ts` | 미리보기 모듈 워커 진입(이름 앞머리 `planetEditor`: 미리 캐시 제외 규칙) |
| `apps/game/src/editor/planet/previewWork.ts` (+시험) | 워커 순수 핵심: 생성 → 요약 자리 → 모으기·꼭짓점 → 답·넘길 목록 |
| `apps/game/src/editor/planet/previewProtocol.ts` | 워커와 주고받는 말, 넘길 목록(겹침 제거)·바이트 |
| `apps/game/src/editor/planet/previewJobs.ts` (+시험) | 작업 줄·면 레벨·열쇠(순수) |
| `apps/game/src/editor/planet/previewCache.ts` (+시험) | 바이트 LRU 결과 기억(순수) |
| `apps/game/src/editor/planet/previewController.ts` (+시험), `previewTypes.ts` | 워커 둘·결과 기억·화면 요약. 검토 뒤: 줄마다 `needed`, rejected에서 빼기, F8·F9 공개본 `deferred`·`requestBaseFinal`, 해시 기억, 버릴 때 비움 |
| `apps/game/src/editor/planet/previewControllerLanes.test.ts`, `previewTestKit.ts` | 검토 시나리오·고정 시드 무작위 차례 시험, 가짜 워커 시험 도우미(관리자 시험 둘이 같이 쓴다) |
| `apps/game/src/editor/planet/previewProtocol.test.ts` | 넘길 목록: 새 배열 필드·같은 버퍼·공유 메모리 |
| `packages/shared/src/planetDraftApi.ts` (+시험), `packages/shared/src/index.ts` | 서버·기기가 같이 쓰는 초안 항목 상한(8KiB)·크기 재기·받지 않음 코드 |
| `apps/game/src/editor/planet/previewTiles.ts` (+시험) | 결과 → 엔진 타일 원천·행성 설명·바이옴 색 |
| `apps/game/src/editor/planet/cellReport.ts` (+시험) | 위도·경도 → 칸 → 결과 값, 설명 묶음 자리 |
| `apps/game/src/editor/planet/editorModel.ts` (+시험) | 초안 항목 고치기 규칙(순수) |
| `apps/game/src/editor/planet/draftSync.ts` (+시험) | 서버 초안 동기화 상태 기계(검토 뒤: 답을 잃은 저장 확인, 멈춤 없앰, 받지 않음 뒤 새 편집, `denied`) |
| `apps/game/src/editor/planet/draftExport.ts` (+시험) | 내보내기 묶음·가져오기 검사(검토 뒤: `entry_too_large`, `checkDraftForPack`) |
| `apps/game/src/editor/planet/crashSentinel.ts` (+시험) | F8·F9 꺼짐 감지(기기 설정. 검토 뒤: 탭마다 표시 + Web Locks, `open()` 비동기, 선택 사항 객체) |
| `apps/game/src/editor/planet/memoryEstimate.ts` (+시험) | 레벨별 메모리 추정표(출처 줄) |
| `apps/game/src/editor/planet/stableJson.ts` (+시험) | 키를 정렬한 JSON(열쇠·같은지) |
| `apps/game/src/editor/planet/testDefinitions.ts` | 시험 도우미(팩의 행성·바이옴 항목) |
| `docs/worklog/2026/10/29-2013-planet-editor-core.md`, `docs/WORKLOG.md` | 이 기록(검토 뒤 `29-2030`에서 이름을 고침: 커밋 시각 20:13 KST), 목차 |

## 함께 바꿔야 하는 파일
- WP-D 화면: `vite.config.ts` `globIgnores`와 `scripts/pwa-build.mjs` 검사(`DEV_ONLY_CHUNK`)에 `planetEditor*` 조각을 넣는다(ADR 38 1절). 지금은 화면이 이 폴더를 가져오지 않아 빌드에 들어가지 않는다.
  - ADR 38의 정규식 `/^assets\/(gpuBench|planetEditor)[^/]*\.(js|css)$/`는 대소문자를 가린다. 화면 진입 파일을 설계 D.1처럼 `PlanetEditorScreen.tsx`로 두면 조각 `PlanetEditorScreen-*.js`가 모든 플레이어에게 미리 캐시된다. 지연 로딩 진입 파일 이름을 소문자 `planetEditor…`로 두거나, 정규식과 `globIgnores`를 `[Pp]lanetEditor`로 넓힌다(설계 D.12).
- WP-D 화면이 이을 것(검토 뒤 바뀐 모양)
  - 미리보기: `base.final.status === "deferred"`이면 번갈아 보기·면적 차이 열에 [공개본 F{n} 만들기]를 두고 `requestBaseFinal()`을 부른다(F9는 확인 창). 새 상태 `deferred`를 상태 칩 문구에 넣는다.
  - 꺼짐 감지: `createCrashSentinel({ storage?, locks?, now?, tabId? })`, `open()`은 Promise다 — 기다린 뒤 `deviceMaxLevel`로 관리자를 만들거나 `setDeviceMaxLevel`을 부른다. `begin`·`end`는 관리자 선택 사항 `sentinel`로 넘긴다.
  - 초안 동기화(`editorApi.ts`): tRPC `UNAUTHORIZED` → `throw new DraftAccessError("unauthorized")`, `FORBIDDEN` → `"forbidden"`, 저장이 아닌 호출의 `BAD_REQUEST` → `"invalid_request"`, 저장의 `CONFLICT` → `{ kind: "conflict" }`, 저장의 `BAD_REQUEST` → `{ kind: "rejected", code }`(코드는 `PLANET_DRAFT_REJECT_CODES`), 그 밖(닿지 못함·5xx)은 그대로 던진다. 상태 `denied`와 `deniedReason`을 문구로 보이고 [다시 시도]가 `retryNow()`.
  - 가져오기: `parseDraftImport` 다음 `checkDraftForPack(항목, { planetIds, biomes })`(정의 조회 결과)이 null일 때만 초안을 바꾼다. 가져온 항목이 면 레벨·바이옴 표를 바꾸면(ADR 38 2절: 편집기는 읽기만) 알릴지 막을지는 화면이 정한다(이 모듈은 막지 않는다).
  - 칸 찾기가 두 벌이다: 이 폴더 `cellReport.ts` `cellAtLatLon`과 WP-E `flatMapRender.ts` `flatMapCellIndex`. 검토 측정에서 F5·F7·F9 모든 픽셀에서 같았다. 합칠 때 하나만 남긴다(평면 미니맵의 픽셀 표가 같은 식을 쓰는지 시험으로 묶는다).
- WP-B 서버(`planetEditor.drafts.save`): 항목 크기는 `@terra/shared` `planetDraftEntryBytes`와 `PLANET_DRAFT_ENTRY_MAX_BYTES`로 재고, 받지 않음 코드는 `PLANET_DRAFT_REJECT_CODES`를 그 차례(entry_too_large → invalid_entry → unknown_biome → unknown_planet → generator_rejected)로 준다. 코드는 사람이 읽는 문장이 아니라 기계가 읽는 칸(예: tRPC 오류 `data`)에 싣는다. 기대 판이 다르면 `CONFLICT`. `get`·`restore`·`remove`의 잘못된 요청(팩에 없는 행성 등)은 `BAD_REQUEST`(기기는 다시 시도하지 않는다).
- WP-A 생성기 도우미가 들어오면: `previewProtocol.ts` `PreviewSummary`를 `summarizePlanet` 결과 타입으로, `planetEditorWorker.ts`가 `runPreviewJob`에 `summarize`를 넘긴다. 바이옴 판정 설명은 `cellReport`의 `explainers`로 붙인다.
- WP-B 서버 초안 API의 모양이 `draftSync.ts` `DraftClient`와 다르면 화면의 tRPC 연결(`editorApi.ts`)에서 맞춘다. `DraftBase`(콘텐츠 버전·정의 해시·생성기 판) 모양도 서버 `base` jsonb와 맞춘다.
- `packages/shared/src/planetDraftApi.ts`의 상한·코드를 바꾸면 서버 drafts.save 검사, 편집기 가져오기(`draftExport.ts`), 화면 메시지 키를 함께 바꾼다.

## 건드리지 말 것
- `planetEditorWorker.ts`의 파일 이름 앞머리(조각 이름 → 미리 캐시 제외 규칙).
- `cellReport.ts` `directionOfLatLon`의 식과 곱셈 순서(엔진 `globeCamera.ts`와 비트까지 같게 옮겨 적었다).
- 편집기 코드·시험에 해시·생성기 판 번호를 적지 않는다(생성기 다양성 고침 `work/generator-variety`가 출력 판을 올린다).

## 미검증·TODO·알려진 문제
- 꺼짐 감지의 Web Locks는 가짜 잠금으로만 시험했다. 실제 브라우저(Chromium·WebKit·Gecko)에서 탭을 끄면 잠금이 풀리는 것은 명세 기준이다(Assumed: 돌려 보지 않음). Chromium은 Web Locks를 쥔 페이지를 뒤로 가기 캐시에 넣지 않을 수 있다(Assumed). 그래서 잠금은 F8·F9가 도는 동안만 쥔다.
- 답을 잃은 저장 확인은 "서버 것 = 이 기기가 보낸 것"이면 내 저장으로 본다. 다른 기기가 똑같은 초안을 저장했어도 충돌 없이 받아들인다(내용이 같아 잃는 것은 없다).
- F8·F9에서 공개본이 `deferred`인 동안 면적 차이 열·번갈아 보기는 그 레벨의 공개본이 없다. 화면 흐름(버튼·확인 창)은 WP-D가 정한다.
- Safari·Firefox 워커, 휴대폰 시간·메모리는 재지 않았다(Unknown). F8·F9는 브라우저 워커로 이 작업에서 돌리지 않았다(Node 메모리만).
- 꺼짐 감지의 pagehide·iOS 동작은 단위 시험만 했다(iOS가 알리지 않고 끄면 pagehide가 오지 않는다는 것은 Assumed).
- 서버 초안 API(WP-B)와 실제로 이어 보지 않았다(미실행). 충돌·받지 않음 코드는 가짜 서버로만 시험했다.
- 가져온 행성 ID가 열린 행성과 다른 경우는 화면이 묻는다(이 모듈은 막지 않는다).
- 행성 면 레벨이 5보다 작으면 빠른 줄은 그 레벨이고, 서버 F5 확인 해시와 레벨이 다를 수 있다(지금 팩 행성은 면 레벨 9).
- 부하에 민감한 시험 두 개(`packages/sim` A* 결정성 5초 제한, `apps/server` 지표 히스토그램)는 부하 평균 약 15에서 main 그대로도 실패했다(위 "최종 확인"). 이 작업과 무관하다.

## 사용자 결정 대기
- 없음.

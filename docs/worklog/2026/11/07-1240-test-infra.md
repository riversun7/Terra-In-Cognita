# 시험 기반: 밸런스 화면 e2e의 속도 제한 실패, 경로 워커 풀 시험의 vitest 프로세스 SIGSEGV

- 일시: 2026-11-07 12:40 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/test-infra`, ADR `docs/adr/2026-11-01-balance-screen.md`(속도 제한), ADR 33(경로 워커 풀). 새 결정 없음(시험만 바꿈)

## 한 일

### 1. `e2e/balance.spec.ts` "배치·사진 › 큰 숫자·en·390px"가 전체 실행에서만 실패
- **원인 (Verified)**: 대결 제한이 아니라 **설정 칸 계열 조회 제한**(사용자마다 순간 30·분당 120, `apps/server/src/tuning/services.ts` `readsPerUser`)이다. 실패한 시험의 trace(`trace.zip` 네트워크 기록): `battleLab.catalog,battleLab.presets` 207(하나가 거절), `balance.table` 200, `balance.contribution` **429**. 기여 조회는 대결 제한을 거치지 않는다(`balance.duels`만 `duelsPerUser`). admin 한 계정의 배치·사진 시험 10개가 시험마다 화면을 두 번 열고(실험실 목록·프리셋·미리 보기 + 가중치 표·기여 = 5번씩), `tuning.list`·`save`·`revertAll`, 칸 담기마다 기여를 실제 서버에 물어 분당 120을 넘겼다. 기여는 거절된 뒤 다시 묻지 않아(`WeightTab.tsx` 효과는 표·1차·담은 칸이 바뀔 때만) 표가 비고 20초 기다림이 끝났다. 따로 돌리면 버킷이 가득이라 통과한다. 대결 제한(순간 2·분당 4)은 네온 시험을 느리게만 했다(거절되면 16초 쉬고 다시 — 쉬는 동안 조회 버킷이 다시 차서 앞쪽 시험은 통과).
- **고침**: 서버 제한은 그대로 두고 시험을 바꿨다.
  - `e2e/helpers/trpc.ts` `replayTrpc`: 같은 입력의 묶은 tRPC 호출(지정한 프로시저만)은 처음 한 번만 서버에 묻고 담아 둔 답으로 돌려준다(오류 칸은 담지 않음, `edits`로 data 고치기, 시험이 직접 부르는 묶지 않은 요청은 늘 서버로). `rewriteTrpc`와 몸통을 나눴다(`fulfillEdited`·`rewrittenHeaders`).
  - `balance.spec.ts` 배치·사진·큰 숫자: 서버 상태를 바꾸지 않는다(세계 값 칸은 `balance.table` 응답의 회피 행 AGI 칸에 덮어쓰기를 넣는다 = rewrite 용도), 화면 조회·대결을 다시 쓴다(실제 대결은 이 묶음 처음 한 번).
  - 실제 서버 경로는 "개발자" 시험(dev 계정: 담기 → 실제 기여·대결 → 적용 → 되돌리기)이 그대로 본다. 새 시험 "대결 속도 제한"(admin, 실제 서버): 가장 작은 대결을 거절될 때까지 부르면 3번 안에 `429 TOO_MANY_REQUESTS rate_limited`, 같은 계정 조회는 200(조회 제한이 아님을 확인), 그 직후 [승률 돌리기]가 "요청이 너무 잦습니다"를 보이고 결과는 비어 있다.
  - 같은 무늬: `battleLab.spec.ts` 배치·사진(실제 전투 + 거절되면 8초 쉬기, admin 조회 소모)·`formulas.spec.ts` 배치·사진(화면 조회)도 `replayTrpc`로 같은 입력을 다시 쓴다. 두 파일의 "개발자" 시험은 그대로 실제 서버.
  - `e2e/helpers/test.ts` 머리 주석의 "시험끼리 함께 쓰는 서버 시도 제한"에 개발 화면 제한과 `replayTrpc`를 적었다.

### 2. `apps/server/src/world/pathPool.test.ts`의 vitest 프로세스가 가끔 SIGSEGV
- **재현 (Verified)**: 시험 파일 하나로는 드물다(그대로 40번, CPU 부하 프로세스 6개와 30번, `vitest run apps/server` 1번, 전체 `vitest run` 4번 모두 0번). 그래서 같은 동작을 되풀이하는 임시 시험을 만들었다(커밋 안 함, 사본 `/tmp/…/scratchpad/ti/zzrepro3/closeLoop.test.ts`): 워커 1개 풀을 띄우고 요청 하나를 넣고 30~300ms 뒤(워커가 모듈을 읽는 중) 닫기를 300번, vitest 프로세스 4개 동시 × 4번.
  - 고치기 전: 파일 32개 중 **3개**가 `Worker exited unexpectedly with signal SIGSEGV`(2)·`SIGTRAP`(1) `during started state` — 조정자가 본 것과 같은 문구.
  - core 덤프(gdb): 죽은 스레드는 늦게 생긴 스레드(워커)이고 `Runtime_TierUpWasmToJSWrapper` → `WasmCodeRefScope::~WasmCodeRefScope` → `WasmCode::DecrementRefCount` → `WasmEngine::FreeDeadCode` → `NativeModule::FreeCode` → `RecursiveMutex::Lock`에서 SIGSEGV(지워진 wasm 모듈을 건드림). 같은 때 다른 스레드는 wasm 백그라운드 최적화 컴파일(`BackgroundCompileJob` → Turboshaft) 중. SIGTRAP 쪽은 `WasmImportWrapperCache::Free` → `WasmCodeAllocator::FreeCode` "Check failed: jit_page.has_value()".
  - 그 wasm은 Node 타입 지우개(amaro = swc를 wasm으로 묶은 것)다. 시험의 워커는 진입 파일과 `@terra/sim` 등 `.ts` 약 150개를 Node 타입 지우기로 읽는다. 시험 코드 없이도 재현된다: 워커가 `stripTypeScriptTypes`를 쉬지 않고 돌리다 끊기기를 되풀이하는 스크립트에서 `corrupted size vs. prev_size`(1/900)·SIGSEGV(1/6,000)·"Check failed: jit_page_->allocations_.erase(addr) == 1"(2/4,800).
- **원인**: Node 24.22.1(V8 13.6.233.17)의 V8 버그 — 한 프로세스에서 wasm을 돌린 isolate(워커)가 끝난 뒤 다음 워커가 같은 wasm을 다시 쓰면, 이미 지워진 wasm 모듈·감싸개 코드를 다시 푼다(Verified: 덤프). 왜 지워진 모듈이 남는지는 V8 안이라 확인하지 못했다(Assumed: V8은 같은 wasm 바이트의 컴파일 결과를 isolate끼리 나눠 쓰고 마지막 사용자가 끝나면 지운다. 그 지우기와 다음 isolate의 감싸개 다시 컴파일이 엇갈린다).
- **버린 고침 (Verified)**: 워커를 `terminate`로 끊지 않고 close 메시지로 스스로 끝내게 바꿔 봤다(경로 풀). 독립 스크립트에서는 0/9,600이었지만 위 재현에서는 오히려 파일 16개 중 **10개**가 죽었다(워커마다 모듈 읽기를 끝까지 해서 wasm을 더 많이 돌린다). 그래서 되돌렸다.
- **고침**: `apps/server/src/testWorkers.ts` `tsWorkerUrl(relative, import.meta.url)` — 워커 주소를 만들기 전에 메인 스레드가 타입 지우개를 한 번 써서(`stripTypeScriptTypes`, 경고는 vitest가 끈다) 그 wasm 모듈을 프로세스가 끝날 때까지 살려 둔다. `.ts` 워커를 띄우는 서버 시험 다섯(경로 풀·2차맵 지형·행성 굽기·대결·전투 다시보기)이 이것을 쓰고, `testWorkers.test.ts`가 서버 시험에 `.ts` 주소를 `new URL`로 직접 만드는 곳이 없는지 본다. 운영 빌드 워커는 `dist/*Worker.js`라 해당 없음.
  - 같은 재현에서 고친 뒤: 경로 풀(terminate 그대로) 파일 16 + 8개, close 방식 풀 8개 — **0/32**(9,600번 닫기). 고치기 전 같은 풀은 3/32.
  - 실제 `pathPool.test.ts`: CPU 부하 프로세스 4개와 함께 vitest 6개 동시 × 10번 = **60/60 통과**.
- `AGENTS.md` 6장 "Node 24 서버 확인 사항"에 이 버그와 `tsWorkerUrl`을 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/helpers/trpc.ts` | `replayTrpc`·`createTrpcReplay`, `rewriteTrpc`와 몸통 나눔 |
| `e2e/balance.spec.ts` | 배치·사진·큰 숫자가 서버 상태를 바꾸지 않고 조회·대결을 다시 씀(세계 값 칸은 응답에 넣음), 대결 속도 제한 시험 더함, 머리 주석에 원인 |
| `e2e/battleLab.spec.ts`·`e2e/formulas.spec.ts` | 배치·사진이 같은 입력의 조회·전투를 다시 씀 |
| `e2e/helpers/test.ts` | 머리 주석: 개발 화면 속도 제한과 `replayTrpc` |
| `apps/server/src/testWorkers.ts`(새)·`testWorkers.test.ts`(새) | 시험 도우미 `tsWorkerUrl`(타입 지우개를 메인 스레드에 쥠)과 지키는지 보는 시험 |
| `apps/server/src/world/pathPool.test.ts`·`world/secondMapTerrain.test.ts`·`planet/bake.test.ts`·`balance/balance.test.ts`·`battleReplay/battleReplay.test.ts` | 워커 주소를 `tsWorkerUrl`로 |
| `AGENTS.md` | 6장 버전 주의에 확인 사항 |

## 함께 바꿔야 하는 파일
- 서버 시험이 `.ts` 진입 워커를 새로 띄우면 `tsWorkerUrl`을 쓴다(`testWorkers.test.ts`가 막는다). 다른 꾸러미 시험이 Node 워커를 띄우면 같은 도우미가 필요하다(지금은 없음).
- 개발 화면에 같은 계정으로 화면을 여러 번 여는 e2e를 더하면 `replayTrpc`를 쓴다. 같은 저장소는 서버 상태를 바꾸지 않는 시험끼리만 쓴다.

## 건드리지 말 것
- 서버 속도 제한 값(`DEFAULT_BALANCE_LIMITS`·`readsPerUser`·`battlesPerUser`): 서버 보호다. 시험을 맞춘다.
- 경로 풀의 `terminate`: close 방식은 위 재현에서 더 자주 죽었다(버린 고침).

## 검사·시험 (Verified, 개발 컨테이너, 무거운 잠금 안)
- 고치기 전 `pnpm e2e e2e/balance.spec.ts --workers=1`: 13 통과·"큰 숫자·en" 실패(trace에서 `balance.contribution` 429).
- 고친 뒤 `pnpm e2e e2e/balance.spec.ts e2e/formulas.spec.ts e2e/battleLab.spec.ts --workers=1`: 45 통과(2.1분, 고치기 전 같은 묶음은 대결·전투 거절 뒤 쉬기 때문에 약 4.8분).
- 재현 횟수는 위 2절.
- 마지막 검사(origin/main `a1fa83f` 합친 뒤): `TEST_DATABASE_URL=… pnpm check` 통과(418 파일·3,464 시험). `pnpm check:docs`·`node scripts/check-docs.mjs origin/main`·`node scripts/check-content.mjs origin/main` 통과. `pnpm e2e e2e/balance.spec.ts e2e/formulas.spec.ts e2e/battleLab.spec.ts --workers=1` 45 통과(2.2분). 전체 `vitest run`(DB 포함) 3번 더 — 모두 통과, 프로세스 죽음 0(위 `pnpm check`까지 4번 연속).
- 합친 뒤 첫 `pnpm check`는 린트에서 멈췄다: 이 작업 트리의 Paraglide 생성 파일(`apps/game/src/paraglide/`, git 제외)이 main이 더한 메시지 키보다 오래됐다(`pnpm check`는 린트가 타입 검사(다시 생성)보다 먼저). `paraglide-js compile` 뒤 다시 돌려 통과. CI는 새로 만든다.

## 미검증·TODO·알려진 문제
- V8 안에서 지워진 모듈이 왜 남는지(Assumed, 위). 더 새 Node 24가 고쳤는지 Unknown(이 환경에서 Node 배포·V8 소스에 닿지 못함). Node를 올리면 `tsWorkerUrl` 없이 위 재현을 다시 돌려 본다.
- 개발 서버(`pnpm dev:server`, tsx)의 워커는 tsx가 `.ts`를 바꾸므로 타입 지우개를 쓰지 않는다고 본다(Assumed, 재지 않음).
- `WeightTab.tsx`: 기여 조회가 한 번 거절되면(속도 제한 등) 칸·1차를 바꿀 때까지 다시 묻지 않아 표가 빈 채로 남는다. 화면 동작이라 이번에 고치지 않았다(시험은 서버 제한을 다 쓰지 않게 바꿈).

## 사용자 결정 대기
- 없음

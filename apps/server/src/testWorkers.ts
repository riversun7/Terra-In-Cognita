// 시험 도우미 — .ts 진입 파일로 워커 스레드(node:worker_threads)를 띄우는 시험은 워커 주소를 tsWorkerUrl로 만든다
// (지키는지는 testWorkers.test.ts가 본다).
// 까닭(2026-11-07 확인, Node 24.22.1 = V8 13.6.233.17, 작업 기록 docs/worklog/2026/11/07-1240-test-infra.md):
// - 시험의 워커는 .ts를 Node 타입 지우기로 읽는다. 그 지우개(amaro)는 WebAssembly 모듈이라 워커마다 wasm을 돌린다.
// - 워커를 띄우고 끝내기를 되풀이하는 시험(경로 워커 풀)의 vitest 프로세스가 가끔 SIGSEGV·SIGTRAP으로 죽었다. core 덤프에서
//   죽은 스레드는 새 워커였고, wasm → JS 감싸개를 다시 컴파일한 뒤 이미 지워진 wasm 모듈의 코드를 풀다 죽었다
//   (Runtime_TierUpWasmToJSWrapper → WasmEngine::FreeDeadCode → NativeModule::FreeCode, 또는
//   WasmImportWrapperCache::Free → "Check failed: jit_page.has_value()"). V8 버그다.
// - 메인 스레드가 타입 지우개를 한 번 써 두면 같은 재현에서 죽지 않았다(2,400번 × 2 = 0번, 안 쓰면 같은 수에서 2·10번).
//   추정: V8은 같은 wasm 바이트의 컴파일 결과를 프로세스 안 isolate끼리 나눠 쓰고 마지막 사용자가 끝나면 지운다. 메인 스레드가
//   쥐고 있으면 프로세스가 끝날 때까지 지우지 않으므로 지우는 길(버그)을 타지 않는다.
// 운영 빌드는 워커를 .js로 묶으므로(dist/*Worker.js) 타입 지우기를 쓰지 않는다. 개발(tsx)은 tsx가 .ts를 바꾼다.
import { stripTypeScriptTypes } from "node:module";

let held = false;

/** 메인 스레드에서 타입 지우개(amaro wasm)를 한 번 써서 프로세스가 끝날 때까지 살려 둔다(여러 번 불러도 한 번) */
export function holdTypeStripper(): void {
  if (held) return;
  held = true;
  stripTypeScriptTypes("const held: boolean = true;");
}

/** .ts 워커 진입 파일 주소(new URL(relative, base)). 워커를 띄우기 전에 타입 지우개를 쥔다 */
export function tsWorkerUrl(relative: string, base: string | URL): URL {
  holdTypeStripper();
  return new URL(relative, base);
}

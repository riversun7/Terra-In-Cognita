// 연결 모듈 지연 로딩 — connection.ts(접속 인사·시계·다시 연결, 서버 메시지 검사 = 메시지 스키마와 zod)를 첫 화면 묶음에서
// 뺀다(ADR 2026-10-29-app-shell 11절 "첫 화면 줄이기"). 앱을 켤 때(connectionStatus.ts의 저장소 start) 받기 시작하고, 받으면
// 바로 연결한다. 연결한 뒤의 동작은 connection.ts 그대로다. 연결 상태는 받는 동안에도 저장소의 처음 값("연결 중")이고,
// 2초 넘으면 연결 줄이 뜨는 것도 같다(저장소가 start 때부터 센다).
// - 받기 전에 새로고침하면(closeForReload) 연결을 열지 않는다. 받은 뒤면 connection.ts의 정상 종료를 그대로 부른다.
// - 받기에 실패하면(배포로 옛 조각이 없어짐·네트워크) Vite가 vite:preloadError를 내고 pwa/updates.ts가 새 버전을 찾는다.
//   그 사이 연결이 끊긴 채 남지 않게 다시 연결처럼 간격을 늘리며 다시 받는다.
import type { ConnectOptions, ConnectionStatus } from "./connection.ts";

type TimerHandle = ReturnType<typeof setTimeout>;
type Connect = (onStatus: (status: ConnectionStatus) => void, options?: ConnectOptions) => () => void;

/** connection.ts에서 쓰는 것 */
export interface ConnectionModule {
  readonly connect: Connect;
  readonly closeForReload: () => void;
}

export interface LazyConnectionDeps {
  readonly load: () => Promise<ConnectionModule>;
  readonly setTimer: (run: () => void, ms: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
}

export interface LazyConnection {
  /** connection.ts의 connect와 같은 모양. 모듈을 받은 뒤에 연결한다 */
  readonly connect: Connect;
  /** 새로고침 직전 — 열린 연결은 정상 종료(1000), 아직 받는 중이면 연결을 열지 않는다 */
  readonly closeForReload: () => void;
}

/** 다시 받기 간격 상한 — connection.ts의 다시 연결 간격 상한과 같다 */
const MAX_RETRY_DELAY_MS = 15_000;

export function createLazyConnection(deps: LazyConnectionDeps): LazyConnection {
  let loaded: ConnectionModule | null = null;
  let reloading = false;

  return {
    connect(onStatus, options) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      let attempt = 0;
      let retryTimer: TimerHandle | null = null;

      const load = (): void => {
        deps.load().then(
          (module) => {
            loaded = module;
            if (cancelled || reloading) return;
            stop = module.connect(onStatus, options);
          },
          () => {
            if (cancelled || reloading) return;
            const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** attempt);
            attempt += 1;
            retryTimer = deps.setTimer(() => {
              retryTimer = null;
              load();
            }, delay);
          },
        );
      };
      load();

      return () => {
        cancelled = true;
        if (retryTimer !== null) deps.clearTimer(retryTimer);
        retryTimer = null;
        stop?.();
      };
    },
    closeForReload() {
      reloading = true;
      loaded?.closeForReload();
    },
  };
}

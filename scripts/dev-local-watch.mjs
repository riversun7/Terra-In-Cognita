// 로컬 개발 서버(scripts/dev-local.mjs)용 마이그레이션 감시·직렬 실행·프로세스 재시작 도우미

/** apps/server/src/migrate.ts 출력에서 새로 적용된 마이그레이션 이름 목록을 꺼낸다 */
export function parseAppliedMigrations(stdout) {
  for (const line of String(stdout).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("마이그레이션 적용:")) continue;
    return trimmed
      .slice("마이그레이션 적용:".length)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 디바운스·직렬화된 마이그레이션 감시기.
 * - 짧은 시간에 파일 이벤트가 여러 번 와도 1회만 실행하고, 실행 중 새 이벤트가 오면 끝나고 1회 더 돈다.
 */
export function createMigrationWatcher({ runMigrate, onApplied, onError, debounceMs = 500 }) {
  let timer = null;
  let running = false;
  let rerunQueued = false;
  let closed = false;

  const execute = async () => {
    if (closed) return;
    if (running) {
      rerunQueued = true;
      return;
    }
    running = true;
    rerunQueued = true;
    try {
      while (rerunQueued) {
        rerunQueued = false;
        if (closed) break;
        const applied = await runMigrate();
        if (!closed && applied.length > 0) {
          await onApplied(applied);
        }
      }
    } catch (error) {
      if (!closed && onError) onError(error);
    } finally {
      running = false;
    }
  };

  const trigger = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void execute();
    }, debounceMs);
  };

  const close = () => {
    closed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { trigger, close };
}

function sendSignal(proc, signal, killGroup) {
  if (killGroup && typeof proc.pid === "number" && proc.pid > 0) {
    try {
      process.kill(-proc.pid, signal);
      return;
    } catch {
      // 프로세스 그룹이 이미 없으면 단일 프로세스 종료로 내린다
    }
  }
  proc.kill(signal);
}

/** 자식 프로세스(또는 프로세스 그룹)에 SIGTERM을 보내 종료를 기다리고, timeoutMs를 넘기면 SIGKILL로 정리한다 */
export function stopProcessGracefully(proc, timeoutMs = 5000, { killGroup = false } = {}) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };
    proc.once("exit", finish);
    sendSignal(proc, "SIGTERM", killGroup);
    const killTimer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        sendSignal(proc, "SIGKILL", killGroup);
      }
      finish();
    }, timeoutMs);
  });
}

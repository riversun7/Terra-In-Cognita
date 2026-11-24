// scripts/dev-local-watch.mjs 단위 시험 — 마이그레이션 출력 파싱, 디바운스·직렬화, 프로세스 종료 확인
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createMigrationWatcher, parseAppliedMigrations, stopProcessGracefully } from "./dev-local-watch.mjs";

describe("parseAppliedMigrations", () => {
  it("적용된 마이그레이션 목록을 파싱한다", () => {
    expect(
      parseAppliedMigrations("$ tsx src/migrate.ts\n마이그레이션 적용: 20261124_a, 20261124_b\n"),
    ).toEqual(["20261124_a", "20261124_b"]);
  });

  it("적용할 마이그레이션이 없으면 빈 배열을 돌려준다", () => {
    expect(parseAppliedMigrations("$ tsx src/migrate.ts\n적용할 마이그레이션 없음\n")).toEqual([]);
  });
});

describe("createMigrationWatcher", () => {
  it("연속 이벤트를 디바운스로 1회만 실행하고, 실행 중 새 이벤트는 뒤에 1회 재실행한다", async () => {
    vi.useFakeTimers();
    try {
      let resolveFirst;
      const runMigrate = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockResolvedValueOnce([]);
      const onApplied = vi.fn();

      const watcher = createMigrationWatcher({ runMigrate, onApplied, debounceMs: 200 });
      watcher.trigger();
      watcher.trigger();
      watcher.trigger();
      await vi.advanceTimersByTimeAsync(200);
      expect(runMigrate).toHaveBeenCalledTimes(1);

      // 실행 도중 새 변경 발생 → 디바운스 후 1회 재실행 예약
      watcher.trigger();
      await vi.advanceTimersByTimeAsync(200);
      expect(runMigrate).toHaveBeenCalledTimes(1);

      resolveFirst(["20261124_city_currency"]);
      await vi.waitFor(() => expect(runMigrate).toHaveBeenCalledTimes(2));
      expect(onApplied).toHaveBeenCalledTimes(1);
      expect(onApplied).toHaveBeenCalledWith(["20261124_city_currency"]);
      watcher.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("close 이후에는 예약된 실행을 취소한다", async () => {
    vi.useFakeTimers();
    try {
      const runMigrate = vi.fn().mockResolvedValue([]);
      const watcher = createMigrationWatcher({ runMigrate, onApplied: vi.fn(), debounceMs: 200 });
      watcher.trigger();
      watcher.close();
      await vi.advanceTimersByTimeAsync(300);
      expect(runMigrate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("stopProcessGracefully", () => {
  it("SIGTERM에 응답해 종료되면 SIGKILL을 보내지 않는다", async () => {
    const proc = new EventEmitter();
    proc.exitCode = null;
    proc.signalCode = null;
    proc.kill = vi.fn((sig) => {
      if (sig === "SIGTERM") {
        setTimeout(() => {
          proc.exitCode = 0;
          proc.emit("exit", 0);
        }, 10);
      }
    });
    await stopProcessGracefully(proc, 1000);
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

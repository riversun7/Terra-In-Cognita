// 설정 칸 실효 값 접근자 시험 — docs/adr/2026-11-01-dev-settings-panel.md 5·7절. 저장소 팩을 서버 시작과 같은 길로 읽는다.
import { loadContentPack } from "@terra/content/node";
import { TEST_SOCIETY_COEFFICIENTS, TUNING_KEYS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { tuningEntriesOf } from "../world/combatCatalog.ts";
import { SERVER_LIVE_PATHS, tuningScopeOf } from "./scope.ts";
import { type TuningOverrideRecord, createTuningState } from "./state.ts";

function packEntries() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return tuningEntriesOf(loaded.source);
}

const record = (id: string, value: number, updatedAtMs = 1, extra: Partial<TuningOverrideRecord> = {}) => ({
  id,
  value,
  packValue: 0,
  contentVersion: "core@15",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs,
  ...extra,
});

describe("설정 칸 실효 값", () => {
  it("덮어쓰기가 없으면 팩 값 그대로(시험 계수표와 같다)", () => {
    const state = createTuningState(packEntries());
    expect(state.society()).toEqual(TEST_SOCIETY_COEFFICIENTS);
    expect(state.appliedCount()).toBe(0);
    expect(state.problems()).toEqual([]);
  });

  it("put·remove·clear가 판을 올리고 society()가 다음 부를 때 새 값이다(받아 둔 표는 그대로)", () => {
    const state = createTuningState(packEntries());
    const before = state.values();
    const revision = state.revision();
    state.put(record("n39_grant_base", 90));
    expect(state.revision()).toBe(revision + 1);
    expect(state.society().cyborg.grantBase).toBe(90);
    expect(state.values().get("n39_grant_base")).toBe(90);
    expect(before.get("n39_grant_base")).toBe(72);
    state.remove("n39_grant_base");
    expect(state.society().cyborg.grantBase).toBe(72);
    state.put(record("s26_rebellion", 30));
    state.clear();
    expect(state.society().rebellionThreshold).toBe(40);
    expect(state.revision()).toBe(revision + 4);
  });

  it("check: 팩에 없는 ID, 범위 밖, 새 규칙 문제는 받지 않는다. 이미 있던 문제는 막지 않는다", () => {
    const state = createTuningState(packEntries());
    expect(state.check("nope_id", 1)).toEqual({ ok: false, reason: "unknown_entry", problems: [] });
    expect(state.check("n39_grant_base", -1)).toEqual({ ok: false, reason: "out_of_range", problems: [] });
    expect(state.check("n9_initial_sum", 200)).toEqual({
      ok: false,
      reason: "rules_conflict",
      problems: ["n9_fit"],
    });
    expect(state.check("n9_initial_sum", 100)).toEqual({ ok: true });
    // 합 100 + 칸 최소 15(90 ≤ 100)는 맞지만, 합만 되돌리면(60 < 90) 문제가 생긴다
    state.put(record("n9_initial_sum", 100));
    expect(state.check("n9_initial_min", 15)).toEqual({ ok: true });
    state.put(record("n9_initial_min", 15, 2));
    expect(state.check("n9_initial_sum", null)).toEqual({
      ok: false,
      reason: "rules_conflict",
      problems: ["n9_fit"],
    });
    expect(state.check("n9_initial_min", null)).toEqual({ ok: true });
    // 팩에 없는 ID 지우기는 늘 된다
    expect(state.check("nope_id", null)).toEqual({ ok: true });
  });

  it("load: 팩에 없는 ID·범위 밖·앞 덮어쓰기와 맞지 않는 줄은 적용하지 않고, 팩 값과 같은 줄은 지울 목록으로", () => {
    const state = createTuningState(packEntries());
    const absorbed = state.load([
      record("gone_entry", 5, 1),
      record("n39_grant_base", 72, 2),
      record("n39_grant_step", 20_000, 3),
      record("n9_initial_sum", 100, 4),
      record("n9_initial_max", 15, 5),
      record("s26_rebellion", 30, 6),
    ]);
    expect(absorbed.map((row) => row.id)).toEqual(["n39_grant_base"]);
    const states = Object.fromEntries(state.overrides().map((held) => [held.id, held.state]));
    expect(states).toEqual({
      gone_entry: "unknown_entry",
      n39_grant_step: "out_of_range",
      n9_initial_sum: "applied",
      n9_initial_max: "rules_conflict",
      s26_rebellion: "applied",
    });
    expect(state.override("n9_initial_max")?.problems).toEqual(["n9_fit"]);
    expect(state.appliedCount()).toBe(2);
    expect(state.society().cyborg.initialSum).toBe(100);
    expect(state.society().cyborg.initialMax).toBe(20);
    // 다시 load하면 처음부터 다시 만든다
    state.load([]);
    expect(state.overrides()).toEqual([]);
    expect(state.society()).toEqual(TEST_SOCIETY_COEFFICIENTS);
  });
});

describe("반영 범위(scope)", () => {
  it("서버가 읽는 경로는 모두 TUNING_KEYS에 있고, 팩 칸마다 live·sim·none 중 하나", () => {
    const paths = new Set(TUNING_KEYS.filter((key) => key.target === "society").map((key) => key.path));
    for (const path of SERVER_LIVE_PATHS) expect(paths, path).toContain(path);
    expect(tuningScopeOf("n39_grant_base")).toBe("live");
    expect(tuningScopeOf("s26_rebellion")).toBe("live");
    expect(tuningScopeOf("c19_loot")).toBe("sim");
    expect(tuningScopeOf("n37_light_dark")).toBe("sim");
    expect(tuningScopeOf("nope_id")).toBe("none");
    const live = packEntries().filter((entry) => tuningScopeOf(entry.id) === "live");
    expect(live).toHaveLength(SERVER_LIVE_PATHS.length);
    // 서버가 읽는 칸은 모두 기술 범위가 있다(ADR 2절)
    for (const entry of live) {
      expect(entry.min, entry.id).toBeDefined();
      expect(entry.unit, entry.id).toBeDefined();
    }
  });
});

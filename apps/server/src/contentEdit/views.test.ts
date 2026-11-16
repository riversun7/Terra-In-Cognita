// 스킬 편집기 화면 JSON 시험 — 움직임 부품·곡선·연사(팩 선택 칸)를 잃지 않는다(화면은 항목을 통째로 저장한다).
// 곡선 칸이 없으면 공격 스킬 사거리 예산 켬이라(D-573 2009) curves: []도 그대로 실어야 끈 것이 남는다.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { createContentEditState } from "./state.ts";
import { skillJsonOf } from "./views.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const source = loaded.source;

describe("skillJsonOf", () => {
  it("팩 스킬은 곡선·움직임 칸이 없으면 칸을 두지 않는다", () => {
    const state = createContentEditState(source);
    const bolt = state.pack.skills.find((entry) => entry.id === "fire_bolt");
    if (!bolt) throw new Error("fixture fire_bolt");
    const json = skillJsonOf(bolt);
    for (const key of ["move", "displace", "curves", "shots"]) expect(key in json, key).toBe(false);
  });

  it("고친 항목의 curves([] 포함)·displace(효과 참조는 ID)·move·shots를 그대로 싣는다", () => {
    const state = createContentEditState(source);
    const pack = state.packEntry("skills", "fire_bolt");
    if (!pack) throw new Error("fixture fire_bolt");
    const off = { ...structuredClone({ ...pack }), curves: [] };
    const shot = {
      ...structuredClone({ ...pack }),
      shape: "single",
      range: 3,
      curves: ["close_shot"],
      shots: 3,
      displace: { kind: "knockback", cells: 2, effect: "move_knockback" },
    };
    const plan = state.plan([
      { category: "skills", id: "fire_bolt", entry: off },
      { category: "skills", id: "frost_bolt", entry: { ...shot, id: "frost_bolt" } },
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    state.install(
      plan.changes.flatMap((c) =>
        c.after
          ? [
              {
                category: "skills" as const,
                id: c.id,
                entry: c.after,
                packHash: c.packHash,
                contentVersion: "core@1",
                note: null,
                updatedById: null,
                updatedByName: null,
                updatedAtMs: 1,
              },
            ]
          : [],
      ),
      1,
    );
    const skills = state.effective().skills;
    const fire = skills.find((entry) => entry.id === "fire_bolt");
    const frost = skills.find((entry) => entry.id === "frost_bolt");
    if (!fire || !frost) throw new Error("installed");
    expect(skillJsonOf(fire).curves).toEqual([]);
    const json = skillJsonOf(frost);
    expect(json.curves).toEqual(["close_shot"]);
    expect(json.shots).toBe(3);
    expect(json.displace).toEqual({ kind: "knockback", cells: 2, effect: "move_knockback" });
  });
});

import { newLabUnit } from "@terra/shared/battleLab";
import { type ReportFlow, emptyFlow } from "@terra/shared/battleReport";
import { describe, expect, it } from "vitest";
import { rowLabel } from "./reportMessages.ts";
import {
  defaultReportForm,
  flowExtremes,
  flowSteps,
  formOfInput,
  formProblem,
  reportInputOf,
  withMode,
} from "./reportModel.ts";

const teams = {
  a: { units: [newLabUnit("human")], retreatHpPct: 0 },
  b: { units: [newLabUnit("human")], retreatHpPct: 0 },
};

/** 명중 4번: 물리 100 → 비율 방어 80 → 고정 70, 크리로 105 */
function sampleFlow(): ReportFlow {
  const flow = emptyFlow(true);
  flow.attacks = 10;
  flow.hitPassed = 8;
  flow.hits = 4;
  flow.crits = 1;
  const v = flow.values;
  v.raw = 400;
  v.rate = 320;
  v.flat = 280;
  v.matchup = 280;
  v.elementalDefense = 280;
  v.resist = 280;
  v.crit = 420;
  v.skill = 420;
  v.buff = 420;
  v.floor = 420;
  v.final = 420;
  v.applied = 400;
  return flow;
}

describe("피해 흐름 단계 줄", () => {
  it("판정 차례 그대로, 굴림 단계는 수, 값 단계는 명중 평균과 바뀐 몫", () => {
    const steps = flowSteps(sampleFlow());
    expect(steps.map((step) => step.id)).toEqual([
      "attack",
      "hitRoll",
      "evadeRoll",
      "critRoll",
      "raw",
      "rate",
      "flat",
      "matchup",
      "elementalDefense",
      "resist",
      "crit",
      "skill",
      "buff",
      "floor",
      "final",
      "applied",
    ]);
    const hit = steps.find((step) => step.id === "hitRoll");
    expect(hit).toMatchObject({ into: 10, out: 8, changePm: -200 });
    const evade = steps.find((step) => step.id === "evadeRoll");
    expect(evade).toMatchObject({ into: 8, out: 4, changePm: -500 });
    const rate = steps.find((step) => step.id === "rate");
    expect(rate).toMatchObject({ avgIn: 100, avgOut: 80, changePm: -200 });
    expect(steps.find((step) => step.id === "matchup")?.idle).toBe(true);
    // 가장 크게 줄인 단계 = 회피 굴림(−50%), 늘린 단계 = 크리 배율(+50%)
    expect(flowExtremes(steps)).toEqual({ loss: "evadeRoll", gain: "crit" });
  });
});

describe("보고서 폼", () => {
  it("폼 → 입력 → 폼이 같은 설정을 돌려준다(다시 돌리기)", () => {
    const form = {
      ...defaultReportForm(),
      name: "x",
      runs: 100,
      seed: 9,
      variantOn: true,
      variantTuning: [{ id: "c1_a", value: 3 }],
    };
    const input = reportInputOf(form, teams, "fallback");
    expect(input.variant).toEqual({ label: "B", setup: null, tuning: [{ id: "c1_a", value: 3 }] });
    const back = formOfInput(input, defaultReportForm());
    expect(back.teams).toEqual(teams);
    expect(reportInputOf(back.form, { ...teams, ...back.teams }, "fallback")).toEqual(input);
  });

  it("종류를 공성으로 바꾸면 판 수·제한 시간이 공성 범위로, 빈 팀은 문제", () => {
    const siege = withMode(defaultReportForm(), "wave");
    expect(siege.runs).toBeLessThanOrEqual(200);
    expect(formProblem(siege, teams)).toBeNull();
    expect(formProblem(defaultReportForm(), { ...teams, b: { units: [], retreatHpPct: 0 } })).toBe(
      "invalid_settings",
    );
    expect(reportInputOf(defaultReportForm(), teams, "이름").name).toBe("이름");
  });

  it("군단·실제 도시·웨이브 팀 수비: 입력 → 폼 → 입력이 같고, 실제 도시가 아니면 세계 수비는 기본값으로", () => {
    const extra = {
      units: [teams.a.units[0] ?? teams.b.units[0]].filter((u) => u !== undefined),
      retreatHpPct: 10,
    };
    const siege = {
      ...withMode(defaultReportForm(), "siege"),
      city: { layout: "world" as const, housing: 40, adminLevel: 1, cityId: 7 },
      cityLabel: "Fake",
      siegeDefense: "world" as const,
      legion: { a: { extra: [extra], retreatAtSec: 30 }, b: { extra: [], retreatAtSec: 0 } },
    };
    const input = reportInputOf(siege, teams, "x");
    expect(input.setup).toMatchObject({
      mode: "siege",
      defense: "world",
      city: { layout: "world", cityId: 7 },
      a: { parties: [teams.a, extra], retreatAtSec: 30 },
    });
    // 팀 B는 세계 수비라 비어도 된다
    expect(formProblem(siege, { ...teams, b: { units: [], retreatHpPct: 0 } })).toBeNull();
    const back = formOfInput(input, defaultReportForm());
    expect(reportInputOf(back.form, { ...teams, ...back.teams }, "x")).toEqual(input);
    // 실제 도시가 아니면 세계 수비는 팀 B로, cityId는 보내지 않는다
    const sim = reportInputOf(
      { ...siege, city: { layout: "city", housing: 40, adminLevel: 1, cityId: 7 } },
      teams,
      "x",
    );
    expect(sim.setup).toMatchObject({ defense: "party", city: { layout: "city" } });
    expect(sim.setup.mode !== "arena" && sim.setup.city.cityId).toBe(undefined);
    // 웨이브 팀 수비: 팀 A는 안 보이고 팀 B 군단이 b로 간다
    const wave = { ...withMode(defaultReportForm(), "wave"), waveDefense: "party" as const };
    const waveInput = reportInputOf(wave, teams, "x");
    expect(waveInput.setup).toMatchObject({ mode: "wave", defense: "party", b: { parties: [teams.b] } });
    expect(formProblem(wave, { ...teams, a: { units: [], retreatHpPct: 0 } })).toBeNull();
    const waveBack = formOfInput(waveInput, defaultReportForm());
    expect(waveBack.form.waveDefense).toBe("party");
    expect(waveBack.teams).toEqual({ b: teams.b });
    // 실제 도시인데 고르지 않았으면 unknown_city
    expect(formProblem({ ...siege, city: { layout: "world", housing: 0, adminLevel: 1 } }, teams)).toBe(
      "unknown_city",
    );
  });

  it("줄 이름: 군단 키는 A2·3, 옛 키는 A3", () => {
    expect(rowLabel("a1.2", "")).toBe("A2·3");
    expect(rowLabel("b2", "x")).toBe("B3 x");
  });
});

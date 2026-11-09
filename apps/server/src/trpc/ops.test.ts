// ops 라우터 시험 — 운영 권한(역할 기본 + 체크박스)으로 막고 여는지, 자기 계정 통제 거절, 감사 기록. DB는 가짜 질의(pg 모양)로 둔다.
import { describe, expect, it } from "vitest";
import { createEconomyServices } from "../economyView/services.ts";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { createMailServices } from "../mail/list.ts";
import { createOpsServices } from "../ops/services.ts";
import type { OpsSwitches } from "../ops/switches.ts";
import { OPS_SWITCHES, type OpsSwitch } from "@terra/shared/ops";
import { createRosterServices } from "../roster/services.ts";
import { NO_VITALS } from "../vitals/reads.ts";
import type { TrpcContext, Viewer } from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { appRouter } from "./router.ts";

const NOW = Date.UTC(2026, 10, 8, 3, 0, 0);
const TARGET = "00000000-0000-4000-8000-000000000002";

/** 가짜 DB: ops_grants 줄과 쓴 질의를 기억한다 */
function fakePool(grants: Record<string, string[]>) {
  const writes: { text: string; values: unknown[] }[] = [];
  const respond = (text: string, values: unknown[]): object[] => {
    if (text.startsWith("select permissions from ops_grants")) {
      const found = grants[String(values[0])];
      return found ? [{ permissions: found }] : [];
    }
    if (text.includes("from audit_log a")) return [];
    // 세력 정체성 정하기·읽기(세력이 없는 가짜 DB)
    if (/from (factions|faction_profiles|currency_profiles)\b/.test(text)) return [];
    if (text.startsWith("select role, name from users"))
      return values[0] === TARGET ? [{ role: "gm", name: "target" }] : [];
    if (text.startsWith("insert") || text.startsWith("delete") || text.startsWith("update")) {
      writes.push({ text, values });
      return [];
    }
    return [{}];
  };
  return {
    writes,
    pool: {
      // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- OpsQueryable(pg Pool.query)과 같은 모양
      query<R extends object>(text: string, values: unknown[] = []): Promise<{ rows: R[] }> {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 가짜 DB: 질의마다 시험이 정한 줄을 돌려준다
        return Promise.resolve({ rows: respond(text, values) as R[] });
      },
    },
  };
}

/** 메모리 운영 스위치(시험용, 기본 꺼짐) */
function memorySwitches(): OpsSwitches {
  const state = new Map<OpsSwitch, boolean>();
  return {
    isOn: (id) => state.get(id) ?? false,
    list: () => OPS_SWITCHES.map((id) => ({ id, enabled: state.get(id) ?? false })),
    set(id, enabled) {
      state.set(id, enabled);
      return Promise.resolve();
    },
  };
}

function callerFor(viewer: Viewer, grants: Record<string, string[]> = {}) {
  const db = fakePool(grants);
  const ops = createOpsServices(
    {
      pool: db.pool,
      world: () => undefined,
      worldStatus: () => undefined,
      switches: memorySwitches(),
      wsConnections: () => 0,
      now: () => NOW,
    },
    { ip: "127.0.0.1" },
  );
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => NOW,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    ops,
    planetEditor: undefined,
    home: createHomeServices(),
    roster: createRosterServices(),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
    holdings: NO_HOLDINGS,
    vitals: NO_VITALS,
    economy: createEconomyServices({ catalog: emptyEconomyCatalog("test") }),
  };
  return { caller: createCallerFactory(appRouter)(ctx), writes: db.writes };
}

const GM: Viewer = { id: "00000000-0000-4000-8000-0000000000a1", loginId: "gm", roles: ["gm"] };
const ADMIN: Viewer = { id: "00000000-0000-4000-8000-0000000000a2", loginId: "admin", roles: ["admin"] };
const DEV: Viewer = { id: "00000000-0000-4000-8000-0000000000a3", loginId: "dev", roles: ["dev"] };
const PLAYER: Viewer = { id: "00000000-0000-4000-8000-0000000000a4", loginId: "p", roles: ["player"] };

describe("ops 라우터 권한", () => {
  it("me = 역할 기본 + 체크박스, 콘솔 역할이 없으면 빈 목록", async () => {
    expect((await callerFor(GM).caller.ops.me()).permissions).toContain("account_ban");
    expect((await callerFor(GM, { [GM.id]: ["unit_heal"] }).caller.ops.me()).granted).toEqual(["unit_heal"]);
    expect((await callerFor(PLAYER, { [PLAYER.id]: ["view_server"] }).caller.ops.me()).permissions).toEqual(
      [],
    );
  });

  it("player는 체크박스가 있어도 FORBIDDEN", async () => {
    const { caller } = callerFor(PLAYER, { [PLAYER.id]: ["view_server"] });
    await expect(caller.ops.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gm은 현황을 보고, 강한 통제(치료)는 체크박스를 받아야 한다", async () => {
    expect((await callerFor(GM).caller.ops.overview()).world.state).toBe("none");
    await expect(callerFor(GM).caller.ops.units.heal({ unitId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // 받으면 통과(월드가 없어 not_ready)
    const granted = callerFor(GM, { [GM.id]: ["unit_heal"] });
    expect(await granted.caller.ops.units.heal({ unitId: 1 })).toEqual({ result: "not_ready" });
  });

  it("권한 부여는 개발자만(관리자는 FORBIDDEN), 저장하면 감사 기록", async () => {
    await expect(
      callerFor(ADMIN).caller.ops.grants.set({ userId: TARGET, permissions: ["unit_heal"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { caller, writes } = callerFor(DEV);
    expect(await caller.ops.grants.set({ userId: TARGET, permissions: ["unit_heal"] })).toEqual({ ok: true });
    expect(writes.map((w) => w.text.split(" ").slice(0, 3).join(" "))).toEqual([
      "insert into ops_grants",
      "insert into audit_log",
    ]);
    expect(writes[1]?.values[1]).toBe("ops.set_grants");
  });

  it("자기 계정은 강제 로그아웃·권한 부여를 못 한다", async () => {
    expect(await callerFor(GM).caller.ops.accounts.kick({ userId: GM.id })).toEqual({
      ok: false,
      code: "self",
    });
    expect(await callerFor(DEV).caller.ops.grants.set({ userId: DEV.id, permissions: [] })).toEqual({
      ok: false,
      code: "self",
    });
  });

  it("유닛 목록: 유저·NPC를 다 보려면 두 권한이 다 있어야 한다", async () => {
    const { caller } = callerFor({ ...GM, roles: ["gm"] });
    expect((await caller.ops.units.list({})).status).toBe("not_ready");
    const onlyNpc = callerFor(PLAYER);
    await expect(onlyNpc.caller.ops.units.list({ ownerKind: "faction" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("지급 금액은 부호 있는 정수 글자만 받는다", async () => {
    const { caller } = callerFor(ADMIN);
    await expect(
      caller.ops.economy.grant({ ownerId: 1, asset: "credit", amount: "1.5", reason: "test" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await caller.ops.economy.grant({ ownerId: 1, asset: "credit", amount: "-5", reason: "test" }),
    ).toEqual({
      ok: false,
      code: "not_ready",
    });
  });

  it("운영 스위치: 운영자는 FORBIDDEN, 관리자는 켜고 끈다(기본 꺼짐), 바꾸면 감사 기록 ops.switch", async () => {
    await expect(callerFor(GM).caller.ops.switches.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { caller, writes } = callerFor(ADMIN);
    expect(await caller.ops.switches.list()).toEqual([{ id: "view_audit", enabled: false }]);
    expect(await caller.ops.switches.set({ id: "view_audit", enabled: true })).toEqual({ ok: true });
    expect(await caller.ops.switches.list()).toEqual([{ id: "view_audit", enabled: true }]);
    expect(writes.at(-1)?.values[1]).toBe("ops.switch");
  });

  it("감사 기록은 분류·한 사람 아이디로 거른다", async () => {
    const { caller } = callerFor(ADMIN);
    expect(await caller.ops.audit({ categories: ["ops", "account"], actorSearch: "rivers" })).toEqual([]);
  });
});

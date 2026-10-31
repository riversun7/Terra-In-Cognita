// planetEditor 라우터 차례 시험(DB 없음) — 우리 권한 표 → Better Auth 확인(ensurePermission) → 속도 제한(admit) → 입력 검사 →
// 서비스. 두 번째 확인이 거절하면(우리 표는 허용해도) 여섯 프로시저 모두 FORBIDDEN이고 서비스는 하나도 불리지 않는다.
// 조회 셋은 read, 쓰기 셋은 write로 묻는다. 가짜 서비스가 불린 것을 적어 둔다.
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { createMailServices } from "../mail/list.ts";
import type {
  PlanetEditorAction,
  PlanetEditorCallKind,
  PlanetEditorServices,
  TrpcContext,
  Viewer,
} from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { appRouter } from "./router.ts";

const DEV: Viewer = {
  id: "00000000-0000-4000-8000-000000000001",
  loginId: "Fake_Dev",
  roles: ["player", "dev"],
};
const PLAYER: Viewer = { ...DEV, roles: ["player"] };
const PLANET = "s2_editor_planet";
const LIBRARY_ID = "7d1f4a52-3a9e-4c1b-9f0e-2b6c8d4e5a10";

interface FakeOptions {
  /** 두 번째 확인의 답 */
  allow: boolean;
  /** admit가 던질 오류(없으면 지난다) */
  limit?: TRPCError;
}

/** 불린 것을 적는 가짜 편집기 서비스. 서비스 본체(정의 조회·초안)는 불리면 "service" 줄을 남긴다 */
function fakeEditor(options: FakeOptions) {
  const calls: string[] = [];
  const service = (name: string) => () => {
    calls.push(`service:${name}`);
    return Promise.reject(new Error("service should not run"));
  };
  const editor: PlanetEditorServices = {
    ensurePermission(action: PlanetEditorAction) {
      calls.push(`permission:${action}`);
      return options.allow
        ? Promise.resolve()
        : Promise.reject(new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" }));
    },
    admit(_viewer: Viewer, kind: PlanetEditorCallKind) {
      calls.push(`admit:${kind}`);
      if (options.limit) throw options.limit;
    },
    definitions: service("definitions"),
    getDraft: service("getDraft"),
    revisions: service("revisions"),
    save: service("save"),
    restore: service("restore"),
    remove: service("remove"),
    library: {
      list: service("library.list"),
      get: service("library.get"),
      create: service("library.create"),
      save: service("library.save"),
      rename: service("library.rename"),
      remove: service("library.remove"),
      versions: service("library.versions"),
      version: service("library.version"),
    },
    systems: {
      list: service("systems.list"),
      get: service("systems.get"),
      create: service("systems.create"),
      save: service("systems.save"),
      rename: service("systems.rename"),
      remove: service("systems.remove"),
    },
  };
  return { editor, calls };
}

function callerFor(viewer: Viewer, editor: PlanetEditorServices) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => 0,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    planetEditor: editor,
    // 홈 자료(앱 뼈대 W3): 이 시험은 쓰지 않는다. 실제 것(제공 함수 0개)을 넣는다
    home: createHomeServices(),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
  };
  return createCallerFactory(appRouter)(ctx);
}

type Caller = ReturnType<typeof callerFor>;

/** 프로시저마다 (맞는 입력, 틀린 입력) — 틀린 입력은 형식이 틀려도 권한·제한이 먼저 나오는지 보려는 것 */
const CASES: {
  name: string;
  action: PlanetEditorAction;
  kind: PlanetEditorCallKind;
  calls: ((caller: Caller) => Promise<unknown>)[];
}[] = [
  {
    name: "definitions",
    action: "read",
    kind: "definitions",
    calls: [(caller) => caller.planetEditor.definitions()],
  },
  {
    name: "drafts.get",
    action: "read",
    kind: "drafts",
    calls: [
      (caller) => caller.planetEditor.drafts.get({ planetId: PLANET }),
      (caller) => caller.planetEditor.drafts.get({ planetId: "Bad Id" }),
    ],
  },
  {
    name: "drafts.revisions",
    action: "read",
    kind: "drafts",
    calls: [
      (caller) => caller.planetEditor.drafts.revisions({ planetId: PLANET }),
      (caller) => caller.planetEditor.drafts.revisions({ planetId: "" }),
    ],
  },
  {
    name: "drafts.save",
    action: "write",
    kind: "drafts",
    calls: [
      (caller) =>
        caller.planetEditor.drafts.save({ planetId: PLANET, entry: {}, base: null, expectedRevision: 0 }),
      (caller) =>
        caller.planetEditor.drafts.save({ planetId: PLANET, entry: {}, base: null, expectedRevision: -1 }),
    ],
  },
  {
    name: "drafts.restore",
    action: "write",
    kind: "drafts",
    calls: [
      (caller) => caller.planetEditor.drafts.restore({ planetId: PLANET, revision: 1 }),
      (caller) => caller.planetEditor.drafts.restore({ planetId: PLANET, revision: 0 }),
    ],
  },
  {
    name: "drafts.remove",
    action: "write",
    kind: "drafts",
    calls: [
      (caller) => caller.planetEditor.drafts.remove({ planetId: PLANET }),
      (caller) => caller.planetEditor.drafts.remove({ planetId: "x" }),
    ],
  },
  // 행성 보관함(ADR 38 "바뀜: 행성 보관함") — 같은 권한·제한 차례
  {
    name: "library.list",
    action: "read",
    kind: "library",
    calls: [(caller) => caller.planetEditor.library.list()],
  },
  {
    name: "library.get",
    action: "read",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.get({ id: LIBRARY_ID }),
      (caller) => caller.planetEditor.library.get({ id: "not-a-uuid" }),
    ],
  },
  {
    name: "library.versions",
    action: "read",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.versions({ id: LIBRARY_ID }),
      (caller) => caller.planetEditor.library.versions({ id: "" }),
    ],
  },
  {
    name: "library.version",
    action: "read",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.version({ id: LIBRARY_ID, revision: 1 }),
      (caller) => caller.planetEditor.library.version({ id: LIBRARY_ID, revision: 0 }),
    ],
  },
  {
    name: "library.create",
    action: "write",
    kind: "library",
    calls: [
      (caller) =>
        caller.planetEditor.library.create({ name: "x", base: { kind: "pack", id: PLANET }, definition: {} }),
      (caller) =>
        caller.planetEditor.library.create({
          name: "x",
          base: { kind: "pack", id: "Bad Id" },
          definition: {},
        }),
    ],
  },
  {
    name: "library.save",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.save({ id: LIBRARY_ID, definition: {}, expectedRevision: 1 }),
      (caller) => caller.planetEditor.library.save({ id: LIBRARY_ID, definition: {}, expectedRevision: 0 }),
    ],
  },
  {
    name: "library.rename",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.rename({ id: LIBRARY_ID, name: "y" }),
      (caller) => caller.planetEditor.library.rename({ id: "x", name: "y" }),
    ],
  },
  {
    name: "library.remove",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.library.remove({ id: LIBRARY_ID }),
      (caller) => caller.planetEditor.library.remove({ id: "x" }),
    ],
  },
  // 항성계 보관함(ADR 2026-10-31-star-system-editor) — 보관함과 같은 권한·제한 차례
  {
    name: "systems.list",
    action: "read",
    kind: "library",
    calls: [(caller) => caller.planetEditor.systems.list()],
  },
  {
    name: "systems.get",
    action: "read",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.systems.get({ id: LIBRARY_ID }),
      (caller) => caller.planetEditor.systems.get({ id: "not-a-uuid" }),
    ],
  },
  {
    name: "systems.create",
    action: "write",
    kind: "library",
    calls: [(caller) => caller.planetEditor.systems.create({ name: "x", definition: {} })],
  },
  {
    name: "systems.save",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.systems.save({ id: LIBRARY_ID, definition: {}, expectedRevision: 1 }),
      (caller) => caller.planetEditor.systems.save({ id: LIBRARY_ID, definition: {}, expectedRevision: 0 }),
    ],
  },
  {
    name: "systems.rename",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.systems.rename({ id: LIBRARY_ID, name: "y" }),
      (caller) => caller.planetEditor.systems.rename({ id: "x", name: "y" }),
    ],
  },
  {
    name: "systems.remove",
    action: "write",
    kind: "library",
    calls: [
      (caller) => caller.planetEditor.systems.remove({ id: LIBRARY_ID }),
      (caller) => caller.planetEditor.systems.remove({ id: "x" }),
    ],
  },
];

describe("planetEditor 라우터 — 권한 두 겹·속도 제한이 입력 검사·서비스보다 먼저", () => {
  it.each(CASES)(
    "$name: Better Auth가 거절하면 FORBIDDEN, 서비스·제한은 불리지 않는다",
    async ({ action, calls }) => {
      for (const call of calls) {
        const { editor, calls: log } = fakeEditor({ allow: false });
        await expect(call(callerFor(DEV, editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(log).toEqual([`permission:${action}`]);
      }
    },
  );

  it.each(CASES)("$name: 우리 권한 표가 거절하면(player) 두 번째 확인도 묻지 않는다", async ({ calls }) => {
    for (const call of calls) {
      const { editor, calls: log } = fakeEditor({ allow: true });
      await expect(call(callerFor(PLAYER, editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(log).toEqual([]);
    }
  });

  it.each(CASES)(
    "$name: 속도 제한에 걸리면 TOO_MANY_REQUESTS(입력 검사·서비스 전)",
    async ({ action, kind, calls }) => {
      for (const call of calls) {
        const limit = new TRPCError({ code: "TOO_MANY_REQUESTS", message: "RATE_LIMITED" });
        const { editor, calls: log } = fakeEditor({ allow: true, limit });
        await expect(call(callerFor(DEV, editor))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
        expect(log).toEqual([`permission:${action}`, `admit:${kind}`]);
      }
    },
  );

  it.each(CASES)(
    "$name: 둘 다 지나면 맞는 입력은 서비스까지, 틀린 입력은 BAD_REQUEST(서비스 전)",
    async ({ name, action, kind, calls }) => {
      const [valid, ...invalid] = calls;
      if (!valid) throw new Error("no call");
      const passed = fakeEditor({ allow: true });
      await expect(valid(callerFor(DEV, passed.editor))).rejects.toThrow("service should not run");
      expect(passed.calls).toHaveLength(3);
      expect(passed.calls.slice(0, 2)).toEqual([`permission:${action}`, `admit:${kind}`]);
      expect(passed.calls[2]).toMatch(/^service:/);
      for (const call of invalid) {
        const rejected = fakeEditor({ allow: true });
        await expect(call(callerFor(DEV, rejected.editor)), name).rejects.toMatchObject({
          code: "BAD_REQUEST",
        });
        expect(rejected.calls).toEqual([`permission:${action}`, `admit:${kind}`]);
      }
    },
  );
});

// 세계 새로 시작(reset-world) 계획·인자 시험 — DB 없이(docs/adr/2026-11-08-world-reset.md)
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema.ts";
import { RESET_CONFIRM, WORLD_RESET_KEEP, parseResetArgs, planWorldReset } from "./resetWorld.ts";

/** 표 정의(schema.ts가 내보내는 모든 표)의 이름 */
const schemaTables: string[] = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table));

describe("남길 표 목록", () => {
  it("남길 표는 모두 표 정의에 있다(이름이 바뀌면 여기서 걸린다)", () => {
    expect(Object.keys(WORLD_RESET_KEEP).filter((name) => !schemaTables.includes(name))).toEqual([]);
  });

  it("계정(Better Auth 표 넷)과 감사 기록은 남긴다", () => {
    for (const table of Object.values(schema.authSchema)) {
      expect(Object.hasOwn(WORLD_RESET_KEEP, getTableName(table))).toBe(true);
    }
    expect(Object.hasOwn(WORLD_RESET_KEEP, "audit_log")).toBe(true);
  });

  it("세계 표(세력·유닛·원장·사이보그·고정본)는 남기지 않는다", () => {
    for (const name of [
      "factions",
      "world_units",
      "ledger_entries",
      "ledger_transactions",
      "cyborgs",
      "second_map_pins",
      "summary_acks",
    ]) {
      expect(schemaTables).toContain(name);
      expect(Object.hasOwn(WORLD_RESET_KEEP, name)).toBe(false);
    }
  });
});

describe("planWorldReset", () => {
  it("목록에 없는 표(나중에 생긴 표 포함)는 지우고, DB에 없는 남길 표는 따로 알린다", () => {
    const plan = planWorldReset(["users", "audit_log", "accounts", "world_units", "new_world_table"], {
      users: "",
      accounts: "",
      audit_log: "",
      old_table: "",
    });
    expect(plan).toEqual({
      keep: ["accounts", "audit_log", "users"],
      wipe: ["new_world_table", "world_units"],
      missingKeep: ["old_table"],
    });
  });

  it("감사 기록·계정이 빠진 목록은 받지 않는다", () => {
    expect(() => planWorldReset(["audit_log"], { users: "", accounts: "" })).toThrow(/audit_log/);
  });
});

describe("parseResetArgs", () => {
  it("확인 글이 정확해야 지운다", () => {
    expect(parseResetArgs([]).ok).toBe(false);
    expect(parseResetArgs(["--confirm", "reset-world"]).ok).toBe(false);
    expect(parseResetArgs(["--confirm", `${RESET_CONFIRM} `]).ok).toBe(false);
    expect(parseResetArgs(["--confirm", RESET_CONFIRM])).toEqual({
      ok: true,
      args: { dryRun: false, waitSec: 15 },
    });
  });

  it("미리 보기는 확인 글 없이 되고, 기다림은 0~300초, 모르는 옵션은 거절", () => {
    expect(parseResetArgs(["--dry-run"])).toEqual({ ok: true, args: { dryRun: true, waitSec: 15 } });
    expect(parseResetArgs(["--confirm", RESET_CONFIRM, "--wait", "0"])).toEqual({
      ok: true,
      args: { dryRun: false, waitSec: 0 },
    });
    expect(parseResetArgs(["--confirm", RESET_CONFIRM, "--wait", "301"]).ok).toBe(false);
    expect(parseResetArgs(["--confirm", RESET_CONFIRM, "--wait", "-1"]).ok).toBe(false);
    expect(parseResetArgs(["--confirm", RESET_CONFIRM, "--force"]).ok).toBe(false);
    expect(parseResetArgs(["extra"]).ok).toBe(false);
  });
});

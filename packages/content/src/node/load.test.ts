// 팩 폴더 읽기·해시 시험 — fixtures/valid(올바른 팩), 없는 폴더, 하위 폴더, 해시가 형식에 흔들리지 않는지
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixture } from "../testFixtures.ts";
import { hashPack } from "./hash.ts";
import { loadContentPack, readPackDir } from "./load.ts";

const VALID = fileURLToPath(new URL("../../fixtures/valid", import.meta.url));

describe("loadContentPack", () => {
  it("올바른 팩 폴더를 읽어 버전·해시를 돌려준다", () => {
    const loaded = loadContentPack(VALID);
    expect(loaded.issues).toEqual([]);
    expect(loaded.version).toBe("valid@2");
    expect(loaded.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.pack?.idChanges.renamed).toHaveLength(1);
  });

  it("없는 폴더는 오류 한 건으로 알린다", () => {
    const loaded = loadContentPack(path.join(VALID, "missing"));
    expect(loaded.pack).toBeUndefined();
    expect(loaded.issues).toEqual([expect.objectContaining({ message: expect.stringContaining("ENOENT") })]);
  });

  it("하위 폴더와 모르는 파일도 읽어서 2단계가 알리게 한다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "terra-content-"));
    const pack = path.join(dir, "core");
    try {
      mkdirSync(path.join(pack, "extra"), { recursive: true });
      for (const [name, text] of fixture().files) writeFileSync(path.join(pack, name), text);
      writeFileSync(path.join(pack, "README.txt"), "메모");
      expect([...readPackDir(pack).files.keys()]).toEqual([
        "README.txt",
        "extra/",
        "id-changes.json",
        "items.json",
        "manifest.json",
      ]);
      expect(loadContentPack(pack).issues.map((issue) => issue.file)).toEqual(["README.txt", "extra/"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("hashPack", () => {
  it("줄 바꿈·키 순서·항목 순서가 달라도 같고, 내용이 다르면 다르다", () => {
    const original = fixture().files;
    const reformatted = fixture({
      "items.json":
        '{"entries":[{"name":{"en":"Copper ore","ko":"구리광석"},"id":"copper_ore"},{"id":"iron_ore","name":{"ko":"철광석","en":"Iron ore"}}]}',
    }).files;
    const changed = fixture({ "manifest.json": { formatVersion: 1, packId: "core", version: 2 } }).files;
    expect(hashPack(reformatted)).toBe(hashPack(original));
    expect(hashPack(changed)).not.toBe(hashPack(original));
  });

  it("BOM이 붙은 파일도 같은 해시", () => {
    const original = fixture().files;
    const withBom = new Map(original);
    withBom.set("items.json", `﻿${original.get("items.json") ?? ""}`);
    expect(hashPack(withBom)).toBe(hashPack(original));
  });
});

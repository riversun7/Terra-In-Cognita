// 팩의 입력(파일 묶음)과 검증을 통과한 결과의 모양
import type { IdChanges } from "./schema/idChanges.ts";
import type { Manifest } from "./schema/manifest.ts";

/** 검증할 팩 — 파일 시스템·git·편집기 어디서 읽었든 같은 모양으로 넘긴다 */
export interface PackSource {
  /** 팩 폴더 이름. manifest.json의 packId와 같아야 한다 */
  packId: string;
  /** 팩 폴더 안의 이름 → 내용. 폴더처럼 파일이 아닌 것은 이름 끝에 "/"를 붙이고 내용은 빈 문자열 */
  files: ReadonlyMap<string, string>;
}

/** 1단계(스키마)를 통과한 팩 */
export interface ContentPack {
  manifest: Manifest;
  idChanges: IdChanges;
  /** 분류 이름 → 항목. 파일이 없는 분류는 빈 배열 */
  entries: ReadonlyMap<string, readonly { id: string }[]>;
}

/** JSON 읽기 — 파일 맨 앞의 BOM(일부 편집기가 붙임)은 무시한다 */
export function parseJson(text: string): unknown {
  return JSON.parse(text.startsWith("﻿") ? text.slice(1) : text);
}

/** 팩의 JSON 파일을 모두 읽는다(파일 이름 → 값). 문법 오류가 있으면 SyntaxError를 던진다 */
export function parsePackFiles(files: ReadonlyMap<string, string>): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const [name, text] of files) {
    if (name.endsWith(".json")) parsed[name] = parseJson(text);
  }
  return parsed;
}

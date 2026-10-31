// 2차맵 지형 디스크 캐시 — 행성 캐시 폴더(PLANET_CACHE_DIR) 아래 second-maps/ (NAS는 같은 볼륨, 지워도 된다).
// 파일 하나 = 2차맵 하나의 지형 파일 gzip: <행성 ID>-<주소 판 표지>-<2차맵 키>.tctr.gz
// 판 표지(2차맵 생성기 판·행성 생성기 판·정의 해시·소품 규칙 해시)가 이름에 있어 판이 바뀌면 옛 파일을 읽지 않는다.
// 쓰기는 임시 파일 → 이름 바꾸기. 읽은 파일이 틀리면(풀리지 않음·키가 다름) 지우고 다시 만든다(terrainWorker.ts).
// 지형 워커가 쓴다(지울 수 있는 TS 문법만).
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

export const TERRAIN_CACHE_SUBDIR = "second-maps";
const SUFFIX = ".tctr.gz";

export function terrainCacheFile(dir: string, planetId: string, version: string, mapKey: number): string {
  return path.join(dir, `${planetId}-${version}-${mapKey}${SUFFIX}`);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** 캐시 파일을 읽는다(없으면 undefined). 읽으면 바뀐 시각을 지금으로(오래 안 쓴 것부터 지운다) */
export async function readTerrainCache(file: string): Promise<Uint8Array | undefined> {
  try {
    const bytes = await readFile(file);
    const now = new Date();
    await utimes(file, now, now).catch(() => undefined);
    return bytes;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export async function writeTerrainCache(file: string, gzip: Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(temporary, gzip);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function removeTerrainCache(file: string): Promise<void> {
  await rm(file, { force: true });
}

/**
 * 이 행성의 다른 판 파일과 임시 파일을 지우고, 지금 판 파일이 keep개를 넘으면 오래 안 쓴 것부터 지운다.
 * 지운 파일 수를 돌려준다. 폴더가 없으면 0
 */
export async function pruneTerrainCache(
  dir: string,
  planetId: string,
  version: string,
  keep: number,
): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
  const prefix = `${planetId}-`;
  const current = `${planetId}-${version}-`;
  const remove: string[] = [];
  const kept: { name: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    if (name.includes(".tmp-") || !name.startsWith(current) || !name.endsWith(SUFFIX)) {
      remove.push(name);
      continue;
    }
    const info = await stat(path.join(dir, name)).catch(() => undefined);
    if (info) kept.push({ name, mtimeMs: info.mtimeMs });
  }
  if (kept.length > keep) {
    const oldest = kept.toSorted((a, b) => a.mtimeMs - b.mtimeMs).slice(0, kept.length - keep);
    for (const { name } of oldest) remove.push(name);
  }
  await Promise.all(remove.map((name) => rm(path.join(dir, name), { force: true })));
  return remove.length;
}

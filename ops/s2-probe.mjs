// S2 행성 타일 측정 클라이언트 — 로그인하고 목록 정보 → 처음 화면 타일(맵 레벨 F−4·F−3)을 받아 시간·크기를 재고,
// 받은 타일은 기기와 같은 정의(packages/protocol·planet)로 모두 읽어 머리 값과 이음매(같은 레벨 경계 높이)를 확인한다.
// ADR 2026-10-29-s2-planet-lod "측정". 새 의존성 없이 Node 24 전역 fetch만 쓴다(fetch는 gzip을 스스로 푼다 → 받은 양은
// content-length). 저장소에서 실행한다(pnpm install 뒤 — packages/protocol의 zod를 읽는다).
//
//   S2_URL=http://127.0.0.1:4320 S2_ID=<아이디> S2_PASSWORD=<비밀번호> node ops/s2-probe.mjs
//
// 선택: S2_PLANET(행성 ID, 기본 s2_synthetic), S2_ALL=1(모든 타일, 기본은 처음 화면 것만),
//       S2_CONCURRENCY(동시 받기, 기본 6 = 렌더러 상한), S2_WAIT_SECONDS(굽기를 기다리는 시간, 기본 300)
// 들어가기는 같은 출처 검사를 하므로 S2_URL은 서버의 BETTER_AUTH_URL과 같아야 한다. 비밀번호는 출력하지 않는다(가짜 계정만).
import { FACE_FRAMES, planetTileIds } from "../packages/planet/src/index.ts";
import {
  decodePlanetTile,
  planetManifestPath,
  planetManifestSchema,
  planetTilePath,
} from "../packages/protocol/src/index.ts";

const baseUrl = (process.env.S2_URL || "http://127.0.0.1:4100").replace(/\/+$/, "");
const loginId = process.env.S2_ID;
const password = process.env.S2_PASSWORD;
const planetId = process.env.S2_PLANET || "s2_synthetic";
const fetchAll = process.env.S2_ALL === "1";
const concurrency = Number(process.env.S2_CONCURRENCY || "6");
const waitSeconds = Number(process.env.S2_WAIT_SECONDS || "300");
if (!loginId || !password) {
  console.error("S2_ID와 S2_PASSWORD가 필요합니다 (시험용 가짜 계정)");
  process.exit(2);
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
function percentile(values, p) {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** 들어가기(POST /api/account/enter) → 세션 쿠키("이름=값") */
async function signIn() {
  const response = await fetch(`${baseUrl}/api/account/enter`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ id: loginId, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 || body.status !== "signed_in") {
    throw new Error(`sign-in failed: HTTP ${response.status} ${body.error ?? body.status ?? ""}`);
  }
  const cookie = response.headers
    .getSetCookie()
    .find((line) => /^(__Secure-)?tic\.session_token=/.test(line));
  if (!cookie) throw new Error("no session cookie in the sign-in response");
  return cookie.split(";", 1)[0];
}

/** 목록 정보를 status가 ready가 될 때까지 묻는다 */
async function readyManifest(cookie) {
  const started = performance.now();
  let polls = 0;
  for (;;) {
    polls += 1;
    const response = await fetch(`${baseUrl}${planetManifestPath(planetId)}`, { headers: { cookie } });
    if (response.status !== 200)
      throw new Error(`manifest: HTTP ${response.status} ${await response.text()}`);
    const manifest = planetManifestSchema.parse(await response.json());
    if (manifest.status === "ready") return { manifest, waitMs: performance.now() - started, polls };
    if (performance.now() - started > waitSeconds * 1000)
      throw new Error("planet did not become ready in time");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** 면 `face`, 맵 레벨 `level`의 꼭짓점 (ci, cj) → 정수 3D 좌표 문자열 (이음매 확인용) */
function cornerPoint(face, level, ci, cj) {
  const n = 2 ** level;
  const { normal, uAxis, vAxis } = FACE_FRAMES[face];
  const u = 2 * ci - n;
  const v = 2 * cj - n;
  return [0, 1, 2].map((axis) => normal[axis] * n + u * uAxis[axis] + v * vAxis[axis]).join(",");
}

const cookie = await signIn();
const { manifest, waitMs, polls } = await readyManifest(cookie);
const ids = planetTileIds(manifest.faceLevel);
const firstView = ids.filter((id) => id.mapLevel <= manifest.faceLevel - 3);
const targets = fetchAll ? ids : firstView;
console.log(
  `# S2 타일 측정 (${baseUrl}, 행성 ${manifest.id}, F ${manifest.faceLevel}, 생성기 ${manifest.generatorVersion}, 동시 ${concurrency})`,
);
console.log(
  `목록 정보: 준비까지 ${round(waitMs)}ms (${polls}번 물음), 바이옴 범례 ${manifest.biomes.length}개`,
);

const latencies = [];
const levelStats = new Map();
const points = new Map();
let seamConflicts = 0;
let headerMismatches = 0;
let next = 0;
const started = performance.now();
let firstViewMs = 0;
let firstViewDone = 0;

async function worker() {
  while (next < targets.length) {
    const id = targets[next++];
    const url = `${baseUrl}${planetTilePath(manifest.tileUrlTemplate, id.key)}`;
    const begin = performance.now();
    const response = await fetch(url, { headers: { cookie, "accept-encoding": "gzip" } });
    if (response.status !== 200)
      throw new Error(`tile ${id.key}: HTTP ${response.status} ${await response.text()}`);
    const gzipBytes = Number(response.headers.get("content-length") ?? 0);
    const raw = new Uint8Array(await response.arrayBuffer());
    latencies.push(performance.now() - begin);
    const tile = decodePlanetTile(raw);
    if (
      tile.mapLevel !== id.mapLevel ||
      tile.face !== id.face ||
      tile.i0 !== id.i0 ||
      tile.j0 !== id.j0 ||
      tile.definitionHash !== manifest.definitionHash ||
      tile.generatorVersion !== manifest.generatorVersion
    ) {
      headerMismatches += 1;
    }
    const stats = levelStats.get(id.mapLevel) ?? { tiles: 0, gzip: 0, raw: 0 };
    stats.tiles += 1;
    stats.gzip += gzipBytes;
    stats.raw += raw.byteLength;
    levelStats.set(id.mapLevel, stats);
    // 이음매: 같은 레벨 타일은 같은 3D 꼭짓점에서 높이가 같아야 한다
    for (let cj = 0; cj <= tile.size; cj++) {
      for (let ci = 0; ci <= tile.size; ci++) {
        const key = `${id.mapLevel}:${cornerPoint(tile.face, tile.mapLevel, tile.i0 + ci, tile.j0 + cj)}`;
        const height = tile.heightsM[cj * (tile.size + 1) + ci];
        const seen = points.get(key);
        if (seen === undefined) points.set(key, height);
        else if (seen !== height) seamConflicts += 1;
      }
    }
    if (id.mapLevel <= manifest.faceLevel - 3) {
      firstViewDone += 1;
      if (firstViewDone === firstView.length) firstViewMs = performance.now() - started;
    }
  }
}

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
const totalMs = performance.now() - started;

console.log("\n| 맵 레벨 | 타일 | 받은 KB(gzip) | 압축 전 KB |");
console.log("|---|---|---|---|");
let gzipTotal = 0;
let rawTotal = 0;
for (const [level, stats] of [...levelStats].toSorted((a, b) => a[0] - b[0])) {
  gzipTotal += stats.gzip;
  rawTotal += stats.raw;
  console.log(`| ${level} | ${stats.tiles} | ${round(stats.gzip / 1024)} | ${round(stats.raw / 1024)} |`);
}
console.log(
  `\n처음 화면(맵 레벨 ${manifest.faceLevel - 4}~${manifest.faceLevel - 3}, ${firstView.length}개): ${round(firstViewMs)}ms` +
    `${fetchAll ? `, 모두 ${targets.length}개: ${round(totalMs)}ms` : ""}`,
);
console.log(
  `받은 양 ${round(gzipTotal / 1024)}KB(압축 전 ${round(rawTotal / 1024)}KB), 타일 하나 p50 ${round(percentile(latencies, 0.5))}ms · p95 ${round(percentile(latencies, 0.95))}ms · 최대 ${round(Math.max(...latencies))}ms`,
);
console.log(`머리 값 어긋남 ${headerMismatches}, 이음매 어긋남(같은 레벨 꼭짓점 높이) ${seamConflicts}`);
if (headerMismatches > 0 || seamConflicts > 0) process.exit(1);

// S1 측정 클라이언트 — 로그인하고 시험 2차맵을 구독해 스냅샷 크기·받기까지 걸린 시간·갱신 양을 잰다 (ADR 33 "측정")
// 받은 메시지는 기기와 같은 정의(packages/protocol)로 모두 검사한다. 새 의존성 없이 Node 24 전역 fetch·WebSocket만 쓴다.
// 저장소에서 실행한다(pnpm install 뒤 — packages/protocol의 zod를 읽는다). 부하 봇은 NAS 밖에서 돌린다(PLAN 9.7).
//
//   S1_URL=http://127.0.0.1:4320 S1_ID=<아이디> S1_PASSWORD=<비밀번호> node ops/s1-probe.mjs
//
// 선택: S1_SECONDS(재는 시간, 기본 60), S1_CLIENTS(동시 연결 수, 기본 1 — 사용자 하나의 구독은 순간 10번까지),
//       S1_MOVE_MS(관리자 이동 명령 간격 ms, 기본 0 = 보내지 않음. admin 계정만 된다)
// S1_URL은 서버의 BETTER_AUTH_URL과 같아야 한다(들어가기·WebSocket의 같은 출처 검사). 비밀번호는 출력하지 않는다.
import {
  PROTOCOL_VERSION,
  S1_TEST_MAP_KEY,
  decodeServerMessage,
  encodeMessage,
  utf8ByteLength,
} from "../packages/protocol/src/index.ts";
import { estimateClockOffset } from "../packages/shared/src/index.ts";

const baseUrl = (process.env.S1_URL || "http://127.0.0.1:4100").replace(/\/+$/, "");
const loginId = process.env.S1_ID;
const password = process.env.S1_PASSWORD;
const seconds = Number(process.env.S1_SECONDS || "60");
const clients = Number(process.env.S1_CLIENTS || "1");
const moveEveryMs = Number(process.env.S1_MOVE_MS || "0");
if (!loginId || !password) {
  console.error("S1_ID와 S1_PASSWORD가 필요합니다 (시험용 가짜 계정)");
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
  return { cookie: cookie.split(";", 1)[0], roles: body.user?.roles ?? [] };
}

/** 연결 하나: 인사 → 시계 맞추기(ping 5번) → 구독 → seconds초 동안 받기 */
function runClient(index, cookie, canMove) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws`;
    const socket = new WebSocket(wsUrl, { headers: { cookie, origin: baseUrl } });
    const stats = {
      index,
      snapshotBytes: 0,
      snapshotParts: 0,
      units: 0,
      buildings: 0,
      subscribeToAckMs: 0,
      subscribeToSnapshotMs: 0,
      messages: 0,
      bytes: 0,
      unitUpdates: 0,
      buildingEvents: 0,
      revGaps: 0,
      maxMessageBytes: 0,
      updateDelaysMs: [],
      commandMs: [],
      commandFailures: new Map(),
      measuredSeconds: 0,
    };
    const samples = [];
    let offsetMs = 0;
    let rev = -1;
    let subscribedAt = 0;
    let snapshotDoneAt = 0;
    let nextRequestId = 1;
    const pending = new Map();
    let unitIds = [];
    let moveTimer;

    const send = (message) => socket.send(encodeMessage(message));
    const finish = () => {
      clearInterval(moveTimer);
      stats.measuredSeconds = snapshotDoneAt > 0 ? (performance.now() - snapshotDoneAt) / 1000 : 0;
      socket.close(1000, "done");
      resolve(stats);
    };

    socket.addEventListener("open", () => {
      send({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "s1-probe" });
    });
    socket.addEventListener("error", () => reject(new Error(`client ${index}: websocket error`)));
    socket.addEventListener("message", (event) => {
      const text = String(event.data);
      const bytes = utf8ByteLength(text);
      const message = decodeServerMessage(text);
      const now = performance.now();
      switch (message.t) {
        case "welcome":
          for (let id = 0; id < 5; id++) {
            setTimeout(() => send({ t: "ping", id, clientSendTime: Date.now() }), id * 100);
          }
          return;
        case "pong":
          samples.push({
            clientSendTime: message.clientSendTime,
            serverTime: message.serverTime,
            clientReceiveTime: Date.now(),
          });
          if (samples.length === 5) {
            offsetMs = estimateClockOffset(samples).offsetMs;
            subscribedAt = performance.now();
            send({ t: "subscribe", id: nextRequestId++, mapKey: S1_TEST_MAP_KEY });
          }
          return;
        case "reject":
          reject(new Error(`client ${index}: rejected ${message.code}`));
          return;
        case "result": {
          const started = pending.get(message.id);
          if (started !== undefined) {
            pending.delete(message.id);
            stats.commandMs.push(now - started);
            if (!message.ok)
              stats.commandFailures.set(message.code, (stats.commandFailures.get(message.code) ?? 0) + 1);
          } else if (message.ok) {
            stats.subscribeToAckMs = now - subscribedAt;
          } else {
            reject(new Error(`client ${index}: subscribe failed ${message.code}`));
          }
          return;
        }
        case "map_snapshot":
          stats.snapshotBytes += bytes;
          stats.snapshotParts += 1;
          stats.units += message.units.length;
          stats.buildings += message.buildings.length;
          stats.maxMessageBytes = Math.max(stats.maxMessageBytes, bytes);
          if (message.part === 0) unitIds = [];
          unitIds.push(...message.units.map((unit) => unit.id));
          if (message.part === message.parts - 1 && snapshotDoneAt === 0) {
            snapshotDoneAt = now;
            stats.subscribeToSnapshotMs = now - subscribedAt;
            rev = message.rev;
            setTimeout(finish, seconds * 1000);
            if (canMove && moveEveryMs > 0) {
              moveTimer = setInterval(() => {
                const unitId = unitIds[Math.floor(Math.random() * unitIds.length)];
                const id = nextRequestId++;
                pending.set(id, performance.now());
                const x = 1024 * Math.floor(Math.random() * 256) + 512;
                const y = 1024 * Math.floor(Math.random() * 256) + 512;
                send({ t: "move_unit", id, mapKey: S1_TEST_MAP_KEY, unitId, x, y });
              }, moveEveryMs);
            }
          }
          return;
        case "unit_paths": {
          if (snapshotDoneAt === 0) return;
          stats.messages += 1;
          stats.bytes += bytes;
          stats.maxMessageBytes = Math.max(stats.maxMessageBytes, bytes);
          if (message.rev <= rev) return;
          if (message.fromRev > rev) stats.revGaps += 1;
          rev = message.rev;
          stats.unitUpdates += message.units.length;
          const serverNow = Date.now() + offsetMs;
          for (const unit of message.units) stats.updateDelaysMs.push(serverNow - unit.departAtMs);
          return;
        }
        case "building_placed":
        case "building_removed":
          if (snapshotDoneAt === 0) return;
          stats.messages += 1;
          stats.bytes += bytes;
          stats.buildingEvents += 1;
          if (message.rev - 1 > rev) stats.revGaps += 1;
          rev = Math.max(rev, message.rev);
          return;
      }
    });
  });
}

const login = await signIn();
const canMove = login.roles.includes("admin");
console.log(`# S1 측정 (${baseUrl}, 연결 ${clients}개, ${seconds}초, 계정 역할 ${login.roles.join(",")})`);
const runs = [];
for (let index = 0; index < clients; index++) {
  runs.push(runClient(index, login.cookie, canMove));
  // 한 사용자의 구독 제한(순간 10번)에 걸리지 않게 조금씩 띄운다
  await new Promise((resolve) => setTimeout(resolve, clients > 10 ? 1_100 : 100));
}
const results = await Promise.all(runs);

console.log(
  "\n| 연결 | 스냅샷 KB(조각) | 유닛 | ok까지 ms | 스냅샷 끝까지 ms | 갱신 메시지/초 | 갱신 유닛/초 | KB/초 | 경로 지연 p50/p95 ms | rev 빠짐 | 가장 큰 메시지 KB |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const s of results) {
  const perSec = (value) => round(value / Math.max(s.measuredSeconds, 0.001));
  console.log(
    `| ${s.index} | ${round(s.snapshotBytes / 1024)} (${s.snapshotParts}) | ${s.units} | ${round(s.subscribeToAckMs)} | ${round(s.subscribeToSnapshotMs)} | ${perSec(s.messages)} | ${perSec(s.unitUpdates)} | ${round(s.bytes / 1024 / Math.max(s.measuredSeconds, 0.001), 2)} | ${round(percentile(s.updateDelaysMs, 0.5))} / ${round(percentile(s.updateDelaysMs, 0.95))} | ${s.revGaps} | ${round(s.maxMessageBytes / 1024)} |`,
  );
}
const commands = results.flatMap((s) => s.commandMs);
if (commands.length > 0) {
  const failures = new Map();
  for (const s of results)
    for (const [code, n] of s.commandFailures) failures.set(code, (failures.get(code) ?? 0) + n);
  console.log(
    `\n이동 명령 ${commands.length}개: 결과까지 p50 ${round(percentile(commands, 0.5))}ms, p95 ${round(percentile(commands, 0.95))}ms, 최대 ${round(Math.max(...commands))}ms. 실패 ${[...failures].map(([c, n]) => `${c} ${n}`).join(", ") || "없음"}`,
  );
}
console.log(
  "\n경로 지연 = 받은 때(서버 시각) − 그 움직임의 출발 시각(departAtMs). 묶어 보내기(약 100ms) + 전송이 들어간다.",
);

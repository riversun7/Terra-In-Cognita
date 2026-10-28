// 배포 자동 점검 (PLAN 7장 7단계) — 새 앱이 실제로 응답하는지 본다. 표준 라이브러리만 쓴다(Node 24 전역 fetch·WebSocket).
// 1) GET /health: 200, status "ok", db·콘텐츠 버전·콘텐츠 해시가 기대값과 같은지
// 2) WebSocket /ws: hello → welcome, welcome의 버전들이 /health와 같은지
// 실행:
//   컨테이너 안(배포·CI): docker exec -i -e EXPECT_DB=ok tic-app node --input-type=module - < ops/smoke.mjs
//   밖에서: SMOKE_URL=http://127.0.0.1:4100 node ops/smoke.mjs
// 기대값: EXPECT_DB(ok|off), EXPECT_CONTENT_VERSION(예: core@1), EXPECT_CONTENT_HASH(64자). 비어 있으면 그 비교는 건너뛴다.
// 실패하면 코드 1 → ops/deploy.sh가 직전 버전으로 되돌린다.
const baseUrl = (process.env.SMOKE_URL || `http://127.0.0.1:${process.env.PORT || "4100"}`).replace(
  /\/+$/,
  "",
);
const TIMEOUT_MS = 5_000;
const expected = {
  db: process.env.EXPECT_DB,
  contentVersion: process.env.EXPECT_CONTENT_VERSION,
  contentHash: process.env.EXPECT_CONTENT_HASH,
};

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const show = (value) => JSON.stringify(value) ?? String(value);

// 1) /health
let health;
try {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  check(response.status === 200, `/health 응답 코드가 ${response.status}입니다(200이어야 함)`);
  health = await response.json();
} catch (error) {
  console.error(`✗ 배포 점검 실패: ${baseUrl}/health 요청 실패 (${error.message})`);
  process.exit(1);
}
check(health.status === "ok", `/health status가 ${show(health.status)}입니다("ok"이어야 함)`);
check(
  typeof health.contentVersion === "string" &&
    health.contentVersion !== "" &&
    health.contentVersion !== "dev",
  `/health contentVersion이 ${show(health.contentVersion)}입니다(팩 버전이어야 함, 예: core@1)`,
);
check(
  /^[0-9a-f]{64}$/.test(health.contentHash ?? ""),
  `/health contentHash가 ${show(health.contentHash)}입니다`,
);
for (const [key, value] of Object.entries(expected)) {
  if (value) check(health[key] === value, `/health ${key}가 ${show(health[key])}입니다(기대 ${show(value)})`);
}

// 2) WebSocket 접속 인사 — 기기가 하는 것과 같은 첫 메시지(packages/protocol의 hello)를 보낸다
const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws`;
let welcome;
try {
  welcome = await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${TIMEOUT_MS}ms 안에 답이 없습니다`));
    }, TIMEOUT_MS);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({ t: "hello", protocolVersion: health.protocolVersion, clientBuild: "smoke" }),
      );
    });
    socket.addEventListener("message", (event) => {
      clearTimeout(timer);
      socket.close();
      try {
        resolve(JSON.parse(String(event.data)));
      } catch (error) {
        reject(error);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("연결 오류"));
    });
  });
} catch (error) {
  failures.push(`WebSocket ${wsUrl} hello → welcome 실패 (${error.message})`);
}
if (welcome) {
  check(welcome.t === "welcome", `WebSocket 첫 답이 welcome이 아닙니다: ${show(welcome)}`);
  for (const key of ["protocolVersion", "simVersion", "contentVersion"]) {
    check(
      welcome[key] === health[key],
      `welcome ${key}(${show(welcome[key])})가 /health(${show(health[key])})와 다릅니다`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ 배포 점검 실패: ${failure}`);
  process.exit(1);
}
console.log(
  `✓ 배포 점검 통과 — ${health.contentVersion} (${health.contentHash.slice(0, 12)}), db ${health.db}, 프로토콜 ${health.protocolVersion}`,
);

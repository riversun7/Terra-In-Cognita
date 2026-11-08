// tRPC 요청 보기·응답 바꾸기 — 기기는 같은 틱에 부른 조회를 HTTP 요청 하나로 묶는다(httpBatchLink, apps/game/src/net/api.ts).
// - 묶은 요청 주소: /api/trpc/<프로시저>,<프로시저>?batch=1&input=<JSON: 차례 번호 → 입력>. 쓰기(mutation)는 POST이고 입력은 본문이다.
// - 응답은 프로시저 차례대로의 배열이다. 변환기가 없어 JSON 그대로다: [{ result: { data } } | { error }].
// - watchTrpc는 그 화면(page)이 보낸 요청만 센다(서비스 워커가 보낸 요청은 없다. 맥락마다 첫 화면은 서비스 워커 밖이다).
// - rewriteTrpc는 서버 답을 받은 뒤 그 프로시저의 data만 고쳐 돌려준다(서버가 아직 보내지 않는 값을 넣어 볼 때).
// - replayTrpc는 같은 입력의 조회를 처음 한 번만 서버에 묻고 그다음은 담아 둔 답으로 돌려준다(배치·사진 시험이 사용자별
//   속도 제한을 다 쓰지 않게. 서버 상태를 바꾸지 않는 시험끼리만 같은 저장소를 쓴다).
import { type Page, type Request, type Route, expect } from "@playwright/test";

/** packages/protocol의 TRPC_PATH(/api/trpc) 아래 */
const TRPC_PREFIX = "/api/trpc/";

export interface TrpcCall {
  /** 이 HTTP 요청에 묶인 프로시저(차례대로) */
  readonly procedures: readonly string[];
  /** 프로시저마다의 입력(입력이 없으면 undefined) */
  readonly inputs: readonly unknown[];
  /** 보낸 시각(시험 프로세스 시계 ms) */
  readonly sentAt: number;
  /** 응답을 다 받았거나 실패한 시각. 아직이면 null */
  endedAt: number | null;
}

/** tRPC 주소면 묶인 프로시저 이름들, 아니면 null */
export function trpcProcedures(url: string): string[] | null {
  const { pathname } = new URL(url);
  if (!pathname.startsWith(TRPC_PREFIX)) return null;
  return decodeURIComponent(pathname.slice(TRPC_PREFIX.length)).split(",");
}

/** 묶은 요청의 입력({ "0": …, "1": … }) → 프로시저 차례의 배열 */
function trpcInputs(request: Request, count: number): unknown[] {
  let raw: unknown = null;
  try {
    raw =
      request.method() === "GET"
        ? JSON.parse(new URL(request.url()).searchParams.get("input") ?? "null")
        : request.postDataJSON();
  } catch {
    raw = null;
  }
  return Array.from({ length: count }, (_, index) =>
    typeof raw === "object" && raw !== null ? Reflect.get(raw, String(index)) : undefined,
  );
}

/** 화면이 보내는 tRPC 요청을 모으기 시작한다(goto 전에 부른다). 돌려준 배열에 쌓인다 */
export function watchTrpc(page: Page): TrpcCall[] {
  const calls: TrpcCall[] = [];
  const open = new Map<Request, TrpcCall>();
  page.on("request", (request) => {
    const procedures = trpcProcedures(request.url());
    if (procedures === null) return;
    const call: TrpcCall = {
      procedures,
      inputs: trpcInputs(request, procedures.length),
      sentAt: Date.now(),
      endedAt: null,
    };
    calls.push(call);
    open.set(request, call);
  });
  const end = (request: Request): void => {
    const call = open.get(request);
    if (call === undefined) return;
    call.endedAt = Date.now();
    open.delete(request);
  };
  page.on("requestfinished", end);
  page.on("requestfailed", end);
  return calls;
}

/**
 * tRPC 요청이 멈출 때까지 기다린다: 보낸 요청이 모두 끝났고 quietMs 동안 새 요청이 없다.
 * "한 번만 보낸다"를 볼 때 쓴다. 두 번째 요청을 부르는 일(다시 연결 등)이 일어난 뒤에 부른다
 */
export async function trpcQuiet(calls: readonly TrpcCall[], quietMs = 1_000): Promise<void> {
  await expect
    .poll(
      () => {
        if (calls.some((call) => call.endedAt === null)) return false;
        const last = Math.max(0, ...calls.map((call) => call.endedAt ?? call.sentAt));
        return Date.now() - last >= quietMs;
      },
      { message: "tRPC 요청이 멈추지 않았습니다", timeout: 20_000, intervals: [100] },
    )
    .toBe(true);
}

/** 묶음 응답의 한 칸에서 data. 오류 칸이거나 모양이 다르면 undefined */
function resultData(entry: unknown): unknown {
  if (typeof entry !== "object" || entry === null) return undefined;
  const result: unknown = Reflect.get(entry, "result");
  return typeof result === "object" && result !== null ? Reflect.get(result, "data") : undefined;
}

/** summary.get data → 보일 것 없음(show: false). 복귀 요약 대화상자를 띄우지 않을 시험용(rewriteTrpc에 넘긴다) */
export function hideSummary(data: unknown): void {
  if (typeof data !== "object" || data === null) throw new Error("summary.get 응답 모양이 다릅니다");
  Reflect.set(data, "show", false);
  Reflect.set(data, "sections", []);
}

/**
 * 프로시저 → data를 고치는 함수. 그 프로시저가 든 요청마다(다시 받기 포함) 서버 답을 받아 data를 고쳐 돌려준다.
 * 화면 하나에 한 번 부른다(고칠 프로시저를 모두 한 번에 준다): 한 묶음에 든 두 프로시저를 다른 처리기가 나눠 고칠 수 없다.
 */
export async function rewriteTrpc(
  page: Page,
  edits: Readonly<Record<string, (data: unknown) => void>>,
): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith(TRPC_PREFIX),
    async (route) => {
      const procedures = trpcProcedures(route.request().url()) ?? [];
      if (!procedures.some((name) => Object.hasOwn(edits, name))) {
        await route.fallback();
        return;
      }
      let response: Awaited<ReturnType<typeof route.fetch>>;
      let body: unknown;
      try {
        response = await route.fetch();
        body = await response.json();
      } catch (error) {
        // 시험이 끝났거나 화면을 옮겨 요청·응답이 버려졌다(맥락을 닫는 중): 고칠 것이 없다
        if (error instanceof Error && /disposed|closed|Test ended/i.test(error.message)) return;
        throw error;
      }
      await fulfillEdited(
        route,
        procedures,
        edits,
        response.status(),
        rewrittenHeaders(response.headers()),
        body,
      );
    },
  );
}

/** 본문을 바꿔 돌려줄 때의 머리글: 길이·압축 머리글은 빼고 다시 단다 */
function rewrittenHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name !== "content-length" && name !== "content-encoding"),
  );
}

/** replayTrpc가 담아 둔 서버 답: "프로시저 이름 + 입력 JSON" → data JSON. 시험 파일 하나가 모듈 범위에 하나 만들어 시험끼리 함께 쓴다 */
export type TrpcReplay = Map<string, string>;

export function createTrpcReplay(): TrpcReplay {
  return new Map();
}

/**
 * 같은 입력의 tRPC 호출(procedures에 든 것만)은 처음 한 번만 서버에 묻고, 그다음은 담아 둔 답으로 돌려준다.
 * 왜: 개발 화면 조회는 사용자마다 속도 제한이 있다(설정 칸 계열 조회 순간 30·분당 120, 밸런스 대결 순간 2·분당 4,
 * 전투 실험실 전투 순간 4·분당 8 — 서버 보호라 그대로 둔다). 한 계정으로 화면을 여러 번 여는 배치·사진 시험이 그 제한을
 * 다 쓰면 뒤 시험의 조회가 TOO_MANY_REQUESTS로 막힌다. 서버 결과가 같기만 하면 되는 시험은 이것으로 서버에 덜 묻는다.
 * - 기기가 묶어 보낸 요청(?batch=1)만 본다. 시험이 page.evaluate로 직접 부르는 요청(묶지 않음)은 늘 서버로 간다.
 * - 묶음의 프로시저가 모두 procedures에 들고 모두 담겨 있으면 서버에 보내지 않는다. 하나라도 없으면 묶음 그대로 서버에
 *   묻고 성공한 칸만 담는다(오류 칸은 담지 않고 그대로 돌려준다).
 * - edits: 돌려주기 전에 그 프로시저의 data를 고친다(rewriteTrpc와 같다. 담아 둔 값은 바꾸지 않는다).
 * 화면 하나에 한 번 부른다(rewriteTrpc와 함께 쓰지 않는다). 같은 저장소는 같은 계정·서버 상태를 보는 시험끼리만 쓴다:
 * 담은 답은 서버 상태가 바뀌어도 그대로다(그래서 이 저장소를 쓰는 시험은 서버 상태를 바꾸지 않는다).
 */
export async function replayTrpc(
  page: Page,
  replay: TrpcReplay,
  procedures: readonly string[],
  edits: Readonly<Record<string, (data: unknown) => void>> = {},
): Promise<void> {
  const replayable = new Set(procedures);
  await page.route(
    (url) => url.pathname.startsWith(TRPC_PREFIX) && url.searchParams.get("batch") === "1",
    async (route) => {
      const request = route.request();
      const names = trpcProcedures(request.url()) ?? [];
      if (!names.some((name) => replayable.has(name) || Object.hasOwn(edits, name))) {
        await route.fallback();
        return;
      }
      const inputs = trpcInputs(request, names.length);
      const keys = names.map((name, index) =>
        replayable.has(name) ? `${name} ${JSON.stringify(inputs[index] ?? null)}` : null,
      );
      const cached = keys.map((key) => (key === null ? undefined : replay.get(key)));
      if (cached.every((data) => data !== undefined)) {
        // 모두 담겨 있다: 서버에 묻지 않는다(묶음 응답 모양 그대로)
        const body = cached.map((data) => ({ result: { data: JSON.parse(data) } }));
        await fulfillEdited(route, names, edits, 200, { "content-type": "application/json" }, body);
        return;
      }
      const response = await route.fetch();
      const body: unknown = await response.json();
      if (Array.isArray(body)) {
        for (const [index, key] of keys.entries()) {
          const data = resultData(body[index]);
          if (key !== null && data !== undefined) replay.set(key, JSON.stringify(data));
        }
      }
      await fulfillEdited(route, names, edits, response.status(), rewrittenHeaders(response.headers()), body);
    },
  );
}

/** 묶음 응답(body)의 칸마다 edits를 적용해 돌려준다 */
async function fulfillEdited(
  route: Route,
  names: readonly string[],
  edits: Readonly<Record<string, (data: unknown) => void>>,
  status: number,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  if (Array.isArray(body)) {
    for (const [index, name] of names.entries()) {
      const edit = Object.hasOwn(edits, name) ? edits[name] : undefined;
      const data = resultData(body[index]);
      if (edit !== undefined && data !== undefined) edit(data);
    }
  }
  await route.fulfill({ status, headers, body: JSON.stringify(body) });
}

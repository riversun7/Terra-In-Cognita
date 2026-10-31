// tRPC 요청 보기·응답 바꾸기 — 기기는 같은 틱에 부른 조회를 HTTP 요청 하나로 묶는다(httpBatchLink, apps/game/src/net/api.ts).
// - 묶은 요청 주소: /api/trpc/<프로시저>,<프로시저>?batch=1&input=<JSON: 차례 번호 → 입력>. 쓰기(mutation)는 POST이고 입력은 본문이다.
// - 응답은 프로시저 차례대로의 배열이다. 변환기가 없어 JSON 그대로다: [{ result: { data } } | { error }].
// - watchTrpc는 그 화면(page)이 보낸 요청만 센다(서비스 워커가 보낸 요청은 없다. 맥락마다 첫 화면은 서비스 워커 밖이다).
// - rewriteTrpc는 서버 답을 받은 뒤 그 프로시저의 data만 고쳐 돌려준다(서버가 아직 보내지 않는 값을 넣어 볼 때).
import { type Page, type Request, expect } from "@playwright/test";

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
      const response = await route.fetch();
      const body: unknown = await response.json();
      if (Array.isArray(body)) {
        for (const [index, name] of procedures.entries()) {
          const edit = Object.hasOwn(edits, name) ? edits[name] : undefined;
          const data = resultData(body[index]);
          if (edit !== undefined && data !== undefined) edit(data);
        }
      }
      // 본문을 바꾸므로 길이·압축 머리글은 빼고 다시 단다
      const headers = Object.fromEntries(
        Object.entries(response.headers()).filter(
          ([name]) => name !== "content-length" && name !== "content-encoding",
        ),
      );
      await route.fulfill({ status: response.status(), headers, body: JSON.stringify(body) });
    },
  );
}

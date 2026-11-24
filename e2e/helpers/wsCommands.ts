// 화면 시험이 WebSocket 명령을 바로 보내는 도우미 — 같은 출처 브라우저에서 보내 쿠키(로그인)가 실린다.
// 시험에 쓸 내 유닛은 실제 길로 만든다: 구인 카드 고용(recruit_hire, 아무 도시 정부기관에서나 — D-469)으로 휴먼을 세우고, 모자란 시험 화폐는
// 운영자 지급(tRPC ops.economy.grant, admin·dev 운영 권한 ledger_grant — 감사 기록이 남는다)으로 받는다. 예전 개발 시험 명령 dev_spawn_units
// (시험 일꾼 받기)는 없앴다(사용자 지적 2026-11-09 "시험일꾼 다 없애라고", 프로토콜 20).
import type { Page } from "@playwright/test";
import { PROTOCOL_VERSION } from "../../packages/protocol/src/version.ts";

/** 시험 2차맵 키(@terra/protocol S1_TEST_MAP_KEY = S2 시험 행성 F9 면 0 (282, 328)) */
const S1_TEST_MAP_KEY = 312_905_547_382_793;

/** 그 주체의 돈(소속 국가 화폐) — 운영자 지급의 자산 별칭(서버 ops/services.ts OPS_MONEY_ALIAS) */
const ASSET_CREDIT = "money";

/**
 * 브라우저에서 WebSocket 명령을 차례로 보낸다(같은 출처라 쿠키가 실린다). 결과 메시지들(result, 2차맵 사이 이동은 travel_result,
 * 구인 고용은 recruit_result, 건물은 facility_result, 배는 boat_result, 채집은 gather_result, 영토 비콘은 beacon_result, 가문 창설은 house_result,
 * 사업장 장부는 business_result)
 * 운영자 빠르기(기획 D-560 1246~1248, apps/server/src/world/operatorPace.ts): 전체 보기 구독(observe) 다음에는 운영자 배율 100(operator_pace)을
 * 함께 보낸다(그 답은 결과 목록에 넣지 않는다) — 배율 기본이 1이 된 뒤에도 시험은 운영자 빠르기로 유닛을 옮긴다. 운영자 모드는 연결이 끊기면 풀리고
 * 가는 길의 빠르기도 1로 돌아가므로, 전체 보기로 구독한 연결은 닫지 않고 다음 sendCommands·페이지 이동 때까지 열어 둔다(그동안 받는 메시지는 버린다)
 */
export async function sendCommands(
  page: Page,
  commands: readonly Record<string, unknown>[],
  /** 첫 요청 ID(서버는 같은 사용자·2차맵·ID 명령을 10분 동안 한 번만 한다 — 같은 명령을 다시 보낼 때는 바꾼다) */
  firstId = 9000,
): Promise<unknown[]> {
  await page.goto("/health");
  return page.evaluate(
    async ({ list, protocolVersion, baseId }) => {
      const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
      const replies: unknown[] = [];
      let done = false;
      socket.addEventListener("message", (event) => {
        if (!done && typeof event.data === "string") replies.push(JSON.parse(event.data));
      });
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const wait = (predicate: (message: unknown) => boolean): Promise<unknown> =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no reply")), 15_000);
          const check = (): void => {
            const found = replies.find(predicate);
            if (found === undefined) setTimeout(check, 20);
            else {
              clearTimeout(timer);
              resolve(found);
            }
          };
          check();
        });
      await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
      socket.send(JSON.stringify({ t: "hello", protocolVersion, clientBuild: "e2e-ws" }));
      await wait(
        (reply) => typeof reply === "object" && reply !== null && Reflect.get(reply, "t") === "welcome",
      );
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const replyTo = (id: number): Promise<unknown> =>
        wait(
          (reply) =>
            typeof reply === "object" &&
            reply !== null &&
            [
              "result",
              "travel_result",
              "recruit_result",
              "facility_result",
              "boat_result",
              "gather_result",
              "beacon_result",
              "house_result",
              "business_result",
            ].includes(String(Reflect.get(reply, "t"))) &&
            Reflect.get(reply, "id") === id,
        );
      const out: unknown[] = [];
      let observing = false;
      for (const [index, command] of list.entries()) {
        const id = baseId + index;
        socket.send(JSON.stringify({ ...command, id }));
        const reply = await replyTo(id);
        out.push(reply);
        if (
          command.t === "subscribe" &&
          command.observe === true &&
          Reflect.get(Object(reply), "ok") === true
        ) {
          observing = true;
          // 요청 ID는 연결마다 새로(같은 ID는 10분 동안 다시 하지 않는다)
          const paceId = 2_000_000_000 + ((Date.now() * 8 + index) % 100_000_000);
          socket.send(
            JSON.stringify({ t: "operator_pace", mapKey: command.mapKey, factor: 100, id: paceId }),
          );
          await replyTo(paceId);
        }
      }
      done = true;
      replies.length = 0;
      if (!observing) socket.close();
      return out;
    },
    { list: commands, protocolVersion: PROTOCOL_VERSION, baseId: firstId },
  );
}

/**
 * player 사이보그 본체가 선 2차맵. 세계 배치(docs/adr/2026-11-07-world-layout.md)로 시작 도시가 시험 2차맵 줄 밖(국가 자리)에 서므로, 임대·구인
 * 받기(같은 2차맵이어야 한다)를 시험할 시설은 그 2차맵에 놓는다. 자리를 모르거나 건너뛰는 중이면 시험 2차맵
 */
export async function cyborgMapKey(page: Page): Promise<number> {
  const key = await page.evaluate(async () => {
    const reply: unknown = await fetch("/api/trpc/world.myPosition").then((response) => response.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, name: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
    const position = pick(pick(pick(reply, "result"), "data"), "position");
    return pick(position, "hidden") === true ? undefined : pick(position, "mapKey");
  });
  return typeof key === "number" ? key : S1_TEST_MAP_KEY;
}

/** 객체 칸 읽기(모르는 모양이면 undefined) */
const pick = (value: unknown, name: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;

/** 화면 안에서 tRPC를 부른다(같은 출처 쿠키). input이 있으면 조회는 ?input=, 바꾸기는 POST 본문. 응답의 result.data(실패면 오류) */
export async function trpc(page: Page, path: string, input: unknown, mutation = false): Promise<unknown> {
  const reply = await page.evaluate(
    async ({ route, body, post }) => {
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = post
        ? await fetch(`/api/trpc/${route}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/trpc/${route}${query}`);
      return { status: response.status, json: (await response.json()) as unknown };
    },
    { route: path, body: input, post: mutation },
  );
  const data = pick(pick(reply.json, "result"), "data");
  if (reply.status !== 200 || data === undefined)
    throw new Error(`${path} failed: ${reply.status} ${JSON.stringify(reply.json).slice(0, 300)}`);
  return data;
}

/** 지금 로그인한 계정의 돈(소속 국가 화폐) 원장 자산 코드. 서버가 모르면(나라 없는 세계) 옛 공용 화폐 */
export async function myMoneyAsset(page: Page): Promise<string> {
  const holdings = await trpc(page, "economy.holdings", undefined);
  const code = pick(holdings, "homeCurrency");
  return typeof code === "string" ? `cur:${code}` : "s3_test_credit";
}

/**
 * 운영자 지급으로 그 계정(아이디)의 소유 주체에 그 주체의 돈(소속 국가 화폐) amount를 준다(부르는 계정은 admin·dev — 운영 권한 ledger_grant). 지급 뒤 잔고
 */
export async function grantCredit(page: Page, loginId: string, amount: number): Promise<bigint> {
  if (!page.url().startsWith("http")) await page.goto("/health");
  const list = await trpc(page, "ops.players.list", { search: loginId });
  const rows = pick(list, "rows");
  const row = (Array.isArray(rows) ? (rows as unknown[]) : []).find(
    (entry) => String(pick(entry, "loginId")).toLowerCase() === loginId.toLowerCase(),
  );
  const ownerId = pick(row, "ownerId");
  if (typeof ownerId !== "number") throw new Error(`no owner for ${loginId}`);
  const reason = "e2e: test units without test workers";
  const granted = await trpc(
    page,
    "ops.economy.grant",
    { ownerId, asset: ASSET_CREDIT, amount: String(amount), reason },
    true,
  );
  if (pick(granted, "ok") !== true) throw new Error(`grant failed: ${JSON.stringify(granted)}`);
  return BigInt(String(pick(granted, "balance")));
}

/** 대문자 글자 n개(가문 이름·약어 — 사람 이름 규칙에 숫자를 쓰지 않는다) */
function letters(n: number): string {
  return Array.from({ length: n }, () => String.fromCodePoint(65 + Math.floor(Math.random() * 26))).join("");
}

/**
 * 이 계정에 가문이 없으면 만든다(기획 D-565 — 유닛을 고용하려면 가문이 있어야 한다). 실제 길: 정체성 저장(tRPC factionIdentity.save, 무작위
 * 시험 이름·약어 — 겹치면 다시) → 가문 창설(WebSocket house_found, 무료). 이미 가문원이거나 창설했으면 아무것도 하지 않는다.
 * 저장한 정체성이 있으면 그것으로 창설한다. /health로 옮겨 보내므로 부른 뒤 화면을 다시 연다
 */
export async function ensureHouse(page: Page): Promise<void> {
  await page.goto("/health");
  const view = await trpc(page, "factionIdentity.house", undefined);
  if (pick(view, "house") !== null) return;
  const mine = await trpc(page, "factionIdentity.mine", undefined);
  if (pick(mine, "identity") === null) {
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
      try {
        await trpc(
          page,
          "factionIdentity.save",
          {
            name: `Testhouse${letters(4)}`,
            shortName: letters(3),
            color: "#16a085",
            emblem: { shape: "shield", division: "pale", charge: "tree", scheme: 1 },
            upload: { mode: "none" },
          },
          true,
        );
        saved = true;
      } catch {
        // 이름·약어가 겹쳤다 — 다른 글자로 다시
      }
    }
    if (!saved) throw new Error("house identity could not be saved");
  }
  const [reply] = await sendCommands(
    page,
    [{ t: "house_found", cost: "0" }],
    9500 + Math.floor(Math.random() * 400),
  );
  if (pick(reply, "ok") !== true) throw new Error(`house_found failed: ${JSON.stringify(reply)}`);
}

/**
 * 구인 카드로 휴먼 하나를 고용한다(실제 플레이어 길, recruit_hire). 그 2차맵(없으면 내 사이보그가 선 2차맵)에 있는 도시의 정부기관에서 가장 싼
 * 남은 카드를 산다 — 휴먼은 그 도시 둘레에 선다. 잔고가 모자라면 실패한다(먼저 grantCredit). 가문이 없으면 먼저 만든다(ensureHouse, D-565).
 * 고용한 유닛 ID. /health로 옮겨 보내므로 부른 뒤 화면을 다시 연다
 */
export async function hireHuman(page: Page, mapKey?: number): Promise<number> {
  await ensureHouse(page);
  await page.goto("/health");
  const target = mapKey ?? (await cyborgMapKey(page));
  const cities = pick(await trpc(page, "world.cities", undefined), "cities");
  const city = (Array.isArray(cities) ? (cities as unknown[]) : []).find(
    (entry) => pick(entry, "mapKey") === target,
  );
  const cityId = pick(city, "id");
  if (typeof cityId !== "number") throw new Error(`no city on map ${String(target)}`);
  const board = await trpc(page, "recruit.board", { cityId });
  const cards = pick(board, "cards");
  const card = (Array.isArray(cards) ? (cards as unknown[]) : [])
    .filter((entry) => pick(entry, "taken") !== true)
    .map((entry) => ({ slot: Number(pick(entry, "slot")), cost: String(pick(entry, "cost")) }))
    .toSorted((a, b) => Number(BigInt(a.cost) - BigInt(b.cost)) || a.slot - b.slot)[0];
  if (!card) throw new Error(`no recruit card left in city ${String(cityId)}`);
  const window = pick(board, "window");
  const [reply] = await sendCommands(page, [
    { t: "recruit_hire", cityId, window, slot: card.slot, cost: card.cost },
  ]);
  const unitId = pick(reply, "unitId");
  if (pick(reply, "ok") !== true || typeof unitId !== "number")
    throw new Error(`recruit_hire failed: ${JSON.stringify(reply)}`);
  return unitId;
}

/**
 * 그 2차맵(없으면 내 사이보그가 선 2차맵)의 내 휴먼 하나를 돌려준다. 없으면 구인 카드로 고용한다(hireHuman — 모자란 시험 화폐는 운영자 지급).
 * 고용은 (주인, 도시, 창)마다 카드 3~5장뿐이고 구인 시험(recruit.spec.ts)도 같은 카드를 산다 → 있는 휴먼을 먼저 쓴다.
 * /health로 옮겨 보내므로 부른 뒤 화면을 다시 연다
 */
export async function ensureHuman(page: Page, loginId: string, mapKey?: number): Promise<number> {
  await page.goto("/health");
  const target = mapKey ?? (await cyborgMapKey(page));
  const units = pick(await trpc(page, "world.mapUnits", { mapKey: target }), "units");
  const found = (Array.isArray(units) ? (units as unknown[]) : []).find(
    (unit) => pick(unit, "kind") === "human" && pick(unit, "hold") === null,
  );
  const unitId = pick(found, "unitId");
  if (typeof unitId === "number") return unitId;
  await grantCredit(page, loginId, 1_000);
  return hireHuman(page, target);
}

// 보유 물건 조작 묶음 — tRPC holdings.list 받기(사이보그·유닛 화면과 같은 규칙: 열 때·[다시 시도]·다시 보일 때 60초 넘었으면)와
// WebSocket 명령(입기·벗기·쓰기·개발 받기), 결과 알림, D-501 교체 확인 창·칸 고르기 창 상태. docs/adr/2026-11-03-item-holdings.md 4·5절.
// - 명령이 성공하면 목록을 다시 받는다(바뀐 값은 서버가 셈한다). 실패 코드는 문구로 보이고, 서버 상태를 모를 때(끊김·답 없음·없는 물건)도
//   다시 받는다. 쿨이면 다시 쓸 시각을 문구에 넣고 쿨 목록도 다시 받는다.
// - 시각은 서버 시계 기준(기기 시계 + 잰 차이, net/serverLink.ts). 효과·쿨 끝 시각이 남았을 때만 1초마다 다시 그린다.
// 지연 조각(사이보그·유닛 화면) 안에서만 쓴다.
import type { HoldingView, HoldingsListResponse } from "@terra/shared/holdings";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../net/api.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { type RosterState, useRosterQuery } from "../roster/useRosterQuery.ts";
import { formatNumber } from "../roster/rosterText.ts";
import { type ItemCommand, type ItemCommandOutcome, sendItemCommand } from "./itemCommands.ts";
import { nextDeadline } from "./holdingsModel.ts";
import { failureNeedsReload, failureText, holdingName } from "./holdingsText.ts";

const loadHoldings = (_preview: boolean, signal: AbortSignal): Promise<HoldingsListResponse> =>
  api.holdings.list.query(undefined, { signal });

/** 서버 시각(ms) */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export type HoldingsTone = "success" | "error";

export interface HoldingsNotice {
  readonly tone: HoldingsTone;
  readonly lines: readonly string[];
  /** 같은 문구가 다시 나도 읽히게 바뀌는 번호 */
  readonly version: number;
}

/** D-501 교체 확인: 이 물건을 쓰면 사라질 효과 */
export interface ReplaceRequest {
  readonly holding: HoldingView;
  readonly effects: readonly string[];
}

/** 칸 고르기 창: 유닛·칸 번호 */
export interface SlotSheetTarget {
  readonly unit: number;
  readonly index: number;
}

export interface HoldingsController {
  readonly state: RosterState<HoldingsListResponse>;
  readonly reload: () => void;
  /** 서버 시각(효과·쿨이 돌 때 1초마다) */
  readonly now: number;
  /** 답을 기다리는 물건 ID(버튼을 막는다). 받기는 -1 */
  readonly pending: number | null;
  readonly notice: HoldingsNotice | null;
  readonly equip: (holding: HoldingView, slot: number) => void;
  readonly unequip: (holding: HoldingView) => void;
  /** 쓰기(item_use). 같은 묶음의 다른 효과가 사라지면 확인 창(replace)을 연다 */
  readonly consume: (holding: HoldingView) => void;
  /** 개발 시험 받기(dev·admin). 성공하면 true */
  readonly grant: (item: string, quantity: number, unit: number | null, label: string) => Promise<boolean>;
  readonly replace: ReplaceRequest | null;
  readonly confirmReplace: () => void;
  readonly cancelReplace: () => void;
  readonly sheet: SlotSheetTarget | null;
  readonly openSlot: (target: SlotSheetTarget) => void;
  readonly closeSlot: () => void;
}

/** 효과·쿨 끝 시각이 남았으면 1초마다 서버 시각을 다시 읽는다 */
function useServerClock(data: HoldingsListResponse | null): number {
  const [now, setNow] = useState(serverNow);
  const deadline = data ? nextDeadline(data, now) : null;
  const running = deadline !== null;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

export function useHoldings(): HoldingsController {
  const query = useRosterQuery(loadHoldings, false);
  const { reload } = query;
  const data = query.state.status === "ready" ? query.state.data : null;
  const now = useServerClock(data);
  const [pending, setPending] = useState<number | null>(null);
  const [notice, setNotice] = useState<HoldingsNotice | null>(null);
  const [replace, setReplace] = useState<ReplaceRequest | null>(null);
  const [sheet, setSheet] = useState<SlotSheetTarget | null>(null);
  // 화면을 떠난 뒤 온 답은 상태를 바꾸지 않는다
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const say = useCallback((tone: HoldingsTone, line: string) => {
    setNotice((previous) => ({ tone, lines: [line], version: (previous?.version ?? 0) + 1 }));
  }, []);

  /** 명령 하나: 보내고 → 결과 알림 → 다시 받기. 성공 문구는 done이 만든다 */
  const run = useCallback(
    async (
      id: number,
      command: ItemCommand,
      done: (outcome: Extract<ItemCommandOutcome, { ok: true }>) => string,
      onFail?: (outcome: Extract<ItemCommandOutcome, { ok: false }>) => boolean,
    ): Promise<boolean> => {
      setPending(id);
      const outcome = await sendItemCommand(command);
      if (!alive.current) return outcome.ok;
      setPending(null);
      if (outcome.ok) {
        say("success", done(outcome));
        reload();
        return true;
      }
      // 부르는 쪽이 따로 다루면(교체 확인) 알림을 내지 않는다
      if (onFail?.(outcome)) return false;
      say("error", failureText(outcome.code, outcome.readyAt, serverNow()));
      if (failureNeedsReload(outcome.code) || outcome.code === "cooldown") reload();
      return false;
    },
    [reload, say],
  );

  const equip = useCallback(
    (holding: HoldingView, slot: number) => {
      void run(holding.id, { t: "item_equip", holding: holding.id, slot }, () =>
        m.holdings_done_equip({ item: holdingName(holding) }),
      ).then((ok) => {
        if (ok && alive.current) setSheet(null);
      });
    },
    [run],
  );

  const unequip = useCallback(
    (holding: HoldingView) => {
      void run(holding.id, { t: "item_unequip", holding: holding.id }, () =>
        m.holdings_done_unequip({ item: holdingName(holding) }),
      ).then((ok) => {
        if (ok && alive.current) setSheet(null);
      });
    },
    [run],
  );

  const consumeHolding = useCallback(
    (holding: HoldingView, confirm: boolean) => {
      void run(
        holding.id,
        { t: "item_use", holding: holding.id, ...(confirm ? { confirm: true } : {}) },
        (outcome) =>
          (outcome.effects ?? []).length > 0
            ? m.holdings_done_use({ item: holdingName(holding) })
            : m.holdings_done_use_missed({ item: holdingName(holding) }),
        (outcome) => {
          // 같은 묶음의 다른 효과가 사라짐(D-501) → 확인 창
          if (outcome.code !== "confirm_replace") return false;
          setReplace({ holding, effects: outcome.effects ?? [] });
          return true;
        },
      );
    },
    [run],
  );

  const grant = useCallback(
    (item: string, quantity: number, unit: number | null, label: string) =>
      run(-1, { t: "dev_grant_item", item, quantity, ...(unit === null ? {} : { unit }) }, () =>
        m.holdings_done_grant({ item: label, count: formatNumber(quantity) }),
      ),
    [run],
  );

  const confirmReplace = useCallback(() => {
    const request = replace;
    setReplace(null);
    if (request) consumeHolding(request.holding, true);
  }, [replace, consumeHolding]);

  return {
    state: query.state,
    reload,
    now,
    pending,
    notice,
    equip,
    unequip,
    consume: useCallback((holding: HoldingView) => consumeHolding(holding, false), [consumeHolding]),
    grant,
    replace,
    confirmReplace,
    cancelReplace: useCallback(() => setReplace(null), []),
    sheet,
    openSlot: useCallback((target: SlotSheetTarget) => setSheet(target), []),
    closeSlot: useCallback(() => setSheet(null), []),
  };
}

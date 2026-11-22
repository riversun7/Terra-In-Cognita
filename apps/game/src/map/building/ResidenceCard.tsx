// 건물 판 개요의 [사는 곳] 카드 — 사용자 답 D-585 1(플레이어·유닛은 집을 여럿 가질 수 있지만 사는 곳은 하나만 고른다. 그 집이 선 도시·나라의 주민이 되고 주민세·
// 신용이 그 사는 곳을 따른다). 주거 건물(생활 단계 시설) 판에서만 보인다.
// - 보내는 유닛(내 유닛)의 지금 사는 곳 한 줄(고른 집 / 숙소 배정 / 없음)과 [여기를 사는 곳으로]·[고른 것 풀기]. 고를 수 없으면 까닭 한 줄.
// - 판정은 서버(WebSocket residence_set). 자료는 tRPC gather.residence(유닛·건물이 바뀌면 다시 읽는다).
// - 바뀜(residence-3, D-591): 정원 한 줄(사는 수 / 층 × 칸, 층·최고 층), 이 유닛이 여기 살면 기간마다 미리 낼 집세·숙박비(일찍 바꾸면 남은 몫은 돌려받지
//   못한다), 여기를 골랐으면 미리 낸 기간이 남은 시간·내지 못해 쉬는 줄, 내 건물이면 주인 칸(집세 정하기·층 올리기 — ResidenceOwner.tsx).
import type { ResidenceResponse } from "@terra/shared/residence";
import { useCallback, useEffect, useId, useState } from "react";
import { fmt, formatDuration } from "../../economy/economyText.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { ResidenceOwner } from "./ResidenceOwner.tsx";
import {
  loadResidence,
  residenceBlockText,
  residenceErrorText,
  residenceLine,
  sendResidence,
} from "./residenceData.ts";

/** 서버 시각(미리 낸 기간 남은 시간 — 채집소 판과 같은 셈) */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export function ResidenceCard(props: {
  readonly buildingId: number;
  /** 보내는 내 유닛(없으면 고르라는 한 줄) */
  readonly actor: number | null;
  readonly unitLabel: (unitId: number) => string;
}) {
  const { buildingId, actor, unitLabel } = props;
  const titleId = useId();
  const [data, setData] = useState<ResidenceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  useEffect(() => {
    if (actor === null) return () => undefined;
    const controller = new AbortController();
    loadResidence(actor, buildingId, controller.signal)
      .then((response) => setData(response))
      .catch(() => undefined);
    return () => controller.abort();
  }, [actor, buildingId]);

  const reload = useCallback(() => {
    if (actor === null) return;
    loadResidence(actor, buildingId)
      .then((response) => setData(response))
      .catch(() => undefined);
  }, [actor, buildingId]);

  // 다른 유닛·건물의 옛 응답은 보이지 않는다
  const shown =
    data?.status === "ok" && data.unitId === actor && data.building?.buildingId === buildingId ? data : null;

  const send = async (target: number | null): Promise<void> => {
    if (busy || actor === null) return;
    notice.clear();
    problem.clear();
    setBusy(true);
    try {
      const outcome = await sendResidence(actor, target);
      if (outcome.ok) notice.show([outcome.buildingId === null ? m.residence_cleared() : m.residence_done()]);
      else problem.show([residenceErrorText(outcome.code)]);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const here = shown?.current?.buildingId === buildingId;
  const chosenHere = here && shown?.current?.source === "chosen";
  const block = shown?.building?.block ?? null;
  const view = shown?.building ?? null;
  const period = formatDuration(shown?.periodMs ?? 0);
  const choice = shown?.choice?.buildingId === buildingId ? shown.choice : null;
  const now = serverNow();
  const prepaid =
    choice?.paidUntilMs !== null && choice?.paidUntilMs !== undefined && choice.paidUntilMs > now;
  const pays = view?.payKind === "rent" || view?.payKind === "lodging";

  return (
    <section className="bp-card" aria-labelledby={titleId} data-part="building-residence">
      <h3 id={titleId} className="bp-card-title">
        {m.residence_title()}
      </h3>
      <p className="bp-muted">{m.residence_hint()}</p>
      {actor === null ? (
        <p className="bp-muted">{m.residence_pick_unit()}</p>
      ) : shown ? (
        <>
          <p data-part="residence-line" data-source={shown.current?.source ?? "none"}>
            {residenceLine(shown, buildingId, unitLabel(actor))}
          </p>
          {view?.floors !== undefined && view.capacity !== undefined ? (
            <p className="bp-muted" data-part="residence-capacity">
              {m.residence_capacity({
                occupants: view.occupants ?? 0,
                capacity: view.capacity,
                floors: view.floors,
                max: view.maxFloors ?? view.floors,
              })}
            </p>
          ) : null}
          {choice && prepaid ? (
            <p data-part="residence-paid">
              {m.residence_paid_until({ time: formatDuration((choice.paidUntilMs ?? now) - now) })}
            </p>
          ) : choice?.paused ? (
            <p className="bp-muted" data-part="residence-paused">
              {pays ? m.residence_unpaid() : m.residence_paused_here()}
            </p>
          ) : null}
          {pays && !chosenHere && view?.price !== null && view?.price !== undefined ? (
            <p className="bp-muted" data-part="residence-price">
              {view.payKind === "rent"
                ? m.residence_price_rent({ period, price: fmt(view.price) })
                : m.residence_price_lodging({ period, price: fmt(view.price) })}
            </p>
          ) : null}
          {block !== null && !here ? (
            <p className="bp-muted" data-part="residence-block">
              {residenceBlockText(block)}
            </p>
          ) : null}
          {block === null || chosenHere ? (
            <div className="bp-actions">
              {block === null && !chosenHere ? (
                <button
                  type="button"
                  className="button-small button-primary"
                  disabled={busy}
                  data-part="residence-choose"
                  onClick={() => void send(buildingId)}
                >
                  {m.residence_choose()}
                </button>
              ) : null}
              {chosenHere ? (
                <button
                  type="button"
                  className="button-small"
                  disabled={busy}
                  data-part="residence-clear"
                  onClick={() => void send(null)}
                >
                  {m.residence_clear()}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="bp-muted">
          {data?.status === "unknown_unit" ? m.residence_error_unit() : m.residence_loading()}
        </p>
      )}
      {view?.mine === true ? (
        <ResidenceOwner
          buildingId={buildingId}
          view={view}
          periodMs={shown?.periodMs ?? 0}
          onDone={(ok, text) => {
            notice.clear();
            problem.clear();
            (ok ? notice : problem).show([text]);
            reload();
          }}
        />
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}

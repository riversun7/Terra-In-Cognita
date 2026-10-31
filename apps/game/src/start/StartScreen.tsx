// 첫 접속 — 사이보그 만들기(기획 60 7.1·D-140·D-6039~D-6041·D-445, docs/adr/2026-11-01-first-login-cyborg.md 1절).
// 이름 → 외형 → 초기 스탯 → 세력 → 시작 도시 → 강하, 여섯 단계를 한 화면 안 상태로 넘긴다(기록 칸을 쌓지 않는다).
// - 틀이 없는 전체 화면이라 머리에 [설정]·[로그아웃]을 둔다. 사이보그가 없으면 틀이 다른 주소를 여기로 보낸다.
// - 자료(지금 굴림·성향·세력·도시)는 tRPC cyborg.creation, 이름 확인은 cyborg.nameCheck, 굴리기·만들기는 WebSocket(cyborgCommands.ts).
// - 서버가 판정한다: 굴림 값·남은 횟수, 이름 고유, 외형 ID, 세력·도시, 놓을 자리. 화면은 결과를 보이고 잘못된 단계로 돌아간다.
// - 만들면 짧은 강하 연출(움직임 줄이기면 없음) 뒤 홈으로(D-445 179). 튜토리얼은 다음 단계다(D-445 176).
// 좁은 폭(휴대폰 세로)이 기준이고, 넓은 폭은 가운데 한 열(--content-max)로 둔다. 지연 로딩 조각(shell/routeViews.tsx).
import type { AccountView } from "@terra/shared";
import {
  type CyborgAppearance,
  type CyborgCreationResponse,
  type CyborgRollView,
  DEFAULT_CYBORG_APPEARANCE,
} from "@terra/shared/cyborg";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { refreshSession, signOut } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { navigate } from "../shell/routerStore.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { text } from "../ui/text.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { markCyborgCreated } from "./cyborgGate.ts";
import { sendCyborgCommand } from "./cyborgCommands.ts";
import { LooksStep, NameStep } from "./nameLookSteps.tsx";
import { CityStep, DescentStep, FactionStep } from "./placeSteps.tsx";
import { commandErrorText } from "./startText.ts";
import { StatsStep } from "./statsStep.tsx";
import "./start.css";

export const START_STEPS = ["name", "looks", "stats", "faction", "city", "descent"] as const;
export type StartStep = (typeof START_STEPS)[number];

const STEP_TITLES = {
  name: m.start_step_name,
  looks: m.start_step_looks,
  stats: m.start_step_stats,
  faction: m.start_step_faction,
  city: m.start_step_city,
  descent: m.start_step_descent,
} satisfies Record<StartStep, () => string>;

const REQUEST_TIMEOUT_MS = 10_000;
/** 강하 연출 길이(움직임 줄이기면 0) */
const DESCENT_SCENE_MS = 1_600;

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: CyborgCreationResponse }
  | { readonly status: "error"; readonly error: PlainMessageKey };

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 고른 세력·도시가 목록에 없으면 기본(추천 세력, 그 세력의 첫 도시 = 가장 덜 붐빔) */
function pickPlace(data: CyborgCreationResponse, factionId: number | null, cityId: number | null) {
  const faction =
    data.factions.find((entry) => entry.id === factionId) ??
    data.factions.find((entry) => entry.recommended) ??
    data.factions[0];
  const city = faction?.cities.find((entry) => entry.id === cityId) ?? faction?.cities[0];
  return { faction, city };
}

export default function StartScreen({ user }: { user: AccountView }) {
  const id = useId();
  const titleRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [step, setStep] = useState<StartStep>("name");
  const [name, setName] = useState("");
  const [look, setLook] = useState<CyborgAppearance>(DEFAULT_CYBORG_APPEARANCE);
  const [roll, setRoll] = useState<CyborgRollView | null>(null);
  const [temperament, setTemperament] = useState<string>("balanced");
  const [factionId, setFactionId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [descending, setDescending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const problem = useLiveLines();
  const clearProblem = problem.clear;
  const stepHeading = useRef<HTMLHeadingElement>(null);

  // 자료 받기(처음·[다시 시도]·만들기 실패 뒤 확인). 늦게 온 앞 요청의 답은 버린다(요청 차례)
  const requestRef = useRef(0);
  const fetchData = useCallback((): void => {
    requestRef.current += 1;
    const mine = requestRef.current;
    api.cyborg.creation.query(undefined, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).then(
      (data) => {
        if (mine !== requestRef.current) return;
        setLoad({ status: "ready", data });
        if (data.roll) {
          setRoll(data.roll);
          setTemperament(data.roll.temperament);
        }
      },
      (error: unknown) => {
        if (mine !== requestRef.current) return;
        const info = apiErrorInfo(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "error", error: info.key });
      },
    );
  }, []);
  useEffect(() => {
    fetchData();
    return () => {
      requestRef.current += 1;
    };
  }, [fetchData]);

  const data = load.status === "ready" ? load.data : null;
  const place = data ? pickPlace(data, factionId, cityId) : { faction: undefined, city: undefined };

  // 이미 만든 계정(다른 기기에서 만듦 등)은 홈으로
  useEffect(() => {
    if (data?.created) navigate({ route: "home" }, { replace: true });
  }, [data?.created]);

  const index = START_STEPS.indexOf(step);
  const goTo = useCallback(
    (next: StartStep) => {
      setStep(next);
      clearProblem();
      // 단계가 바뀌면 그 단계 제목에 초점(화면 읽기 프로그램이 새 단계를 읽는다)
      requestAnimationFrame(() => stepHeading.current?.focus());
    },
    [clearProblem],
  );

  const onRoll = async (): Promise<void> => {
    const result = await sendCyborgCommand({ t: "cyborg_roll", temperament });
    if (result.ok && result.roll) {
      setRoll(result.roll);
      problem.clear();
      return;
    }
    if (!result.ok) {
      problem.show([commandErrorText(result.code)]);
      if (result.code === "already_created") fetchData();
    }
  };

  const onDescend = async (): Promise<void> => {
    if (descending || !data || !place.faction || !place.city) return;
    setDescending(true);
    problem.clear();
    const result = await sendCyborgCommand({
      t: "cyborg_create",
      name,
      appearance: look,
      factionId: place.faction.id,
      cityId: place.city.id,
    });
    if (result.ok) {
      const wait = prefersReducedMotion() ? 0 : DESCENT_SCENE_MS;
      setTimeout(() => {
        markCyborgCreated(user.id, name.trim().normalize("NFC"), look);
        navigate({ route: "home" }, { replace: true });
      }, wait);
      return;
    }
    setDescending(false);
    const code = result.code;
    problem.show([commandErrorText(code)]);
    if (code === "name_invalid" || code === "name_reserved" || code === "name_taken") goTo("name");
    else if (code === "appearance_invalid") goTo("looks");
    else if (code === "roll_required" || code === "rolls_exhausted") goTo("stats");
    else if (code === "unknown_faction") goTo("faction");
    else if (code === "unknown_city" || code === "no_room") goTo("city");
    // 서버가 받았는지 모르는 실패(끊김·시간 초과)·이미 만듦은 자료를 다시 물어 확인한다
    if (code === "offline" || code === "timeout" || code === "already_created") fetchData();
  };

  const onSignOut = async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    const ok = await signOut();
    if (!ok) {
      setSigningOut(false);
      problem.show([m.account_sign_out_failed()]);
    }
  };

  const canNext =
    step === "stats"
      ? roll !== null
      : step === "faction"
        ? place.faction !== undefined
        : step === "city"
          ? place.city !== undefined
          : true;

  return (
    <section className="start" aria-labelledby={`${id}-title`} data-step={step}>
      <header className="start-head">
        <h1 id={`${id}-title`} ref={titleRef} className="start-title" tabIndex={-1}>
          {m.start_title()}
        </h1>
        <div className="start-head-actions">
          <AppLink to={{ route: "settings" }} className="start-settings">
            {m.start_settings()}
          </AppLink>
          <button
            type="button"
            className="button-small"
            onClick={() => void onSignOut()}
            aria-disabled={signingOut}
          >
            {m.account_sign_out()}
          </button>
        </div>
      </header>
      {load.status === "loading" ? (
        <p className="status" role="status">
          {m.start_loading()}
        </p>
      ) : load.status === "error" ? (
        <div className="start-panel panel">
          <LiveMessage tone="error" lines={[m.start_load_failed(), text({ key: load.error })]} />
          <div className="form-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setLoad({ status: "loading" });
                fetchData();
              }}
            >
              {m.retry()}
            </button>
          </div>
        </div>
      ) : data ? (
        <>
          <ol className="start-progress" aria-label={m.start_progress_label()}>
            {START_STEPS.map((entry, at) => (
              <li
                key={entry}
                className="start-progress-item"
                data-state={at < index ? "done" : at === index ? "current" : "todo"}
                aria-current={at === index ? "step" : undefined}
              >
                <span className="start-progress-dot" aria-hidden="true" />
                <span className="start-progress-name">{STEP_TITLES[entry]()}</span>
              </li>
            ))}
          </ol>
          <div className="start-panel panel">
            <p className="start-step-count">
              {m.start_step_of({ current: String(index + 1), total: String(START_STEPS.length) })}
            </p>
            <h2 ref={stepHeading} className="start-step-title" tabIndex={-1}>
              {STEP_TITLES[step]()}
            </h2>
            {step === "name" ? (
              <NameStep name={name} onName={setName} onDone={() => goTo("looks")} />
            ) : step === "looks" ? (
              <LooksStep look={look} onLook={setLook} />
            ) : step === "stats" ? (
              <StatsStep
                data={data}
                roll={roll}
                temperament={temperament}
                onTemperament={setTemperament}
                onRoll={onRoll}
              />
            ) : step === "faction" ? (
              <FactionStep
                data={data}
                selected={place.faction?.id ?? null}
                onSelect={(next) => {
                  setFactionId(next);
                  setCityId(null);
                }}
              />
            ) : step === "city" && place.faction ? (
              <CityStep faction={place.faction} selected={place.city?.id ?? null} onSelect={setCityId} />
            ) : step === "descent" && place.faction && place.city && roll ? (
              <DescentStep
                name={name}
                look={look}
                roll={roll}
                faction={place.faction}
                city={place.city}
                descending={descending}
              />
            ) : null}
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
            {step === "name" ? null : (
              <div className="start-nav">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => goTo(START_STEPS[index - 1] ?? "name")}
                  disabled={descending}
                >
                  {m.start_back()}
                </button>
                {step === "descent" ? (
                  <button
                    type="button"
                    className="button-primary start-descend"
                    onClick={() => void onDescend()}
                    aria-disabled={descending}
                  >
                    {descending ? m.start_descent_sending() : m.start_descent_button()}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => goTo(START_STEPS[index + 1] ?? "descent")}
                    aria-disabled={!canNext}
                    disabled={!canNext}
                  >
                    {m.start_next()}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

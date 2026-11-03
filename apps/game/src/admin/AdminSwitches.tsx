// 운영자 시스템 제어판(Part A · Live Ops, 기획 49 N53 · D-513)
// 이전 프로젝트(AntiGravt01 /admin/manage 및 /admin/manage/system)의 KPI 요약 카드·런타임 스위치 ControlCard·운영 주의사항을
// 이 저장소의 설정 칸 실시간 덮어쓰기(api.tuning.list / save)와 연결한다.
// 설정 칸 서비스가 없는 시험 서버에서는 조용히 기본값으로 표시해 기존 관리자 계정 시험을 깨지 않는다.
import type { TuningListResponse } from "@terra/shared/tuning";
import { useEffect, useState } from "react";
import { api } from "../net/api.ts";
import { getLocale } from "../paraglide/runtime.js";
import { AppLink } from "../shell/AppLink.tsx";

interface SwitchSpec {
  readonly id: string;
  readonly defaultOn: boolean;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subKo: string;
  readonly subEn: string;
  readonly descKo: string;
  readonly descEn: string;
  readonly loopsKo: readonly string[];
  readonly loopsEn: readonly string[];
}

const SWITCH_SPECS: readonly SwitchSpec[] = [
  {
    id: "n53_gardener_waves",
    defaultOn: false,
    titleKo: "정원 세력 웨이브",
    titleEn: "Gardener Waves",
    subKo: "49 N53 · 도시 웨이브 굴림 및 공성 예고",
    subEn: "49 N53 · City wave rolls & siege notices",
    descKo:
      "테스트 단계에서는 기본 꺼짐(0)입니다. 켜면 하루 끝마다 오염된 도시에 정원 세력 웨이브가 예고·진군합니다. 꺼져 있어도 칸 오염 층은 그대로 쌓입니다.",
    descEn:
      "Off (0) by default during testing. When enabled, polluted cities roll for Gardener wave marches at end-of-day. Pollution still accumulates while off.",
    loopsKo: ["하루 끝(UTC 0시) 도시 웨이브 확률 굴림 (C15)", "8시간 예고 뒤 공성 전투 시작 (C17·C18)"],
    loopsEn: ["End-of-day city wave probability roll (C15)", "Siege battle launch after 8h notice (C17·C18)"],
  },
  {
    id: "n53_market_enabled",
    defaultOn: true,
    titleKo: "물자 거래소 주문·체결",
    titleEn: "Commodity Market Orders",
    subKo: "49 N53 · 도시 창고 기반 지정가 주문장",
    subEn: "49 N53 · City warehouse limit order book",
    descKo:
      "물자 거래소의 신규 매수·매도 주문 등록과 체결 엔진을 제어합니다. 점검이나 이상 시세 발생 시 일시정지할 수 있습니다.",
    descEn:
      "Controls new buy/sell order placement and matching on the commodity market. Pause during maintenance or market anomalies.",
    loopsKo: ["지정가 매수·매도 호가창 매칭", "체결 수수료·거래세 정산"],
    loopsEn: ["Limit order book matching", "Trade fee & tax settlement"],
  },
  {
    id: "n53_exchange_enabled",
    defaultOn: true,
    titleKo: "화폐 환전소",
    titleEn: "Currency Exchange",
    subKo: "49 N53 · 세력 화폐 간 환전 호가창",
    subEn: "49 N53 · Inter-faction currency exchange",
    descKo:
      "세력 화폐 사이의 환율 호가창과 환전 체결을 제어합니다. 특정 화폐 급변동이나 경제 점검 시 환전을 일시 멈춥니다.",
    descEn:
      "Controls inter-faction currency order books and exchange execution. Pause during currency volatility or audits.",
    loopsKo: ["세력 화폐 간 환전 주문 체결", "환전 수수료 정산"],
    loopsEn: ["Inter-faction currency order matching", "Exchange fee settlement"],
  },
  {
    id: "n53_production_enabled",
    defaultOn: true,
    titleKo: "1차·가공 생산 루프",
    titleEn: "Production Loop",
    subKo: "49 N53 · 채집·가공 시설 산출 적립",
    subEn: "49 N53 · Gathering & crafting facility output",
    descKo:
      "광산·벌목장·농장 등 1차 채집과 가공 시설의 노동 산출 적립을 제어합니다. 일시정지하면 산출 적립이 멈춥니다.",
    descEn:
      "Controls resource output accumulation across gathering and crafting facilities. Pausing halts output generation.",
    loopsKo: ["소유 주체 정산 때 노동 계약 산출 적립 (N48)", "채집 티어 추첨·진행 적립 (N43·N44)"],
    loopsEn: [
      "Labor contract output routing on settlement (N48)",
      "Gathering tier roll & progress (N43·N44)",
    ],
  },
  {
    id: "n53_npc_ai_enabled",
    defaultOn: true,
    titleKo: "NPC 세력 자율 AI",
    titleEn: "NPC Faction Autonomous AI",
    subKo: "49 N53 · 외교·전쟁·세율·구인 판단 루프",
    subEn: "49 N53 · Diplomacy, war, tax & recruitment AI",
    descKo:
      "NPC 국가가 주기적으로 수행하는 외교·전쟁 선포·강화·주식 매각·세율 조정·구인 카드 고용 판단을 제어합니다.",
    descEn:
      "Controls periodic NPC nation decisions including diplomacy, war declarations, peace, share sales, tax policy, and recruitment.",
    loopsKo: ["NPC 국가 주기 판단 (EVENT_DECIDE)", "세율 조정·행정 건물 구인 카드 고용 (D-469)"],
    loopsEn: ["Periodic NPC faction decision tick (EVENT_DECIDE)", "Tax policy & admin recruitment (D-469)"],
  },
];

export function AdminOpsPanel({ totalUsers }: { readonly totalUsers: number | null }) {
  const ko = getLocale() !== "en";
  const [tuning, setTuning] = useState<TuningListResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.tuning.list
      .query()
      .then((res) => {
        if (!cancelled) setTuning(res);
      })
      .catch(() => {
        // 설정 칸 서비스가 없는 시험 서버에서는 기본값으로만 표시한다
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valueOf = (spec: SwitchSpec): boolean => {
    const entry = tuning?.entries.find((item) => item.id === spec.id);
    if (!entry) return spec.defaultOn;
    return entry.value !== 0;
  };

  const activeCount = SWITCH_SPECS.filter((spec) => valueOf(spec)).length;
  const overrideCount = tuning ? tuning.entries.filter((item) => item.override !== null).length : 0;

  const toggleSwitch = async (spec: SwitchSpec): Promise<void> => {
    if (!tuning || busyId !== null) return;
    const currentOn = valueOf(spec);
    const nextValue = currentOn ? 0 : 1;
    setBusyId(spec.id);
    setErrorMsg(null);
    try {
      const updated = await api.tuning.save.mutate({
        expectedRevision: tuning.revision,
        changes: [{ id: spec.id, value: nextValue }],
        note: ko
          ? `운영 스위치 전환: ${spec.titleKo} → ${nextValue === 1 ? "ON" : "OFF"}`
          : `Operator switch: ${spec.titleEn} → ${nextValue === 1 ? "ON" : "OFF"}`,
      });
      setTuning(updated);
    } catch {
      setErrorMsg(
        ko
          ? "스위치 상태를 바꾸지 못했습니다. 새로고침 뒤 다시 시도해 주세요."
          : "Could not toggle the switch. Please refresh and try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleExpand = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="admin-ops">
      {/* Part A 헤더 배너 (운영 · 라이브 관리) */}
      <div className="admin-role-banner">
        <div className="admin-role-info">
          <span className="admin-part-badge">PART A · LIVE OPS &amp; MANAGEMENT</span>
          <p className="admin-role-desc">
            {ko
              ? "실시간 서버 가동 상태, 49 N53 런타임 온/오프 스위치, 플레이어 계정·권한을 관리하는 운영자 전용 콘솔입니다."
              : "Operator console for live server status, 49 N53 runtime on/off switches, and player account permissions."}
          </p>
        </div>
        <AppLink to={{ route: "dev" }} className="admin-hub-link">
          {ko ? "테스트 & 에디터 허브 (/dev) 전환 →" : "Switch to Editor & Simulator Hub (/dev) →"}
        </AppLink>
      </div>

      {/* 상단 4 KPI 요약 카드 */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">{ko ? "총 등록 계정" : "Registered Accounts"}</span>
          <strong className="admin-kpi-value">{totalUsers === null ? "—" : totalUsers}</strong>
          <span className="admin-kpi-sub">
            {ko ? "플레이어 · 개발자 · 운영자" : "Players · Devs · Admins"}
          </span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">{ko ? "시스템 가동 상태" : "System Status"}</span>
          <strong className="admin-kpi-value" data-tone="online">
            ONLINE
          </strong>
          <span className="admin-kpi-sub">{ko ? "단일 월드 실시간 루프" : "Single-world live loop"}</span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">{ko ? "활성 운영 스위치 (N53)" : "Active Switches (N53)"}</span>
          <strong className="admin-kpi-value">
            {activeCount} / {SWITCH_SPECS.length} ON
          </strong>
          <span className="admin-kpi-sub">
            {valueOf(SWITCH_SPECS[0]!)
              ? ko
                ? "정원 웨이브 켜짐"
                : "Gardener waves ON"
              : ko
                ? "정원 웨이브 꺼짐 (테스트 기본)"
                : "Gardener waves OFF (test default)"}
          </span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">{ko ? "세계 설정 판" : "World Config Revision"}</span>
          <strong className="admin-kpi-value">{tuning ? `Rev #${tuning.revision}` : "Rev #0"}</strong>
          <span className="admin-kpi-sub">
            {tuning
              ? ko
                ? `${tuning.contentVersion} · 덮어쓰기 ${overrideCount}건`
                : `${tuning.contentVersion} · ${overrideCount} overrides`
              : ko
                ? "팩 기본값"
                : "Pack defaults"}
          </span>
        </div>
      </div>

      {/* 런타임 시스템 제어 스위치 (49 N53) */}
      <div className="admin-switches-section">
        <div className="admin-section-head">
          <div>
            <h2 className="admin-subtitle">
              {ko ? "시스템 노드 & 런타임 스위치 (49 N53)" : "System Nodes & Runtime Switches (49 N53)"}
            </h2>
            <p className="admin-section-sub">
              {ko
                ? "서버 재시작 없이 주요 게임 루프를 즉시 켜거나 일시정지합니다. 바꾼 값은 DB에 저장되어 재시작 뒤에도 유지됩니다."
                : "Toggle core game loops immediately without restarting the server. Changes persist across restarts."}
            </p>
          </div>
          <AppLink to={{ route: "dev_tuning" }} className="button-small">
            {ko ? "전체 설정 칸 (/dev/tuning) →" : "All Settings (/dev/tuning) →"}
          </AppLink>
        </div>

        {errorMsg ? (
          <p role="alert" className="field-error">
            {errorMsg}
          </p>
        ) : null}

        <div className="admin-switch-grid">
          {SWITCH_SPECS.map((spec) => {
            const on = valueOf(spec);
            const isOpen = expanded.has(spec.id);
            const isBusy = busyId === spec.id;
            return (
              <article
                key={spec.id}
                className="admin-switch-card"
                data-switch-id={spec.id}
                data-state={on ? "active" : "paused"}
              >
                <div className="admin-switch-top">
                  <div className="admin-switch-title-group">
                    <div className="admin-switch-title-row">
                      <h3 className="admin-switch-title">{ko ? spec.titleKo : spec.titleEn}</h3>
                      <span className="admin-state-pill" data-state={on ? "active" : "paused"}>
                        {on ? "ACTIVE" : "PAUSED"}
                      </span>
                    </div>
                    <p className="admin-switch-sub">{ko ? spec.subKo : spec.subEn}</p>
                  </div>
                  <button
                    type="button"
                    className={on ? "button-small" : "button-small button-primary"}
                    disabled={!tuning || isBusy}
                    aria-pressed={on}
                    onClick={() => void toggleSwitch(spec)}
                  >
                    {isBusy
                      ? ko
                        ? "처리 중…"
                        : "Saving…"
                      : on
                        ? ko
                          ? "일시정지 (끄기)"
                          : "Pause (Turn Off)"
                        : ko
                          ? "재개 (켜기)"
                          : "Resume (Turn On)"}
                  </button>
                </div>

                <p className="admin-switch-desc">{ko ? spec.descKo : spec.descEn}</p>

                <div className="admin-switch-foot">
                  <button
                    type="button"
                    className="admin-detail-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleExpand(spec.id)}
                  >
                    {isOpen
                      ? ko
                        ? "▲ 작동 원리 및 제어 루프 접기"
                        : "▲ Hide affected loops"
                      : ko
                        ? "▼ 작동 원리 및 제어 루프 상세 보기"
                        : "▼ Show affected loops"}
                  </button>
                  {isOpen ? (
                    <ul className="admin-loop-list">
                      {(ko ? spec.loopsKo : spec.loopsEn).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {/* 운영자 주의사항 안내 */}
        <div className="admin-caution-box">
          <strong>{ko ? "운영자 제어 주의사항" : "Operator Control Notice"}</strong>
          <p>
            {ko
              ? "정원 세력 웨이브(n53_gardener_waves)는 테스트 중 기본 꺼짐(PAUSED) 상태입니다. 거래소·환전소·생산·NPC AI 스위치를 일시정지하면 진행 중인 주기는 안전하게 마무리되고 다음 틱부터 멈춥니다."
              : "Gardener Waves (n53_gardener_waves) is PAUSED by default during testing. Pausing Market, Exchange, Production, or NPC AI safely completes the current tick and halts subsequent cycles."}
          </p>
        </div>
      </div>
    </div>
  );
}

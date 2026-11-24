// 개발자 시안 모음(/dev/mockups) — 디자인 시안 보드와 교체 전 기존 에셋을 한곳에 보관·비교한다.
// 조각 이름 MockupsGalleryScreen-* (vite.config.ts·scripts/pwa-build.mjs DEV_ONLY_CHUNK로 미리 캐시에서 제외).
import { useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import type { SignatureIconName } from "../../ui/SignatureIcon.tsx";
import "./mockupsGallery.css";

type MockupTab = "icons";

interface IconCompareEntry {
  readonly id: SignatureIconName;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly sourceKo: string;
  readonly sourceEn: string;
  readonly changed: boolean;
}

const ICON_ENTRIES: readonly IconCompareEntry[] = [
  {
    id: "home",
    labelKo: "홈",
    labelEn: "Home",
    sourceKo: "2차 시안 1 (정면 전략판)",
    sourceEn: "R2 #1 (Front Dashboard)",
    changed: true,
  },
  {
    id: "map",
    labelKo: "2차맵",
    labelEn: "Local Map",
    sourceKo: "1차 시안 2 (홀로 전술 지도)",
    sourceEn: "R1 #2 (Holo Sector Map)",
    changed: true,
  },
  {
    id: "globe",
    labelKo: "1차맵",
    labelEn: "Planet Map",
    sourceKo: "1차 시안 4 (궤도 행성)",
    sourceEn: "R1 #4 (Orbital Exoplanet)",
    changed: true,
  },
  {
    id: "units",
    labelKo: "유닛",
    labelEn: "Units",
    sourceKo: "2차 시안 3 (순화 스쿼드)",
    sourceEn: "R2 #3 (Sleek Squad)",
    changed: true,
  },
  {
    id: "economy",
    labelKo: "경제",
    labelEn: "Economy",
    sourceKo: "2차 시안 5 (코인+상승)",
    sourceEn: "R2 #5 (Coin + Trend)",
    changed: true,
  },
  {
    id: "faction",
    labelKo: "세력",
    labelEn: "Faction",
    sourceKo: "2차 보드 2 / 1차 3 (육각 문장)",
    sourceEn: "R2 #2 / R1 #3 (Hex Crest)",
    changed: true,
  },
  {
    id: "inventory",
    labelKo: "인벤토리",
    labelEn: "Inventory",
    sourceKo: "2차 시안 3 (2×2 자원 슬롯)",
    sourceEn: "R2 #3 (2×2 Resource Grid)",
    changed: true,
  },
  {
    id: "inbox",
    labelKo: "처리할 일",
    labelEn: "Tasks",
    sourceKo: "1차 시안 1 (홀로 체크 패드)",
    sourceEn: "R1 #1 (Holo Task Pad)",
    changed: true,
  },
  {
    id: "mail",
    labelKo: "우편",
    labelEn: "Mail",
    sourceKo: "1차 시안 1 (글래스 디지털 우편)",
    sourceEn: "R1 #1 (Glass Digital Mail)",
    changed: true,
  },
  {
    id: "settings",
    labelKo: "설정",
    labelEn: "Settings",
    sourceKo: "1차 시안 2 (육각 테크 기어)",
    sourceEn: "R1 #2 (Hex Tech Gear)",
    changed: true,
  },
  {
    id: "dev",
    labelKo: "개발자",
    labelEn: "Developer",
    sourceKo: "2차 보드 2 / 1차 1 (터미널)",
    sourceEn: "R2 #2 / R1 #1 (Terminal)",
    changed: true,
  },
  {
    id: "admin",
    labelKo: "관리자",
    labelEn: "Admin",
    sourceKo: "2차 보드 1 (원테두리 제거 자물쇠)",
    sourceEn: "R2 #1 (Clean Cyber Lock)",
    changed: true,
  },
  {
    id: "ops",
    labelKo: "운영자 콘솔",
    labelEn: "Ops Console",
    sourceKo: "1차 시안 1 (텔레메트리 모니터)",
    sourceEn: "R1 #1 (Telemetry Monitor)",
    changed: true,
  },
  {
    id: "logout",
    labelKo: "로그아웃",
    labelEn: "Log out",
    sourceKo: "2차 보드 1 / 1차 2 (전원 링)",
    sourceEn: "R2 #1 / R1 #2 (Power Ring)",
    changed: true,
  },
  {
    id: "edit",
    labelKo: "메뉴 편집",
    labelEn: "Edit Menu",
    sourceKo: "1차 시안 4 (모듈 슬라이더)",
    sourceEn: "R1 #4 (Modular Sliders)",
    changed: true,
  },
  {
    id: "cyborg",
    labelKo: "사이보그",
    labelEn: "Cyborg",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
  {
    id: "city",
    labelKo: "도시 (2차맵)",
    labelEn: "City (Map)",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
  {
    id: "nearby",
    labelKo: "주변 (2차맵)",
    labelEn: "Nearby (Map)",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
  {
    id: "chat",
    labelKo: "채팅",
    labelEn: "Chat",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
  {
    id: "credit",
    labelKo: "자금 (상단 띠)",
    labelEn: "Credits (Strip)",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
  {
    id: "facility",
    labelKo: "시설 (상단 띠)",
    labelEn: "Facilities (Strip)",
    sourceKo: "기존 유지",
    sourceEn: "Kept Legacy",
    changed: false,
  },
];

interface BoardItem {
  readonly id: string;
  readonly src: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descKo: string;
  readonly descEn: string;
  readonly badge: string;
}

const ICON_BOARDS: readonly BoardItem[] = [
  {
    id: "r2-part1",
    src: "/dev/mockups/icons/board-r2-part1.png",
    titleKo: "2차 보완·신규 SF 아이콘 시안 보드 (완료분)",
    titleEn: "Round 2 Refined & New Sci-Fi Icon Board (Part 1)",
    descKo:
      "정면·고대비 가시성 강화본 — 홈·인벤토리·유닛·경제·세력(테두리)·개발자·로그아웃·관리자(원테두리 제거)",
    descEn:
      "Front-facing high-visibility pass — Home, Inventory, Units, Economy, Faction (framed), Dev, Logout, Admin (ring removed)",
    badge: "R2 · PART 1",
  },
  {
    id: "r1-main",
    src: "/dev/mockups/icons/board-r1-main.png",
    titleKo: "1차 주 메뉴 SF 아이콘 시안 보드 (8종 × 5안)",
    titleEn: "Round 1 Main Menu Sci-Fi Icon Board (8 × 5)",
    descKo: "홈 · 2차맵 · 1차맵 · 유닛 · 경제 · 세력 · 사이보그 · 인벤토리 5가지 SF 컨셉 비교",
    descEn:
      "5 sci-fi concepts each for Home, Local Map, Planet Map, Units, Economy, Faction, Cyborg, and Inventory",
    badge: "R1 · MAIN",
  },
  {
    id: "r1-system",
    src: "/dev/mockups/icons/board-r1-system.png",
    titleKo: "1차 시스템·하단 메뉴 SF 아이콘 시안 보드 (8종 × 5안)",
    titleEn: "Round 1 System & Footer Sci-Fi Icon Board (8 × 5)",
    descKo:
      "처리할 일 · 우편 · 설정 · 개발자 · 관리자 · 운영자 콘솔 · 로그아웃 · 메뉴 편집 5가지 SF 컨셉 비교",
    descEn:
      "5 sci-fi concepts each for Tasks, Mail, Settings, Developer, Admin, Ops Console, Logout, and Edit Menu",
    badge: "R1 · SYSTEM",
  },
];

export default function MockupsGalleryScreen({ initialTab }: { readonly initialTab?: string | undefined }) {
  const ko = getLocale() !== "en";
  const [tab, setTab] = useState<MockupTab>(initialTab === "icons" ? "icons" : "icons");
  const [zoomBoard, setZoomBoard] = useState<BoardItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (zoomBoard !== null && !dialog.open) dialog.showModal();
    if (zoomBoard === null && dialog.open) dialog.close();
  }, [zoomBoard]);

  return (
    <section className="screen screen-wide mockups-screen" aria-labelledby="mockups-title">
      <div className="screen-header">
        <div>
          <h1 id="mockups-title" className="screen-title" tabIndex={-1}>
            {m.shell_route_dev_mockups()}
          </h1>
          <p className="lead">{m.dev_mockups_lead()}</p>
        </div>
        <BackButton />
      </div>

      <div className="mockups-tabs" role="tablist" aria-label={m.dev_mockups_tabs_label()}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "icons"}
          className="mockups-tab"
          onClick={() => setTab("icons")}
        >
          {m.dev_mockups_tab_icons()}
        </button>
      </div>

      {tab === "icons" ? (
        <div className="mockups-body">
          {/* 1. 저장된 시안 보드 3장 */}
          <section className="panel mockups-section" aria-labelledby="mockups-boards-title">
            <div className="mockups-section-head">
              <h2 id="mockups-boards-title" className="section-title">
                {m.dev_mockups_boards_title()}
              </h2>
              <p className="field-hint">{m.dev_mockups_boards_hint()}</p>
            </div>
            <div className="mockups-boards">
              {ICON_BOARDS.map((board) => (
                <article key={board.id} className="mockups-board-card">
                  <div className="mockups-board-head">
                    <div>
                      <span className="mockups-badge">{board.badge}</span>
                      <h3 className="mockups-board-title">{ko ? board.titleKo : board.titleEn}</h3>
                      <p className="mockups-board-desc">{ko ? board.descKo : board.descEn}</p>
                    </div>
                    <button type="button" className="button-small" onClick={() => setZoomBoard(board)}>
                      {m.dev_mockups_zoom()}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="mockups-board-preview"
                    onClick={() => setZoomBoard(board)}
                    aria-label={ko ? `${board.titleKo} 크게 보기` : `Inspect ${board.titleEn}`}
                  >
                    <img src={board.src} alt={ko ? board.titleKo : board.titleEn} loading="lazy" />
                  </button>
                </article>
              ))}
            </div>
          </section>

          {/* 2. 현재 적용 아이콘 vs 기존(레거시) 보관 아이콘 비교 */}
          <section className="panel mockups-section" aria-labelledby="mockups-compare-title">
            <div className="mockups-section-head">
              <h2 id="mockups-compare-title" className="section-title">
                {m.dev_mockups_compare_title()}
              </h2>
              <p className="field-hint">{m.dev_mockups_compare_hint()}</p>
            </div>
            <div className="mockups-icon-grid">
              {ICON_ENTRIES.map((entry) => (
                <div
                  key={entry.id}
                  className="mockups-icon-card"
                  data-changed={entry.changed ? "true" : "false"}
                >
                  <div className="mockups-icon-card-head">
                    <strong className="mockups-icon-name">{ko ? entry.labelKo : entry.labelEn}</strong>
                    <code className="mockups-icon-id">{entry.id}</code>
                  </div>
                  <div className="mockups-icon-pair">
                    <figure className="mockups-icon-slot" data-kind="current">
                      <img src={`/icons/nav/${entry.id}.png`} alt="" width={48} height={48} loading="lazy" />
                      <figcaption>{m.dev_mockups_current()}</figcaption>
                    </figure>
                    <span className="mockups-icon-arrow" aria-hidden="true">
                      ←
                    </span>
                    <figure className="mockups-icon-slot" data-kind="legacy">
                      <img
                        src={`/dev/mockups/icons/legacy/${entry.id}.png`}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                      />
                      <figcaption>{m.dev_mockups_legacy()}</figcaption>
                    </figure>
                  </div>
                  <p className="mockups-icon-source">{ko ? entry.sourceKo : entry.sourceEn}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* 시안 보드 확대 라이트박스 */}
      <dialog
        ref={dialogRef}
        className="mockups-lightbox"
        aria-label={zoomBoard ? (ko ? zoomBoard.titleKo : zoomBoard.titleEn) : m.dev_mockups_zoom()}
        onClose={() => setZoomBoard(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setZoomBoard(null);
        }}
      >
        {zoomBoard ? (
          <div className="mockups-lightbox-inner">
            <div className="mockups-lightbox-head">
              <div>
                <span className="mockups-badge">{zoomBoard.badge}</span>
                <strong className="mockups-lightbox-title">
                  {ko ? zoomBoard.titleKo : zoomBoard.titleEn}
                </strong>
              </div>
              <button type="button" className="button-small" onClick={() => setZoomBoard(null)}>
                {m.dev_mockups_close()}
              </button>
            </div>
            <div className="mockups-lightbox-stage">
              <img src={zoomBoard.src} alt={ko ? zoomBoard.titleKo : zoomBoard.titleEn} />
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

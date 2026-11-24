// 건물 테크트리용 아이소메트릭 건물 썸네일·분류 아이콘·소형 UI 아이콘 — 테마 토큰(currentColor·var(--…))만 쓴다.
import type { FacilityJson } from "@terra/shared/buildingEditor";
import { defaultModelOf } from "./buildingLookText.ts";
import type { TechTreeColumnId } from "./buildingTechTree.ts";

/** 분류 필터 알약용 14px 선 아이콘 */
export function ColumnIcon({ col }: { col: TechTreeColumnId | "all" }) {
  return (
    <svg viewBox="0 0 16 16" className="btt-ico" aria-hidden="true">
      {col === "all" ? (
        <path
          d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z"
          fill="currentColor"
        />
      ) : col === "gathering" ? (
        <path
          d="M8 2.2c2.8 1.5 4.2 4 3.5 6.8-.5 2-2 3.2-3.5 3.8-1.5-.6-3-1.8-3.5-3.8C3.8 6.2 5.2 3.7 8 2.2Zm0 3.3v8.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : col === "process" ? (
        <path
          d="M8 2.2 10 4l2.5-.5.5 2.5L14.8 8 13 10l-.5 2.5-2.5-.5L8 13.8 6 12l-2.5.5L3 10 1.2 8 3 6l.5-2.5L6 4 8 2.2Zm0 3.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ) : col === "manufacture" ? (
        <path
          d="M3 13 8.8 7.2M6.8 3.2l2.6 2.6-1.4 1.4-2.6-2.6 1.4-1.4Zm2.4 2.4 3.6-2.4-1.2 3.6-2.4-1.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : col === "storage" ? (
        <path
          d="M8 2 13.5 5v6L8 14l-5.5-3V5L8 2Zm0 6 5.5-3M8 8v6M8 8 2.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ) : col === "housing" ? (
        <path
          d="M2.5 7.5 8 2.8l5.5 4.7v5.7h-4v-3.5h-3v3.5h-4V7.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ) : col === "administration" ? (
        <path
          d="M2.2 6.2 8 2.6l5.8 3.6H2.2Zm1.5 1.3v4.5M6.6 7.5v4.5M9.4 7.5v4.5M12.3 7.5v4.5M2 13.2h12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : col === "commerce" ? (
        <path
          d="M8 2.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6ZM6.3 9.7c.4.4 1 .6 1.7.6 1 0 1.7-.5 1.7-1.2 0-.8-.7-1-1.7-1.2-1-.2-1.7-.5-1.7-1.2 0-.7.7-1.2 1.7-1.2.7 0 1.2.2 1.6.5M8 4.4v7.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      ) : col === "public" ? (
        <path
          d="M6.2 2.5h3.6M7 2.5v3.2L3.8 12a1.2 1.2 0 0 0 1.1 1.7h6.2a1.2 1.2 0 0 0 1.1-1.7L9 5.7V2.5M5.3 9.5h5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : col === "transport" ? (
        <path
          d="M8 2.5v7M5 5.2h6M3 10.5c1.2 2 3.2 3 5 3s3.8-1 5-3M3.5 10.5H5m6 0h1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M8 2.2 13 4.2v3.6c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V4.2L8 2.2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** 카드 썸네일용 아이소메트릭 건물 일러스트(모델·분류별 실루엣, 0ms 즉시 렌더) */
export function BuildingIsoThumb({
  entry,
  column,
  className,
}: {
  entry: FacilityJson;
  column: TechTreeColumnId;
  className?: string | undefined;
}) {
  const model = entry.look?.model ?? defaultModelOf(entry.id);
  const kind =
    model === "government" || column === "administration"
      ? "gov"
      : model === "warehouse" ||
          model === "grand_warehouse" ||
          model === "storehouse" ||
          model === "stockpile" ||
          model === "logistics" ||
          column === "storage"
        ? "storage"
        : model === "temple"
          ? "temple"
          : model === "lab" || model === "hospital" || column === "public"
            ? "lab"
            : model === "goods_exchange" ||
                model === "fx_exchange" ||
                model === "unit_exchange" ||
                model === "stock_exchange" ||
                column === "commerce"
              ? "commerce"
              : model === "shipyard" || model === "dock" || column === "transport"
                ? "harbor"
                : model === "wall" || model === "beacon" || column === "military"
                  ? "military"
                  : model === "smelter" || model === "kiln" || model === "sawmill" || column === "process"
                    ? "factory"
                    : model === "workshop" || model === "kitchen" || column === "manufacture"
                      ? "workshop"
                      : model === "lodging" || model === "house" || column === "housing"
                        ? "house"
                        : "gather";

  return (
    <svg viewBox="0 0 48 48" className={className ?? "btt-iso-svg"} aria-hidden="true">
      {/* 아이소메트릭 바닥 그리드 판 */}
      <polygon points="24,41 6,32 24,23 42,32" className="btt-iso-base" />
      {kind === "gov" ? (
        <>
          <polygon points="24,13 10,20 24,27 38,20" className="btt-iso-roof" />
          <polygon points="10,20 24,27 24,37 10,30" className="btt-iso-left" />
          <polygon points="38,20 24,27 24,37 38,30" className="btt-iso-right" />
          <polygon points="24,7 17,11 24,15 31,11" className="btt-iso-accent" />
          <path d="M14 23v8M18 25v8M29 25v8M33 23v8" className="btt-iso-line" />
        </>
      ) : kind === "storage" ? (
        <>
          <polygon points="24,14 9,21 24,28 39,21" className="btt-iso-roof" />
          <polygon points="9,21 24,28 24,37 9,30" className="btt-iso-left" />
          <polygon points="39,21 24,28 24,37 39,30" className="btt-iso-right" />
          <polygon points="14,26 20,29 20,35 14,32" className="btt-iso-accent" />
          <path d="M14 18.5 29 25.5M19 16.2 34 23.2" className="btt-iso-line" />
        </>
      ) : kind === "commerce" ? (
        <>
          <polygon points="24,10 12,16 24,22 36,16" className="btt-iso-accent" />
          <polygon points="12,16 24,22 24,37 12,31" className="btt-iso-left" />
          <polygon points="36,16 24,22 24,37 36,31" className="btt-iso-right" />
          <path d="M15 21l6 3M15 25l6 3M27 24l6-3M27 28l6-3" className="btt-iso-line" />
        </>
      ) : kind === "temple" ? (
        <>
          <polygon points="24,6 15,20 24,25 33,20" className="btt-iso-accent" />
          <polygon points="13,21 24,27 24,37 13,31" className="btt-iso-left" />
          <polygon points="35,21 24,27 24,37 35,31" className="btt-iso-right" />
          <line x1="24" y1="6" x2="24" y2="25" className="btt-iso-line" />
        </>
      ) : kind === "lab" ? (
        <>
          <polygon points="11,22 24,29 24,37 11,30" className="btt-iso-left" />
          <polygon points="37,22 24,29 24,37 37,30" className="btt-iso-right" />
          <polygon points="24,16 11,22 24,29 37,22" className="btt-iso-roof" />
          <ellipse cx="24" cy="18" rx="8" ry="6" className="btt-iso-accent" />
        </>
      ) : kind === "factory" ? (
        <>
          <polygon points="24,16 10,23 24,30 38,23" className="btt-iso-roof" />
          <polygon points="10,23 24,30 24,37 10,30" className="btt-iso-left" />
          <polygon points="38,23 24,30 24,37 38,30" className="btt-iso-right" />
          <rect x="28" y="8" width="5" height="13" rx="1" className="btt-iso-accent" />
          <rect x="19" y="11" width="4" height="9" rx="1" className="btt-iso-left" />
        </>
      ) : kind === "workshop" ? (
        <>
          <polygon points="24,13 11,20 24,27 37,20" className="btt-iso-accent" />
          <polygon points="11,20 24,27 24,37 11,30" className="btt-iso-left" />
          <polygon points="37,20 24,27 24,37 37,30" className="btt-iso-right" />
          <polygon points="28,27 33,24.5 33,32 28,34.5" className="btt-iso-roof" />
        </>
      ) : kind === "harbor" ? (
        <>
          <polygon points="24,26 8,33 24,40 40,33" className="btt-iso-accent" />
          <polygon points="12,18 24,24 24,32 12,26" className="btt-iso-left" />
          <polygon points="34,19 24,24 24,32 34,27" className="btt-iso-right" />
          <path d="M24 22V9l9 5-9 3" className="btt-iso-line" />
        </>
      ) : kind === "military" ? (
        <>
          <polygon points="24,10 14,15 24,20 34,15" className="btt-iso-accent" />
          <polygon points="14,15 24,20 24,36 14,31" className="btt-iso-left" />
          <polygon points="34,15 24,20 24,36 34,31" className="btt-iso-right" />
          <path d="M24 20v16M18 17v4M30 17v4" className="btt-iso-line" />
        </>
      ) : kind === "house" ? (
        <>
          <polygon points="24,11 11,20 24,27 37,20" className="btt-iso-accent" />
          <polygon points="12,20 24,27 24,37 12,30" className="btt-iso-left" />
          <polygon points="36,20 24,27 24,37 36,30" className="btt-iso-right" />
          <polygon points="27,28 31,26 31,34 27,36" className="btt-iso-roof" />
        </>
      ) : (
        <>
          <polygon points="24,15 11,22 24,29 37,22" className="btt-iso-roof" />
          <polygon points="11,22 24,29 24,37 11,30" className="btt-iso-left" />
          <polygon points="37,22 24,29 24,37 37,30" className="btt-iso-right" />
          <circle cx="17" cy="19" r="4" className="btt-iso-accent" />
          <circle cx="29" cy="17" r="3" className="btt-iso-accent" />
        </>
      )}
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="btt-mini-ico" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.8V8l2.4 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="btt-mini-ico" aria-hidden="true">
      <circle cx="7.2" cy="7.2" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.8 10.8 2.9 2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="btt-mini-ico" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M8 7.2v3.6M8 4.9h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

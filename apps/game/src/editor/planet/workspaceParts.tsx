// 편집 화면 조각 — 머리 줄 틀, 진행 칩 문구, 행성 바이옴 순서. EditorWorkspace.tsx가 쓴다(파일 크기를 나눈 것).
import type { ReactNode } from "react";
import { m } from "../../paraglide/messages.js";
import type { DraftEntry } from "./editorModel.ts";
import type { PreviewStage } from "./previewProtocol.ts";
import type { PreviewDefinition, PreviewSnapshot } from "./previewTypes.ts";

/** 정의 조회의 행성 하나에서 쓰는 것 */
export interface EditorPlanet {
  readonly id: string;
  readonly entry: DraftEntry;
  readonly definitionHash: string;
  readonly check: { readonly faceLevel: number; readonly hash: string };
}

export interface EditorDefinitions {
  readonly contentVersion: string;
  readonly generatorVersion: number;
  readonly planets: readonly EditorPlanet[];
  readonly biomes: readonly unknown[];
}

/** 일 단계 차례(진행 칩의 n/전체) */
const STAGES: readonly PreviewStage[] = [
  "grid",
  "tectonics",
  "seaLevel",
  "flowDirections",
  "climate",
  "erosion",
  "hydrology",
  "surface",
  "hash",
  "summary",
  "levels",
];

/** 지금 도는 일 한 줄(본 줄 먼저). 없으면 null */
export function runningText(snapshot: PreviewSnapshot): string | null {
  const running = snapshot.lanes.final.running ?? snapshot.lanes.quick.running;
  if (!running) return null;
  const step = running.stage === null ? 0 : STAGES.indexOf(running.stage) + 1;
  return m.planet_editor_job_running({
    level: String(running.level),
    role: running.role === "draft" ? m.planet_editor_role_draft() : m.planet_editor_role_base(),
    step: String(step),
    total: String(STAGES.length),
  });
}

export function definitionOf(entry: DraftEntry, biomes: readonly unknown[]): PreviewDefinition {
  return { entry, biomes };
}

/** 행성 biomes 순서(= 결과 바이옴 번호)의 바이옴 항목들. 없는 ID는 그 ID만 든 자리 */
export function biomesInPlanetOrder(entry: DraftEntry, biomes: readonly unknown[]): unknown[] {
  const refs: readonly unknown[] = Array.isArray(entry.biomes) ? entry.biomes : [];
  return refs.map((ref) => {
    const found = biomes.find(
      (biome) => typeof biome === "object" && biome !== null && Reflect.get(biome, "id") === ref,
    );
    return found ?? { id: ref };
  });
}

/** 머리 줄 + 본문 틀(세션 전에도 같은 모양). save가 있으면 저장 상태 칩과 [저장] 단추를 단다 */
export function Frame({
  heading,
  onBack,
  save,
  children,
}: {
  heading: ReactNode;
  onBack: () => void;
  save: {
    readonly text: string;
    readonly status: string;
    readonly canSave: boolean;
    readonly onSave: () => void;
  } | null;
  children: ReactNode;
}) {
  return (
    <>
      <header className="pe-header">
        <button type="button" className="button-small pe-back" onClick={onBack}>
          {m.planet_editor_back()}
        </button>
        {heading}
        {save ? (
          <div className="pe-save-group">
            <span className="pe-chip pe-save-chip" data-save-status={save.status} role="status">
              {save.text}
            </span>
            <button
              type="button"
              className="button-small button-primary pe-save"
              aria-disabled={!save.canSave}
              onClick={() => {
                if (save.canSave) save.onSave();
              }}
            >
              {m.planet_editor_library_save()}
            </button>
          </div>
        ) : null}
      </header>
      {children}
    </>
  );
}

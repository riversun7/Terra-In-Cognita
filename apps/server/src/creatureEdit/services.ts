// 크리처 편집기 요청 처리(tRPC creatures.*) — 권한(tuning:read·write 두 겹)과 속도 제한은 라우터가 먼저 본다.
// 스킬·아이템·건물 편집기와 같은 덮어쓰기 층(ContentEditShared: 판·차례·감사·켤 때 고르기)을 쓴다.
// - 분류 트리(creature_classes)도 같은 묶음으로 고친다(put_class·revert_class): 분류를 만들고 크리쳐를 그리로 옮기는 일이 한 번에 든다.
// - list: 크리처(실효·팩·덮어쓰기·해시), 분류 트리, 고르기 창(아이템·스킬·유닛 종류·이미지·3D 모델 파일 목록), 은퇴 ID, 잠든 줄, 판.
// - check: 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다(저장하지 않음).
// - save: baseHash 묶음(새 항목 만들기·고치기·끄기·되돌리기·잠든 줄 버리기).
// - history: 감사 기록 요약 가운데 크리처 줄이 든 것.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  CREATURE_LIMITS,
  type CreatureEditorChange,
  type CreatureEditorCheckResponse,
  type CreatureEditorHistoryRow,
  type CreatureEditorListResponse,
} from "@terra/shared/creatureEditor";
import { normalizeTuningNote } from "@terra/shared/tuning";
import { issueView } from "../contentEdit/core.ts";
import { type ContentEditShared, applyContentBatch } from "../contentEdit/services.ts";
import type { ContentPut } from "../contentEdit/state.ts";
import { readContentHistory } from "../contentEdit/store.ts";
import type { Database } from "../db/client.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import {
  creatureClassViews,
  creatureItemOptions,
  creatureSkillOptions,
  creatureUnitKindOptions,
  creatureViews,
} from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared CREATURE_EDITOR_REASONS) */
export const CREATURE_EDITOR_REJECTED = "CREATURE_EDITOR_REJECTED";

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", CREATURE_EDITOR_REJECTED, reason, details);

export interface CreatureEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly CreatureEditorChange[];
  readonly note?: string | null | undefined;
}

export interface CreatureEditorServices {
  list(): Promise<CreatureEditorListResponse>;
  check(changes: readonly CreatureEditorChange[]): Promise<CreatureEditorCheckResponse>;
  save(viewer: Viewer, input: CreatureEditorSaveInput): Promise<CreatureEditorListResponse>;
  history(): Promise<{ rows: CreatureEditorHistoryRow[] }>;
}

const IMAGE_FILE_RE = /\.(webp|png|jpg|jpeg|avif|gif|svg)$/i;
const DEFAULT_CREATURE_IMAGE_DIRS = [
  fileURLToPath(new URL("../../../game/public/creatures", import.meta.url)),
  fileURLToPath(new URL("../../../game/dist/creatures", import.meta.url)),
];

const MODEL_FILE_RE = /\.(glb|gltf)$/i;

/** 정적 폴더(public·dist의 creatures/<sub>)에서 pattern에 맞는 파일 이름 + 이미 참조된 파일 이름 */
function listCreatureFiles(sub: string, pattern: RegExp, referenced: Iterable<string | undefined>): string[] {
  const names = new Set<string>();
  for (const base of DEFAULT_CREATURE_IMAGE_DIRS) {
    const dir = sub === "" ? base : `${base}/${sub}`;
    try {
      for (const file of fs.readdirSync(dir)) {
        if (pattern.test(file)) names.add(file);
      }
    } catch {
      // 정적 이미지 폴더가 없는 환경(단위 시험 등)에서는 참조된 파일 이름만 돌려준다
    }
  }
  for (const img of referenced) {
    if (img && !img.includes("/")) names.add(img);
  }
  return [...names].toSorted();
}

/** 크리쳐·분류 트리 파일(creatures.json·creature_classes.json)의 문제만 */
const creatureIssue = (issue: ContentIssueView): boolean =>
  issue.file === null || issue.file.startsWith("creature");

function putsOf(changes: readonly CreatureEditorChange[]): {
  puts: ContentPut[];
  discard: { category: "creatures"; id: string }[];
} {
  const puts: ContentPut[] = [];
  const discard: { category: "creatures"; id: string }[] = [];
  for (const change of changes) {
    if (change.op === "discard_sleeping") {
      discard.push({ category: "creatures", id: change.id });
      continue;
    }
    if (change.op === "put_class") {
      puts.push({
        category: "creature_classes",
        id: change.entry.id,
        entry: Object.fromEntries(Object.entries(change.entry)),
        baseHash: change.baseHash,
      });
      continue;
    }
    if (change.op === "revert_class") {
      puts.push({ category: "creature_classes", id: change.id, entry: null, baseHash: change.baseHash });
      continue;
    }
    if (change.op === "revert") {
      puts.push({ category: "creatures", id: change.id, entry: null, baseHash: change.baseHash });
      continue;
    }
    puts.push({
      category: "creatures",
      id: change.entry.id,
      entry: Object.fromEntries(Object.entries(change.entry)),
      baseHash: change.baseHash,
    });
  }
  if (puts.length > CREATURE_LIMITS.changesMax) throw rejected("invalid_entry", ["changes"]);
  return { puts, discard };
}

export function createCreatureEditorServices(deps: {
  db: Database;
  shared: ContentEditShared;
  ip: string | null;
}): CreatureEditorServices {
  const { db, shared } = deps;
  const { state } = shared;

  const list = (): Promise<CreatureEditorListResponse> => {
    const snapshot = state.snapshot();
    const { effective } = snapshot;
    const availableImages = listCreatureFiles(
      "",
      IMAGE_FILE_RE,
      effective.creatures.map((entry) => entry.image),
    );
    const availableModels = listCreatureFiles(
      "models",
      MODEL_FILE_RE,
      effective.creatures.map((entry) => entry.model),
    );
    return Promise.resolve({
      contentVersion: shared.pack.contentVersion,
      revision: snapshot.revision,
      creatures: creatureViews(state, snapshot),
      classes: creatureClassViews(state, snapshot),
      retiredClasses: state.retiredIds("creature_classes"),
      items: creatureItemOptions(effective.items),
      skills: creatureSkillOptions(effective.skills),
      unitKinds: creatureUnitKindOptions(effective.unitKinds),
      availableImages,
      availableModels,
      retired: state.retiredIds("creatures"),
      sleeping: state.sleepingRows().filter((row) => row.category === "creatures"),
    });
  };

  return {
    list,

    check(changes) {
      const { puts } = putsOf(changes);
      const plan = state.plan(puts);
      if (!plan.ok) {
        const issues: ContentIssueView[] =
          plan.issues.length > 0
            ? plan.issues.filter(creatureIssue)
            : [
                {
                  level: "error",
                  file: null,
                  id: plan.id,
                  path: null,
                  code: plan.reason,
                  params: { details: plan.details.join(", ") },
                  message: plan.reason,
                },
              ];
        return Promise.resolve({ ok: false, issues: issues.length > 0 ? issues : plan.issues });
      }
      return Promise.resolve({ ok: true, issues: plan.warnings.map(issueView).filter(creatureIssue) });
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const { puts, discard } = putsOf(input.changes);
      await applyContentBatch(
        { db, shared, ip: deps.ip },
        viewer,
        { expectedRevision: input.expectedRevision, puts, discard, note },
        CREATURE_EDITOR_REJECTED,
      );
      return list();
    },

    async history() {
      const rows = await readContentHistory(db, CREATURE_LIMITS.historyLimit, { category: "creatures" });
      return { rows };
    },
  };
}

// 편집기 2차맵 미리보기 붙이기 — 칸 정보창의 [2차맵 미리보기] 단추와 창(ADR 2026-10-31-second-map-from-planet 9절, ADR 38 D6a).
// EditorWorkspace.tsx가 부른다(파일 크기를 나눈 것).
// - 2차맵은 행성 진짜 면 레벨(정의의 faceLevel, F9까지)의 칸 하나다: 지구본이 F7 미리보기여도 2차맵은 F9 칸으로 만든다.
// - 워커 손잡이는 편집 화면이 하나 들고 있다(같은 행성이면 행성 값을 다시 쓴다). 화면을 떠나면 버린다.
// - 들고 있지 않은 행성이 F9 이상이면 F9 미리보기와 같은 확인 창을 먼저 띄운다(ADR 38 4절, 시간·메모리).
// - 꺼짐 감지가 이 기기의 레벨 상한을 낮췄으면(crashSentinel) 그보다 높은 행성은 막는다.
// - 엔진 렌더러는 앱에 하나다(sharedRenderer.ts: 빌려 가면 앞 쪽 캔버스가 떼어진다). 그래서 창이 열린 동안(open) 편집 화면은
//   지구본 엔진을 내리고, 닫으면 같은 보기로 다시 만든다(EditorGlobe의 보기 넘기기).
import { type ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import { cellAtLatLon } from "./cellReport.ts";
import type { LatLon } from "./flatMapRender.ts";
import { previewInput } from "./previewController.ts";
import { previewKey } from "./previewJobs.ts";
import type { PreviewDefinition } from "./previewTypes.ts";
import { type SecondMapJob, createSecondMapPreviewClient } from "../../map/secondMapBuildClient.ts";

const SecondMapPreview = lazy(() => import("./planetEditorSecondMap.ts"));

/** 칸 정보창 단추에 넘기는 것 */
export interface SecondMapOpener {
  /** 2차맵을 만드는 행성 면 레벨 */
  readonly level: number;
  /** 이 기기에서 그 레벨을 만들 수 없음(꺼짐 감지) */
  readonly blocked: boolean;
  readonly onOpen: () => void;
}

export interface SecondMapPreviewArgs {
  /** 지금 보이는 쪽(초안·공개본)의 행성 항목과 팩 바이옴 항목들 */
  readonly entry: unknown;
  readonly biomes: readonly unknown[];
  readonly picked: LatLon | null;
  /** 콘텐츠 map_props 원본 항목 */
  readonly mapProps: readonly unknown[];
  readonly deviceCap: number | null;
  readonly confirmHeavy: (level: number, run: () => void) => void;
}

interface OpenJob {
  readonly seq: number;
  readonly job: SecondMapJob;
  readonly level: number;
}

/** 정의의 행성 입력(진짜 면 레벨). 생성기가 받지 않는 정의면 null(단추를 숨긴다: 미리보기도 rejected다) */
function planetJobBase(
  definition: PreviewDefinition,
): { input: PlanetGeneratorInput; planetKey: string } | null {
  const level: unknown =
    typeof definition.entry === "object" && definition.entry !== null
      ? Reflect.get(definition.entry, "faceLevel")
      : undefined;
  if (typeof level !== "number") return null;
  try {
    const input = previewInput(definition, level);
    return { input, planetKey: previewKey(input) };
  } catch {
    return null;
  }
}

export function useSecondMapPreview(args: SecondMapPreviewArgs): {
  opener: SecondMapOpener | null;
  dialog: ReactNode;
  /** 창이 열려 있음(그동안 지구본 엔진을 내린다) */
  open: boolean;
} {
  const { entry, biomes, picked, mapProps, deviceCap, confirmHeavy } = args;
  const [client] = useState(() => createSecondMapPreviewClient());
  const [open, setOpen] = useState<OpenJob | null>(null);
  const seqRef = useRef(0);
  useEffect(() => () => client.dispose(), [client]);
  const base = useMemo(() => planetJobBase({ entry, biomes }), [entry, biomes]);

  let opener: SecondMapOpener | null = null;
  if (base && picked) {
    const level = base.input.faceLevel;
    const job: SecondMapJob = {
      ...base,
      mapKey: cellAtLatLon(level, picked.latDeg, picked.lonDeg).key,
      props: mapProps,
    };
    opener = {
      level,
      blocked: deviceCap !== null && level > deviceCap,
      onOpen: () => {
        const run = (): void => {
          seqRef.current += 1;
          setOpen({ seq: seqRef.current, job, level });
        };
        if (client.hasPlanet(job.planetKey)) run();
        else confirmHeavy(level, run);
      },
    };
  }
  const dialog = open ? (
    <Suspense fallback={null}>
      <SecondMapPreview
        key={open.seq}
        client={client}
        job={open.job}
        level={open.level}
        onClose={() => setOpen(null)}
      />
    </Suspense>
  ) : null;
  return { opener, dialog, open: open !== null };
}

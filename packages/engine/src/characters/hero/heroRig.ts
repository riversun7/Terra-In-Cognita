// 게임형 3D 캐릭터(V2) 계층형 관절 리깅 & 파츠 조형 — 5.3등신 스타일리시 SF 액션 비율.
// 기존 CharacterLook(v2)의 모든 부위(head 8·face 8·top 13·torso 8·arms 5·legs 5·back 8·extra 8·plating 0~3·build 4·height)를 100% 호환한다.
// 단순 6각 로우폴리 상자 대신 매끄러운 캡슐·구체·테이퍼 실린더·곡면 바이저·다층 갑주와 실제 무릎/팔꿈치/목/망토/날개 피벗을 조립한다.
import type { CharacterLook } from "@terra/shared/characterLook";
import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { type HeroMaterialSet, createHeroMaterials } from "./heroMaterials.ts";

export type HeroPoseId = "idle" | "combat" | "walk" | "inspect";

export interface HeroRig {
  readonly root: Group;
  readonly pelvis: Group;
  readonly torso: Group;
  readonly head: Group;
  readonly shoulderL: Group;
  readonly shoulderR: Group;
  readonly elbowL: Group;
  readonly elbowR: Group;
  readonly hipL: Group;
  readonly hipR: Group;
  readonly kneeL: Group;
  readonly kneeR: Group;
  readonly capePivot: Group | null;
  readonly wingLPivot: Group | null;
  readonly wingRPivot: Group | null;
  readonly ponytailPivot: Group | null;
  readonly basePelvisY: number;
  readonly heightM: number;
  readonly partCount: number;
  readonly triangleCount: number;
  applyPose(pose: HeroPoseId, time: number): void;
  dispose(): void;
}

interface BuildDims {
  readonly legLen: number;
  readonly torsoH: number;
  readonly chestW: number;
  readonly chestD: number;
  readonly waistW: number;
  readonly limbR: number;
  readonly headR: number;
  readonly tallScale: number;
}

const BUILD_DIMS: Readonly<Record<CharacterLook["build"], BuildDims>> = {
  standard: {
    legLen: 0.88,
    torsoH: 0.56,
    chestW: 0.42,
    chestD: 0.25,
    waistW: 0.3,
    limbR: 0.068,
    headR: 0.148,
    tallScale: 1,
  },
  compact: {
    legLen: 0.78,
    torsoH: 0.51,
    chestW: 0.44,
    chestD: 0.27,
    waistW: 0.33,
    limbR: 0.074,
    headR: 0.156,
    tallScale: 0.93,
  },
  sturdy: {
    legLen: 0.87,
    torsoH: 0.59,
    chestW: 0.52,
    chestD: 0.31,
    waistW: 0.37,
    limbR: 0.084,
    headR: 0.152,
    tallScale: 1.03,
  },
  slender: {
    legLen: 0.94,
    torsoH: 0.57,
    chestW: 0.37,
    chestD: 0.22,
    waistW: 0.26,
    limbR: 0.058,
    headR: 0.142,
    tallScale: 1.04,
  },
};

const HEAD_RATIO: Readonly<Record<CharacterLook["head"], readonly [number, number, number]>> = {
  round: [1.0, 1.04, 1.0],
  block: [0.98, 1.0, 0.98],
  tall: [0.88, 1.16, 0.94],
  wide: [1.14, 0.94, 0.98],
  egg: [0.92, 1.12, 0.96],
  dome: [0.96, 1.06, 0.98],
  hex: [1.0, 1.02, 0.96],
  jaw: [1.0, 1.08, 0.98],
};

interface MeshTransform {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
  readonly castShadow?: boolean;
}

class MeshFactory {
  readonly geometries: BufferGeometry[] = [];
  parts = 0;
  triangles = 0;

  track<G extends BufferGeometry>(geometry: G): G {
    this.geometries.push(geometry);
    return geometry;
  }

  add(parent: Group, geometry: BufferGeometry, material: Material, t: MeshTransform = {}): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    mesh.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    mesh.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    mesh.castShadow = t.castShadow ?? true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.parts += 1;
    const index = geometry.getIndex();
    const pos = geometry.getAttribute("position");
    this.triangles += Math.round((index ? index.count : (pos?.count ?? 0)) / 3);
    return mesh;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
  }
}

export function buildHeroRig(look: CharacterLook): HeroRig {
  const mat = createHeroMaterials(look);
  const f = new MeshFactory();
  const d = BUILD_DIMS[look.build];
  const scale = (look.height / 100) * d.tallScale;

  const thighLen = d.legLen * 0.47;
  const shinLen = d.legLen * 0.44;
  const footH = d.legLen * 0.09;
  const hipY = d.legLen;
  const hipX = d.waistW * 0.34;
  const shoulderX = d.chestW * 0.56 + d.limbR * 0.72;
  const shoulderY = d.torsoH - 0.08;
  const upperArmLen = d.torsoH * 0.5;
  const forearmLen = d.torsoH * 0.46;

  const root = new Group();
  root.scale.setScalar(scale);

  const pelvis = new Group();
  pelvis.position.set(0, hipY, 0);
  root.add(pelvis);

  const torso = new Group();
  torso.position.set(0, 0.04, 0);
  pelvis.add(torso);

  const head = new Group();
  head.position.set(0, d.torsoH + 0.05, 0);
  torso.add(head);

  const shoulderL = new Group();
  shoulderL.position.set(-shoulderX, shoulderY, 0);
  torso.add(shoulderL);

  const shoulderR = new Group();
  shoulderR.position.set(shoulderX, shoulderY, 0);
  torso.add(shoulderR);

  const elbowL = new Group();
  elbowL.position.set(0, -upperArmLen, 0);
  shoulderL.add(elbowL);

  const elbowR = new Group();
  elbowR.position.set(0, -upperArmLen, 0);
  shoulderR.add(elbowR);

  const hipL = new Group();
  hipL.position.set(-hipX, -0.02, 0);
  pelvis.add(hipL);

  const hipR = new Group();
  hipR.position.set(hipX, -0.02, 0);
  pelvis.add(hipR);

  const kneeL = new Group();
  kneeL.position.set(0, -thighLen, 0);
  hipL.add(kneeL);

  const kneeR = new Group();
  kneeR.position.set(0, -thighLen, 0);
  hipR.add(kneeR);

  // ── 1. 골반·하체 (Pelvis + Legs) ──
  buildPelvisAndLegs(f, mat, look, d, pelvis, hipL, hipR, kneeL, kneeR, thighLen, shinLen, footH);

  // ── 2. 몸통 (Torso) ──
  buildTorso(f, mat, look, d, torso);

  // ── 3. 팔·손 (Arms) ──
  buildArms(f, mat, look, d, shoulderL, shoulderR, elbowL, elbowR, upperArmLen, forearmLen);

  // ── 4. 머리·얼굴·헤어/헬멧 (Head + Face + Top) ──
  const headDims = buildHeadAndFace(f, mat, look, d, head);
  const ponytailPivot = buildTop(f, mat, look, headDims, head);

  // ── 5. 등 장식 (Back) ──
  const backPivots = buildBack(f, mat, look, d, torso);

  // ── 6. 덧장식 (Extra) ──
  buildExtra(f, mat, look, d, torso, shoulderX, shoulderY);

  // ── 7. 겉 장갑 단계 (Plating 0~3) ──
  buildPlating(f, mat, look, d, torso, head, headDims, elbowL, elbowR, hipL, hipR, kneeL, kneeR, thighLen);

  const rawHeight = hipY + 0.04 + d.torsoH + 0.05 + headDims.h + (look.top === "antenna" ? 0.16 : 0.05);
  const heightM = rawHeight * scale;

  const rig: HeroRig = {
    root,
    pelvis,
    torso,
    head,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    hipL,
    hipR,
    kneeL,
    kneeR,
    capePivot: backPivots.capePivot,
    wingLPivot: backPivots.wingLPivot,
    wingRPivot: backPivots.wingRPivot,
    ponytailPivot,
    basePelvisY: hipY,
    heightM,
    partCount: f.parts,
    triangleCount: f.triangles,
    applyPose(pose: HeroPoseId, time: number): void {
      applyHeroPose(rig, pose, time);
    },
    dispose(): void {
      f.dispose();
      mat.dispose();
    },
  };

  rig.applyPose("idle", 0);
  return rig;
}

function buildPelvisAndLegs(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  pelvis: Group,
  hipL: Group,
  hipR: Group,
  kneeL: Group,
  kneeR: Group,
  thighLen: number,
  shinLen: number,
  footH: number,
): void {
  // 골반 코어 + 허리 밴드
  f.add(pelvis, new CylinderGeometry(d.waistW * 0.49, d.waistW * 0.44, 0.14, 16), mat.secondaryDark, {
    y: 0.01,
    sz: (d.chestD / d.chestW) * 1.04,
  });
  f.add(pelvis, new CapsuleGeometry(d.waistW * 0.24, d.waistW * 0.24, 6, 12), mat.metalDark, {
    y: -0.04,
    rz: Math.PI / 2,
    sz: 0.72,
  });

  const legSides: readonly [Group, Group, number][] = [
    [hipL, kneeL, -1],
    [hipR, kneeR, 1],
  ];
  const r = d.limbR;

  for (const [hip, knee, side] of legSides) {
    // 고관절 소켓
    f.add(hip, new SphereGeometry(r * 1.05, 14, 10), mat.metalDark, { y: 0 });

    if (look.legs === "piston") {
      // 기계 피스톤 허벅지 + 실린더
      f.add(hip, new CylinderGeometry(r * 0.62, r * 0.56, thighLen * 0.9, 14), mat.metalDark, {
        y: -thighLen * 0.5,
      });
      f.add(hip, new CylinderGeometry(r * 0.22, r * 0.22, thighLen * 0.72, 10), mat.metal, {
        x: side * r * 0.58,
        y: -thighLen * 0.48,
        z: 0.02,
      });
      // 기계 무릎 관절
      f.add(knee, new CylinderGeometry(r * 0.85, r * 0.85, r * 1.45, 14), mat.metal, {
        rz: Math.PI / 2,
      });
      f.add(knee, new SphereGeometry(r * 0.35, 10, 8), mat.glow, {
        x: side * r * 0.75,
        castShadow: false,
      });
      // 피스톤 정강이
      f.add(knee, new BoxGeometry(r * 1.45, shinLen * 0.84, r * 1.5), mat.metal, {
        y: -shinLen * 0.46,
      });
      f.add(knee, new CylinderGeometry(r * 0.3, r * 0.3, shinLen * 0.88, 10), mat.metalDark, {
        y: -shinLen * 0.48,
        z: -r * 0.55,
      });
    } else {
      // 유기/전술 허벅지(위쪽이 탄탄하고 무릎으로 자연스럽게 좁아짐)
      f.add(hip, new CylinderGeometry(r * 1.22, r * 0.94, thighLen * 0.92, 16), mat.secondary, {
        y: -thighLen * 0.48,
        sz: 1.08,
      });
      // 무릎 관절
      f.add(knee, new SphereGeometry(r * 0.92, 14, 10), mat.secondaryDark, { y: 0 });

      if (look.legs === "boots") {
        // 상단 커프가 있는 전술 롱부츠
        f.add(knee, new CylinderGeometry(r * 1.06, r * 0.88, shinLen * 0.92, 16), mat.leather, {
          y: -shinLen * 0.46,
          sz: 1.1,
        });
        f.add(knee, new TorusGeometry(r * 1.04, r * 0.18, 10, 18), mat.accent, {
          y: -shinLen * 0.08,
          rx: Math.PI / 2,
        });
      } else if (look.legs === "greaves") {
        // 중장갑 정강이 그리브
        f.add(knee, new CylinderGeometry(r * 0.92, r * 0.78, shinLen * 0.92, 16), mat.secondaryDark, {
          y: -shinLen * 0.46,
        });
        f.add(knee, new CylinderGeometry(r * 1.12, r * 0.92, shinLen * 0.76, 8), mat.metal, {
          y: -shinLen * 0.44,
          z: r * 0.28,
          sx: 0.96,
          sz: 0.78,
        });
        f.add(knee, new BoxGeometry(r * 1.4, r * 1.1, r * 0.75), mat.accent, {
          y: -0.02,
          z: r * 0.72,
        });
      } else {
        // 일반 / 스커트 하의
        f.add(knee, new CylinderGeometry(r * 0.92, r * 0.74, shinLen * 0.92, 16), mat.secondaryDark, {
          y: -shinLen * 0.46,
          sz: 1.04,
        });
      }
    }

    // 발목 + 전술 부츠(발등 + 앞코 + 밑창 3단 조형)
    const bootMat =
      look.legs === "piston" || look.legs === "greaves"
        ? mat.metalDark
        : look.legs === "boots"
          ? mat.leather
          : mat.secondaryDark;
    const footY = -shinLen - footH * 0.45;
    f.add(knee, new SphereGeometry(r * 0.72, 12, 10), mat.metalDark, { y: -shinLen + 0.02 });
    f.add(knee, new BoxGeometry(r * 1.65, footH * 0.85, r * 2.55), bootMat, {
      y: footY + footH * 0.08,
      z: r * 0.55,
    });
    // 둥근 부츠 앞코
    f.add(knee, new SphereGeometry(r * 0.82, 14, 10), bootMat, {
      y: footY + footH * 0.04,
      z: r * 1.68,
      sx: 0.98,
      sy: 0.56,
      sz: 0.85,
    });
    // 밑창 트림
    f.add(knee, new BoxGeometry(r * 1.76, footH * 0.28, r * 3.15), mat.ink, {
      y: -shinLen - footH * 0.86,
      z: r * 0.65,
    });
  }

  // 스커트(플리츠 A라인)
  if (look.legs === "skirt") {
    const skirtH = thighLen * 1.08;
    f.add(pelvis, new CylinderGeometry(d.waistW * 0.52, d.waistW * 0.84, skirtH, 16, 1, false), mat.primary, {
      y: -skirtH * 0.44,
      sz: 0.88,
    });
    f.add(pelvis, new TorusGeometry(d.waistW * 0.82, 0.016, 8, 24), mat.accent, {
      y: -skirtH * 0.96,
      rx: Math.PI / 2,
      sy: 0.88,
    });
  }
}

function buildTorso(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  torso: Group,
): void {
  const T = d.torsoH;
  const W = d.chestW;
  const D = d.chestD;
  const front = D * 0.52;
  const bodyMat =
    look.torso === "plate" || look.torso === "core" || look.torso === "suit" ? mat.armor : mat.primary;

  // 기본 해부학적 2단 몸통(복부 테이퍼 + 역삼각 상흉부)
  f.add(torso, new CylinderGeometry(W * 0.42, d.waistW * 0.46, T * 0.46, 16), mat.primaryDark, {
    y: T * 0.23,
    sz: (D / W) * 1.06,
  });
  f.add(torso, new CylinderGeometry(W * 0.52, W * 0.42, T * 0.56, 16), bodyMat, {
    y: T * 0.72,
    sz: (D / W) * 1.08,
  });
  // 쇄골·어깨 상판 캡
  f.add(torso, new CapsuleGeometry(D * 0.42, W * 0.66, 8, 16), bodyMat, {
    y: T * 0.92,
    rz: Math.PI / 2,
    sy: 0.66,
  });

  switch (look.torso) {
    case "tunic": {
      // V넥 칼라 + 허리띠 + 튜닉 앞뒤 자락
      f.add(torso, new TorusGeometry(W * 0.24, 0.022, 10, 18), mat.primaryLight, {
        y: T * 0.98,
        rx: Math.PI / 2,
      });
      f.add(torso, new CylinderGeometry(d.waistW * 0.52, d.waistW * 0.52, 0.055, 16), mat.accent, {
        y: T * 0.16,
        sz: (D / W) * 1.12,
      });
      f.add(torso, new CylinderGeometry(d.waistW * 0.52, d.waistW * 0.64, 0.18, 16), mat.primaryDark, {
        y: -0.05,
        sz: (D / W) * 1.1,
      });
      break;
    }
    case "plate": {
      // 다층 흉갑(좌우 펙토랄 플레이트 + 중앙 스터넘 + 복부 리브)
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(W * 0.42, T * 0.34, 0.08), mat.metal, {
          x: side * W * 0.21,
          y: T * 0.73,
          z: front * 0.88,
          ry: -side * 0.22,
          rx: -0.1,
        });
      }
      f.add(torso, new BoxGeometry(W * 0.2, T * 0.36, 0.09), mat.accent, {
        y: T * 0.72,
        z: front * 0.96,
      });
      // 복부 세그먼트 3단
      for (let i = 0; i < 3; i++) {
        f.add(torso, new BoxGeometry(W * (0.58 - i * 0.06), 0.048, D * 0.98), mat.metalDark, {
          y: T * (0.44 - i * 0.12),
          z: 0.015,
        });
      }
      // 쇄골 가드 바
      f.add(torso, new BoxGeometry(W * 0.96, 0.06, D * 0.78), mat.accent, {
        y: T * 0.94,
      });
      break;
    }
    case "jacket": {
      // 오픈 전술 재킷(양옆 프론트 패널 + 높은 스탠드 칼라 + 안쪽 셔츠)
      f.add(torso, new BoxGeometry(W * 0.26, T * 0.86, 0.05), mat.primaryLight, {
        y: T * 0.5,
        z: front * 0.9,
      });
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(W * 0.34, T * 0.84, D * 1.06), mat.primary, {
          x: side * W * 0.28,
          y: T * 0.52,
          z: 0.01,
        });
      }
      // 스탠드 칼라
      f.add(
        torso,
        new CylinderGeometry(W * 0.3, W * 0.34, 0.09, 16, 1, true, -Math.PI * 0.78, Math.PI * 1.56),
        mat.accent,
        { y: T * 1.01, ry: Math.PI },
      );
      f.add(torso, new CylinderGeometry(d.waistW * 0.53, d.waistW * 0.53, 0.055, 16), mat.primaryDark, {
        y: 0.06,
        sz: (D / W) * 1.12,
      });
      break;
    }
    case "robe": {
      // 롱 코트 / 로브 하단 트임 자락 + 허리띠 + 전면 스톨
      const skirtH = d.legLen * 0.66;
      f.add(
        torso,
        new CylinderGeometry(d.waistW * 0.52, d.waistW * 0.86, skirtH, 16, 1, false),
        mat.primary,
        { y: -skirtH * 0.45, sz: 0.82 },
      );
      f.add(torso, new BoxGeometry(W * 0.24, T * 0.86, 0.05), mat.accent, {
        y: T * 0.54,
        z: front * 0.98,
      });
      f.add(torso, new BoxGeometry(W * 0.22, skirtH * 0.82, 0.045), mat.accent, {
        y: -skirtH * 0.4,
        z: front * 0.98,
        rx: -0.14,
      });
      f.add(torso, new TorusGeometry(d.waistW * 0.51, 0.028, 10, 20), mat.accentDark, {
        y: T * 0.14,
        rx: Math.PI / 2,
        sy: (D / W) * 1.12,
      });
      break;
    }
    case "vest": {
      // 전술 방탄 베스트 + 가슴 파우치 4개
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(W * 0.36, T * 0.78, D * 1.08), mat.primary, {
          x: side * W * 0.25,
          y: T * 0.52,
        });
        f.add(torso, new BoxGeometry(W * 0.22, 0.085, 0.055), mat.leather, {
          x: side * W * 0.24,
          y: T * 0.36,
          z: front * 1.02,
        });
        f.add(torso, new BoxGeometry(W * 0.18, 0.075, 0.045), mat.accent, {
          x: side * W * 0.24,
          y: T * 0.68,
          z: front * 1.02,
        });
      }
      f.add(torso, new BoxGeometry(W * 0.88, 0.06, D * 1.12), mat.metalDark, {
        y: T * 0.12,
      });
      break;
    }
    case "core": {
      // 가슴 아크 리액터 하우징 + 발광 코어 + 링 + 도관
      f.add(torso, new CylinderGeometry(0.115, 0.13, 0.06, 8), mat.metalDark, {
        y: T * 0.66,
        z: front * 0.9,
        rx: Math.PI / 2,
      });
      f.add(torso, new TorusGeometry(0.092, 0.016, 10, 20), mat.metal, {
        y: T * 0.66,
        z: front * 1.02,
      });
      f.add(torso, new CylinderGeometry(0.072, 0.072, 0.04, 20), mat.glow, {
        y: T * 0.66,
        z: front * 1.0,
        rx: Math.PI / 2,
        castShadow: false,
      });
      // 좌우 에너지 라인
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(W * 0.26, 0.022, 0.025), mat.glow, {
          x: side * W * 0.3,
          y: T * 0.72,
          z: front * 0.92,
          rz: side * 0.28,
          castShadow: false,
        });
      }
      break;
    }
    case "suit": {
      // 밀착 에어로 사이버 수트 + V자 네온 트림 + 척추 라인
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(W * 0.34, 0.028, 0.032), mat.accent, {
          x: side * W * 0.19,
          y: T * 0.74,
          z: front * 0.98,
          rz: -side * 0.34,
        });
      }
      f.add(torso, new BoxGeometry(0.035, T * 0.44, 0.028), mat.glow, {
        y: T * 0.44,
        z: front * 0.96,
        castShadow: false,
      });
      f.add(torso, new TorusGeometry(d.waistW * 0.48, 0.022, 10, 20), mat.metal, {
        y: T * 0.16,
        rx: Math.PI / 2,
        sy: (D / W) * 1.08,
      });
      break;
    }
    case "poncho": {
      // 어깨를 넓게 덮는 판초 + 밑단 액센트 트림
      f.add(torso, new CylinderGeometry(W * 0.34, W * 0.92, T * 0.74, 16, 1, false), mat.primary, {
        y: T * 0.64,
        sz: 0.78,
      });
      f.add(torso, new TorusGeometry(W * 0.9, 0.02, 8, 24), mat.accent, {
        y: T * 0.28,
        rx: Math.PI / 2,
        sy: 0.78,
      });
      f.add(torso, new TorusGeometry(W * 0.35, 0.026, 10, 20), mat.accent, {
        y: T * 0.98,
        rx: Math.PI / 2,
      });
      break;
    }
    default: {
      const unknown: never = look.torso;
      return unknown;
    }
  }
}

function buildArms(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  shoulderL: Group,
  shoulderR: Group,
  elbowL: Group,
  elbowR: Group,
  upperArmLen: number,
  forearmLen: number,
): void {
  const r = d.limbR * 0.88;
  const pairs: readonly [Group, Group, number][] = [
    [shoulderL, elbowL, -1],
    [shoulderR, elbowR, 1],
  ];

  for (const [shoulder, elbow, side] of pairs) {
    // 둥근 삼각근 어깨 캡
    f.add(
      shoulder,
      new SphereGeometry(r * 1.18, 14, 10),
      look.arms === "piston" ? mat.metalDark : mat.primary,
      { y: 0.01 },
    );

    if (look.arms === "piston") {
      f.add(shoulder, new CylinderGeometry(r * 0.56, r * 0.48, upperArmLen * 0.88, 12), mat.metalDark, {
        y: -upperArmLen * 0.5,
      });
      f.add(shoulder, new CylinderGeometry(r * 0.2, r * 0.2, upperArmLen * 0.76, 10), mat.metal, {
        x: side * r * 0.55,
        y: -upperArmLen * 0.48,
      });
      f.add(elbow, new SphereGeometry(r * 0.86, 12, 10), mat.metal, { y: 0 });
      f.add(elbow, new CylinderGeometry(r * 0.95, r * 0.78, forearmLen * 0.86, 10), mat.metal, {
        y: -forearmLen * 0.44,
      });
      // 기계 집게형 손
      f.add(elbow, new BoxGeometry(r * 1.35, 0.08, r * 1.45), mat.metalDark, {
        y: -forearmLen - 0.03,
      });
      continue;
    }

    // 상완
    f.add(shoulder, new CylinderGeometry(r * 1.02, r * 0.84, upperArmLen * 0.9, 14), mat.primary, {
      y: -upperArmLen * 0.48,
    });
    // 팔꿈치 관절
    f.add(
      elbow,
      new SphereGeometry(r * 0.82, 12, 10),
      look.arms === "plain" ? mat.skinShade : mat.primaryDark,
      { y: 0 },
    );

    if (look.arms === "plain") {
      f.add(elbow, new CylinderGeometry(r * 0.82, r * 0.66, forearmLen * 0.88, 14), mat.skin, {
        y: -forearmLen * 0.46,
      });
    } else if (look.arms === "sleeve") {
      f.add(elbow, new CylinderGeometry(r * 0.98, r * 0.92, forearmLen * 0.74, 14), mat.primary, {
        y: -forearmLen * 0.38,
      });
      f.add(elbow, new CylinderGeometry(r * 1.04, r * 1.02, forearmLen * 0.16, 14), mat.accent, {
        y: -forearmLen * 0.8,
      });
    } else if (look.arms === "gauntlet") {
      // 두꺼운 전완 건틀릿 + 너클 바 + 발광 슬릿
      f.add(elbow, new CylinderGeometry(r * 1.15, r * 1.24, forearmLen * 0.86, 8), mat.metal, {
        y: -forearmLen * 0.45,
      });
      f.add(elbow, new BoxGeometry(r * 0.5, forearmLen * 0.56, r * 0.4), mat.accent, {
        x: side * r * 1.08,
        y: -forearmLen * 0.46,
      });
      f.add(elbow, new BoxGeometry(r * 0.16, forearmLen * 0.38, r * 0.18), mat.glow, {
        x: side * r * 1.28,
        y: -forearmLen * 0.46,
        castShadow: false,
      });
    } else if (look.arms === "claw") {
      // 브레이서 + 3갈래 에너지 클로
      f.add(elbow, new CylinderGeometry(r * 1.06, r * 1.12, forearmLen * 0.78, 10), mat.metalDark, {
        y: -forearmLen * 0.42,
      });
      for (const offset of [-0.028, 0, 0.028]) {
        f.add(elbow, new ConeGeometry(0.015, 0.14, 6), mat.accent, {
          x: side * r * 0.55,
          y: -forearmLen - 0.07,
          z: offset,
          rx: Math.PI,
        });
      }
      f.add(elbow, new BoxGeometry(0.02, 0.09, 0.07), mat.glow, {
        x: side * r * 0.95,
        y: -forearmLen + 0.02,
        castShadow: false,
      });
    }

    // 손바닥 + 엄지 조형(클로 제외)
    if (look.arms !== "claw") {
      const handMat = look.arms === "gauntlet" ? mat.metalDark : mat.skin;
      f.add(elbow, new CapsuleGeometry(r * 0.56, 0.042, 6, 10), handMat, {
        y: -forearmLen - 0.032,
        sx: 0.78,
        sz: 1.05,
      });
      f.add(elbow, new CapsuleGeometry(r * 0.26, 0.028, 4, 8), handMat, {
        x: -side * r * 0.42,
        y: -forearmLen - 0.02,
        z: r * 0.46,
        rx: 0.4,
      });
    }
  }
}

interface HeadDims {
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly cy: number;
  readonly topY: number;
}

function buildHeadAndFace(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  head: Group,
): HeadDims {
  const [kw, kh, kd] = HEAD_RATIO[look.head];
  const r = d.headR;
  const w = r * 2 * kw;
  const h = r * 2.15 * kh;
  const depth = r * 2.02 * kd;
  const cy = h * 0.52;
  const topY = cy + h * 0.5;
  const zf = depth * 0.5;

  // 목(관절 링 포함)
  f.add(head, new CylinderGeometry(r * 0.42, r * 0.52, 0.1, 14), mat.skinShade, { y: -0.01 });
  f.add(head, new TorusGeometry(r * 0.5, 0.016, 8, 16), mat.metalDark, {
    y: -0.045,
    rx: Math.PI / 2,
  });

  // 두상 조형 8종
  switch (look.head) {
    case "round":
    case "egg":
    case "tall":
    case "wide": {
      // 매끄러운 두개골 + 살짝 좁은 턱
      f.add(head, new SphereGeometry(0.5, 22, 16), mat.skin, {
        y: cy + h * 0.04,
        sx: w,
        sy: h * 0.92,
        sz: depth,
      });
      f.add(head, new SphereGeometry(0.5, 16, 12), mat.skin, {
        y: cy - h * 0.16,
        z: depth * 0.04,
        sx: w * 0.78,
        sy: h * 0.62,
        sz: depth * 0.86,
      });
      break;
    }
    case "block": {
      // 각진 전술 헬멧형 두상(베벨 층)
      f.add(head, new BoxGeometry(w * 0.92, h * 0.88, depth * 0.92), mat.skin, { y: cy });
      f.add(head, new BoxGeometry(w * 0.98, h * 0.72, depth * 0.84), mat.skin, { y: cy + h * 0.04 });
      f.add(head, new BoxGeometry(w * 0.82, h * 0.96, depth * 0.82), mat.skin, { y: cy });
      break;
    }
    case "dome": {
      // 에어로 사이버 돔(매끈한 반구 + 턱 베이스)
      f.add(head, new CylinderGeometry(w * 0.47, w * 0.41, h * 0.5, 20), mat.skin, {
        y: cy - h * 0.18,
        sz: depth / w,
      });
      f.add(head, new SphereGeometry(0.5, 22, 14), mat.skin, {
        y: cy + h * 0.06,
        sx: w * 0.96,
        sy: h * 0.88,
        sz: depth * 0.96,
      });
      break;
    }
    case "hex": {
      // 6각 하드서피스 사이버 두상
      f.add(head, new CylinderGeometry(w * 0.52, w * 0.46, h * 0.92, 6), mat.skin, {
        y: cy,
        ry: Math.PI / 6,
        sz: depth / w,
      });
      f.add(head, new CylinderGeometry(w * 0.46, w * 0.52, h * 0.18, 6), mat.metal, {
        y: topY - h * 0.08,
        ry: Math.PI / 6,
      });
      break;
    }
    case "jaw": {
      // 위쪽이 넓고 턱선이 날카롭게 떨어지는 영웅형 두상
      f.add(head, new SphereGeometry(0.5, 20, 14), mat.skin, {
        y: cy + h * 0.1,
        sx: w * 1.02,
        sy: h * 0.78,
        sz: depth * 0.98,
      });
      f.add(head, new CylinderGeometry(w * 0.44, w * 0.28, h * 0.48, 8), mat.skin, {
        y: cy - h * 0.2,
        z: depth * 0.04,
        sz: 0.9,
      });
      break;
    }
    default: {
      const unknown: never = look.head;
      return unknown;
    }
  }

  // 양옆 귀 / 사이버 이어 캡
  for (const side of [-1, 1] as const) {
    f.add(
      head,
      new CylinderGeometry(h * 0.13, h * 0.13, 0.032, 14),
      look.plating > 0 ? mat.metalDark : mat.skinShade,
      {
        x: side * (w * 0.49),
        y: cy - h * 0.02,
        z: -depth * 0.02,
        rz: Math.PI / 2,
      },
    );
    if (look.plating > 0) {
      f.add(head, new TorusGeometry(h * 0.08, 0.008, 8, 16), mat.glow, {
        x: side * (w * 0.51),
        y: cy - h * 0.02,
        z: -depth * 0.02,
        ry: Math.PI / 2,
        castShadow: false,
      });
    }
  }

  // ── 얼굴 조형 8종 ──
  const eyeY = cy + h * 0.02;
  const eyeX = w * 0.19;

  const addDetailedEyes = (): void => {
    for (const side of [-1, 1] as const) {
      // 흰자
      f.add(head, new SphereGeometry(w * 0.095, 12, 10), mat.eyeWhite, {
        x: side * eyeX,
        y: eyeY,
        z: zf * 0.88,
        sx: 1.08,
        sy: 0.86,
        sz: 0.45,
        castShadow: false,
      });
      // 컬러 홍채
      f.add(head, new SphereGeometry(w * 0.068, 12, 10), mat.eyeIris, {
        x: side * eyeX,
        y: eyeY,
        z: zf * 0.93,
        sx: 0.96,
        sy: 1.0,
        sz: 0.4,
        castShadow: false,
      });
      // 동공 + 반짝이는 캐치라이트
      f.add(head, new SphereGeometry(w * 0.036, 10, 8), mat.eyePupil, {
        x: side * eyeX,
        y: eyeY,
        z: zf * 0.96,
        sz: 0.35,
        castShadow: false,
      });
      f.add(head, new SphereGeometry(w * 0.018, 8, 6), mat.eyeWhite, {
        x: side * eyeX + w * 0.022,
        y: eyeY + h * 0.022,
        z: zf * 0.98,
        castShadow: false,
      });
      // 입체 눈썹
      f.add(head, new CapsuleGeometry(w * 0.018, w * 0.11, 4, 8), mat.hair, {
        x: side * eyeX,
        y: eyeY + h * 0.11,
        z: zf * 0.92,
        rz: Math.PI / 2 - side * 0.12,
      });
    }
    // 작은 콧날
    f.add(head, new ConeGeometry(w * 0.034, h * 0.09, 6), mat.skinShade, {
      y: eyeY - h * 0.1,
      z: zf * 0.98,
      rx: 0.3,
    });
  };

  switch (look.face) {
    case "eyes": {
      addDetailedEyes();
      // 자연스러운 입 라인
      f.add(head, new CapsuleGeometry(0.007, w * 0.12, 4, 8), mat.skinShade, {
        y: eyeY - h * 0.23,
        z: zf * 0.92,
        rz: Math.PI / 2,
      });
      break;
    }
    case "visor": {
      // 곡면 글래스 바이저 + 내부 에너지 스캔 바
      f.add(
        head,
        new CylinderGeometry(w * 0.53, w * 0.51, h * 0.28, 20, 1, false, -Math.PI * 0.36, Math.PI * 0.72),
        mat.visor,
        { y: eyeY, z: 0.01, sz: depth / w },
      );
      f.add(
        head,
        new CylinderGeometry(w * 0.545, w * 0.535, h * 0.055, 20, 1, false, -Math.PI * 0.3, Math.PI * 0.6),
        mat.glow,
        { y: eyeY, z: 0.012, sz: depth / w, castShadow: false },
      );
      break;
    }
    case "mono": {
      // 다크 광학 하우징 + 원형 카메라 렌즈 + 발광 조리개 링
      f.add(head, new BoxGeometry(w * 0.56, h * 0.36, 0.07), mat.visor, {
        y: eyeY,
        z: zf * 0.88,
      });
      f.add(head, new CylinderGeometry(w * 0.16, w * 0.18, 0.055, 18), mat.metal, {
        y: eyeY,
        z: zf * 0.97,
        rx: Math.PI / 2,
      });
      f.add(head, new CylinderGeometry(w * 0.12, w * 0.12, 0.04, 18), mat.glow, {
        y: eyeY,
        z: zf * 1.0,
        rx: Math.PI / 2,
        castShadow: false,
      });
      break;
    }
    case "grill": {
      // 하관 전술 호흡기 그릴 + 날카로운 발광 눈 2개
      f.add(head, new BoxGeometry(w * 0.54, h * 0.28, 0.09), mat.metalDark, {
        y: cy - h * 0.2,
        z: zf * 0.88,
      });
      for (const offset of [-0.028, 0, 0.028]) {
        f.add(head, new BoxGeometry(w * 0.42, 0.014, 0.03), mat.metal, {
          y: cy - h * 0.2 + offset,
          z: zf * 1.01,
        });
      }
      for (const side of [-1, 1] as const) {
        f.add(head, new BoxGeometry(w * 0.16, h * 0.065, 0.04), mat.glow, {
          x: side * eyeX,
          y: eyeY,
          z: zf * 0.96,
          rz: -side * 0.12,
          castShadow: false,
        });
      }
      break;
    }
    case "goggles": {
      // 스트랩 + 듀얼 고글 렌즈 + 발광 유리
      f.add(head, new TorusGeometry(w * 0.51, 0.02, 8, 24), mat.leather, {
        y: eyeY,
        rx: Math.PI / 2,
        sy: depth / w,
      });
      for (const side of [-1, 1] as const) {
        f.add(head, new CylinderGeometry(w * 0.16, w * 0.16, 0.06, 18), mat.accent, {
          x: side * eyeX,
          y: eyeY,
          z: zf * 0.95,
          rx: Math.PI / 2,
        });
        f.add(head, new CylinderGeometry(w * 0.125, w * 0.125, 0.065, 18), mat.glow, {
          x: side * eyeX,
          y: eyeY,
          z: zf * 0.97,
          rx: Math.PI / 2,
          castShadow: false,
        });
      }
      f.add(head, new BoxGeometry(w * 0.14, 0.026, 0.04), mat.metal, {
        y: eyeY,
        z: zf * 0.98,
      });
      break;
    }
    case "mask": {
      addDetailedEyes();
      // 전술 하프 페이스 마스크 + 사이드 필터
      f.add(
        head,
        new CylinderGeometry(w * 0.52, w * 0.42, h * 0.36, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
        mat.accent,
        { y: cy - h * 0.22, z: 0.015, sz: depth / w },
      );
      for (const side of [-1, 1] as const) {
        f.add(head, new CylinderGeometry(0.032, 0.032, 0.04, 12), mat.metalDark, {
          x: side * w * 0.34,
          y: cy - h * 0.24,
          z: zf * 0.72,
          rx: Math.PI / 2,
          ry: side * 0.5,
        });
      }
      break;
    }
    case "screen": {
      // 곡면 OLED 페이스 패널 + 디지털 눈 & 파형
      f.add(
        head,
        new CylinderGeometry(w * 0.52, w * 0.48, h * 0.62, 20, 1, false, -Math.PI * 0.34, Math.PI * 0.68),
        mat.visor,
        { y: cy - h * 0.02, z: 0.012, sz: depth / w },
      );
      for (const side of [-1, 1] as const) {
        f.add(head, new CapsuleGeometry(w * 0.042, h * 0.065, 4, 8), mat.glow, {
          x: side * eyeX,
          y: eyeY + h * 0.02,
          z: zf * 0.98,
          castShadow: false,
        });
      }
      f.add(head, new BoxGeometry(w * 0.24, 0.022, 0.02), mat.glow, {
        y: cy - h * 0.16,
        z: zf * 0.97,
        castShadow: false,
      });
      break;
    }
    case "slit": {
      // 중장갑 페이스플레이트 + V자 협슬릿 발광
      f.add(
        head,
        new CylinderGeometry(w * 0.54, w * 0.52, h * 0.2, 12, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
        mat.metalDark,
        { y: eyeY, z: 0.01, sz: depth / w },
      );
      for (const side of [-1, 1] as const) {
        f.add(head, new BoxGeometry(w * 0.28, 0.02, 0.03), mat.glow, {
          x: side * w * 0.16,
          y: eyeY,
          z: zf * 1.0,
          ry: -side * 0.24,
          rz: side * 0.08,
          castShadow: false,
        });
      }
      break;
    }
    default: {
      const unknown: never = look.face;
      return unknown;
    }
  }

  return { w, h, d: depth, cy, topY };
}

function buildTop(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  b: HeadDims,
  head: Group,
): Group | null {
  if (look.top === "none") return null;
  let ponytailPivot: Group | null = null;

  const hairCrown = (scaleY = 0.62, extra = 1.06): void => {
    f.add(head, new SphereGeometry(0.5, 20, 14), mat.hair, {
      y: b.cy + b.h * 0.18,
      z: -b.d * 0.04,
      sx: b.w * extra,
      sy: b.h * scaleY,
      sz: b.d * extra,
    });
  };

  switch (look.top) {
    case "short": {
      hairCrown(0.66, 1.08);
      // 층진 앞머리 프린지 3가닥
      for (const [ox, rz, sy] of [
        [-0.24, 0.24, 0.9],
        [0, 0.05, 1.05],
        [0.24, -0.22, 0.88],
      ] as const) {
        f.add(head, new ConeGeometry(b.w * 0.18, b.h * 0.26 * sy, 8), mat.hair, {
          x: ox * b.w,
          y: b.topY - b.h * 0.18,
          z: b.d * 0.44,
          rx: 2.65,
          rz,
        });
      }
      break;
    }
    case "bob": {
      hairCrown(0.68, 1.1);
      // 좌우로 감싸는 곡면 보브 컷
      for (const side of [-1, 1] as const) {
        f.add(head, new CapsuleGeometry(b.w * 0.16, b.h * 0.44, 6, 12), mat.hair, {
          x: side * b.w * 0.48,
          y: b.cy - b.h * 0.04,
          z: -b.d * 0.06,
          rz: -side * 0.12,
          sz: 1.55,
        });
      }
      f.add(head, new CapsuleGeometry(b.w * 0.42, b.h * 0.36, 6, 12), mat.hair, {
        y: b.cy - b.h * 0.08,
        z: -b.d * 0.36,
        sz: 0.52,
      });
      break;
    }
    case "spiky": {
      hairCrown(0.58, 1.06);
      const spikes: readonly [number, number, number, number, number, number][] = [
        [0, b.topY + 0.08, 0.03, 0.14, 0.24, -0.15],
        [-0.1, b.topY + 0.05, -0.02, 0.12, 0.2, 0.45],
        [0.1, b.topY + 0.05, -0.02, 0.12, 0.2, -0.45],
        [0, b.topY + 0.04, -0.1, 0.12, 0.21, -0.55],
        [-0.08, b.topY + 0.02, 0.09, 0.1, 0.16, 0.32],
        [0.08, b.topY + 0.02, 0.09, 0.1, 0.16, -0.32],
      ];
      for (const [x, y, z, rad, len, tilt] of spikes) {
        f.add(head, new ConeGeometry(rad * 0.65, len, 7), mat.hair, {
          x,
          y,
          z,
          rx: z < 0 ? -0.5 : 0.18,
          rz: tilt,
        });
      }
      break;
    }
    case "ponytail": {
      hairCrown(0.64, 1.08);
      // 헤어 밴드 + 흔들리는 포니테일 피벗
      f.add(head, new TorusGeometry(0.048, 0.015, 8, 16), mat.accent, {
        y: b.cy + b.h * 0.14,
        z: -b.d * 0.5,
      });
      ponytailPivot = new Group();
      ponytailPivot.position.set(0, b.cy + b.h * 0.14, -b.d * 0.54);
      head.add(ponytailPivot);
      f.add(ponytailPivot, new CapsuleGeometry(0.046, 0.2, 8, 12), mat.hair, {
        y: -0.12,
        z: -0.06,
        rx: 0.42,
      });
      f.add(ponytailPivot, new ConeGeometry(0.046, 0.14, 10), mat.hair, {
        y: -0.26,
        z: -0.11,
        rx: Math.PI + 0.2,
      });
      break;
    }
    case "mohawk": {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        f.add(head, new ConeGeometry(0.048, 0.15 + Math.sin(t * Math.PI) * 0.05, 7), mat.hair, {
          y: b.topY + 0.04 - Math.abs(t - 0.5) * 0.08,
          z: b.d * (0.34 - t * 0.72),
          rx: (0.5 - t) * 0.7,
        });
      }
      break;
    }
    case "bun": {
      hairCrown(0.64, 1.08);
      f.add(head, new SphereGeometry(b.w * 0.34, 16, 12), mat.hair, {
        y: b.topY + 0.02,
        z: -b.d * 0.24,
      });
      f.add(head, new TorusGeometry(b.w * 0.24, 0.016, 8, 16), mat.accent, {
        y: b.topY - 0.04,
        z: -b.d * 0.22,
        rx: Math.PI / 2 - 0.3,
      });
      break;
    }
    case "cap": {
      f.add(head, new SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), mat.accent, {
        y: b.cy + b.h * 0.08,
        sx: b.w * 1.12,
        sy: b.h * 0.94,
        sz: b.d * 1.12,
      });
      // 곡선 챙
      f.add(
        head,
        new CylinderGeometry(b.w * 0.46, b.w * 0.5, 0.024, 16, 1, false, -0.9, 1.8),
        mat.accentDark,
        {
          y: b.cy + b.h * 0.2,
          z: b.d * 0.28,
          rx: 0.14,
        },
      );
      f.add(head, new BoxGeometry(0.055, 0.045, 0.02), mat.metal, {
        y: b.cy + b.h * 0.32,
        z: b.d * 0.55,
      });
      break;
    }
    case "helm": {
      // SF 택티컬 헬멧 + 볼 가드 + 상단 레일
      f.add(head, new SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat.metal, {
        y: b.cy + b.h * 0.06,
        sx: b.w * 1.16,
        sy: b.h * 1.02,
        sz: b.d * 1.18,
      });
      for (const side of [-1, 1] as const) {
        f.add(head, new BoxGeometry(0.045, b.h * 0.48, b.d * 0.56), mat.metalDark, {
          x: side * b.w * 0.54,
          y: b.cy - b.h * 0.08,
          z: -b.d * 0.08,
        });
      }
      f.add(head, new BoxGeometry(0.055, 0.075, b.d * 0.88), mat.accent, {
        y: b.topY + 0.03,
      });
      break;
    }
    case "hood": {
      f.add(head, new SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), mat.primary, {
        y: b.cy + b.h * 0.04,
        z: -b.d * 0.06,
        sx: b.w * 1.24,
        sy: b.h * 1.14,
        sz: b.d * 1.24,
      });
      // 후드 앞쪽 림
      f.add(head, new TorusGeometry(b.w * 0.56, 0.036, 10, 22), mat.primaryDark, {
        y: b.cy + b.h * 0.02,
        z: b.d * 0.14,
        sy: b.h / b.w,
      });
      break;
    }
    case "antenna": {
      f.add(head, new CylinderGeometry(0.055, 0.07, 0.04, 12), mat.metalDark, { y: b.topY + 0.01 });
      f.add(head, new CylinderGeometry(0.008, 0.018, 0.22, 10), mat.metal, { y: b.topY + 0.12 });
      f.add(head, new SphereGeometry(0.028, 12, 10), mat.glow, {
        y: b.topY + 0.24,
        castShadow: false,
      });
      break;
    }
    case "crest": {
      f.add(head, new BoxGeometry(0.05, 0.04, b.d * 0.92), mat.metal, { y: b.topY + 0.015 });
      f.add(head, new ConeGeometry(0.06, 0.22, 6), mat.accent, {
        y: b.topY + 0.11,
        z: -0.02,
        sx: 0.45,
        sz: 2.3,
        rx: -0.22,
      });
      f.add(head, new BoxGeometry(0.018, 0.14, b.d * 0.55), mat.glow, {
        y: b.topY + 0.11,
        z: -0.02,
        castShadow: false,
      });
      break;
    }
    case "horns": {
      f.add(head, new TorusGeometry(b.w * 0.5, 0.022, 8, 22), mat.accent, {
        y: b.cy + b.h * 0.22,
        rx: Math.PI / 2,
        sy: b.d / b.w,
      });
      for (const side of [-1, 1] as const) {
        f.add(head, new ConeGeometry(0.044, 0.16, 10), mat.horn, {
          x: side * b.w * 0.36,
          y: b.topY + 0.04,
          z: b.d * 0.12,
          rz: -side * 0.48,
          rx: 0.18,
        });
        f.add(head, new ConeGeometry(0.028, 0.12, 10), mat.horn, {
          x: side * b.w * 0.5,
          y: b.topY + 0.14,
          z: b.d * 0.16,
          rz: -side * 0.18,
          rx: 0.08,
        });
      }
      break;
    }
    default: {
      const unknown: never = look.top;
      return unknown;
    }
  }

  return ponytailPivot;
}

function buildBack(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  torso: Group,
): { capePivot: Group | null; wingLPivot: Group | null; wingRPivot: Group | null } {
  if (look.back === "none") return { capePivot: null, wingLPivot: null, wingRPivot: null };
  const T = d.torsoH;
  const W = d.chestW;
  const zb = -d.chestD * 0.54;
  let capePivot: Group | null = null;
  let wingLPivot: Group | null = null;
  let wingRPivot: Group | null = null;

  switch (look.back) {
    case "pack": {
      f.add(torso, new BoxGeometry(W * 0.68, T * 0.64, 0.18), mat.leather, {
        y: T * 0.56,
        z: zb - 0.08,
      });
      f.add(torso, new BoxGeometry(W * 0.72, 0.085, 0.2), mat.accent, {
        y: T * 0.84,
        z: zb - 0.08,
      });
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(0.042, T * 0.72, 0.03), mat.accentDark, {
          x: side * W * 0.26,
          y: T * 0.58,
          z: d.chestD * 0.52,
        });
      }
      break;
    }
    case "tank": {
      for (const side of [-1, 1] as const) {
        f.add(torso, new CapsuleGeometry(0.068, T * 0.44, 8, 14), mat.metal, {
          x: side * 0.085,
          y: T * 0.56,
          z: zb - 0.09,
        });
        f.add(torso, new TorusGeometry(0.072, 0.012, 8, 16), mat.accent, {
          x: side * 0.085,
          y: T * 0.68,
          z: zb - 0.09,
          rx: Math.PI / 2,
        });
      }
      f.add(torso, new BoxGeometry(0.28, 0.08, 0.1), mat.metalDark, {
        y: T * 0.56,
        z: zb - 0.04,
      });
      break;
    }
    case "cape": {
      capePivot = new Group();
      capePivot.position.set(0, T * 0.92, zb - 0.02);
      torso.add(capePivot);
      const capeLen = T + d.legLen * 0.56;
      f.add(capePivot, new BoxGeometry(W * 0.96, 0.08, 0.1), mat.accentDark, {
        y: 0,
        z: -0.02,
      });
      f.add(
        capePivot,
        new CylinderGeometry(W * 0.48, W * 0.74, capeLen, 12, 1, true, Math.PI * 0.74, Math.PI * 0.52),
        mat.accent,
        {
          y: -capeLen * 0.5,
          z: -0.05,
          rx: 0.14,
        },
      );
      f.add(capePivot, new BoxGeometry(W * 1.02, capeLen * 0.96, 0.028), mat.accent, {
        y: -capeLen * 0.5,
        z: -0.08,
        rx: 0.14,
      });
      break;
    }
    case "wings": {
      f.add(torso, new BoxGeometry(0.16, 0.18, 0.09), mat.metalDark, {
        y: T * 0.7,
        z: zb - 0.04,
      });
      wingLPivot = new Group();
      wingLPivot.position.set(-0.07, T * 0.72, zb - 0.06);
      torso.add(wingLPivot);
      wingRPivot = new Group();
      wingRPivot.position.set(0.07, T * 0.72, zb - 0.06);
      torso.add(wingRPivot);

      const wingPairs: readonly [Group, number][] = [
        [wingLPivot, -1],
        [wingRPivot, 1],
      ];
      for (const [pivot, side] of wingPairs) {
        // 3단 에너지 메카 블레이드 윙
        for (let i = 0; i < 3; i++) {
          const span = 0.42 - i * 0.07;
          f.add(pivot, new BoxGeometry(span, 0.075 - i * 0.01, 0.022), mat.metal, {
            x: side * (span * 0.5 + 0.03),
            y: 0.12 - i * 0.09,
            z: -0.03 * i,
            rz: side * (0.34 - i * 0.22),
            ry: -side * 0.28,
          });
          f.add(pivot, new BoxGeometry(span * 0.92, 0.024, 0.026), mat.glow, {
            x: side * (span * 0.5 + 0.04),
            y: 0.095 - i * 0.09,
            z: -0.03 * i,
            rz: side * (0.34 - i * 0.22),
            ry: -side * 0.28,
            castShadow: false,
          });
        }
      }
      break;
    }
    case "array": {
      f.add(torso, new BoxGeometry(0.24, 0.2, 0.1), mat.metalDark, { y: T * 0.68, z: zb - 0.04 });
      for (const side of [-1, 1] as const) {
        f.add(torso, new CylinderGeometry(0.012, 0.018, 0.44, 8), mat.metal, {
          x: side * 0.1,
          y: T * 0.98,
          z: zb - 0.07,
          rz: -side * 0.2,
        });
        f.add(torso, new SphereGeometry(0.028, 10, 8), mat.glow, {
          x: side * 0.145,
          y: T * 0.98 + 0.22,
          z: zb - 0.07,
          castShadow: false,
        });
      }
      break;
    }
    case "shield": {
      f.add(torso, new CylinderGeometry(0.25, 0.22, 0.045, 6), mat.metal, {
        y: T * 0.56,
        z: zb - 0.06,
        rx: Math.PI / 2,
      });
      f.add(torso, new CylinderGeometry(0.16, 0.16, 0.052, 6), mat.accent, {
        y: T * 0.56,
        z: zb - 0.068,
        rx: Math.PI / 2,
      });
      f.add(torso, new SphereGeometry(0.052, 12, 10), mat.glow, {
        y: T * 0.56,
        z: zb - 0.095,
        castShadow: false,
      });
      break;
    }
    case "jet": {
      f.add(torso, new BoxGeometry(0.28, 0.26, 0.14), mat.metalDark, { y: T * 0.64, z: zb - 0.07 });
      for (const side of [-1, 1] as const) {
        f.add(torso, new CylinderGeometry(0.052, 0.078, 0.26, 14), mat.metal, {
          x: side * 0.11,
          y: T * 0.48,
          z: zb - 0.09,
        });
        f.add(torso, new ConeGeometry(0.056, 0.1, 12), mat.glow, {
          x: side * 0.11,
          y: T * 0.3,
          z: zb - 0.09,
          rx: Math.PI,
          castShadow: false,
        });
      }
      break;
    }
    default: {
      const unknown: never = look.back;
      return unknown;
    }
  }

  return { capePivot, wingLPivot, wingRPivot };
}

function buildExtra(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  torso: Group,
  shoulderX: number,
  shoulderY: number,
): void {
  if (look.extra === "none") return;
  const T = d.torsoH;
  const W = d.chestW;
  const D = d.chestD;
  const front = D * 0.55;

  switch (look.extra) {
    case "scarf": {
      f.add(torso, new TorusGeometry(W * 0.32, 0.048, 12, 22), mat.accent, {
        y: T * 0.99,
        rx: Math.PI / 2,
      });
      f.add(torso, new BoxGeometry(0.095, 0.28, 0.032), mat.accent, {
        x: W * 0.18,
        y: T * 0.72,
        z: front + 0.02,
        rz: 0.12,
      });
      break;
    }
    case "pads": {
      // 다층 메카 숄더 폴드론
      for (const side of [-1, 1] as const) {
        f.add(
          torso,
          new SphereGeometry(d.limbR * 1.85, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
          mat.metal,
          {
            x: side * (shoulderX + 0.01),
            y: shoulderY + 0.02,
            rz: -side * 0.32,
            sz: 1.15,
          },
        );
        f.add(torso, new BoxGeometry(0.09, 0.022, 0.12), mat.accent, {
          x: side * (shoulderX + 0.05),
          y: shoulderY + 0.08,
          rz: -side * 0.4,
        });
      }
      break;
    }
    case "belt": {
      f.add(torso, new CylinderGeometry(d.waistW * 0.54, d.waistW * 0.54, 0.07, 16), mat.leather, {
        y: 0.04,
        sz: (D / W) * 1.14,
      });
      f.add(torso, new BoxGeometry(0.085, 0.075, 0.04), mat.metal, {
        y: 0.04,
        z: front * 0.95,
      });
      for (const side of [-1, 1] as const) {
        f.add(torso, new BoxGeometry(0.08, 0.1, 0.065), mat.accentDark, {
          x: side * d.waistW * 0.44,
          y: 0.02,
          z: front * 0.7,
        });
      }
      break;
    }
    case "collar": {
      f.add(torso, new TorusGeometry(W * 0.34, 0.036, 10, 22), mat.metal, {
        y: T * 0.99,
        rx: Math.PI / 2,
      });
      f.add(torso, new BoxGeometry(0.085, 0.03, 0.035), mat.glow, {
        y: T * 0.99,
        z: front * 0.78,
        castShadow: false,
      });
      break;
    }
    case "badge": {
      f.add(torso, new CylinderGeometry(0.058, 0.058, 0.022, 6), mat.metalDark, {
        x: W * 0.22,
        y: T * 0.74,
        z: front * 0.98,
        rx: Math.PI / 2,
      });
      f.add(torso, new CylinderGeometry(0.036, 0.036, 0.028, 6), mat.glow, {
        x: W * 0.22,
        y: T * 0.74,
        z: front * 1.0,
        rx: Math.PI / 2,
        castShadow: false,
      });
      break;
    }
    case "sash": {
      f.add(torso, new TorusGeometry(W * 0.64, 0.032, 10, 24), mat.accent, {
        y: T * 0.54,
        rz: 0.68,
        ry: 0.18,
        sz: 0.44,
      });
      f.add(torso, new BoxGeometry(0.095, 0.11, 0.075), mat.leather, {
        x: -W * 0.36,
        y: T * 0.14,
        z: front * 0.72,
      });
      break;
    }
    case "lamp": {
      f.add(torso, new BoxGeometry(0.075, 0.095, 0.085), mat.metalDark, {
        x: -shoulderX + 0.04,
        y: shoulderY + 0.11,
        z: 0.01,
      });
      f.add(torso, new CylinderGeometry(0.036, 0.04, 0.04, 14), mat.glow, {
        x: -shoulderX + 0.04,
        y: shoulderY + 0.12,
        z: 0.06,
        rx: Math.PI / 2,
        castShadow: false,
      });
      break;
    }
    default: {
      const unknown: never = look.extra;
      return unknown;
    }
  }
}

function buildPlating(
  f: MeshFactory,
  mat: HeroMaterialSet,
  look: CharacterLook,
  d: BuildDims,
  torso: Group,
  head: Group,
  headDims: HeadDims,
  elbowL: Group,
  elbowR: Group,
  hipL: Group,
  hipR: Group,
  kneeL: Group,
  kneeR: Group,
  thighLen: number,
): void {
  if (look.plating <= 0) return;
  const r = d.limbR;

  // 1단계: 무릎·팔꿈치 아머 가드
  for (const knee of [kneeL, kneeR]) {
    f.add(knee, new BoxGeometry(r * 1.4, r * 1.25, r * 0.8), mat.metal, {
      y: 0.01,
      z: r * 0.82,
    });
  }
  for (const [elbow, side] of [
    [elbowL, -1],
    [elbowR, 1],
  ] as const) {
    f.add(elbow, new BoxGeometry(r * 0.9, r * 1.0, r * 0.95), mat.metalDark, {
      x: side * r * 0.55,
      y: 0,
      z: -r * 0.4,
    });
  }

  if (look.plating < 2) return;

  // 2단계: 턱 가드 + 흉부 중앙 보강 플레이트
  f.add(head, new BoxGeometry(headDims.w * 0.62, headDims.h * 0.16, headDims.d * 0.56), mat.metal, {
    y: headDims.cy - headDims.h * 0.36,
    z: headDims.d * 0.24,
  });
  f.add(torso, new BoxGeometry(d.chestW * 0.36, d.torsoH * 0.36, 0.06), mat.metal, {
    y: d.torsoH * 0.4,
    z: d.chestD * 0.54,
  });

  if (look.plating < 3) return;

  // 3단계: 허벅지 사이드 아머 + 척추 파워 스파인(발광 노드 3개)
  for (const [hip, side] of [
    [hipL, -1],
    [hipR, 1],
  ] as const) {
    f.add(hip, new BoxGeometry(r * 0.55, thighLen * 0.56, r * 1.45), mat.metal, {
      x: side * r * 1.15,
      y: -thighLen * 0.42,
    });
  }
  f.add(torso, new BoxGeometry(0.085, d.torsoH * 0.78, 0.055), mat.metalDark, {
    y: d.torsoH * 0.5,
    z: -d.chestD * 0.54,
  });
  for (let i = 0; i < 3; i++) {
    f.add(torso, new SphereGeometry(0.022, 10, 8), mat.glow, {
      y: d.torsoH * (0.28 + i * 0.22),
      z: -d.chestD * 0.58,
      castShadow: false,
    });
  }
}

function applyHeroPose(rig: HeroRig, pose: HeroPoseId, time: number): void {
  // 기본 초기화
  rig.pelvis.position.set(0, rig.basePelvisY, 0);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  rig.shoulderL.rotation.set(0, 0, 0.14);
  rig.shoulderR.rotation.set(0, 0, -0.14);
  rig.elbowL.rotation.set(-0.18, 0, 0);
  rig.elbowR.rotation.set(-0.18, 0, 0);
  rig.hipL.rotation.set(0, 0, -0.04);
  rig.hipR.rotation.set(0, 0, 0.04);
  rig.kneeL.rotation.set(0.04, 0, 0);
  rig.kneeR.rotation.set(0.04, 0, 0);

  const breath = Math.sin(time * 2.1);
  const gentle = Math.sin(time * 1.15);

  switch (pose) {
    case "idle": {
      // 자연스러운 영웅 스탠스 + 숨쉬기 + 시선 미세 회전
      rig.pelvis.position.y = rig.basePelvisY + breath * 0.012;
      rig.torso.rotation.y = 0.08 + gentle * 0.03;
      rig.torso.rotation.x = 0.02 + breath * 0.012;
      rig.head.rotation.y = -0.08 + Math.sin(time * 0.7) * 0.09;
      rig.head.rotation.x = -0.02 + breath * 0.015;
      rig.shoulderL.rotation.set(0.06, 0, 0.16 + breath * 0.025);
      rig.shoulderR.rotation.set(-0.08, 0, -0.16 - breath * 0.025);
      rig.elbowL.rotation.x = -0.24;
      rig.elbowR.rotation.x = -0.32;
      rig.hipL.rotation.set(-0.04, 0.06, -0.06);
      rig.hipR.rotation.set(0.06, -0.08, 0.06);
      rig.kneeL.rotation.x = 0.06;
      rig.kneeR.rotation.x = 0.08;
      break;
    }
    case "combat": {
      // 무게 중심 낮춘 전투 태세 + 가드
      const bounce = Math.sin(time * 4.2);
      rig.pelvis.position.y = rig.basePelvisY - 0.08 + bounce * 0.015;
      rig.pelvis.rotation.y = -0.32;
      rig.torso.rotation.set(0.14, 0.18, 0);
      rig.head.rotation.set(-0.1, 0.14, 0);
      rig.shoulderL.rotation.set(-0.95 + bounce * 0.04, 0.25, 0.24);
      rig.elbowL.rotation.set(-1.15, 0, 0.22);
      rig.shoulderR.rotation.set(-0.62 - bounce * 0.04, -0.2, -0.32);
      rig.elbowR.rotation.set(-1.25, 0, -0.18);
      rig.hipL.rotation.set(-0.34, 0.1, -0.14);
      rig.kneeL.rotation.x = 0.42;
      rig.hipR.rotation.set(0.28, -0.15, 0.14);
      rig.kneeR.rotation.x = 0.34;
      break;
    }
    case "walk": {
      // 무릎·팔꿈치 꺾이는 게임 걷기 사이클
      const phase = time * 6.2;
      const swing = Math.sin(phase);
      const liftL = Math.max(0, Math.cos(phase));
      const liftR = Math.max(0, -Math.cos(phase));
      rig.pelvis.position.y = rig.basePelvisY - 0.03 + Math.abs(Math.sin(phase)) * 0.04;
      rig.pelvis.rotation.y = swing * 0.1;
      rig.torso.rotation.set(0.07, -swing * 0.12, 0);
      rig.head.rotation.y = swing * 0.04;
      rig.hipL.rotation.x = swing * 0.56;
      rig.kneeL.rotation.x = 0.08 + liftL * 0.62;
      rig.hipR.rotation.x = -swing * 0.56;
      rig.kneeR.rotation.x = 0.08 + liftR * 0.62;
      rig.shoulderL.rotation.set(-swing * 0.48, 0, 0.14);
      rig.elbowL.rotation.x = -0.25 - Math.max(0, -swing) * 0.4;
      rig.shoulderR.rotation.set(swing * 0.48, 0, -0.14);
      rig.elbowR.rotation.x = -0.25 - Math.max(0, swing) * 0.4;
      break;
    }
    case "inspect": {
      // 허리에 한 손 올리고 여유롭게 점검하는 포즈
      rig.pelvis.position.y = rig.basePelvisY + breath * 0.01;
      rig.pelvis.rotation.y = 0.16;
      rig.torso.rotation.set(-0.04, -0.12, 0.03);
      rig.head.rotation.set(-0.03, -0.05 + gentle * 0.07, -0.04);
      rig.shoulderL.rotation.set(0.05, 0, 0.42);
      rig.elbowL.rotation.set(-0.62, 0, -0.58);
      rig.shoulderR.rotation.set(-0.32 + breath * 0.03, -0.12, -0.22);
      rig.elbowR.rotation.set(-0.85, 0, 0.1);
      rig.hipL.rotation.set(-0.06, 0.08, -0.08);
      rig.hipR.rotation.set(0.08, -0.12, 0.08);
      rig.kneeL.rotation.x = 0.06;
      rig.kneeR.rotation.x = 0.12;
      break;
    }
    default: {
      const unknown: never = pose;
      return unknown;
    }
  }

  // 보조 흔들림(망토·날개·포니테일)
  if (rig.capePivot) {
    const capeBase = pose === "walk" ? 0.24 : pose === "combat" ? 0.18 : 0.06;
    rig.capePivot.rotation.x = capeBase + Math.sin(time * 3.1) * 0.06;
  }
  if (rig.wingLPivot && rig.wingRPivot) {
    const flap = Math.sin(time * 2.6) * 0.09;
    rig.wingLPivot.rotation.y = -0.16 - flap;
    rig.wingRPivot.rotation.y = 0.16 + flap;
  }
  if (rig.ponytailPivot) {
    rig.ponytailPivot.rotation.x = (pose === "walk" ? 0.22 : 0.06) + Math.sin(time * 3.6) * 0.08;
    rig.ponytailPivot.rotation.z = Math.cos(time * 2.4) * 0.05;
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Camera, ChevronLeft, ChevronRight, CircleStop, Grid3X3, Lightbulb, Lock, Plus, Save, Search, Unlock, Video, X } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  PANORAMA_AVATAR_POSES,
  panoramaAvatarPoseLabel,
  panoramaAvatarPoseRootDefaults,
  type PanoramaAvatar,
  type PanoramaAvatarPoseId,
} from '../../utils/panorama3d';
import {
  addDirectorActor,
  applyDirectorAvatarPose,
  buildDirectorPromptText,
  DIRECTOR_DEFAULT_ACTOR_MODEL_URL,
  DIRECTOR_FALLBACK_ACTOR_MODEL_URL,
  removeDirectorActor,
  selectDirectorActor,
  type DirectorMode,
  type DirectorProject,
  type DirectorRigSettings,
  type DirectorScenePreset,
  sanitizeDirectorProject,
} from '../../utils/directorProject';
import { detectDirectorPoseFromImage } from '../../utils/directorPoseEstimation';

export interface DirectorStudioProps {
  open: boolean;
  project: DirectorProject;
  upstreamImages?: string[];
  upstreamModels?: string[];
  onClose: () => void;
  onProjectChange: (project: DirectorProject) => void;
  onCaptureImage: (dataUrl: string) => void | Promise<void>;
  onCaptureVideo: (blob: Blob) => void | Promise<void>;
}

const buttonStyle = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/12 bg-white/8 px-3 text-xs font-medium text-slate-100 hover:bg-white/14';
const activeButtonStyle = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-cyan-300/70 bg-cyan-400/20 px-3 text-xs font-medium text-cyan-50';

type DirectorPanelTab = 'action' | 'skeleton' | 'camera' | 'lighting' | 'scene' | 'resources';

const DIRECTOR_PANEL_TABS: Array<{ id: DirectorPanelTab; label: string }> = [
  { id: 'action', label: '动作' },
  { id: 'skeleton', label: '骨骼' },
  { id: 'camera', label: '机位' },
  { id: 'lighting', label: '灯光' },
  { id: 'scene', label: '场景' },
  { id: 'resources', label: '资源' },
];

const DIRECTOR_ACTION_ANIMATION_MAP: Record<string, string[]> = {
  standing: ['Standing Pose', 'Idle', 'idle', 'Standing', 'Walk', 'Animation'],
  sitting: ['Sitting Pose', 'Sitting', 'sit'],
  sit: ['Sitting Pose', 'Sitting', 'sit'],
  crouch: ['Crouch Pose', 'Squat Pose', 'Crouch', 'Squat'],
  squat: ['Squat Pose', 'Crouch Pose', 'Squat', 'Crouch'],
  walking: ['Walking Pose', 'Walking', 'walk', 'Walk', 'Animation'],
  walk: ['Walking Pose', 'Walking', 'walk', 'Walk', 'Animation'],
  running: ['Running Pose', 'Running', 'run', 'Run', 'Walk', 'Animation'],
  run: ['Running Pose', 'Running', 'run', 'Run', 'Walk', 'Animation'],
  combat: ['Combat', 'Fight', 'Punch', 'Boxing'],
  punch: ['Punch', 'Boxing', 'Jab', 'Cross'],
  'flying-kick': ['Flying Kick', 'Fly Kick', 'Kick', 'Jump Kick'],
  kick: ['Kick', 'Front Kick', 'Side Kick'],
  'taekwondo-roundhouse': ['Roundhouse', 'Roundhouse Kick', 'Kick'],
  'taekwondo-front-kick': ['Front Kick', 'Kick'],
  'taekwondo-side-kick': ['Side Kick', 'Kick'],
  'taekwondo-axe-kick': ['Axe Kick', 'Kick'],
  'taekwondo-back-kick': ['Back Kick', 'Kick'],
  'karate-punch': ['Karate Punch', 'Punch'],
  'boxing-jab': ['Jab', 'Punch'],
  'boxing-cross': ['Cross', 'Punch'],
  'boxing-hook': ['Hook', 'Punch'],
  'boxing-uppercut': ['Uppercut', 'Punch'],
  pointing: ['Point', 'Pointing'],
  jump: ['Jump'],
  dance: ['Dance', 'Animation'],
  wave: ['Wave', 'Dance', 'Standing Pose', 'Standing', 'Idle', 'Animation'],
  salute: ['Salute', 'Standing Pose', 'Standing', 'Idle', 'Animation'],
};

const DIRECTOR_ACTION_FALLBACK_BLOCKLIST = new Set([
  'combat',
  'punch',
  'flying-kick',
  'kick',
  'taekwondo-roundhouse',
  'jump',
]);

const DIRECTOR_ACTION_RESOURCE_LIBRARY = [
  { id: 'director-basic', label: '导演台基础姿势', sourceLabel: '内置程序姿势', tags: ['站立', '坐下', '蹲下', '走路', '奔跑'], url: 'builtin://director-action-pack/basic' },
  { id: 'director-combat', label: '导演台格斗动作', sourceLabel: '内置程序动作', tags: ['拳击', '踢腿', '战斗', '跳跃'], url: 'builtin://director-action-pack/combat' },
  { id: 'director-gesture', label: '导演台表演动作', sourceLabel: '内置程序动作', tags: ['挥手', '敬礼', '指向', '表演'], url: 'builtin://director-action-pack/gesture' },
];

const DIRECTOR_AUTO_ACTION_PACK_URLS = [
  'builtin://director-action-pack/basic',
  'builtin://director-action-pack/gesture',
];

const DIRECTOR_SCENE_PRESETS: Array<{ id: DirectorScenePreset; label: string; background: string; floor: string }> = [
  { id: 'studio', label: '暗色影棚', background: '#060b12', floor: '#0b1220' },
  { id: 'stage', label: '舞台', background: '#100718', floor: '#160b22' },
  { id: 'street', label: '街景', background: '#10151c', floor: '#1b1f25' },
  { id: 'room', label: '室内', background: '#11100e', floor: '#1d1915' },
];

const modelNameFromUrl = (url: string) => {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || url);
  } catch {
    return url.split('/').filter(Boolean).pop() || url;
  }
};

function disposeObject(root: THREE.Object3D) {
  root.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material: THREE.Material) => material.dispose());
  });
}

function findBestAnimationClipName(clipNames: string[], poseId: string, fallback: string) {
  const candidates = DIRECTOR_ACTION_ANIMATION_MAP[poseId] || [];
  for (const candidate of candidates) {
    const match = clipNames.find((name) => name.toLowerCase().includes(candidate.toLowerCase()));
    if (match) return match;
  }
  if (DIRECTOR_ACTION_FALLBACK_BLOCKLIST.has(poseId)) return '';
  return clipNames.find((name) => name.toLowerCase().includes(fallback.toLowerCase())) || clipNames[0] || fallback;
}

function findSupportedAnimationClipName(clipNames: string[], poseId: string) {
  const candidates = DIRECTOR_ACTION_ANIMATION_MAP[poseId] || [];
  for (const candidate of candidates) {
    const match = clipNames.find((name) => name.toLowerCase().includes(candidate.toLowerCase()));
    if (match) return match;
  }
  return '';
}

function sampleStaticPose(action: THREE.AnimationAction, mixer: THREE.AnimationMixer, ratio: number) {
  const clip = action.getClip();
  const duration = Math.max(clip.duration || 0, 0.001);
  mixer.stopAllAction();
  action.reset();
  action.enabled = true;
  action.setEffectiveWeight(1);
  action.setEffectiveTimeScale(1);
  action.play();
  action.paused = false;
  const sampleTime = THREE.MathUtils.clamp(ratio, 0, 1) * duration;
  action.time = sampleTime;
  mixer.setTime(sampleTime);
  action.paused = true;
}

function findFirstSkinnedMesh(root: THREE.Object3D) {
  let skinned: THREE.SkinnedMesh | null = null;
  root.traverse((object: any) => {
    if (!skinned && object.isSkinnedMesh && object.skeleton) skinned = object as THREE.SkinnedMesh;
  });
  return skinned;
}

function shouldUseFbxLoader(url: string) {
  return /\.fbx(\?|#|$)/i.test(url);
}

function applyCameraRig(camera: THREE.PerspectiveCamera, orbit: OrbitControls | null, settings: DirectorProject['camera']) {
  const target = new THREE.Vector3(0, settings.targetY, 0);
  const yaw = THREE.MathUtils.degToRad(settings.yaw);
  const elevation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-settings.pitch, -75, 75));
  const radius = Math.max(settings.distance, 0.1);
  camera.fov = settings.fov;
  camera.position.set(
    Math.sin(yaw) * Math.cos(elevation) * radius,
    target.y + Math.sin(elevation) * radius,
    Math.cos(yaw) * Math.cos(elevation) * radius,
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  if (orbit) {
    orbit.target.copy(target);
    orbit.update();
  }
}

function cameraSettingsFromOrbit(camera: THREE.PerspectiveCamera, orbit: OrbitControls, current: DirectorProject['camera']): DirectorProject['camera'] {
  const offset = camera.position.clone().sub(orbit.target);
  const distance = THREE.MathUtils.clamp(offset.length(), 1, 40);
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
  const horizontal = Math.max(Math.sqrt(offset.x * offset.x + offset.z * offset.z), 0.001);
  const pitch = -THREE.MathUtils.radToDeg(Math.atan2(offset.y, horizontal));
  return {
    ...current,
    distance: Math.round(distance * 10) / 10,
    yaw: Math.round(THREE.MathUtils.clamp(yaw, -180, 180)),
    pitch: Math.round(THREE.MathUtils.clamp(pitch, -85, 85)),
    targetY: Math.round(THREE.MathUtils.clamp(orbit.target.y, 0, 4) * 10) / 10,
  };
}

function applyBoneRotations(root: THREE.Object3D, rotations: DirectorRigSettings['boneRotations']) {
  root.traverse((object: any) => {
    const next = object?.isBone && object.name ? rotations[object.name] : null;
    if (!next) return;
    object.rotation.set(
      THREE.MathUtils.degToRad(next.x),
      THREE.MathUtils.degToRad(next.y),
      THREE.MathUtils.degToRad(next.z),
      object.rotation.order,
    );
  });
}

function findBone(root: THREE.Object3D | null, name: string) {
  if (!root || !name) return null;
  let found: THREE.Bone | null = null;
  root.traverse((object: any) => {
    if (!found && object.isBone && object.name === name) found = object as THREE.Bone;
  });
  return found;
}

function findNearestBone(root: THREE.Object3D | null, point: THREE.Vector3): THREE.Bone | null {
  if (!root) return null;
  let bestBone: THREE.Bone | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const world = new THREE.Vector3();
  root.traverse((object: any) => {
    if (!object.isBone || !object.name) return;
    object.getWorldPosition(world);
    const distance = world.distanceTo(point);
    if (distance < bestDistance) {
      bestBone = object as unknown as THREE.Bone;
      bestDistance = distance;
    }
  });
  return bestBone;
}

function placeActorRoot(root: THREE.Object3D, actor: DirectorProject['actors'][number]) {
  root.visible = actor.visible !== false;
  root.position.set(actor.x, actor.y, actor.z);
  root.rotation.y = THREE.MathUtils.degToRad(actor.heading || 0);
  root.userData.directorActorRoot = true;
  root.userData.directorActorId = actor.id;
}

function normalizeActorHeading(degrees: number) {
  const normalized = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Math.round(normalized);
}

function actorPlacementFromRoot(root: THREE.Object3D) {
  return {
    x: Math.round(THREE.MathUtils.clamp(root.position.x, -20, 20) * 10) / 10,
    y: Math.round(THREE.MathUtils.clamp(root.position.y, -10, 10) * 10) / 10,
    z: Math.round(THREE.MathUtils.clamp(root.position.z, -20, 20) * 10) / 10,
    heading: normalizeActorHeading(THREE.MathUtils.radToDeg(root.rotation.y)),
  };
}

const DIRECTOR_BONE_CONTROLS = [
  { id: 'head', label: '头', candidates: ['mixamorigHead', 'head'] },
  { id: 'spine', label: '胸', candidates: ['mixamorigSpine2', 'mixamorigSpine1', 'spine2', 'chest'] },
  { id: 'hips', label: '髋', candidates: ['mixamorigHips', 'hips', 'pelvis'] },
  { id: 'leftHand', label: '左手', candidates: ['mixamorigLeftHand', 'leftHand', 'hand_l'] },
  { id: 'rightHand', label: '右手', candidates: ['mixamorigRightHand', 'rightHand', 'hand_r'] },
  { id: 'leftElbow', label: '左肘', candidates: ['mixamorigLeftForeArm', 'leftForeArm', 'forearm_l'] },
  { id: 'rightElbow', label: '右肘', candidates: ['mixamorigRightForeArm', 'rightForeArm', 'forearm_r'] },
  { id: 'leftKnee', label: '左膝', candidates: ['mixamorigLeftLeg', 'leftLeg', 'calf_l'] },
  { id: 'rightKnee', label: '右膝', candidates: ['mixamorigRightLeg', 'rightLeg', 'calf_r'] },
  { id: 'leftFoot', label: '左脚', candidates: ['mixamorigLeftFoot', 'leftFoot', 'foot_l'] },
  { id: 'rightFoot', label: '右脚', candidates: ['mixamorigRightFoot', 'rightFoot', 'foot_r'] },
] as const;

const DIRECTOR_HAND_BONE_CONTROLS = [
  { id: 'leftThumb', label: '左拇', candidates: ['mixamorigLeftHandThumb1', 'mixamorigLeftHandThumb2', 'leftThumb', 'thumb_l'] },
  { id: 'leftIndex', label: '左食', candidates: ['mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2', 'leftIndex', 'index_l'] },
  { id: 'leftMiddle', label: '左中', candidates: ['mixamorigLeftHandMiddle1', 'mixamorigLeftHandMiddle2', 'leftMiddle', 'middle_l'] },
  { id: 'leftRing', label: '左无', candidates: ['mixamorigLeftHandRing1', 'mixamorigLeftHandRing2', 'leftRing', 'ring_l'] },
  { id: 'leftPinky', label: '左小', candidates: ['mixamorigLeftHandPinky1', 'mixamorigLeftHandPinky2', 'leftPinky', 'pinky_l'] },
  { id: 'rightThumb', label: '右拇', candidates: ['mixamorigRightHandThumb1', 'mixamorigRightHandThumb2', 'rightThumb', 'thumb_r'] },
  { id: 'rightIndex', label: '右食', candidates: ['mixamorigRightHandIndex1', 'mixamorigRightHandIndex2', 'rightIndex', 'index_r'] },
  { id: 'rightMiddle', label: '右中', candidates: ['mixamorigRightHandMiddle1', 'mixamorigRightHandMiddle2', 'rightMiddle', 'middle_r'] },
  { id: 'rightRing', label: '右无', candidates: ['mixamorigRightHandRing1', 'mixamorigRightHandRing2', 'rightRing', 'ring_r'] },
  { id: 'rightPinky', label: '右小', candidates: ['mixamorigRightHandPinky1', 'mixamorigRightHandPinky2', 'rightPinky', 'pinky_r'] },
] as const;

type DirectorHandSide = 'left' | 'right';
type DirectorHandPoseId = 'open' | 'fist' | 'point' | 'relaxed';

const DIRECTOR_HAND_POSE_PRESETS: Array<{ id: DirectorHandPoseId; label: string }> = [
  { id: 'open', label: '张手' },
  { id: 'fist', label: '握拳' },
  { id: 'point', label: '指向' },
  { id: 'relaxed', label: '放松手' },
];

const DIRECTOR_FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
const DIRECTOR_FINGER_SEGMENTS = [1, 2, 3] as const;

function directorHandBoneName(side: DirectorHandSide, finger: typeof DIRECTOR_FINGER_NAMES[number], segment: typeof DIRECTOR_FINGER_SEGMENTS[number]) {
  return `mixamorig${side === 'left' ? 'Left' : 'Right'}Hand${finger}${segment}`;
}

function buildDirectorHandPoseRotations(side: DirectorHandSide, poseId: DirectorHandPoseId, availableBones: string[]) {
  const available = new Set(availableBones);
  const rotations: DirectorRigSettings['boneRotations'] = {};
  const curlByPose = (finger: typeof DIRECTOR_FINGER_NAMES[number], segment: number) => {
    if (poseId === 'open') return 0;
    if (poseId === 'relaxed') return finger === 'Thumb' ? 12 : segment === 1 ? 18 : 24;
    if (poseId === 'point' && finger === 'Index') return 0;
    if (poseId === 'point' && finger === 'Thumb') return 18;
    return finger === 'Thumb' ? 34 : segment === 1 ? 52 : 68;
  };

  DIRECTOR_FINGER_NAMES.forEach((finger) => {
    DIRECTOR_FINGER_SEGMENTS.forEach((segment) => {
      const boneName = directorHandBoneName(side, finger, segment);
      if (!available.has(boneName)) return;
      const curl = curlByPose(finger, segment);
      rotations[boneName] = {
        x: finger === 'Thumb' ? Math.round(curl * 0.45) : 0,
        y: finger === 'Thumb' ? (side === 'left' ? -curl : curl) : 0,
        z: side === 'left' ? -curl : curl,
      };
    });
  });

  const handBone = `mixamorig${side === 'left' ? 'Left' : 'Right'}Hand`;
  if (available.has(handBone) && poseId === 'point') {
    rotations[handBone] = { x: 0, y: side === 'left' ? -8 : 8, z: side === 'left' ? -8 : 8 };
  }

  return rotations;
}

function findControlBone(root: THREE.Object3D, candidates: readonly string[]): THREE.Bone | null {
  const bones: THREE.Bone[] = [];
  const lowered = candidates.map((candidate) => candidate.toLowerCase());
  root.traverse((object: any) => {
    if (object.isBone && object.name) bones.push(object as THREE.Bone);
  });
  return bones.find((bone) => lowered.some((candidate) => bone.name.toLowerCase() === candidate))
    || bones.find((bone) => lowered.some((candidate) => bone.name.toLowerCase().includes(candidate)))
    || null;
}

function createDirectorBoneControls(root: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'director-bone-controls';
  const geometry = new THREE.SphereGeometry(0.055, 18, 12);
  const material = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.92, depthTest: false });
  [...DIRECTOR_BONE_CONTROLS, ...DIRECTOR_HAND_BONE_CONTROLS].forEach((control) => {
    const bone = findControlBone(root, control.candidates);
    if (!bone?.name) return;
    const handle = new THREE.Mesh(geometry, material);
    handle.name = `control-${control.id}`;
    handle.renderOrder = 20;
    handle.userData.directorBoneControl = true;
    handle.userData.boneName = bone.name;
    handle.userData.controlLabel = control.label;
    handle.userData.sourceBone = bone;
    group.add(handle);
  });
  return group;
}

function updateDirectorBoneControls(group: THREE.Group | null) {
  if (!group) return;
  const world = new THREE.Vector3();
  group.children.forEach((child: any) => {
    const bone = child.userData?.sourceBone as THREE.Bone | undefined;
    if (!bone) return;
    bone.getWorldPosition(world);
    child.position.copy(world);
  });
}

function q(x = 0, y = 0, z = 0) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z),
  ));
}

function boneQuaternionTrack(boneName: string, frames: Array<[number, THREE.Quaternion]>) {
  return new THREE.QuaternionKeyframeTrack(
    `${boneName}.quaternion`,
    frames.map(([time]) => time),
    frames.flatMap(([, quat]) => [quat.x, quat.y, quat.z, quat.w]),
  );
}

function createDirectorBuiltinActionClips(packId: string) {
  if (packId.includes('basic')) {
    return [
      new THREE.AnimationClip('Standing Pose', 1, [
        boneQuaternionTrack('mixamorigHips', [[0, q(0, 0, 0)], [1, q(0, 0, 0)]]),
        boneQuaternionTrack('mixamorigSpine', [[0, q(0, 0, 0)], [1, q(0, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftArm', [[0, q(0, 0, 16)], [1, q(0, 0, 16)]]),
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -16)], [1, q(0, 0, -16)]]),
      ]),
      new THREE.AnimationClip('Sitting Pose', 1, [
        boneQuaternionTrack('mixamorigHips', [[0, q(-8, 0, 0)], [1, q(-8, 0, 0)]]),
        boneQuaternionTrack('mixamorigSpine', [[0, q(10, 0, 0)], [1, q(10, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(-82, 0, 9)], [1, q(-82, 0, 9)]]),
        boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(-82, 0, -9)], [1, q(-82, 0, -9)]]),
        boneQuaternionTrack('mixamorigLeftLeg', [[0, q(84, 0, 0)], [1, q(84, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightLeg', [[0, q(84, 0, 0)], [1, q(84, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftArm', [[0, q(10, 0, 18)], [1, q(10, 0, 18)]]),
        boneQuaternionTrack('mixamorigRightArm', [[0, q(10, 0, -18)], [1, q(10, 0, -18)]]),
      ]),
      new THREE.AnimationClip('Crouch Pose', 1, [
        boneQuaternionTrack('mixamorigHips', [[0, q(-24, 0, 0)], [1, q(-24, 0, 0)]]),
        boneQuaternionTrack('mixamorigSpine', [[0, q(24, 0, 0)], [1, q(24, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(-72, 0, 12)], [1, q(-72, 0, 12)]]),
        boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(-72, 0, -12)], [1, q(-72, 0, -12)]]),
        boneQuaternionTrack('mixamorigLeftLeg', [[0, q(92, 0, 0)], [1, q(92, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightLeg', [[0, q(92, 0, 0)], [1, q(92, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftFoot', [[0, q(-16, 0, 0)], [1, q(-16, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightFoot', [[0, q(-16, 0, 0)], [1, q(-16, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftArm', [[0, q(4, 0, 42)], [1, q(4, 0, 42)]]),
        boneQuaternionTrack('mixamorigRightArm', [[0, q(4, 0, -42)], [1, q(4, 0, -42)]]),
      ]),
      new THREE.AnimationClip('Walking Pose', 1.2, [
        boneQuaternionTrack('mixamorigHips', [[0, q(-4, 0, 0)], [0.6, q(-4, 0, 0)], [1.2, q(-4, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(-32, 0, 0)], [0.6, q(18, 0, 0)], [1.2, q(-32, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(18, 0, 0)], [0.6, q(-32, 0, 0)], [1.2, q(18, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftLeg', [[0, q(22, 0, 0)], [0.6, q(4, 0, 0)], [1.2, q(22, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightLeg', [[0, q(4, 0, 0)], [0.6, q(22, 0, 0)], [1.2, q(4, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftArm', [[0, q(0, 0, 34)], [0.6, q(0, 0, -14)], [1.2, q(0, 0, 34)]]),
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -14)], [0.6, q(0, 0, 34)], [1.2, q(0, 0, -14)]]),
      ]),
      new THREE.AnimationClip('Running Pose', 1, [
        boneQuaternionTrack('mixamorigHips', [[0, q(-12, 0, 0)], [0.5, q(-12, 0, 0)], [1, q(-12, 0, 0)]]),
        boneQuaternionTrack('mixamorigSpine', [[0, q(12, 0, 0)], [0.5, q(12, 0, 0)], [1, q(12, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(-54, 0, 0)], [0.5, q(34, 0, 0)], [1, q(-54, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(34, 0, 0)], [0.5, q(-54, 0, 0)], [1, q(34, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftLeg', [[0, q(42, 0, 0)], [0.5, q(8, 0, 0)], [1, q(42, 0, 0)]]),
        boneQuaternionTrack('mixamorigRightLeg', [[0, q(8, 0, 0)], [0.5, q(42, 0, 0)], [1, q(8, 0, 0)]]),
        boneQuaternionTrack('mixamorigLeftArm', [[0, q(0, 0, 62)], [0.5, q(0, 0, -28)], [1, q(0, 0, 62)]]),
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -28)], [0.5, q(0, 0, 62)], [1, q(0, 0, -28)]]),
      ]),
    ];
  }
  if (packId.includes('gesture')) {
    return [
      new THREE.AnimationClip('Wave', 1.4, [
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -58)], [0.35, q(0, 0, -112)], [0.7, q(0, 0, -70)], [1.05, q(0, 0, -112)], [1.4, q(0, 0, -58)]]),
        boneQuaternionTrack('mixamorigRightForeArm', [[0, q(0, 0, -42)], [0.35, q(0, 0, -92)], [0.7, q(0, 0, -30)], [1.05, q(0, 0, -92)], [1.4, q(0, 0, -42)]]),
        boneQuaternionTrack('mixamorigRightHand', [[0, q(0, 0, 0)], [0.35, q(0, 30, 0)], [0.7, q(0, -24, 0)], [1.05, q(0, 30, 0)], [1.4, q(0, 0, 0)]]),
      ]),
      new THREE.AnimationClip('Salute', 1.2, [
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -35)], [0.45, q(0, 0, -95)], [1.2, q(0, 0, -95)]]),
        boneQuaternionTrack('mixamorigRightForeArm', [[0, q(0, 0, -20)], [0.45, q(0, 0, -105)], [1.2, q(0, 0, -105)]]),
      ]),
      new THREE.AnimationClip('Point', 1.2, [
        boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -12)], [0.45, q(-8, 18, -78)], [1.2, q(-8, 18, -78)]]),
        boneQuaternionTrack('mixamorigRightForeArm', [[0, q(0, 0, -18)], [0.45, q(0, 0, -8)], [1.2, q(0, 0, -8)]]),
      ]),
    ];
  }
  return [
    new THREE.AnimationClip('Punch', 0.9, [
      boneQuaternionTrack('mixamorigSpine', [[0, q(0, 0, 0)], [0.35, q(0, -18, 0)], [0.9, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightArm', [[0, q(0, 0, -35)], [0.35, q(-8, 20, -98)], [0.9, q(0, 0, -35)]]),
      boneQuaternionTrack('mixamorigRightForeArm', [[0, q(0, 0, -80)], [0.35, q(0, 0, -5)], [0.9, q(0, 0, -80)]]),
    ]),
    new THREE.AnimationClip('Kick', 1.1, [
      boneQuaternionTrack('mixamorigHips', [[0, q(0, 0, 0)], [0.42, q(-7, 0, 0)], [1.1, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(0, 0, 0)], [0.42, q(-82, 0, -8)], [1.1, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightLeg', [[0, q(0, 0, 0)], [0.42, q(55, 0, 0)], [1.1, q(0, 0, 0)]]),
    ]),
    new THREE.AnimationClip('Flying Kick', 1.25, [
      boneQuaternionTrack('mixamorigHips', [[0, q(0, 0, 0)], [0.52, q(-18, 0, -12)], [1.25, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(0, 0, 0)], [0.52, q(-95, 8, -18)], [1.25, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(0, 0, 0)], [0.52, q(35, 0, 12)], [1.25, q(0, 0, 0)]]),
    ]),
    new THREE.AnimationClip('Jump', 1, [
      boneQuaternionTrack('mixamorigLeftUpLeg', [[0, q(0, 0, 0)], [0.35, q(25, 0, 0)], [0.7, q(-12, 0, 0)], [1, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightUpLeg', [[0, q(0, 0, 0)], [0.35, q(25, 0, 0)], [0.7, q(-12, 0, 0)], [1, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigLeftLeg', [[0, q(0, 0, 0)], [0.35, q(-35, 0, 0)], [1, q(0, 0, 0)]]),
      boneQuaternionTrack('mixamorigRightLeg', [[0, q(0, 0, 0)], [0.35, q(-35, 0, 0)], [1, q(0, 0, 0)]]),
    ]),
  ];
}

function buildAvatarMesh(avatar: PanoramaAvatar) {
  const group = new THREE.Group();
  group.name = avatar.name;
  group.userData.avatarId = avatar.id;
  const color = new THREE.Color(avatar.color || '#38bdf8');
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.02, transparent: true, opacity: avatar.opacity });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf8d8bd, roughness: 0.58 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.72 });
  const marker = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const root = panoramaAvatarPoseRootDefaults(avatar.poseId);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.24), dark);
  pelvis.position.y = 0.78;
  pelvis.castShadow = true;
  group.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.82, 8, 18), suit);
  torso.position.y = 1.34;
  torso.rotation.z = THREE.MathUtils.degToRad(root.rootRoll || 0);
  torso.rotation.x = THREE.MathUtils.degToRad(root.rootPitch || 0);
  torso.scale.set(1.04, 1.12, 0.72);
  torso.castShadow = true;
  group.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 16), skin);
  neck.position.y = 1.86;
  neck.castShadow = true;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 28, 20), skin);
  head.position.y = 2.08;
  head.scale.set(0.9, 1.05, 0.86);
  head.castShadow = true;
  group.add(head);

  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.2), marker);
  shoulder.position.y = 1.72;
  shoulder.castShadow = true;
  group.add(shoulder);

  const makeLimb = (length: number, radius: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 14), material);
    mesh.castShadow = true;
    return mesh;
  };
  const poseIsKick = avatar.poseId.includes('kick') || avatar.poseId.includes('roundhouse');
  const poseIsAir = avatar.poseId.includes('jump') || avatar.groundMode === 'floating';
  const parts = [
    { x: -0.48, y: 1.34, z: 0, rz: poseIsKick ? 68 : 22, rx: 8, len: 0.62, r: 0.055, mat: suit },
    { x: 0.48, y: 1.34, z: 0, rz: poseIsKick ? -42 : -22, rx: -8, len: 0.62, r: 0.055, mat: suit },
    { x: -0.18, y: 0.44, z: 0, rz: poseIsAir ? -18 : 7, rx: 0, len: 0.76, r: 0.07, mat: dark },
    { x: 0.18, y: poseIsKick ? 0.9 : 0.44, z: poseIsKick ? 0.03 : 0, rz: poseIsKick ? -86 : -7, rx: poseIsKick ? 10 : 0, len: 0.76, r: 0.07, mat: dark },
  ];
  parts.forEach((part) => {
    const mesh = makeLimb(part.len, part.r, part.mat);
    mesh.position.set(part.x, part.y, part.z);
    mesh.rotation.x = THREE.MathUtils.degToRad(part.rx);
    mesh.rotation.z = THREE.MathUtils.degToRad(part.rz);
    group.add(mesh);
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  group.position.set(avatar.distance * 0.2, avatar.heightOffset + (root.rootHeight || 0), 0);
  group.rotation.y = THREE.MathUtils.degToRad(avatar.heading || 0);
  group.scale.setScalar((avatar.scale || 1) * 1.18);
  return group;
}

async function loadActorModel(url: string) {
  if (shouldUseFbxLoader(url)) {
    const loader = new FBXLoader();
    return await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(url, (group) => {
        group.userData.animations = group.animations || [];
        resolve(group);
      }, undefined, (error) => reject(error));
    });
  }
  const loader = new GLTFLoader();
  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(url, (gltf) => {
      const root = gltf.scene || new THREE.Group();
      root.userData.animations = gltf.animations || [];
      resolve(root);
    }, undefined, (error) => reject(error));
  });
}

async function loadActionPackAnimations(url: string) {
  if (/^builtin:\/\/director-action-pack\//i.test(url)) {
    return { clips: createDirectorBuiltinActionClips(url), sourceRoot: new THREE.Group() };
  }
  if (shouldUseFbxLoader(url)) {
    const loader = new FBXLoader();
    const object = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(url, (group) => resolve(group), undefined, (error) => reject(error));
    });
    return { clips: object.animations || [], sourceRoot: object };
  }
  const loader = new GLTFLoader();
  return await new Promise<{ clips: THREE.AnimationClip[]; sourceRoot: THREE.Object3D }>((resolve, reject) => {
    loader.load(url, (gltf) => {
      resolve({ clips: gltf.animations || [], sourceRoot: gltf.scene || new THREE.Group() });
    }, undefined, (error) => reject(error));
  });
}

export function DirectorStudio({
  open,
  project,
  upstreamImages = [],
  upstreamModels = [],
  onClose,
  onProjectChange,
  onCaptureImage,
  onCaptureVideo,
}: DirectorStudioProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const actorRootRef = useRef<THREE.Group | null>(null);
  const loadedActorRef = useRef<THREE.Object3D | null>(null);
  const actorPreviewGroupRef = useRef<THREE.Group | null>(null);
  const cameraSyncingRef = useRef(false);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const boneControlGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const runtimeObjectsRef = useRef<{
    ambient: THREE.AmbientLight;
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    floor: THREE.Mesh;
    floorMaterial: THREE.MeshStandardMaterial;
    grid: THREE.GridHelper;
    backWall: THREE.Mesh;
  } | null>(null);
  const actorMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actorActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const actorClipNamesRef = useRef<string[]>([]);
  const playbackModeRef = useRef(project.actor?.playbackMode || 'static');
  const cleanProjectRef = useRef(sanitizeDirectorProject(project));
  const onProjectChangeRef = useRef(onProjectChange);
  const activePanelTabRef = useRef<DirectorPanelTab>('action');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<DirectorPanelTab>('action');
  const [actionPackUrl, setActionPackUrl] = useState('');
  const [actionLibraryQuery, setActionLibraryQuery] = useState('');
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [lastActionImportMessage, setLastActionImportMessage] = useState('');
  const [poseImportBusy, setPoseImportBusy] = useState(false);
  const [poseImportMessage, setPoseImportMessage] = useState('');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [actorState, setActorState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    message: string;
    modelUrl?: string;
    clipNames: string[];
    packMessages: string[];
  }>({ status: 'idle', message: '', clipNames: [], packMessages: [] });
  const cleanProject = useMemo(() => sanitizeDirectorProject(project), [project]);
  const activeActor = cleanProject.actors.find((actor) => actor.id === cleanProject.activeActorId) || cleanProject.actors[0];
  const activeAvatar = cleanProject.avatars[0];
  const actionPackSignature = useMemo(() => (
    cleanProject.actionPacks
      .map((pack) => `${pack.id}:${pack.enabled ? 1 : 0}:${pack.url}`)
      .join('|')
  ), [cleanProject.actionPacks]);
  const filteredActionResources = useMemo(() => {
    const query = actionLibraryQuery.trim().toLowerCase();
    if (!query) return DIRECTOR_ACTION_RESOURCE_LIBRARY;
    return DIRECTOR_ACTION_RESOURCE_LIBRARY.filter((resource) => {
      const haystack = [resource.label, resource.sourceLabel, ...resource.tags, resource.url].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [actionLibraryQuery]);
  const supportedPoseIds = useMemo(() => new Set(
    PANORAMA_AVATAR_POSES
      .filter((pose) => actorState.clipNames.length === 0 || Boolean(findSupportedAnimationClipName(actorState.clipNames, pose.id)))
      .map((pose) => pose.id),
  ), [actorState.clipNames]);

  const patchProject = useCallback((patch: Partial<DirectorProject>) => {
    onProjectChange(sanitizeDirectorProject({ ...cleanProject, ...patch, updatedAt: new Date().toISOString() }));
  }, [cleanProject, onProjectChange]);

  const patchActiveActor = useCallback((patch: Partial<typeof activeActor>) => {
    if (!activeActor) return;
    const nextActor = { ...activeActor, ...patch };
    patchProject({
      activeActorId: nextActor.id,
      actor: nextActor.actor,
      rig: nextActor.rig,
      actors: cleanProject.actors.map((item) => item.id === activeActor.id ? nextActor : item),
    });
  }, [activeActor, cleanProject.actors, patchProject]);

  useEffect(() => {
    playbackModeRef.current = activeActor?.actor.playbackMode || cleanProject.actor.playbackMode;
    cleanProjectRef.current = cleanProject;
  }, [activeActor?.actor.playbackMode, cleanProject]);

  useEffect(() => {
    cleanProjectRef.current = cleanProject;
  }, [cleanProject]);

  useEffect(() => {
    onProjectChangeRef.current = onProjectChange;
  }, [onProjectChange]);

  useEffect(() => {
    activePanelTabRef.current = activePanelTab;
  }, [activePanelTab]);

  useEffect(() => {
    if (!open || !mountRef.current) return;
    const mount = mountRef.current;
    mount.innerHTML = '';
    actorMixerRef.current = null;
    actorActionsRef.current = {};
    actorClipNamesRef.current = [];
    runtimeObjectsRef.current = null;
    actorRootRef.current = null;
    loadedActorRef.current = null;
    actorPreviewGroupRef.current = null;
    skeletonHelperRef.current = null;
    boneControlGroupRef.current = null;
    transformRef.current = null;
    orbitRef.current = null;
    setBoneNames([]);
    setActorState({ status: 'loading', message: '加载 3D 演员...', clipNames: [], packMessages: [] });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cleanProject.scene.backgroundColor);
    scene.fog = cleanProject.scene.fogEnabled ? new THREE.Fog(cleanProject.scene.backgroundColor, 20, 58) : null;
    sceneRef.current = scene;

    const width = Math.max(640, mount.clientWidth || 960);
    const height = Math.max(360, mount.clientHeight || 540);
    const camera = new THREE.PerspectiveCamera(cleanProject.camera.fov, width / height, 0.1, 100);
    camera.rotation.order = 'YXZ';
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, cleanProject.lights.ambientIntensity);
    const key = new THREE.DirectionalLight(cleanProject.lights.keyColor, cleanProject.lights.keyIntensity);
    key.position.set(cleanProject.lights.keyX, cleanProject.lights.keyY, cleanProject.lights.keyZ);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const rim = new THREE.DirectionalLight(cleanProject.lights.rimColor, cleanProject.lights.rimIntensity);
    rim.position.set(-5, 3.8, -6);
    scene.add(ambient, key, rim);

    const floorMaterial = new THREE.MeshStandardMaterial({ color: cleanProject.scene.floorColor, roughness: 0.9, metalness: 0.04 });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    floor.visible = cleanProject.scene.floorVisible;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, 0x0891b2, 0x1e293b);
    grid.name = 'director-grid';
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.62;
    grid.visible = cleanProject.scene.gridVisible;
    scene.add(grid);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 12),
      new THREE.MeshBasicMaterial({ color: 0x07111f, transparent: true, opacity: 0.72 }),
    );
    backWall.position.set(0, 6, -12);
    backWall.visible = cleanProject.scene.backdropVisible;
    scene.add(backWall);
    runtimeObjectsRef.current = { ambient, key, rim, floor, floorMaterial, grid, backWall };

    const avatars = new THREE.Group();
    avatars.name = 'director-fallback-avatars';
    cleanProject.avatars.filter((avatar) => avatar.visible).forEach((avatar, index) => {
      const avatarMesh = buildAvatarMesh(avatar);
      avatarMesh.position.x += (index - (cleanProject.avatars.length - 1) / 2) * 1.2;
      avatars.add(avatarMesh);
    });
    avatars.visible = false;
    scene.add(avatars);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.enabled = !cleanProject.camera.locked;
    orbitRef.current = orbit;
    cameraSyncingRef.current = true;
    applyCameraRig(camera, orbit, cleanProject.camera);
    cameraSyncingRef.current = false;
    orbit.addEventListener('end', () => {
      if (cameraSyncingRef.current || cleanProjectRef.current.camera.locked) return;
      const current = cleanProjectRef.current;
      onProjectChangeRef.current(sanitizeDirectorProject({
        ...current,
        camera: cameraSettingsFromOrbit(camera, orbit, current.camera),
        updatedAt: new Date().toISOString(),
      }));
    });
    const transform = new TransformControls(camera, renderer.domElement);
    transformRef.current = transform;
    const firstAvatar = avatars.children[0];
    if (firstAvatar) transform.attach(firstAvatar);
    transform.setMode(cleanProject.rig.transformMode);
    transform.addEventListener('dragging-changed', (event: any) => {
      orbit.enabled = !event.value && !cleanProjectRef.current.camera.locked;
    });
    transform.addEventListener('objectChange', () => {
      const object: any = transform.object;
      const current = cleanProjectRef.current;
      const currentActiveActor = current.actors.find((actor) => actor.id === current.activeActorId) || current.actors[0];
      if (actorRootRef.current && object === actorRootRef.current) {
        if (!currentActiveActor) return;
        const placement = actorPlacementFromRoot(actorRootRef.current);
        onProjectChangeRef.current(sanitizeDirectorProject({
          ...current,
          actors: current.actors.map((actor) => actor.id === currentActiveActor.id ? { ...actor, ...placement } : actor),
          updatedAt: new Date().toISOString(),
        }));
        return;
      }
      if (!object?.isBone || !object.name) return;
      const toDegrees = (radians: number) => Math.round(THREE.MathUtils.radToDeg(radians));
      const nextRig = {
        ...(currentActiveActor?.rig || current.rig),
        selectedBone: object.name,
        transformMode: (currentActiveActor?.rig.transformMode || current.rig.transformMode) === 'rotate' ? 'rotate' as const : current.rig.transformMode,
        boneRotations: {
          ...(currentActiveActor?.rig.boneRotations || current.rig.boneRotations),
          [object.name]: {
            x: toDegrees(object.rotation.x),
            y: toDegrees(object.rotation.y),
            z: toDegrees(object.rotation.z),
          },
        },
      };
      onProjectChangeRef.current(sanitizeDirectorProject({
        ...current,
        rig: nextRig,
        actors: currentActiveActor
          ? current.actors.map((actor) => actor.id === currentActiveActor.id ? { ...actor, rig: nextRig } : actor)
          : current.actors,
        updatedAt: new Date().toISOString(),
      }));
    });
    const transformHelper = transform.getHelper();
    transformHelper.visible = cleanProject.rig.showTransform;
    scene.add(transformHelper);

    const actorRoot = new THREE.Group();
    actorRoot.name = 'director-actor-root';
    actorRoot.visible = false;
    scene.add(actorRoot);
    actorRootRef.current = actorRoot;
    const actorPreviewGroup = new THREE.Group();
    actorPreviewGroup.name = 'director-actor-preview-group';
    scene.add(actorPreviewGroup);
    actorPreviewGroupRef.current = actorPreviewGroup;
    const actorMixer = new THREE.AnimationMixer(actorRoot);
    actorMixerRef.current = actorMixer;
    let disposed = false;

    const pickBoneFromPointer = (event: MouseEvent) => {
      const actor = loadedActorRef.current;
      if (!actor || !renderer.domElement.contains(event.target as Node)) return;
      const current = cleanProjectRef.current;
      if (event.type === 'click' && current.rig.transformMode !== 'rotate' && activePanelTabRef.current !== 'skeleton') return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const controls = boneControlGroupRef.current?.children || [];
      const meshes: THREE.Object3D[] = [...controls];
      actor.traverse((object: any) => {
        if (object.isMesh || object.isSkinnedMesh) meshes.push(object);
      });
      raycasterRef.current.setFromCamera(pointer, camera);
      const hit = raycasterRef.current.intersectObjects(meshes, true)[0];
      if (!hit) return;
      const controlBoneName = hit.object.userData?.directorBoneControl ? hit.object.userData.boneName : '';
      const bone = controlBoneName ? findBone(actor, controlBoneName) : findNearestBone(actor, hit.point);
      if (!bone?.name) return;
      onProjectChangeRef.current(sanitizeDirectorProject({
        ...current,
        rig: {
          ...(current.actors.find((actor) => actor.id === current.activeActorId)?.rig || current.rig),
          selectedBone: bone.name,
          showSkeleton: true,
          showTransform: true,
          transformMode: 'rotate',
        },
        actors: current.actors.map((actor) => actor.id === current.activeActorId ? {
          ...actor,
          rig: {
            ...actor.rig,
            selectedBone: bone.name,
            showSkeleton: true,
            showTransform: true,
            transformMode: 'rotate',
          },
        } : actor),
        updatedAt: new Date().toISOString(),
      }));
      setActivePanelTab('skeleton');
    };
    renderer.domElement.addEventListener('click', pickBoneFromPointer);
    renderer.domElement.addEventListener('dblclick', pickBoneFromPointer);

    const requestedModelUrl = cleanProject.actor.modelUrl || DIRECTOR_DEFAULT_ACTOR_MODEL_URL;
    const candidateModelUrls = Array.from(new Set([
      requestedModelUrl,
      DIRECTOR_DEFAULT_ACTOR_MODEL_URL,
      DIRECTOR_FALLBACK_ACTOR_MODEL_URL,
    ].filter(Boolean)));

    const loadFirstAvailableActor = async () => {
      let lastError: unknown = null;
      for (const modelUrl of candidateModelUrls) {
        try {
          const loadedRoot = await loadActorModel(modelUrl);
          return { loadedRoot, modelUrl };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    };

    loadFirstAvailableActor()
      .then(async ({ loadedRoot, modelUrl }) => {
        if (disposed) {
          disposeObject(loadedRoot);
          return;
        }
        actorRoot.add(loadedRoot);
        loadedActorRef.current = loadedRoot;
        if (activeActor) placeActorRoot(actorRoot, activeActor);
        avatars.visible = false;
        transform.attach(actorRoot);
        loadedRoot.traverse((object: any) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        applyBoneRotations(loadedRoot, cleanProject.rig.boneRotations);
        const nextBoneNames: string[] = [];
        loadedRoot.traverse((object: any) => {
          if (object.isBone && object.name) nextBoneNames.push(object.name);
        });
        setBoneNames(Array.from(new Set(nextBoneNames)).slice(0, 120));
        const skeletonHelper = new THREE.SkeletonHelper(loadedRoot);
        skeletonHelper.visible = cleanProject.rig.showSkeleton;
        scene.add(skeletonHelper);
        skeletonHelperRef.current = skeletonHelper;
        const boneControls = createDirectorBoneControls(loadedRoot);
        boneControls.visible = cleanProject.rig.showSkeleton;
        scene.add(boneControls);
        boneControlGroupRef.current = boneControls;
        const box = new THREE.Box3().setFromObject(loadedRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const actorScale = (1.75 / Math.max(size.y || 1, 0.01)) * (cleanProject.actor.scale || 1);
        loadedRoot.scale.setScalar(actorScale);
        loadedRoot.position.set(-center.x * actorScale, 0, -center.z * actorScale);
        loadedRoot.position.y -= box.min.y * actorScale;
        const clips = (loadedRoot.userData.animations || []) as THREE.AnimationClip[];
        const targetSkinnedMesh = findFirstSkinnedMesh(loadedRoot);
        const packMessages: string[] = [];
        actorClipNamesRef.current = clips.map((clip) => clip.name);
        actorActionsRef.current = {};
        clips.forEach((clip) => {
          const action = actorMixer.clipAction(clip);
          action.loop = THREE.LoopRepeat;
          actorActionsRef.current[clip.name] = action;
        });
        const hasMixamoRig = nextBoneNames.some((name) => name.toLowerCase().startsWith('mixamorig'));
        const autoActionPacks = hasMixamoRig ? DIRECTOR_AUTO_ACTION_PACK_URLS
          .filter((url) => !cleanProject.actionPacks.some((pack) => pack.url === url))
          .map((url) => ({ id: url, name: modelNameFromUrl(url), source: 'builtin' as const, url, enabled: true })) : [];
        const enabledActionPacks = [...autoActionPacks, ...cleanProject.actionPacks.filter((pack) => pack.enabled && pack.url)];
        await Promise.all(enabledActionPacks.map(async (actionPack) => {
          try {
            const loadedPack = await loadActionPackAnimations(actionPack.url);
            const sourceSkinnedMesh = findFirstSkinnedMesh(loadedPack.sourceRoot);
            const packClips = loadedPack.clips.map((clip) => {
              if (!targetSkinnedMesh || !sourceSkinnedMesh) return clip;
              try {
                return SkeletonUtils.retargetClip(targetSkinnedMesh, sourceSkinnedMesh, clip, {
                  useFirstFramePosition: true,
                } as any);
              } catch {
                return clip;
              }
            });
            packClips.forEach((clip) => {
              const clipName = actorActionsRef.current[clip.name] ? `${actionPack.name} / ${clip.name}` : clip.name;
              const renamedClip = clip.clone();
              renamedClip.name = clipName;
              const action = actorMixer.clipAction(renamedClip);
              action.loop = THREE.LoopRepeat;
              actorActionsRef.current[clipName] = action;
              actorClipNamesRef.current.push(clipName);
            });
            packMessages.push(`${actionPack.name}: ${packClips.length} 段${targetSkinnedMesh && sourceSkinnedMesh ? ' · 自动重定向' : ''}`);
          } catch (error: any) {
            packMessages.push(`${actionPack.name}: 加载失败`);
          }
        }));
        const activeName = findBestAnimationClipName(actorClipNamesRef.current, activeAvatar?.poseId || cleanProject.actor.activeAnimation || 'standing', 'Idle');
        Object.entries(actorActionsRef.current).forEach(([name, action]) => {
          if (name === activeName) {
            if (cleanProject.actor.playbackMode === 'static') sampleStaticPose(action, actorMixer, cleanProject.actor.staticPoseTime);
            else {
              action.reset().fadeIn(0.2).play();
              action.paused = false;
            }
          }
          else action.stop();
        });
        setActorState({
          status: 'ready',
          message: `${modelNameFromUrl(modelUrl)} · ${actorClipNamesRef.current.length || 0} 段动画`,
          modelUrl,
          clipNames: actorClipNamesRef.current,
          packMessages,
        });
        if ((activeName && cleanProject.actor.activeAnimation !== activeName) || modelUrl !== cleanProject.actor.modelUrl) {
          const nextActorSettings = {
            ...cleanProject.actor,
            source: modelUrl === DIRECTOR_DEFAULT_ACTOR_MODEL_URL || modelUrl === DIRECTOR_FALLBACK_ACTOR_MODEL_URL ? 'builtin' as const : cleanProject.actor.source,
            modelUrl,
            activeAnimation: activeName || cleanProject.actor.activeAnimation,
          };
          patchProject({
            actor: nextActorSettings,
            actors: activeActor ? cleanProject.actors.map((item) => item.id === activeActor.id ? {
              ...item,
              actor: nextActorSettings,
            } : item) : cleanProject.actors,
          });
        }
      })
      .catch((error) => {
        if (disposed) return;
        console.warn('导演台演员加载失败', error);
        actorRoot.visible = false;
        avatars.visible = false;
        setActorState({ status: 'error', message: '演员模型加载失败，请在骨骼页切换模型或导入可用 GLB/FBX', clipNames: [], packMessages: [] });
      });

    let frame = 0;
    const render = () => {
      frame = window.requestAnimationFrame(render);
      if (playbackModeRef.current === 'animated') actorMixer.update(1 / 60);
      if (loadedActorRef.current) {
        const current = cleanProjectRef.current;
        const active = current.actors.find((actor) => actor.id === current.activeActorId) || current.actors[0];
        applyBoneRotations(loadedActorRef.current, active?.rig.boneRotations || current.rig.boneRotations);
      }
      updateDirectorBoneControls(boneControlGroupRef.current);
      orbit.update();
      renderer.render(scene, camera);
    };
    render();

    let resizeFrame = 0;
    const resizeDirectorViewport = () => {
      resizeFrame = 0;
      const nextWidth = Math.max(640, mount.clientWidth || width);
      const nextHeight = Math.max(360, mount.clientHeight || height);
      camera.aspect = nextWidth / nextHeight;
      cameraSyncingRef.current = true;
      applyCameraRig(camera, orbit, cleanProject.camera);
      cameraSyncingRef.current = false;
      renderer.setSize(nextWidth, nextHeight);
    };
    const scheduleDirectorResize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resizeDirectorViewport);
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleDirectorResize) : null;
    resizeObserver?.observe(mount);
    window.addEventListener('resize', scheduleDirectorResize);

    return () => {
      window.removeEventListener('resize', scheduleDirectorResize);
      resizeObserver?.disconnect();
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      renderer.domElement.removeEventListener('click', pickBoneFromPointer);
      renderer.domElement.removeEventListener('dblclick', pickBoneFromPointer);
      window.cancelAnimationFrame(frame);
      disposed = true;
      transform.dispose();
      orbit.dispose();
      actorMixer.stopAllAction();
      actorMixer.uncacheRoot(actorRoot);
      disposeObject(scene);
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch {}
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [actionPackSignature, cleanProject.actor.modelUrl, cleanProject.actor.scale, activeActor?.id, open]);

  useEffect(() => {
    if (!open || !actorRootRef.current || !activeActor) return;
    placeActorRoot(actorRootRef.current, activeActor);
  }, [activeActor?.heading, activeActor?.id, activeActor?.visible, activeActor?.x, activeActor?.y, activeActor?.z, cleanProject.actors, open]);

  useEffect(() => {
    const group = actorPreviewGroupRef.current;
    if (!open || !group) return;
    let disposed = false;
    const previewActors = cleanProject.actors.filter((actor) => actor.id !== cleanProject.activeActorId);
    group.clear();

    previewActors.forEach((actor) => {
      const previewRoot = new THREE.Group();
      previewRoot.name = `director-actor-preview-root-${actor.id}`;
      placeActorRoot(previewRoot, actor);
      group.add(previewRoot);
      if (actor.visible === false) return;
      loadActorModel(actor.actor.modelUrl)
        .then((loadedRoot) => {
          if (disposed) {
            disposeObject(loadedRoot);
            return;
          }
          loadedRoot.name = `director-actor-preview-${actor.id}`;
          loadedRoot.traverse((object: any) => {
            if (object.isMesh) {
              object.castShadow = true;
              object.receiveShadow = true;
            }
          });
          applyBoneRotations(loadedRoot, actor.rig.boneRotations);
          const box = new THREE.Box3().setFromObject(loadedRoot);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const actorScale = (1.75 / Math.max(size.y || 1, 0.01)) * (actor.actor.scale || 1);
          loadedRoot.scale.setScalar(actorScale);
          loadedRoot.position.set(-center.x * actorScale, 0, -center.z * actorScale);
          loadedRoot.position.y -= box.min.y * actorScale;
          previewRoot.add(loadedRoot);
        })
        .catch((error) => {
          console.warn('导演台预览演员加载失败', actor.name, error);
        });
    });

    return () => {
      disposed = true;
      group.clear();
    };
  }, [cleanProject.activeActorId, cleanProject.actors, open]);

  useEffect(() => {
    if (!open || !cameraRef.current) return;
    if (orbitRef.current) orbitRef.current.enabled = !cleanProject.camera.locked;
    cameraSyncingRef.current = true;
    applyCameraRig(cameraRef.current, orbitRef.current, cleanProject.camera);
    cameraSyncingRef.current = false;
  }, [cleanProject.camera, open]);

  useEffect(() => {
    const actorMixer = actorMixerRef.current;
    const actions = actorActionsRef.current;
    const activeName = cleanProject.actor.activeAnimation;
    if (!open || !actorMixer || !activeName || !actions[activeName]) return;
    Object.entries(actions).forEach(([name, action]) => {
      if (name === activeName) {
        if (cleanProject.actor.playbackMode === 'static') sampleStaticPose(action, actorMixer, cleanProject.actor.staticPoseTime);
        else {
          action.reset().fadeIn(0.18).play();
          action.paused = false;
        }
      } else {
        action.fadeOut(0.12);
      }
    });
  }, [cleanProject.actor.activeAnimation, cleanProject.actor.playbackMode, cleanProject.actor.staticPoseTime, open]);

  useEffect(() => {
    const runtime = runtimeObjectsRef.current;
    if (!open || !runtime || !sceneRef.current) return;
    runtime.ambient.intensity = cleanProject.lights.ambientIntensity;
    runtime.key.intensity = cleanProject.lights.keyIntensity;
    runtime.key.color.set(cleanProject.lights.keyColor);
    runtime.key.position.set(cleanProject.lights.keyX, cleanProject.lights.keyY, cleanProject.lights.keyZ);
    runtime.rim.intensity = cleanProject.lights.rimIntensity;
    runtime.rim.color.set(cleanProject.lights.rimColor);
  }, [cleanProject.lights, open]);

  useEffect(() => {
    const runtime = runtimeObjectsRef.current;
    const scene = sceneRef.current;
    if (!open || !runtime || !scene) return;
    scene.background = new THREE.Color(cleanProject.scene.backgroundColor);
    scene.fog = cleanProject.scene.fogEnabled ? new THREE.Fog(cleanProject.scene.backgroundColor, 20, 58) : null;
    runtime.floorMaterial.color.set(cleanProject.scene.floorColor);
    runtime.floor.visible = cleanProject.scene.floorVisible;
    runtime.grid.visible = cleanProject.scene.gridVisible;
    runtime.grid.scale.setScalar(cleanProject.scene.gridSize / 30);
    runtime.backWall.visible = cleanProject.scene.backdropVisible;
  }, [cleanProject.scene, open]);

  useEffect(() => {
    if (!open) return;
    const transform = transformRef.current;
    const helper = transform?.getHelper();
    if (transform) transform.setMode(cleanProject.rig.transformMode);
    if (helper) helper.visible = cleanProject.rig.showTransform;
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = cleanProject.rig.showSkeleton;
    if (boneControlGroupRef.current) boneControlGroupRef.current.visible = cleanProject.rig.showSkeleton;
    if (loadedActorRef.current) {
      applyBoneRotations(loadedActorRef.current, cleanProject.rig.boneRotations);
      const selectedBone = findBone(loadedActorRef.current, cleanProject.rig.selectedBone);
      if (selectedBone && transform) transform.attach(selectedBone);
      else if (actorRootRef.current && transform) transform.attach(actorRootRef.current);
    }
  }, [cleanProject.rig, open]);

  const setMode = (mode: DirectorMode) => patchProject({ mode });
  const setPlaybackMode = (playbackMode: DirectorProject['actor']['playbackMode']) => {
    if (!activeActor) return;
    patchActiveActor({ actor: { ...activeActor.actor, playbackMode } });
  };
  const setStaticPoseTime = (staticPoseTime: number) => {
    if (!activeActor) return;
    patchActiveActor({ actor: { ...activeActor.actor, staticPoseTime } });
  };
  const setActorModel = (modelUrl: string, source: DirectorProject['actor']['source']) => {
    if (!activeActor) return;
    patchActiveActor({
      actor: {
        ...activeActor.actor,
        source,
        modelUrl,
        activeAnimation: modelUrl === DIRECTOR_FALLBACK_ACTOR_MODEL_URL ? 'Idle' : 'Standing Pose',
      },
      rig: {
        ...activeActor.rig,
        selectedBone: '',
        boneRotations: {},
        transformMode: 'rotate',
        showSkeleton: true,
        showTransform: true,
      },
    });
    setActivePanelTab('skeleton');
  };
  const addActionPack = (url: string, source: 'url' | 'upstream' | 'builtin' = 'url') => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setLastActionImportMessage('请输入 GLB / GLTF / FBX 动作包 URL');
      return;
    }
    const existing = cleanProject.actionPacks.find((pack) => pack.url === cleanUrl);
    if (existing) {
      setLastActionImportMessage(`${existing.name} 已在工程里${existing.enabled ? '，正在使用' : '，但已停用'}`);
      return;
    }
    const nextPack = {
      id: `action-pack-${Date.now()}`,
      name: modelNameFromUrl(cleanUrl).replace(/\.(glb|gltf|fbx)$/i, '') || `动作包 ${cleanProject.actionPacks.length + 1}`,
      source,
      url: cleanUrl,
      enabled: true,
    } as const;
    patchProject({ actionPacks: [...cleanProject.actionPacks, nextPack] });
    setLastActionImportMessage(`已加入 ${nextPack.name}，正在重载动作`);
    setActionPackUrl('');
  };
  const removeActionPack = (id: string) => {
    patchProject({ actionPacks: cleanProject.actionPacks.filter((pack) => pack.id !== id) });
  };
  const toggleActionPack = (id: string) => {
    patchProject({
      actionPacks: cleanProject.actionPacks.map((pack) => (
        pack.id === id ? { ...pack, enabled: !pack.enabled } : pack
      )),
    });
  };
  const patchCamera = (camera: Partial<DirectorProject['camera']>) => {
    if (cleanProject.camera.locked && !Object.prototype.hasOwnProperty.call(camera, 'locked')) return;
    patchProject({ camera: { ...cleanProject.camera, ...camera } });
  };
  const patchLights = (lights: Partial<DirectorProject['lights']>) => {
    if (cleanProject.lights.locked && !Object.prototype.hasOwnProperty.call(lights, 'locked')) return;
    patchProject({ lights: { ...cleanProject.lights, ...lights } });
  };
  const patchScene = (scene: Partial<DirectorProject['scene']>) => {
    patchProject({ scene: { ...cleanProject.scene, ...scene } });
  };
  const patchRig = (rig: Partial<DirectorProject['rig']>) => {
    if (!activeActor) return;
    patchActiveActor({ rig: { ...activeActor.rig, ...rig } });
  };
  const setScenePreset = (preset: DirectorScenePreset) => {
    const config = DIRECTOR_SCENE_PRESETS.find((item) => item.id === preset);
    patchScene({
      preset,
      ...(config ? { backgroundColor: config.background, floorColor: config.floor } : {}),
    });
  };
  const setSelectedBoneRotation = (axis: 'x' | 'y' | 'z', value: number) => {
    const selectedBone = cleanProject.rig.selectedBone || '';
    if (!selectedBone) return;
    const current = cleanProject.rig.boneRotations[selectedBone] || { x: 0, y: 0, z: 0 };
    patchRig({
      selectedBone,
      boneRotations: {
        ...cleanProject.rig.boneRotations,
        [selectedBone]: { ...current, [axis]: value },
      },
    });
  };
  const selectActorRootForMove = () => {
    if (actorRootRef.current && transformRef.current) transformRef.current.attach(actorRootRef.current);
    patchRig({
      selectedBone: '',
      transformMode: 'translate',
      showTransform: true,
      showSkeleton: true,
    });
    setActivePanelTab('skeleton');
  };
  const applyDirectorHandPose = (side: DirectorHandSide, poseId: DirectorHandPoseId) => {
    if (!activeActor) return;
    const rotations = buildDirectorHandPoseRotations(side, poseId, boneNames);
    const firstBone = Object.keys(rotations)[0] || '';
    if (!firstBone) {
      setPoseImportMessage('当前模型没有识别到 Mixamo 手指骨，换骨骼人形或导入带手指骨的模型后可用。');
      return;
    }
    patchRig({
      showSkeleton: true,
      showTransform: true,
      transformMode: 'rotate',
      selectedBone: firstBone,
      boneRotations: {
        ...activeActor.rig.boneRotations,
        ...rotations,
      },
    });
    setActivePanelTab('skeleton');
  };
  const resetActiveActorRigForAction = () => {
    if (!activeActor) return cleanProject.rig;
    return {
      ...activeActor.rig,
      selectedBone: '',
      boneRotations: {},
      transformMode: 'rotate' as const,
    };
  };
  const addActor = (kind: 'skeleton' | 'expression') => {
    onProjectChange(addDirectorActor(cleanProject, kind));
    setActivePanelTab('action');
  };
  const selectActor = (actorId: string) => {
    onProjectChange(selectDirectorActor(cleanProject, actorId));
    setActivePanelTab('action');
  };
  const deleteActor = (actorId: string) => {
    onProjectChange(removeDirectorActor(cleanProject, actorId));
    setActivePanelTab('action');
  };
  const patchActorPlacement = (actorId: string, placement: Partial<Pick<typeof activeActor, 'x' | 'y' | 'z' | 'heading' | 'visible'>>) => {
    const actor = cleanProject.actors.find((item) => item.id === actorId);
    if (!actor) return;
    onProjectChange(sanitizeDirectorProject({
      ...cleanProject,
      actors: cleanProject.actors.map((item) => item.id === actorId ? { ...item, ...placement } : item),
      updatedAt: new Date().toISOString(),
    }));
  };
  const importPoseFromImage = async (imageUrl: string, index: number) => {
    if (!imageUrl || poseImportBusy) return;
    setPoseImportBusy(true);
    setPoseImportMessage(`正在识别参考图 ${index + 1} 的人体姿势...`);
    try {
      const result = await detectDirectorPoseFromImage(imageUrl);
      if (!result) {
        setPoseImportMessage(`参考图 ${index + 1} 没有识别到清晰人体姿势`);
        return;
      }
      onProjectChange(sanitizeDirectorProject({
        ...cleanProject,
        actor: activeActor ? {
          ...activeActor.actor,
          source: 'builtin',
          modelUrl: DIRECTOR_DEFAULT_ACTOR_MODEL_URL,
          activeAnimation: 'Standing Pose',
          playbackMode: 'static',
        } : cleanProject.actor,
        rig: activeActor ? {
          ...activeActor.rig,
          showSkeleton: true,
          showTransform: true,
          transformMode: 'rotate',
          selectedBone: 'mixamorigHips',
          boneRotations: {
            ...activeActor.rig.boneRotations,
            ...result.boneRotations,
          },
        } : cleanProject.rig,
        actors: activeActor ? cleanProject.actors.map((item) => item.id === activeActor.id ? {
          ...item,
          actor: {
            ...item.actor,
            source: 'builtin',
            modelUrl: DIRECTOR_DEFAULT_ACTOR_MODEL_URL,
            activeAnimation: 'Standing Pose',
            playbackMode: 'static',
          },
          rig: {
            ...item.rig,
            showSkeleton: true,
            showTransform: true,
            transformMode: 'rotate',
            selectedBone: 'mixamorigHips',
            boneRotations: {
              ...item.rig.boneRotations,
              ...result.boneRotations,
            },
          },
        } : item) : cleanProject.actors,
        updatedAt: new Date().toISOString(),
      }));
      setPoseImportMessage(`已从参考图 ${index + 1} 生成 3D 骨骼姿势，可继续拖动关节微调`);
      setActivePanelTab('skeleton');
    } catch (error) {
      setPoseImportMessage(error instanceof Error ? error.message : '姿势识别失败');
    } finally {
      setPoseImportBusy(false);
    }
  };
  const setPose = (poseId: PanoramaAvatarPoseId) => {
    if (!activeAvatar) return;
    const clipName = findSupportedAnimationClipName(actorClipNamesRef.current, poseId);
    const next = applyDirectorAvatarPose(cleanProject, activeAvatar.id, poseId);
    if (actorClipNamesRef.current.length > 0 && !clipName) {
      setLastActionImportMessage(`${panoramaAvatarPoseLabel(poseId)} 还没有匹配的 3D 动作；请导入 Mixamo/FBX 动作包或使用基础姿势。`);
      setActivePanelTab('action');
      onProjectChange(next);
      return;
    }
    const nextClipName = clipName || findBestAnimationClipName(actorClipNamesRef.current, poseId, 'Idle');
    Object.entries(actorActionsRef.current).forEach(([name, action]) => {
      if (name === nextClipName) {
        if (cleanProject.actor.playbackMode === 'static' && actorMixerRef.current) sampleStaticPose(action, actorMixerRef.current, cleanProject.actor.staticPoseTime);
        else {
          action.reset().fadeIn(0.18).play();
          action.paused = false;
        }
      }
      else action.fadeOut(0.12);
    });
    onProjectChange({
      ...next,
      actor: activeActor ? { ...activeActor.actor, activeAnimation: nextClipName } : { ...next.actor, activeAnimation: nextClipName },
      actors: activeActor ? next.actors.map((item) => item.id === activeActor.id ? {
        ...item,
        actor: { ...item.actor, activeAnimation: nextClipName },
        rig: resetActiveActorRigForAction(),
      } : item) : next.actors,
      rig: activeActor ? resetActiveActorRigForAction() : next.rig,
    });
  };

  const captureImage = async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    await onCaptureImage(renderer.domElement.toDataURL('image/png'));
  };

  const toggleRecording = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    const canvas = renderer.domElement;
    const stream = canvas.captureStream(cleanProject.render.fps || 24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      setRecording(false);
      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' });
      await onCaptureVideo(blob);
      stream.getTracks().forEach((track) => track.stop());
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const selectedBoneName = cleanProject.rig.selectedBone || '';
  const selectedBoneRotation = selectedBoneName
    ? cleanProject.rig.boneRotations[selectedBoneName] || { x: 0, y: 0, z: 0 }
    : { x: 0, y: 0, z: 0 };

  if (!open) return null;

  return createPortal(
    <div
      className="nodrag nopan nowheel fixed inset-0 z-[2147483000] flex h-screen w-screen flex-col overflow-hidden bg-[#05080d] text-slate-100"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#070b12]/95 px-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        <div className="flex min-w-[190px] flex-col">
          <div className="text-sm font-semibold tracking-normal">Director 导演台</div>
          <div className="text-[11px] text-slate-500">3D scene blocking / camera / recording</div>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
          <button type="button" className={cleanProject.mode === '3d' ? activeButtonStyle : buttonStyle} onClick={() => setMode('3d')}>3D模式</button>
          <button type="button" className={cleanProject.mode === '2d' ? activeButtonStyle : buttonStyle} onClick={() => setMode('2d')}>2D模式</button>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
          <button type="button" className={cleanProject.actor.playbackMode === 'static' ? activeButtonStyle : buttonStyle} onClick={() => setPlaybackMode('static')}>静态姿势</button>
          <button type="button" className={cleanProject.actor.playbackMode === 'animated' ? activeButtonStyle : buttonStyle} onClick={() => setPlaybackMode('animated')}>动作播放</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={buttonStyle} onClick={() => setLeftSidebarCollapsed((value) => !value)} title={leftSidebarCollapsed ? '展开动作栏' : '收起动作栏'}>
            {leftSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />} {leftSidebarCollapsed ? '动作栏' : '收起动作栏'}
          </button>
          <button type="button" className={buttonStyle} onClick={() => setRightSidebarCollapsed((value) => !value)} title={rightSidebarCollapsed ? '展开参数栏' : '收起参数栏'}>
            {rightSidebarCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />} {rightSidebarCollapsed ? '参数栏' : '收起参数栏'}
          </button>
          <button type="button" className={buttonStyle} onClick={captureImage}><Camera size={15} />截屏</button>
          <button type="button" className={recording ? activeButtonStyle : buttonStyle} onClick={toggleRecording}>
            {recording ? <CircleStop size={15} /> : <Video size={15} />}
            录制视频
          </button>
          <button type="button" className={buttonStyle} onClick={() => onProjectChange(sanitizeDirectorProject(cleanProject))}><Save size={15} />保存工程</button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-white/12 bg-white/8 text-slate-200 hover:bg-white/14" onClick={onClose}><X size={17} /></button>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `${leftSidebarCollapsed ? '44px' : '260px'} minmax(0,1fr) ${rightSidebarCollapsed ? '44px' : '360px'}`,
        }}
      >
        <aside className="min-h-0 overflow-hidden border-r border-white/10 bg-[#0b111c]">
          {leftSidebarCollapsed ? (
            <div className="director-sidebar-rail flex h-full flex-col items-center gap-2 px-1.5 py-3">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-white/12 bg-white/8 text-slate-200 hover:bg-white/14" onClick={() => setLeftSidebarCollapsed(false)} title="展开动作栏">
                <ChevronRight size={16} />
              </button>
              <div className="[writing-mode:vertical-rl] text-[11px] tracking-normal text-slate-500">动作栏</div>
            </div>
          ) : (
          <>
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-xs font-semibold text-slate-200">动作库</div>
            <div className="mt-1 text-[11px] text-slate-500">{PANORAMA_AVATAR_POSES.length} 个可用动作，当前 {activeAvatar ? panoramaAvatarPoseLabel(activeAvatar.poseId) : '未选择'}</div>
          </div>
          <div className="h-[calc(100vh-112px)] overflow-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              {PANORAMA_AVATAR_POSES.slice(0, 64).map((pose) => {
                const action = {
                  enabled: supportedPoseIds.has(pose.id),
                  active: activeAvatar?.poseId === pose.id,
                };
                const needsActionPack = actorState.clipNames.length > 0 && !action.enabled;
                return (
                <button
                  key={pose.id}
                  type="button"
                  disabled={!action.enabled}
                  className={`min-h-10 rounded-md border px-2.5 py-2 text-left text-xs leading-tight transition ${action.active ? 'border-cyan-300/70 bg-cyan-400/18 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.16)]' : action.enabled ? 'border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/18 hover:bg-white/[0.08]' : 'cursor-not-allowed border-white/5 bg-white/[0.025] text-slate-600'}`}
                  onClick={() => setPose(pose.id)}
                  title={action.enabled ? pose.label : '当前演员模型没有这个动作 clip，需动作包'}
                >
                  <span className="block">{pose.label}</span>
                  {needsActionPack ? <span className="mt-1 block text-[10px] text-slate-600">需动作包</span> : null}
                </button>
                );
              })}
            </div>
          </div>
          </>
          )}
        </aside>

        <main className="relative min-h-0 overflow-hidden bg-[#05080d]">
          {cleanProject.mode === '3d' ? (
            <>
              <div ref={mountRef} className="absolute inset-0" />
              <div className="pointer-events-none absolute left-5 top-5 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-300 backdrop-blur">
                <div className="font-medium text-slate-100">Scene 01</div>
                <div>FOV {cleanProject.camera.fov} / Yaw {cleanProject.camera.yaw} / Pitch {cleanProject.camera.pitch} / {cleanProject.render.resolution}</div>
                <div>{cleanProject.scene.preset} / {cleanProject.actor.playbackMode === 'animated' ? 'playing' : 'static pose'}</div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[#060a11]">
              <div className="w-[560px] max-w-[82%] rounded-md border border-white/12 bg-white/[0.06] p-5 text-sm text-slate-300 shadow-2xl">
                2D模式会承接同一套镜头、素材和动作提示，后续接入分镜画布与角色平面位移。
              </div>
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-hidden border-l border-white/10 bg-[#0b111c]">
          {rightSidebarCollapsed ? (
            <div className="director-sidebar-rail flex h-full flex-col items-center gap-2 px-1.5 py-3">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-white/12 bg-white/8 text-slate-200 hover:bg-white/14" onClick={() => setRightSidebarCollapsed(false)} title="展开参数栏">
                <ChevronLeft size={16} />
              </button>
              <div className="[writing-mode:vertical-rl] text-[11px] tracking-normal text-slate-500">参数栏</div>
            </div>
          ) : (
          <>
          <div className="border-b border-white/10 p-3">
            <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/20 p-1">
              {DIRECTOR_PANEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`h-8 rounded px-2 text-xs font-medium ${activePanelTab === tab.id ? 'bg-cyan-400/18 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.22)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}
                  onClick={() => setActivePanelTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[calc(100vh-112px)] overflow-auto p-4">
          {activePanelTab === 'camera' ? (
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">机位控制</div>
              <button type="button" className={cleanProject.camera.locked ? activeButtonStyle : buttonStyle} onClick={() => patchCamera({ locked: !cleanProject.camera.locked })}>
                {cleanProject.camera.locked ? <Lock size={13} /> : <Unlock size={13} />}
                {cleanProject.camera.locked ? '锁定机位' : '自由机位'}
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {[
                { label: '正面', camera: { yaw: 0, pitch: -8, distance: 7 } },
                { label: '三分之二', camera: { yaw: 35, pitch: -12, distance: 8 } },
                { label: '俯拍', camera: { yaw: 25, pitch: -42, distance: 10 } },
                { label: '低机位', camera: { yaw: -28, pitch: 12, distance: 7 } },
              ].map((preset) => (
                <button key={preset.label} type="button" className={buttonStyle} disabled={cleanProject.camera.locked} onClick={() => patchCamera(preset.camera)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="mb-3 block text-xs text-slate-400">
              FOV {cleanProject.camera.fov}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={10} max={120} value={cleanProject.camera.fov} disabled={cleanProject.camera.locked} onChange={(event) => patchCamera({ fov: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block text-xs text-slate-400">
              距离 {cleanProject.camera.distance}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={1} max={40} value={cleanProject.camera.distance} disabled={cleanProject.camera.locked} onChange={(event) => patchCamera({ distance: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block text-xs text-slate-400">
              水平角 {cleanProject.camera.yaw}°
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={-180} max={180} value={cleanProject.camera.yaw} disabled={cleanProject.camera.locked} onChange={(event) => patchCamera({ yaw: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block text-xs text-slate-400">
              俯仰 {cleanProject.camera.pitch}°
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={-75} max={75} value={cleanProject.camera.pitch} disabled={cleanProject.camera.locked} onChange={(event) => patchCamera({ pitch: Number(event.target.value) })} />
            </label>
            <label className="block text-xs text-slate-400">
              目标高度 {cleanProject.camera.targetY.toFixed(1)}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={0} max={40} value={Math.round(cleanProject.camera.targetY * 10)} disabled={cleanProject.camera.locked} onChange={(event) => patchCamera({ targetY: Number(event.target.value) / 10 })} />
            </label>
          </div>
          ) : null}

          {activePanelTab === 'lighting' ? (
          <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button type="button" className={buttonStyle} disabled={cleanProject.lights.locked} onClick={() => patchLights({ ambientIntensity: 0.42, keyIntensity: 2.6, rimIntensity: 1.8, keyColor: '#ffffff', rimColor: '#7dd3fc' })}><Lightbulb size={14} />影棚</button>
            <button type="button" className={buttonStyle} disabled={cleanProject.lights.locked} onClick={() => patchLights({ ambientIntensity: 0.24, keyIntensity: 4.2, rimIntensity: 2.8, keyColor: '#ffe7bf', rimColor: '#8bd3ff' })}><Lightbulb size={14} />舞台</button>
          </div>
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3 text-xs text-slate-400">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">灯光</div>
              <button type="button" className={cleanProject.lights.locked ? activeButtonStyle : buttonStyle} onClick={() => patchLights({ locked: !cleanProject.lights.locked })}>
                {cleanProject.lights.locked ? <Lock size={13} /> : <Unlock size={13} />}
                {cleanProject.lights.locked ? '锁定灯光' : '自由灯光'}
              </button>
            </div>
            <label className="mb-3 block">
              环境光 {cleanProject.lights.ambientIntensity.toFixed(2)}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={0} max={300} value={Math.round(cleanProject.lights.ambientIntensity * 100)} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ ambientIntensity: Number(event.target.value) / 100 })} />
            </label>
            <label className="mb-3 block">
              主光 {cleanProject.lights.keyIntensity.toFixed(2)}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={0} max={800} value={Math.round(cleanProject.lights.keyIntensity * 100)} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ keyIntensity: Number(event.target.value) / 100 })} />
            </label>
            <div className="mb-3 grid grid-cols-[1fr_42px] items-center gap-2">
              <span>主光颜色</span>
              <input className="h-8 w-10 rounded border border-white/10 bg-transparent disabled:opacity-35" type="color" value={cleanProject.lights.keyColor} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ keyColor: event.target.value })} />
            </div>
            <label className="mb-3 block">
              主光 X {cleanProject.lights.keyX}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={-12} max={12} value={cleanProject.lights.keyX} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ keyX: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block">
              主光 Y {cleanProject.lights.keyY}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={0} max={16} value={cleanProject.lights.keyY} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ keyY: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block">
              主光 Z {cleanProject.lights.keyZ}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={-12} max={12} value={cleanProject.lights.keyZ} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ keyZ: Number(event.target.value) })} />
            </label>
            <label className="mb-3 block">
              轮廓光 {cleanProject.lights.rimIntensity.toFixed(2)}
              <input className="mt-2 w-full accent-cyan-300 disabled:opacity-35" type="range" min={0} max={600} value={Math.round(cleanProject.lights.rimIntensity * 100)} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ rimIntensity: Number(event.target.value) / 100 })} />
            </label>
            <div className="grid grid-cols-[1fr_42px] items-center gap-2">
              <span>轮廓光颜色</span>
              <input className="h-8 w-10 rounded border border-white/10 bg-transparent disabled:opacity-35" type="color" value={cleanProject.lights.rimColor} disabled={cleanProject.lights.locked} onChange={(event) => patchLights({ rimColor: event.target.value })} />
            </div>
          </div>
          </>
          ) : null}

          {activePanelTab === 'resources' ? (
          <>
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3 text-[12px] leading-6 text-slate-400">
            <div className="flex justify-between"><span>上游图片</span><span className="text-slate-100">{upstreamImages.length}</span></div>
            <div className="flex justify-between"><span>上游模型</span><span className="text-slate-100">{upstreamModels.length}</span></div>
            <div className="flex justify-between"><span>3D演员</span><span className="text-slate-100">{cleanProject.actors.length}</span></div>
            <div className="mt-2 truncate border-t border-white/10 pt-2 text-slate-300">{activeActor ? `${activeActor.name} · ${modelNameFromUrl(activeActor.actor.modelUrl)}` : '未选择演员'}</div>
          </div>
          {upstreamModels.length ? (
            <div className="mb-4 grid gap-2">
              {upstreamModels.slice(0, 8).map((url, index) => (
                <div key={`resource-${url}`} className="rounded-md border border-white/10 bg-white/[0.045] p-2 text-[11px] text-slate-400">
                  <div className="truncate text-xs font-medium text-slate-100">{modelNameFromUrl(url) || `上游模型 ${index + 1}`}</div>
                  <div className="mt-1 truncate">{url}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className={buttonStyle} onClick={() => setActorModel(url, 'upstream')}>设为演员</button>
                    <button type="button" className={buttonStyle} onClick={() => addActionPack(url, 'upstream')}>动作包</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-white/10 bg-black/20 px-3 py-4 text-[11px] text-slate-500">连接 3D 模型输出节点后，可在这里设为演员或动作包。</div>
          )}
          {upstreamImages.length ? (
            <div className="mb-4 grid grid-cols-2 gap-2">
              {upstreamImages.slice(0, 6).map((url, index) => (
                <div key={`reference-${url}`} className="overflow-hidden rounded-md border border-white/10 bg-black/20">
                  <img src={url} alt={`参考图 ${index + 1}`} className="h-24 w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <span className="min-w-0 truncate text-[10px] text-slate-400">参考图 {index + 1}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-cyan-300/25 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-100 hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={poseImportBusy}
                      onClick={() => void importPoseFromImage(url, index)}
                    >
                      识别3D姿势
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {poseImportMessage ? (
            <div className="mb-4 rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[11px] leading-5 text-cyan-100">
              {poseImportMessage}
            </div>
          ) : null}
          <div className="h-64 w-full overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-[#07111f] p-3 text-[11px] leading-5 text-slate-300">
            {buildDirectorPromptText(cleanProject)}
          </div>
          </>
          ) : null}

          {activePanelTab === 'scene' ? (
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3 text-xs text-slate-400">
            <div className="mb-3 text-xs font-semibold text-slate-200">场景</div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {DIRECTOR_SCENE_PRESETS.map((preset) => (
                <button key={preset.id} type="button" className={cleanProject.scene.preset === preset.id ? activeButtonStyle : buttonStyle} onClick={() => setScenePreset(preset.id)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mb-3 grid grid-cols-[1fr_42px] items-center gap-2">
              <span>背景色</span>
              <input className="h-8 w-10 rounded border border-white/10 bg-transparent" type="color" value={cleanProject.scene.backgroundColor} onChange={(event) => patchScene({ backgroundColor: event.target.value })} />
            </div>
            <div className="mb-3 grid grid-cols-[1fr_42px] items-center gap-2">
              <span>地面色</span>
              <input className="h-8 w-10 rounded border border-white/10 bg-transparent" type="color" value={cleanProject.scene.floorColor} onChange={(event) => patchScene({ floorColor: event.target.value })} />
            </div>
            <label className="mb-3 block">
              网格尺寸 {cleanProject.scene.gridSize}
              <input className="mt-2 w-full accent-cyan-300" type="range" min={8} max={80} value={cleanProject.scene.gridSize} onChange={(event) => patchScene({ gridSize: Number(event.target.value) })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={cleanProject.scene.floorVisible ? activeButtonStyle : buttonStyle} onClick={() => patchScene({ floorVisible: !cleanProject.scene.floorVisible })}>地面</button>
              <button type="button" className={cleanProject.scene.gridVisible ? activeButtonStyle : buttonStyle} onClick={() => patchScene({ gridVisible: !cleanProject.scene.gridVisible })}><Grid3X3 size={14} />网格</button>
              <button type="button" className={cleanProject.scene.backdropVisible ? activeButtonStyle : buttonStyle} onClick={() => patchScene({ backdropVisible: !cleanProject.scene.backdropVisible })}>背景墙</button>
              <button type="button" className={cleanProject.scene.fogEnabled ? activeButtonStyle : buttonStyle} onClick={() => patchScene({ fogEnabled: !cleanProject.scene.fogEnabled })}>雾效</button>
            </div>
          </div>
          ) : null}

          {activePanelTab === 'action' ? (
          <>
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3 text-[12px] leading-6 text-slate-400">
            <div className="flex justify-between">
              <span>演员状态</span>
              <span className={actorState.status === 'ready' ? 'text-emerald-300' : actorState.status === 'error' ? 'text-rose-300' : 'text-slate-100'}>{actorState.status}</span>
            </div>
            <div className="flex justify-between"><span>模型来源</span><span className="text-slate-100">{cleanProject.actor.source}</span></div>
            <div className="flex justify-between"><span>动作模式</span><span className="text-slate-100">{cleanProject.actor.playbackMode === 'animated' ? '动作播放' : '静态姿势'}</span></div>
            <div className="flex justify-between"><span>当前动画</span><span className="text-slate-100">{cleanProject.actor.activeAnimation}</span></div>
            {cleanProject.actor.playbackMode === 'static' ? (
              <label className="mt-2 block border-t border-white/10 pt-2 text-xs text-slate-400">
                姿势取帧 {Math.round(cleanProject.actor.staticPoseTime * 100)}%
                <input
                  className="mt-2 w-full accent-cyan-300"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(cleanProject.actor.staticPoseTime * 100)}
                  onChange={(event) => setStaticPoseTime(Number(event.target.value) / 100)}
                />
              </label>
            ) : null}
            <div className="mt-2 line-clamp-2 border-t border-white/10 pt-2 text-slate-300">{actorState.message || cleanProject.actor.modelUrl}</div>
            {actorState.clipNames.length ? (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2">
                {actorState.clipNames.slice(0, 8).map((name) => (
                  <span key={name} className="max-w-full truncate rounded border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-100">
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">演员 / 机器人</div>
              <Bot size={14} className="text-cyan-200" />
            </div>
            <div className="mb-3 rounded border border-white/10 bg-black/20 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-slate-300">演员轨道</div>
                <span className="text-[10px] text-slate-500">{cleanProject.actors.length} 个</span>
              </div>
              <div className="grid gap-1.5">
                {cleanProject.actors.map((actor, index) => (
                  <div key={actor.id} className={`rounded border px-2 py-2 text-[11px] ${actor.id === activeActor?.id ? 'border-cyan-300/45 bg-cyan-400/10 text-cyan-50' : 'border-white/8 bg-white/[0.035] text-slate-400'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => selectActor(actor.id)}>
                        {index + 1}. {actor.name}
                      </button>
                      <button type="button" className={actor.visible ? 'text-emerald-300' : 'text-slate-600'} onClick={() => patchActorPlacement(actor.id, { visible: !actor.visible })}>
                        {actor.visible ? '显示' : '隐藏'}
                      </button>
                      <button type="button" className="text-rose-300 disabled:text-slate-700" disabled={cleanProject.actors.length <= 1} onClick={() => deleteActor(actor.id)}>
                        删除
                      </button>
                    </div>
                    <div className="mt-1 truncate text-slate-500">{modelNameFromUrl(actor.actor.modelUrl)} · {actor.actor.playbackMode === 'animated' ? '动作播放' : '静态姿势'}</div>
                    {actor.id === activeActor?.id ? (
                      <>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <label className="block">
                            X {actor.x.toFixed(1)}
                            <input className="mt-1 w-full accent-cyan-300" type="range" min={-80} max={80} value={Math.round(actor.x * 10)} onChange={(event) => patchActorPlacement(actor.id, { x: Number(event.target.value) / 10 })} />
                          </label>
                          <label className="block">
                            Z {actor.z.toFixed(1)}
                            <input className="mt-1 w-full accent-cyan-300" type="range" min={-80} max={80} value={Math.round(actor.z * 10)} onChange={(event) => patchActorPlacement(actor.id, { z: Number(event.target.value) / 10 })} />
                          </label>
                          <label className="block">
                            Y {actor.y.toFixed(1)}
                            <input className="mt-1 w-full accent-cyan-300" type="range" min={-40} max={80} value={Math.round(actor.y * 10)} onChange={(event) => patchActorPlacement(actor.id, { y: Number(event.target.value) / 10 })} />
                          </label>
                          <label className="block">
                            朝向 {Math.round(actor.heading)}°
                            <input className="mt-1 w-full accent-cyan-300" type="range" min={-180} max={180} value={Math.round(actor.heading)} onChange={(event) => patchActorPlacement(actor.id, { heading: Number(event.target.value) })} />
                          </label>
                        </div>
                        <button type="button" className={`${buttonStyle} mt-2 w-full`} onClick={selectActorRootForMove}>选中演员移动</button>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={buttonStyle} onClick={() => addActor('skeleton')}><Plus size={13} />添加骨骼机器人</button>
                <button type="button" className={buttonStyle} onClick={() => addActor('expression')}><Plus size={13} />添加表情机器人</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={cleanProject.actor.modelUrl === DIRECTOR_DEFAULT_ACTOR_MODEL_URL ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(DIRECTOR_DEFAULT_ACTOR_MODEL_URL, 'builtin')}>
                骨骼机器人
              </button>
              <button type="button" className={cleanProject.actor.modelUrl === DIRECTOR_FALLBACK_ACTOR_MODEL_URL ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(DIRECTOR_FALLBACK_ACTOR_MODEL_URL, 'builtin')}>
                表情机器人
              </button>
            </div>
            {upstreamModels.length ? (
              <div className="mt-2 grid gap-2">
                {upstreamModels.slice(0, 3).map((url, index) => (
                  <button key={`actor-action-${url}`} type="button" className={cleanProject.actor.modelUrl === url ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(url, 'upstream')}>
                    <Plus size={13} /> 上游模型 {index + 1}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          </>
          ) : null}

          {activePanelTab === 'skeleton' ? (
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3">
            <div className="mb-2 text-xs font-semibold text-slate-200">骨骼 / 演员模型</div>
            <div className="mb-3 rounded border border-cyan-300/20 bg-cyan-400/10 px-2 py-2 text-[11px] leading-5 text-cyan-100">
              双击画面里的角色可选中最近骨骼；切到旋转后拖动三轴手柄会写回当前工程。
            </div>
            <div className="grid gap-2">
              <button type="button" className={cleanProject.actor.modelUrl === DIRECTOR_DEFAULT_ACTOR_MODEL_URL ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(DIRECTOR_DEFAULT_ACTOR_MODEL_URL, 'builtin')}>
                骨骼人形
              </button>
              <button type="button" className={cleanProject.actor.modelUrl === DIRECTOR_FALLBACK_ACTOR_MODEL_URL ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(DIRECTOR_FALLBACK_ACTOR_MODEL_URL, 'builtin')}>
                表情机器人
              </button>
              {upstreamModels.slice(0, 4).map((url, index) => (
                <button key={url} type="button" className={cleanProject.actor.modelUrl === url ? activeButtonStyle : buttonStyle} onClick={() => setActorModel(url, 'upstream')}>
                  上游模型 {index + 1}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className={cleanProject.rig.showSkeleton ? activeButtonStyle : buttonStyle} onClick={() => patchRig({ showSkeleton: !cleanProject.rig.showSkeleton })}>骨架线</button>
              <button type="button" className={cleanProject.rig.showTransform ? activeButtonStyle : buttonStyle} onClick={() => patchRig({ showTransform: !cleanProject.rig.showTransform })}>变换器</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className={!cleanProject.rig.selectedBone && cleanProject.rig.transformMode === 'translate' ? activeButtonStyle : buttonStyle} onClick={selectActorRootForMove}>
                演员根节点
              </button>
              <button type="button" className={cleanProject.rig.selectedBone && cleanProject.rig.transformMode === 'rotate' ? activeButtonStyle : buttonStyle} disabled={!selectedBoneName} onClick={() => patchRig({ transformMode: 'rotate', showTransform: true })}>
                单骨骼旋转
              </button>
            </div>
            <label className="mt-3 block text-[11px] text-slate-400">
              选中骨骼
              <select
                className="mt-1 h-8 w-full rounded border border-white/10 bg-[#07111f] px-2 text-[11px] text-slate-200 outline-none"
                value={selectedBoneName}
                onChange={(event) => patchRig({ selectedBone: event.target.value, transformMode: 'rotate' })}
              >
                <option value="">{boneNames.length ? '不选骨骼，拖动演员根节点' : '等待模型骨骼'}</option>
                {boneNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div className="mt-3 rounded border border-white/10 bg-black/20 p-2">
              <div className="mb-2 text-[11px] font-semibold text-slate-300">手部预设</div>
              <div className="grid grid-cols-2 gap-2">
                {(['left', 'right'] as const).map((side) => (
                  <div key={side} className="rounded border border-white/8 bg-white/[0.035] p-1.5">
                    <div className="mb-1 text-[10px] text-slate-500">{side === 'left' ? '左手' : '右手'}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {DIRECTOR_HAND_POSE_PRESETS.map((preset) => (
                        <button key={`${side}-${preset.id}`} type="button" className="h-7 rounded border border-white/10 bg-white/[0.05] px-1 text-[10px] text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-400/10" onClick={() => applyDirectorHandPose(side, preset.id)}>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 rounded border border-white/10 bg-black/20 p-2 text-[11px] leading-5 text-slate-400">
              <div className="mb-2 flex justify-between"><span>骨骼数量</span><span className="text-slate-100">{boneNames.length}</span></div>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <label key={axis} className="mb-2 block">
                  {axis.toUpperCase()} 旋转 {selectedBoneRotation[axis]}°
                  <input className="mt-1 w-full accent-cyan-300" type="range" min={-180} max={180} value={selectedBoneRotation[axis]} disabled={!selectedBoneName} onChange={(event) => setSelectedBoneRotation(axis, Number(event.target.value))} />
                </label>
              ))}
              <button type="button" className={buttonStyle} disabled={!selectedBoneName} onClick={() => {
                if (!selectedBoneName) return;
                const { [selectedBoneName]: _removed, ...rest } = cleanProject.rig.boneRotations;
                patchRig({ boneRotations: rest });
              }}>
                重置当前骨骼
              </button>
            </div>
          </div>
          ) : null}

          {activePanelTab === 'action' ? (
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.045] p-3">
            <div className="mb-2 text-xs font-semibold text-slate-200">动作资源库</div>
            <div className="mb-3 flex h-8 items-center gap-2 rounded border border-white/10 bg-[#07111f] px-2 text-slate-400 focus-within:border-cyan-300/50">
              <Search size={13} />
              <input
                className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
                value={actionLibraryQuery}
                onChange={(event) => setActionLibraryQuery(event.target.value)}
                placeholder="搜索动作资源：奔跑 / 拳击 / wave"
              />
            </div>
            <label className="mb-2 block text-[11px] text-slate-400">
              动作包 URL
              <input
                className="mt-1 h-8 w-full rounded border border-white/10 bg-[#07111f] px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                value={actionPackUrl}
                onChange={(event) => setActionPackUrl(event.target.value)}
                placeholder="https://.../action-pack.glb"
              />
            </label>
            <button type="button" className={buttonStyle} onClick={() => addActionPack(actionPackUrl, 'url')}>
              导入动作包
            </button>
            {lastActionImportMessage ? (
              <div className="mt-2 rounded border border-cyan-300/20 bg-cyan-400/10 px-2 py-1.5 text-[11px] text-cyan-100">
                {lastActionImportMessage}
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
              {filteredActionResources.map((resource) => (
                <button key={resource.id} type="button" className="rounded-md border border-white/10 bg-white/[0.045] p-2 text-left hover:border-cyan-300/35 hover:bg-white/[0.08]" onClick={() => addActionPack(resource.url, 'builtin')}>
                  <span className="block text-xs font-medium text-slate-100">{resource.label}</span>
                  <span className="mt-1 block text-[10px] text-slate-500">{resource.sourceLabel} · {resource.tags.join(' / ')}</span>
                  <span className="mt-1 block text-[10px] text-cyan-200">加入动作包</span>
                </button>
              ))}
              {!filteredActionResources.length ? (
                <div className="rounded border border-white/10 bg-black/20 px-2 py-3 text-[11px] text-slate-500">没有匹配的动作资源</div>
              ) : null}
            </div>
            {upstreamModels.length ? (
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                {upstreamModels.slice(0, 4).map((url, index) => (
                  <button key={`action-${url}`} type="button" className={buttonStyle} onClick={() => addActionPack(url, 'upstream')}>
                    导入上游动作 {index + 1}
                  </button>
                ))}
              </div>
            ) : null}
            {cleanProject.actionPacks.length ? (
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                {cleanProject.actionPacks.map((pack) => (
                  <div key={pack.id} className="rounded border border-white/10 bg-black/20 p-2 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-slate-200">{pack.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" className={pack.enabled ? 'text-emerald-300 hover:text-emerald-200' : 'text-slate-500 hover:text-slate-300'} onClick={() => toggleActionPack(pack.id)}>
                          {pack.enabled ? '停用' : '启用'}
                        </button>
                        <button type="button" className="text-rose-300 hover:text-rose-200" onClick={() => removeActionPack(pack.id)}>删除</button>
                      </div>
                    </div>
                    <div className="mt-1 truncate">{pack.source} · {pack.url}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {actorState.packMessages.length ? (
              <div className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-5 text-slate-400">
                {actorState.packMessages.map((message) => <div key={message}>{message}</div>)}
              </div>
            ) : null}
          </div>
          ) : null}
          </div>
          </>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

export default DirectorStudio;

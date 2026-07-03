import {
  PANORAMA_AVATAR_COLORS,
  type PanoramaAvatar,
  type PanoramaAvatarPoseId,
  panoramaAvatarPoseDefaultParams,
  panoramaAvatarPoseLabel,
  panoramaAvatarPosePrompt,
  panoramaAvatarPoseRootDefaults,
  safePanoramaAvatarPose,
} from './panorama3d.ts';

export type DirectorMode = '3d' | '2d';
export type DirectorResolution = '720p' | '1080p';
export type DirectorActorPlaybackMode = 'static' | 'animated';

export const DIRECTOR_DEFAULT_ACTOR_MODEL_URL = 'https://threejs.org/examples/models/gltf/Xbot.glb';
export const DIRECTOR_FALLBACK_ACTOR_MODEL_URL = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

const LEGACY_DIRECTOR_ACTOR_MODEL_URLS = new Set([
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb',
]);

export interface DirectorActorSettings {
  source: 'builtin' | 'upstream' | 'custom';
  modelUrl: string;
  activeAnimation: string;
  playbackMode: DirectorActorPlaybackMode;
  staticPoseTime: number;
  scale: number;
}

export interface DirectorCamera {
  fov: number;
  distance: number;
  yaw: number;
  pitch: number;
  targetY: number;
  locked: boolean;
}

export interface DirectorRenderSettings {
  resolution: DirectorResolution;
  fps: number;
}

export interface DirectorActionPack {
  id: string;
  name: string;
  source: 'url' | 'upstream' | 'builtin';
  url: string;
  enabled: boolean;
}

export interface DirectorLightSettings {
  ambientIntensity: number;
  keyIntensity: number;
  keyColor: string;
  keyX: number;
  keyY: number;
  keyZ: number;
  rimIntensity: number;
  rimColor: string;
  locked: boolean;
}

export type DirectorScenePreset = 'studio' | 'stage' | 'street' | 'room';

export interface DirectorSceneSettings {
  preset: DirectorScenePreset;
  backgroundColor: string;
  floorColor: string;
  gridVisible: boolean;
  gridSize: number;
  floorVisible: boolean;
  backdropVisible: boolean;
  fogEnabled: boolean;
}

export interface DirectorRigSettings {
  showSkeleton: boolean;
  showTransform: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
  selectedBone: string;
  boneRotations: Record<string, { x: number; y: number; z: number }>;
}

export interface DirectorActorInstance {
  id: string;
  name: string;
  visible: boolean;
  actor: DirectorActorSettings;
  rig: DirectorRigSettings;
  x: number;
  y: number;
  z: number;
  heading: number;
  createdAt: string;
}

export interface DirectorProject {
  schema: 't8-director-project';
  version: 1;
  mode: DirectorMode;
  title: string;
  camera: DirectorCamera;
  render: DirectorRenderSettings;
  activeActorId: string;
  actors: DirectorActorInstance[];
  actor: DirectorActorSettings;
  actionPacks: DirectorActionPack[];
  lights: DirectorLightSettings;
  scene: DirectorSceneSettings;
  rig: DirectorRigSettings;
  avatars: PanoramaAvatar[];
  assets: {
    images: string[];
    models: string[];
  };
  updatedAt: string;
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

function createDefaultAvatar(index = 0): PanoramaAvatar {
  const poseId = safePanoramaAvatarPose('standing');
  const root = panoramaAvatarPoseRootDefaults(poseId);
  return {
    id: `director-avatar-${index + 1}`,
    name: `角色 ${index + 1}`,
    visible: true,
    yaw: 0,
    pitch: 0,
    distance: 0,
    heightOffset: 0,
    rootHeight: root.rootHeight,
    rootPitch: root.rootPitch,
    rootRoll: root.rootRoll,
    groundMode: root.groundMode,
    scale: 1,
    heading: 0,
    faceMode: 'camera',
    poseId,
    poseParams: panoramaAvatarPoseDefaultParams(poseId),
    color: PANORAMA_AVATAR_COLORS[index % PANORAMA_AVATAR_COLORS.length] || '#38bdf8',
    opacity: 1,
    createdAt: new Date().toISOString(),
  };
}

function createDefaultActorSettings(kind: 'skeleton' | 'expression' = 'skeleton'): DirectorActorSettings {
  return {
    source: 'builtin',
    modelUrl: kind === 'expression' ? DIRECTOR_FALLBACK_ACTOR_MODEL_URL : DIRECTOR_DEFAULT_ACTOR_MODEL_URL,
    activeAnimation: kind === 'expression' ? 'Idle' : 'Standing Pose',
    playbackMode: 'static',
    staticPoseTime: 0.35,
    scale: 1,
  };
}

function createDefaultRigSettings(): DirectorRigSettings {
  return {
    showSkeleton: true,
    showTransform: true,
    transformMode: 'translate',
    selectedBone: '',
    boneRotations: {},
  };
}

function createDefaultDirectorActor(index = 0, kind: 'skeleton' | 'expression' = 'skeleton'): DirectorActorInstance {
  return {
    id: `director-actor-${index + 1}`,
    name: kind === 'expression' ? `表情机器人 ${index + 1}` : `骨骼机器人 ${index + 1}`,
    visible: true,
    actor: createDefaultActorSettings(kind),
    rig: createDefaultRigSettings(),
    x: index * 1.4,
    y: 0,
    z: 0,
    heading: 0,
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultDirectorProject(): DirectorProject {
  const defaultActor = createDefaultDirectorActor();
  return {
    schema: 't8-director-project',
    version: 1,
    mode: '3d',
    title: '导演台工程',
    camera: { fov: 40, distance: 8, yaw: 35, pitch: -12, targetY: 1, locked: false },
    render: { resolution: '1080p', fps: 24 },
    activeActorId: defaultActor.id,
    actors: [defaultActor],
    actor: defaultActor.actor,
    actionPacks: [],
    lights: {
      ambientIntensity: 0.42,
      keyIntensity: 2.6,
      keyColor: '#ffffff',
      keyX: 5,
      keyY: 8,
      keyZ: 6,
      rimIntensity: 1.8,
      rimColor: '#7dd3fc',
      locked: false,
    },
    scene: {
      preset: 'studio',
      backgroundColor: '#060b12',
      floorColor: '#0b1220',
      gridVisible: true,
      gridSize: 30,
      floorVisible: true,
      backdropVisible: true,
      fogEnabled: true,
    },
    rig: defaultActor.rig,
    avatars: [createDefaultAvatar()],
    assets: { images: [], models: [] },
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeAvatar(value: unknown, index: number): PanoramaAvatar {
  const fallback = createDefaultAvatar(index);
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const poseId = safePanoramaAvatarPose(raw.poseId || fallback.poseId);
  const root = panoramaAvatarPoseRootDefaults(poseId);
  return {
    ...fallback,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : fallback.name,
    visible: raw.visible === false ? false : true,
    yaw: clamp(raw.yaw, -180, 180, fallback.yaw),
    pitch: clamp(raw.pitch, -90, 90, fallback.pitch),
    distance: clamp(raw.distance, -20, 20, fallback.distance),
    heightOffset: clamp(raw.heightOffset, -10, 10, fallback.heightOffset),
    rootHeight: clamp(raw.rootHeight, -5, 8, root.rootHeight),
    rootPitch: clamp(raw.rootPitch, -180, 180, root.rootPitch),
    rootRoll: clamp(raw.rootRoll, -180, 180, root.rootRoll),
    groundMode: raw.groundMode === 'floating' || raw.groundMode === 'manual' ? raw.groundMode : root.groundMode,
    scale: clamp(raw.scale, 0.1, 5, fallback.scale),
    heading: clamp(raw.heading, -180, 180, fallback.heading),
    faceMode: raw.faceMode === 'heading' ? 'heading' : 'camera',
    poseId,
    poseParams: raw.poseParams && typeof raw.poseParams === 'object' && !Array.isArray(raw.poseParams)
      ? { ...panoramaAvatarPoseDefaultParams(poseId), ...(raw.poseParams as Record<string, number | string | boolean>) }
      : panoramaAvatarPoseDefaultParams(poseId),
    color: typeof raw.color === 'string' && raw.color ? raw.color : fallback.color,
    opacity: clamp(raw.opacity, 0.1, 1, fallback.opacity),
    characterPrompt: typeof raw.characterPrompt === 'string' && raw.characterPrompt.trim()
      ? raw.characterPrompt.trim().slice(0, 240)
      : undefined,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallback.createdAt,
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function colorValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean : fallback;
}

function sanitizeActorSettings(value: unknown, fallback: DirectorActorSettings): DirectorActorSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  const rawActorModelUrl = typeof raw.modelUrl === 'string' && raw.modelUrl.trim()
    ? raw.modelUrl.trim()
    : '';
  const actorModelUrl = raw.source === 'builtin' && LEGACY_DIRECTOR_ACTOR_MODEL_URLS.has(rawActorModelUrl)
    ? DIRECTOR_DEFAULT_ACTOR_MODEL_URL
    : rawActorModelUrl || fallback.modelUrl;
  return {
    source: raw.source === 'custom' || raw.source === 'upstream' ? raw.source : 'builtin',
    modelUrl: actorModelUrl,
    activeAnimation: typeof raw.activeAnimation === 'string' && raw.activeAnimation.trim()
      ? raw.activeAnimation.trim().slice(0, 80)
      : fallback.activeAnimation,
    playbackMode: raw.playbackMode === 'animated' ? 'animated' : 'static',
    staticPoseTime: clamp(raw.staticPoseTime, 0, 1, fallback.staticPoseTime),
    scale: clamp(raw.scale, 0.1, 5, fallback.scale),
  };
}

function sanitizeRigSettings(value: unknown, fallback: DirectorRigSettings): DirectorRigSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  return {
    showSkeleton: raw.showSkeleton === false ? false : fallback.showSkeleton,
    showTransform: raw.showTransform === false ? false : fallback.showTransform,
    transformMode: raw.transformMode === 'translate' ? 'translate' : 'rotate',
    selectedBone: typeof raw.selectedBone === 'string' ? raw.selectedBone.trim().slice(0, 80) : fallback.selectedBone,
    boneRotations: raw.boneRotations && typeof raw.boneRotations === 'object' && !Array.isArray(raw.boneRotations)
      ? Object.fromEntries(Object.entries(raw.boneRotations).slice(0, 80).map(([name, rotation]: [string, any]) => [
          name.slice(0, 80),
          {
            x: clamp(rotation?.x, -180, 180, 0),
            y: clamp(rotation?.y, -180, 180, 0),
            z: clamp(rotation?.z, -180, 180, 0),
          },
        ]))
      : {},
  };
}

function sanitizeActionPack(value: unknown, index: number): DirectorActionPack | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : '';
  if (!url) return null;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim().slice(0, 80)
    : `动作包 ${index + 1}`;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : `action-pack-${index + 1}`,
    name,
    source: raw.source === 'upstream' || raw.source === 'builtin' ? raw.source : 'url',
    url,
    enabled: raw.enabled === false ? false : true,
  };
}

function sanitizeDirectorActor(value: unknown, index: number, fallbackActor: DirectorActorSettings, fallbackRig: DirectorRigSettings): DirectorActorInstance | null {
  const fallback = createDefaultDirectorActor(index);
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    ...fallback,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : fallback.name,
    visible: raw.visible === false ? false : true,
    actor: sanitizeActorSettings(raw.actor, index === 0 ? fallbackActor : fallback.actor),
    rig: sanitizeRigSettings(raw.rig, index === 0 ? fallbackRig : fallback.rig),
    x: clamp(raw.x, -20, 20, fallback.x),
    y: clamp(raw.y, -10, 10, fallback.y),
    z: clamp(raw.z, -20, 20, fallback.z),
    heading: clamp(raw.heading, -180, 180, fallback.heading),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallback.createdAt,
  };
}

export function sanitizeDirectorProject(value: unknown): DirectorProject {
  const fallback = createDefaultDirectorProject();
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  const rawCamera = raw.camera && typeof raw.camera === 'object' && !Array.isArray(raw.camera) ? raw.camera : {};
  const rawRender = raw.render && typeof raw.render === 'object' && !Array.isArray(raw.render) ? raw.render : {};
  const rawActor = raw.actor && typeof raw.actor === 'object' && !Array.isArray(raw.actor) ? raw.actor : {};
  const rawLights = raw.lights && typeof raw.lights === 'object' && !Array.isArray(raw.lights) ? raw.lights : {};
  const rawScene = raw.scene && typeof raw.scene === 'object' && !Array.isArray(raw.scene) ? raw.scene : {};
  const rawRig = raw.rig && typeof raw.rig === 'object' && !Array.isArray(raw.rig) ? raw.rig : {};
  const actor = sanitizeActorSettings(rawActor, fallback.actor);
  const rig = sanitizeRigSettings(rawRig, fallback.rig);
  const actors = Array.isArray(raw.actors)
    ? raw.actors
      .slice(0, 12)
      .map((item, index) => sanitizeDirectorActor(item, index, actor, rig))
      .filter((item): item is DirectorActorInstance => Boolean(item))
    : [];
  const migratedActors = actors.length ? actors : [{
    ...createDefaultDirectorActor(0, actor.modelUrl === DIRECTOR_FALLBACK_ACTOR_MODEL_URL ? 'expression' : 'skeleton'),
    actor,
    rig,
  }];
  const activeActorId = typeof raw.activeActorId === 'string' && migratedActors.some((item) => item.id === raw.activeActorId)
    ? raw.activeActorId
    : migratedActors[0].id;
  const activeActor = migratedActors.find((item) => item.id === activeActorId) || migratedActors[0];
  const avatars = Array.isArray(raw.avatars) ? raw.avatars.map(sanitizeAvatar).filter(Boolean) : [];
  const actionPacks = Array.isArray(raw.actionPacks)
    ? raw.actionPacks.map(sanitizeActionPack).filter((item): item is DirectorActionPack => Boolean(item))
    : [];

  return {
    ...fallback,
    mode: raw.mode === '2d' ? '2d' : '3d',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : fallback.title,
    camera: {
      fov: clamp(rawCamera.fov, 10, 120, fallback.camera.fov),
      distance: clamp(rawCamera.distance, 1, 40, fallback.camera.distance),
      yaw: clamp(rawCamera.yaw, -180, 180, fallback.camera.yaw),
      pitch: clamp(rawCamera.pitch, -85, 85, fallback.camera.pitch),
      targetY: clamp(rawCamera.targetY, 0, 4, fallback.camera.targetY),
      locked: rawCamera.locked === true,
    },
    render: {
      resolution: rawRender.resolution === '720p' ? '720p' : '1080p',
      fps: clamp(rawRender.fps, 12, 60, fallback.render.fps),
    },
    activeActorId,
    actors: migratedActors,
    actor: activeActor.actor,
    actionPacks,
    lights: {
      ambientIntensity: clamp(rawLights.ambientIntensity, 0, 3, fallback.lights.ambientIntensity),
      keyIntensity: clamp(rawLights.keyIntensity, 0, 8, fallback.lights.keyIntensity),
      keyColor: colorValue(rawLights.keyColor, fallback.lights.keyColor),
      keyX: clamp(rawLights.keyX, -12, 12, fallback.lights.keyX),
      keyY: clamp(rawLights.keyY, 0, 16, fallback.lights.keyY),
      keyZ: clamp(rawLights.keyZ, -12, 12, fallback.lights.keyZ),
      rimIntensity: clamp(rawLights.rimIntensity, 0, 6, fallback.lights.rimIntensity),
      rimColor: colorValue(rawLights.rimColor, fallback.lights.rimColor),
      locked: rawLights.locked === true,
    },
    scene: {
      preset: rawScene.preset === 'stage' || rawScene.preset === 'street' || rawScene.preset === 'room'
        ? rawScene.preset
        : fallback.scene.preset,
      backgroundColor: colorValue(rawScene.backgroundColor, fallback.scene.backgroundColor),
      floorColor: colorValue(rawScene.floorColor, fallback.scene.floorColor),
      gridVisible: rawScene.gridVisible === false ? false : fallback.scene.gridVisible,
      gridSize: clamp(rawScene.gridSize, 8, 80, fallback.scene.gridSize),
      floorVisible: rawScene.floorVisible === false ? false : fallback.scene.floorVisible,
      backdropVisible: rawScene.backdropVisible === false ? false : fallback.scene.backdropVisible,
      fogEnabled: rawScene.fogEnabled === false ? false : fallback.scene.fogEnabled,
    },
    rig: activeActor.rig,
    avatars: avatars.length ? avatars : [createDefaultAvatar()],
    assets: {
      images: stringList(raw.assets?.images),
      models: stringList(raw.assets?.models),
    },
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : fallback.updatedAt,
  };
}

export function applyDirectorAvatarPose(
  project: DirectorProject,
  avatarId: string,
  poseIdValue: PanoramaAvatarPoseId,
): DirectorProject {
  const poseId = safePanoramaAvatarPose(poseIdValue);
  const root = panoramaAvatarPoseRootDefaults(poseId);
  const poseParams = panoramaAvatarPoseDefaultParams(poseId);
  const base = sanitizeDirectorProject(project);
  return {
    ...base,
    avatars: base.avatars.map((avatar) => avatar.id === avatarId
      ? {
          ...avatar,
          poseId,
          poseParams,
          rootHeight: root.rootHeight,
          rootPitch: root.rootPitch,
          rootRoll: root.rootRoll,
          groundMode: root.groundMode,
        }
      : avatar),
    updatedAt: new Date().toISOString(),
  };
}

function projectWithActiveActor(baseProject: DirectorProject, activeActor: DirectorActorInstance): DirectorProject {
  return sanitizeDirectorProject({
    ...baseProject,
    activeActorId: activeActor.id,
    actor: activeActor.actor,
    rig: activeActor.rig,
    actors: baseProject.actors.map((item) => item.id === activeActor.id ? activeActor : item),
    updatedAt: new Date().toISOString(),
  });
}

export function selectDirectorActor(project: DirectorProject, actorId: string): DirectorProject {
  const base = sanitizeDirectorProject(project);
  const actor = base.actors.find((item) => item.id === actorId) || base.actors[0];
  return projectWithActiveActor(base, actor);
}

export function addDirectorActor(project: DirectorProject, kind: 'skeleton' | 'expression' = 'skeleton'): DirectorProject {
  const base = sanitizeDirectorProject(project);
  const index = base.actors.length;
  const actor = {
    ...createDefaultDirectorActor(index, kind),
    id: `director-actor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: (index - (base.actors.length - 1) / 2) * 1.35,
  };
  return sanitizeDirectorProject({
    ...base,
    activeActorId: actor.id,
    actor: actor.actor,
    rig: actor.rig,
    actors: [...base.actors, actor],
    updatedAt: new Date().toISOString(),
  });
}

export function removeDirectorActor(project: DirectorProject, actorId: string): DirectorProject {
  const base = sanitizeDirectorProject(project);
  if (base.actors.length <= 1) return base;
  const actors = base.actors.filter((item) => item.id !== actorId);
  const activeActor = actors.find((item) => item.id === base.activeActorId) || actors[0];
  return sanitizeDirectorProject({
    ...base,
    activeActorId: activeActor.id,
    actor: activeActor.actor,
    rig: activeActor.rig,
    actors,
    updatedAt: new Date().toISOString(),
  });
}

export function buildDirectorPromptText(value: DirectorProject): string {
  const project = sanitizeDirectorProject(value);
  const actorTracks = project.actors
    .map((actor, index) => `3D Actor ${index + 1}: ${actor.name}, model ${actor.actor.modelUrl}, animation ${actor.actor.activeAnimation}, mode ${actor.actor.playbackMode}, position ${actor.x}/${actor.y}/${actor.z}`)
    .join('\n');
  const avatars = project.avatars
    .map((avatar, index) => {
      const label = panoramaAvatarPoseLabel(avatar.poseId);
      const prompt = panoramaAvatarPosePrompt(avatar.poseId);
      const character = avatar.characterPrompt ? `, character ${avatar.characterPrompt}` : '';
      return `Actor ${index + 1}: ${avatar.name}, pose ${avatar.poseId} (${label}), ${prompt}${character}`;
    })
    .join('\n');
  return [
    `Director 3D scene: ${project.title}`,
    `Actor model ${project.actor.modelUrl}, animation ${project.actor.activeAnimation}`,
    `Action mode ${project.actor.playbackMode}, static pose sample ${Math.round(project.actor.staticPoseTime * 100)}%`,
    `Mode ${project.mode}, FOV ${project.camera.fov}, camera distance ${project.camera.distance}, yaw ${project.camera.yaw}, pitch ${project.camera.pitch}`,
    `Scene preset ${project.scene.preset}, floor ${project.scene.floorVisible ? 'on' : 'off'}, grid ${project.scene.gridVisible ? 'on' : 'off'}, fog ${project.scene.fogEnabled ? 'on' : 'off'}`,
    `Lighting ambient ${project.lights.ambientIntensity}, key ${project.lights.keyIntensity} ${project.lights.keyColor}, rim ${project.lights.rimIntensity} ${project.lights.rimColor}`,
    `Render ${project.render.resolution} at ${project.render.fps}fps`,
    actorTracks,
    avatars,
  ].filter(Boolean).join('\n');
}

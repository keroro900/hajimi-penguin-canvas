import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const loadDirectorProject = async () => import('../src/utils/directorProject.ts');
const loadDirectorPoseEstimation = async () => import('../src/utils/directorPoseEstimation.ts');

function makeMediaPipePose(overrides: Record<number, Partial<{ x: number; y: number; z: number; visibility: number }>> = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  Object.entries({
    0: { x: 0.5, y: 0.16 },
    11: { x: 0.38, y: 0.28 },
    12: { x: 0.62, y: 0.28 },
    13: { x: 0.3, y: 0.43 },
    14: { x: 0.7, y: 0.43 },
    15: { x: 0.26, y: 0.58 },
    16: { x: 0.74, y: 0.58 },
    23: { x: 0.43, y: 0.56 },
    24: { x: 0.57, y: 0.56 },
    25: { x: 0.39, y: 0.78 },
    26: { x: 0.61, y: 0.78 },
    27: { x: 0.37, y: 0.96 },
    28: { x: 0.63, y: 0.96 },
    31: { x: 0.35, y: 0.98 },
    32: { x: 0.65, y: 0.98 },
    ...overrides,
  }).forEach(([index, value]) => {
    landmarks[Number(index)] = { ...landmarks[Number(index)], ...value };
  });
  return landmarks;
}

test('director studio node is registered as a visible 3D node', () => {
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const types = read('../src/types/canvas.ts');
  const placement = read('../src/utils/nodePlacement.ts');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(registry, /type:\s*'director-studio'[\s\S]*label:\s*'导演台'[\s\S]*category:\s*'3d'/);
  assert.match(ports, /'director-studio':\s*\{\s*inputs:\s*\['text', 'image', 'model3d'\],\s*outputs:\s*\['text', 'image', 'video'\]\s*\}/);
  assert.match(types, /\|\s*'director-studio'/);
  assert.match(placement, /'director-studio':\s*\{\s*w:\s*420,\s*h:\s*360\s*\}/);
  assert.match(canvas, /const DirectorStudioNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/DirectorStudioNode'\), 'DirectorStudioNode'\)/);
  assert.match(canvas, /'director-studio': DirectorStudioNode/);
  assert.match(canvas, /'director-studio':\s*\{/);
});

test('director project defaults create a reusable 3D scene with avatar actions', async () => {
  const {
    applyDirectorAvatarPose,
    buildDirectorPromptText,
    addDirectorActor,
    createDefaultDirectorProject,
    DIRECTOR_FALLBACK_ACTOR_MODEL_URL,
    removeDirectorActor,
    sanitizeDirectorProject,
    selectDirectorActor,
  } = await loadDirectorProject();

  const project = createDefaultDirectorProject();
  assert.equal(project.schema, 't8-director-project');
  assert.equal(project.mode, '3d');
  assert.match(project.actor.modelUrl, /Xbot\.glb/);
  assert.match(DIRECTOR_FALLBACK_ACTOR_MODEL_URL, /RobotExpressive\.glb/);
  assert.equal(project.actor.source, 'builtin');
  assert.equal(project.actor.playbackMode, 'static');
  assert.equal(project.actor.staticPoseTime, 0.35);
  assert.equal(project.actors.length, 1);
  assert.equal(project.activeActorId, project.actors[0].id);
  assert.equal(project.actors[0].actor.modelUrl, project.actor.modelUrl);
  assert.equal(project.avatars.length, 1);
  assert.equal(project.avatars[0].poseId, 'standing');
  assert.equal(project.camera.fov, 40);
  assert.equal(project.camera.distance, 8);
  assert.equal(project.camera.targetY, 1);
  assert.equal(project.camera.locked, false);
  assert.equal(project.lights.keyIntensity, 2.6);
  assert.equal(project.lights.locked, false);
  assert.equal(project.scene.preset, 'studio');
  assert.equal(project.scene.gridVisible, true);
  assert.equal(project.rig.showSkeleton, true);
  assert.equal(project.render.resolution, '1080p');

  const posed = applyDirectorAvatarPose(project, project.avatars[0].id, 'taekwondo-roundhouse');
  assert.equal(posed.avatars[0].poseId, 'taekwondo-roundhouse');
  assert.equal(posed.avatars[0].groundMode, 'floating');
  assert.ok(posed.avatars[0].rootHeight > 0);

  const prompt = buildDirectorPromptText(posed);
  assert.match(prompt, /Director 3D scene/);
  assert.match(prompt, /taekwondo-roundhouse/);
  assert.match(prompt, /FOV 40/);
  assert.match(prompt, /Scene preset studio/);
  assert.match(prompt, /Lighting ambient/);

  const sanitized = sanitizeDirectorProject({
    mode: '2d',
    camera: { fov: 999, distance: -10, targetY: 9 },
    lights: { keyIntensity: 99, keyColor: 'bad-color', locked: true },
    scene: { preset: 'street', gridSize: 200, gridVisible: false },
    rig: { transformMode: 'rotate', selectedBone: 'mixamorigRightArm', boneRotations: { mixamorigRightArm: { x: 45, y: 999, z: -30 } } },
    avatars: [],
  });
  assert.equal(sanitized.mode, '2d');
  assert.equal(sanitized.camera.fov, 120);
  assert.equal(sanitized.camera.distance, 1);
  assert.equal(sanitized.camera.targetY, 4);
  assert.equal(sanitized.camera.locked, false);
  assert.equal(sanitized.lights.keyIntensity, 8);
  assert.equal(sanitized.lights.keyColor, '#ffffff');
  assert.equal(sanitized.lights.locked, true);
  assert.equal(sanitized.scene.preset, 'street');
  assert.equal(sanitized.scene.gridSize, 80);
  assert.equal(sanitized.scene.gridVisible, false);
  assert.equal(sanitized.rig.transformMode, 'rotate');
  assert.equal(sanitized.rig.boneRotations.mixamorigRightArm.y, 180);
  assert.equal(sanitized.avatars.length, 1);

  const expressive = sanitizeDirectorProject({ actor: { source: 'builtin', modelUrl: DIRECTOR_FALLBACK_ACTOR_MODEL_URL } });
  assert.match(expressive.actor.modelUrl, /RobotExpressive\.glb/);

  const withActionPack = sanitizeDirectorProject({
    actionPacks: [{ id: 'pack-1', name: 'Kick Pack', source: 'url', url: 'https://example.com/kick.glb', enabled: true }],
  });
  assert.equal(withActionPack.actionPacks.length, 1);
  assert.equal(withActionPack.actionPacks[0].name, 'Kick Pack');
  assert.equal(withActionPack.actionPacks[0].url, 'https://example.com/kick.glb');

  const dynamicMode = sanitizeDirectorProject({ actor: { playbackMode: 'animated' } });
  assert.equal(dynamicMode.actor.playbackMode, 'animated');

  const sampledPose = sanitizeDirectorProject({ actor: { staticPoseTime: 0.82 } });
  assert.equal(sampledPose.actor.staticPoseTime, 0.82);

  const clampedPose = sanitizeDirectorProject({ actor: { staticPoseTime: 4 } });
  assert.equal(clampedPose.actor.staticPoseTime, 1);

  const withTwoActors = addDirectorActor(project, 'expression');
  assert.equal(withTwoActors.actors.length, 2);
  assert.equal(withTwoActors.activeActorId, withTwoActors.actors[1].id);
  assert.match(withTwoActors.actor.modelUrl, /RobotExpressive\.glb/);
  assert.match(withTwoActors.actors[1].actor.modelUrl, /RobotExpressive\.glb/);
  assert.ok(withTwoActors.actors[1].x > withTwoActors.actors[0].x);

  const selectedFirst = selectDirectorActor(withTwoActors, withTwoActors.actors[0].id);
  assert.equal(selectedFirst.activeActorId, selectedFirst.actors[0].id);
  assert.equal(selectedFirst.actor.modelUrl, selectedFirst.actors[0].actor.modelUrl);

  const patchedActiveActor = sanitizeDirectorProject({
    ...withTwoActors,
    actor: { ...withTwoActors.actor, activeAnimation: 'Wave' },
    actors: withTwoActors.actors.map((actor) => actor.id === withTwoActors.activeActorId
      ? { ...actor, actor: { ...actor.actor, activeAnimation: 'Wave' } }
      : actor),
  });
  assert.equal(patchedActiveActor.actor.activeAnimation, 'Wave');
  assert.equal(
    patchedActiveActor.actors.find((actor) => actor.id === patchedActiveActor.activeActorId)?.actor.activeAnimation,
    'Wave',
  );

  const removedSecond = removeDirectorActor(withTwoActors, withTwoActors.actors[1].id);
  assert.equal(removedSecond.actors.length, 1);
  assert.equal(removedSecond.activeActorId, removedSecond.actors[0].id);

  const migratedActors = sanitizeDirectorProject({
    actor: { modelUrl: DIRECTOR_FALLBACK_ACTOR_MODEL_URL, playbackMode: 'animated' },
    rig: { selectedBone: 'mixamorigHead' },
  });
  assert.equal(migratedActors.actors.length, 1);
  assert.equal(migratedActors.actors[0].actor.playbackMode, 'animated');
  assert.equal(migratedActors.actors[0].rig.selectedBone, 'mixamorigHead');
});

test('director pose estimation maps MediaPipe landmarks to Mixamo rig rotations', async () => {
  const {
    directorPoseLandmarksFromMediaPipe,
    directorPoseToMixamoBoneRotations,
    poseMasterPointsFromMediaPipe,
  } = await loadDirectorPoseEstimation();

  const landmarks = directorPoseLandmarksFromMediaPipe(makeMediaPipePose({
    15: { x: 0.18, y: 0.24 },
    16: { x: 0.82, y: 0.24 },
    25: { x: 0.48, y: 0.66 },
    26: { x: 0.72, y: 0.78 },
  }));

  assert.ok(landmarks);
  assert.equal(Math.round(landmarks.neck.x * 100), 50);
  assert.equal(Math.round(landmarks.pelvis.y * 100), 56);

  const rotations = directorPoseToMixamoBoneRotations(landmarks);
  assert.ok(Math.abs(rotations.mixamorigLeftArm.z) > 20);
  assert.ok(Math.abs(rotations.mixamorigRightArm.z) > 20);
  assert.ok(Math.abs(rotations.mixamorigLeftUpLeg.x) > 1 || Math.abs(rotations.mixamorigLeftUpLeg.z) > 1);
  assert.ok(rotations.mixamorigSpine);
  assert.ok(rotations.mixamorigHead);

  const poseMasterPoints = poseMasterPointsFromMediaPipe(makeMediaPipePose(), { width: 420, height: 560 });
  assert.ok(poseMasterPoints);
  assert.equal(Math.round(poseMasterPoints.neck.x), 210);
  assert.equal(Math.round(poseMasterPoints.pelvis.y), 314);
});

test('director studio implementation exposes 3D capture and recording controls', () => {
  const node = read('../src/components/nodes/DirectorStudioNode.tsx');
  const poseMaster = read('../src/components/nodes/PoseMasterNode.tsx');
  const studio = read('../src/components/director/DirectorStudio.tsx');

  assert.match(node, /useUpstreamMaterials/);
  assert.match(node, /DirectorStudio/);
  assert.match(node, /打开导演台/);
  assert.match(studio, /WebGLRenderer/);
  assert.match(studio, /GLTFLoader/);
  assert.match(studio, /FBXLoader/);
  assert.match(studio, /SkeletonUtils/);
  assert.match(studio, /AnimationMixer/);
  assert.match(studio, /clipAction/);
  assert.match(studio, /DIRECTOR_ACTION_ANIMATION_MAP/);
  assert.match(studio, /DIRECTOR_FALLBACK_ACTOR_MODEL_URL/);
  assert.match(studio, /findSupportedAnimationClipName/);
  assert.match(studio, /running:\s*\[/);
  assert.match(studio, /walking:\s*\[/);
  assert.match(studio, /DIRECTOR_ACTION_FALLBACK_BLOCKLIST/);
  assert.doesNotMatch(studio, /combat:\s*\[[^\]]*Running/);
  assert.doesNotMatch(studio, /'flying-kick':\s*\[[^\]]*Running/);
  assert.match(studio, /需动作包/);
  assert.match(studio, /actionPacks/);
  assert.match(studio, /loadActionPackAnimations/);
  assert.match(studio, /shouldUseFbxLoader\(url\)/);
  assert.match(studio, /动作包 URL/);
  assert.match(studio, /导入动作包/);
  assert.match(studio, /导入上游动作/);
  assert.match(studio, /DIRECTOR_ACTION_RESOURCE_LIBRARY/);
  assert.match(studio, /detectDirectorPoseFromImage/);
  assert.match(studio, /识别3D姿势/);
  assert.match(studio, /poseImportBusy/);
  assert.doesNotMatch(poseMaster, /FilesetResolver/);
  assert.doesNotMatch(poseMaster, /PoseLandmarker/);
  assert.match(poseMaster, /detectPosePeopleFromImage/);
  assert.match(studio, /builtin:\/\/director-action-pack\/basic/);
  assert.match(studio, /DIRECTOR_AUTO_ACTION_PACK_URLS/);
  assert.match(studio, /builtin:\/\/director-action-pack\/combat/);
  assert.match(studio, /createDirectorBuiltinActionClips/);
  assert.match(studio, /new THREE\.AnimationClip\('Crouch Pose'/);
  assert.match(studio, /new THREE\.AnimationClip\('Sitting Pose'/);
  assert.match(studio, /new THREE\.AnimationClip\('Punch'/);
  assert.match(studio, /new THREE\.AnimationClip\('Kick'/);
  assert.match(studio, /new THREE\.AnimationClip\('Wave'/);
  assert.match(studio, /retargetClip/);
  assert.match(studio, /自动重定向/);
  assert.match(studio, /静态姿势/);
  assert.match(studio, /动作播放/);
  assert.match(studio, /type DirectorPanelTab/);
  assert.match(studio, /DIRECTOR_PANEL_TABS/);
  assert.match(studio, /id:\s*'action'/);
  assert.match(studio, /id:\s*'skeleton'/);
  assert.match(studio, /id:\s*'camera'/);
  assert.match(studio, /id:\s*'lighting'/);
  assert.match(studio, /id:\s*'scene'/);
  assert.match(studio, /id:\s*'resources'/);
  assert.match(studio, /activePanelTab/);
  assert.match(studio, /骨骼/);
  assert.match(studio, /场景/);
  assert.match(studio, /资源/);
  assert.match(studio, /staticPoseTime/);
  assert.match(studio, /sampleStaticPose/);
  assert.match(studio, /姿势取帧/);
  assert.match(studio, /actionLibraryQuery/);
  assert.match(studio, /pack\.enabled/);
  assert.match(studio, /启用/);
  assert.match(studio, /停用/);
  assert.match(studio, /playbackMode === 'animated'/);
  assert.match(studio, /actorMixer\.update\(1 \/ 60\)/);
  assert.match(studio, /bg-\[#07111f\]/);
  assert.match(studio, /actorState\.clipNames/);
  assert.match(studio, /avatars\.visible = false/);
  assert.match(studio, /loadedRoot\.position\.y -= box\.min\.y/);
  assert.match(studio, /supportedPoseIds/);
  assert.doesNotMatch(studio, /DIRECTOR_POSE_ONLY_IDS/);
  assert.match(studio, /action\.enabled/);
  assert.match(studio, /OrbitControls/);
  assert.match(studio, /TransformControls/);
  assert.match(studio, /SkeletonHelper/);
  assert.match(studio, /actorPreviewGroupRef/);
  assert.match(studio, /director-actor-preview-group/);
  assert.match(studio, /director-actor-preview-root/);
  assert.match(studio, /loadActorModel\(actor\.actor\.modelUrl\)/);
  assert.doesNotMatch(studio, /renderActorProxyClones/);
  assert.match(studio, /applyCameraRig/);
  assert.match(studio, /applyBoneRotations/);
  assert.match(studio, /runtimeObjectsRef/);
  assert.match(studio, /PANORAMA_AVATAR_POSES/);
  assert.match(studio, /captureStream/);
  assert.match(studio, /MediaRecorder/);
  assert.match(studio, /createPortal/);
  assert.match(studio, /document\.body/);
  assert.match(studio, /3D模式/);
  assert.match(studio, /2D模式/);
  assert.match(studio, /录制视频/);
  assert.match(studio, /机位控制/);
  assert.match(studio, /自由机位/);
  assert.match(studio, /锁定机位/);
  assert.match(studio, /主光颜色/);
  assert.match(studio, /自由灯光/);
  assert.match(studio, /锁定灯光/);
  assert.match(studio, /leftSidebarCollapsed/);
  assert.match(studio, /rightSidebarCollapsed/);
  assert.match(studio, /收起动作栏/);
  assert.match(studio, /收起参数栏/);
  assert.match(studio, /展开动作栏/);
  assert.match(studio, /展开参数栏/);
  assert.match(studio, /director-sidebar-rail/);
  assert.match(studio, /ResizeObserver/);
  assert.match(studio, /resizeDirectorViewport/);
  assert.doesNotMatch(studio, /leftSidebarCollapsed\s*\?\s*'0px'/);
  assert.doesNotMatch(studio, /rightSidebarCollapsed\s*\?\s*'0px'/);
  assert.match(studio, /actorRootRef\.current && object === actorRootRef\.current/);
  assert.match(studio, /directorActorRoot/);
  assert.match(studio, /actorPlacementFromRoot/);
  assert.match(studio, /normalizeActorHeading/);
  assert.match(studio, /selectedBoneName = cleanProject\.rig\.selectedBone \|\| ''/);
  assert.match(studio, /演员根节点/);
  assert.match(studio, /选中演员移动/);
  assert.match(studio, /DIRECTOR_HAND_BONE_CONTROLS/);
  assert.match(studio, /DIRECTOR_HAND_POSE_PRESETS/);
  assert.match(studio, /buildDirectorHandPoseRotations/);
  assert.match(studio, /applyDirectorHandPose/);
  assert.match(studio, /mixamorigLeftHandIndex1/);
  assert.match(studio, /mixamorigRightHandThumb1/);
  assert.match(studio, /张手/);
  assert.match(studio, /握拳/);
  assert.match(studio, /指向/);
  assert.match(studio, /放松手/);
  assert.match(studio, /DIRECTOR_SCENE_PRESETS/);
  assert.match(studio, /设为演员/);
  assert.match(studio, /addDirectorActor/);
  assert.match(studio, /selectDirectorActor/);
  assert.match(studio, /removeDirectorActor/);
  assert.match(studio, /添加骨骼机器人/);
  assert.match(studio, /添加表情机器人/);
  assert.match(studio, /activeActor/);
  assert.match(studio, /演员轨道/);
  assert.match(studio, /resetActiveActorRigForAction/);
  assert.match(studio, /选中骨骼/);
  assert.match(studio, /setSelectedBoneRotation/);
  assert.match(studio, /findNearestBone/);
  assert.match(studio, /DIRECTOR_BONE_CONTROLS/);
  assert.match(studio, /createDirectorBoneControls/);
  assert.match(studio, /directorBoneControl/);
  assert.match(studio, /raycasterRef/);
  assert.match(studio, /addEventListener\('dblclick', pickBoneFromPointer\)/);
  assert.match(studio, /addEventListener\('objectChange'/);
  assert.match(studio, /lastActionImportMessage/);
  assert.match(studio, /加入动作包/);
  assert.match(studio, /双击画面里的角色/);
  assert.match(studio, /showSkeleton/);
  assert.doesNotMatch(studio, /已回退到占位人偶/);
});

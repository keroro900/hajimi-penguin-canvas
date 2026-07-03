import type { DirectorRigSettings } from './directorProject';

export const DIRECTOR_MEDIAPIPE_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
export const DIRECTOR_MEDIAPIPE_POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

export interface DirectorPosePoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface DirectorPoseLandmarks {
  head: DirectorPosePoint;
  neck: DirectorPosePoint;
  chest: DirectorPosePoint;
  pelvis: DirectorPosePoint;
  lShoulder: DirectorPosePoint;
  rShoulder: DirectorPosePoint;
  lElbow: DirectorPosePoint;
  rElbow: DirectorPosePoint;
  lWrist: DirectorPosePoint;
  rWrist: DirectorPosePoint;
  lHip: DirectorPosePoint;
  rHip: DirectorPosePoint;
  lKnee: DirectorPosePoint;
  rKnee: DirectorPosePoint;
  lAnkle: DirectorPosePoint;
  rAnkle: DirectorPosePoint;
  lFoot: DirectorPosePoint;
  rFoot: DirectorPosePoint;
}

type PoseLandmarkerLike = {
  detect: (image: HTMLImageElement) => { landmarks?: unknown[] };
};

let poseLandmarkerPromise: Promise<PoseLandmarkerLike> | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function landmarkPoint(landmarks: any[], index: number): DirectorPosePoint | null {
  const item = landmarks[index];
  if (!item || typeof item.x !== 'number' || typeof item.y !== 'number') return null;
  return {
    x: clamp(item.x, 0, 1),
    y: clamp(item.y, 0, 1),
    z: typeof item.z === 'number' ? clamp(item.z, -1, 1) : 0,
    visibility: typeof item.visibility === 'number' ? clamp(item.visibility, 0, 1) : 1,
  };
}

function averagePoint(points: DirectorPosePoint[]): DirectorPosePoint {
  const count = Math.max(points.length, 1);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
    z: points.reduce((sum, point) => sum + point.z, 0) / count,
    visibility: points.reduce((sum, point) => sum + point.visibility, 0) / count,
  };
}

function averageAvailable(points: Array<DirectorPosePoint | null>) {
  const valid = points.filter((point): point is DirectorPosePoint => Boolean(point));
  return valid.length ? averagePoint(valid) : null;
}

function interpolatePoint(a: DirectorPosePoint, b: DirectorPosePoint, ratio: number): DirectorPosePoint {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
    z: a.z + (b.z - a.z) * ratio,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

export function directorPoseLandmarksFromMediaPipe(landmarks: any[]): DirectorPoseLandmarks | null {
  const headRaw = averageAvailable([0, 2, 5, 7, 8].map((index) => landmarkPoint(landmarks, index)));
  const lShoulder = landmarkPoint(landmarks, 11);
  const rShoulder = landmarkPoint(landmarks, 12);
  const lHip = landmarkPoint(landmarks, 23);
  const rHip = landmarkPoint(landmarks, 24);
  if (!headRaw || !lShoulder || !rShoulder || !lHip || !rHip) return null;

  const neck = averagePoint([lShoulder, rShoulder]);
  const pelvis = averagePoint([lHip, rHip]);
  const chest = interpolatePoint(neck, pelvis, 0.42);
  const lElbow = landmarkPoint(landmarks, 13) || interpolatePoint(lShoulder, landmarkPoint(landmarks, 15) || lShoulder, 0.55);
  const rElbow = landmarkPoint(landmarks, 14) || interpolatePoint(rShoulder, landmarkPoint(landmarks, 16) || rShoulder, 0.55);
  const lWrist = landmarkPoint(landmarks, 15) || lElbow;
  const rWrist = landmarkPoint(landmarks, 16) || rElbow;
  const lKnee = landmarkPoint(landmarks, 25) || interpolatePoint(lHip, landmarkPoint(landmarks, 27) || lHip, 0.55);
  const rKnee = landmarkPoint(landmarks, 26) || interpolatePoint(rHip, landmarkPoint(landmarks, 28) || rHip, 0.55);
  const lAnkle = landmarkPoint(landmarks, 27) || lKnee;
  const rAnkle = landmarkPoint(landmarks, 28) || rKnee;
  const lFoot = landmarkPoint(landmarks, 31) || lAnkle;
  const rFoot = landmarkPoint(landmarks, 32) || rAnkle;

  return {
    head: headRaw,
    neck,
    chest,
    pelvis,
    lShoulder,
    rShoulder,
    lElbow,
    rElbow,
    lWrist,
    rWrist,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lAnkle,
    rAnkle,
    lFoot,
    rFoot,
  };
}

export type PoseMasterJointKey = keyof DirectorPoseLandmarks;
export type PoseMasterPoint = { x: number; y: number };
export type PoseMasterPoints = Record<PoseMasterJointKey, PoseMasterPoint>;

export function poseMasterPointsFromDirectorLandmarks(landmarks: DirectorPoseLandmarks, bounds: { width: number; height: number }): PoseMasterPoints {
  const width = Math.max(1, bounds.width || 1);
  const height = Math.max(1, bounds.height || 1);
  return Object.fromEntries(
    (Object.keys(landmarks) as PoseMasterJointKey[]).map((key) => [
      key,
      {
        x: clamp(landmarks[key].x * width, 0, width),
        y: clamp(landmarks[key].y * height, 0, height),
      },
    ]),
  ) as PoseMasterPoints;
}

export function poseMasterPointsFromMediaPipe(landmarks: any[], bounds: { width: number; height: number }): PoseMasterPoints | null {
  const directorLandmarks = directorPoseLandmarksFromMediaPipe(landmarks);
  return directorLandmarks ? poseMasterPointsFromDirectorLandmarks(directorLandmarks, bounds) : null;
}

function segmentAngleDeg(a: DirectorPosePoint, b: DirectorPosePoint) {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

function rotationFromDown(a: DirectorPosePoint, b: DirectorPosePoint, mirror = 1) {
  return clamp((segmentAngleDeg(a, b) - 90) * mirror, -145, 145);
}

function rotationFromUp(a: DirectorPosePoint, b: DirectorPosePoint, mirror = 1) {
  return clamp((segmentAngleDeg(a, b) + 90) * mirror, -145, 145);
}

function bendAmount(a: DirectorPosePoint, b: DirectorPosePoint, c: DirectorPosePoint, sign = 1) {
  const first = segmentAngleDeg(a, b);
  const second = segmentAngleDeg(b, c);
  let delta = second - first;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return clamp(delta * sign, -130, 130);
}

export function directorPoseToMixamoBoneRotations(landmarks: DirectorPoseLandmarks): DirectorRigSettings['boneRotations'] {
  const shoulderSlope = (landmarks.rShoulder.y - landmarks.lShoulder.y) * 160;
  const hipSlope = (landmarks.rHip.y - landmarks.lHip.y) * 120;
  const torsoLean = (landmarks.neck.x - landmarks.pelvis.x) * 120;
  const headLean = (landmarks.head.x - landmarks.neck.x) * 140;

  return {
    mixamorigHips: { x: clamp((landmarks.neck.y - landmarks.pelvis.y - 0.28) * -90, -45, 45), y: 0, z: clamp(hipSlope, -45, 45) },
    mixamorigSpine: { x: clamp((landmarks.chest.y - landmarks.neck.y - 0.12) * 120, -50, 50), y: 0, z: clamp(torsoLean + shoulderSlope * 0.35, -55, 55) },
    mixamorigHead: { x: 0, y: clamp((landmarks.head.z - landmarks.neck.z) * 90, -45, 45), z: clamp(headLean, -55, 55) },
    mixamorigLeftArm: { x: clamp((landmarks.lElbow.z - landmarks.lShoulder.z) * 90, -60, 60), y: 0, z: rotationFromDown(landmarks.lShoulder, landmarks.lElbow, 1) },
    mixamorigLeftForeArm: { x: 0, y: 0, z: bendAmount(landmarks.lShoulder, landmarks.lElbow, landmarks.lWrist, 1) },
    mixamorigRightArm: { x: clamp((landmarks.rElbow.z - landmarks.rShoulder.z) * 90, -60, 60), y: 0, z: rotationFromDown(landmarks.rShoulder, landmarks.rElbow, 1) },
    mixamorigRightForeArm: { x: 0, y: 0, z: bendAmount(landmarks.rShoulder, landmarks.rElbow, landmarks.rWrist, 1) },
    mixamorigLeftUpLeg: { x: rotationFromUp(landmarks.lHip, landmarks.lKnee, -0.55), y: 0, z: rotationFromDown(landmarks.lHip, landmarks.lKnee, 0.55) },
    mixamorigLeftLeg: { x: bendAmount(landmarks.lHip, landmarks.lKnee, landmarks.lAnkle, -0.75), y: 0, z: 0 },
    mixamorigLeftFoot: { x: clamp((segmentAngleDeg(landmarks.lAnkle, landmarks.lFoot) - 5) * 0.35, -35, 35), y: 0, z: 0 },
    mixamorigRightUpLeg: { x: rotationFromUp(landmarks.rHip, landmarks.rKnee, -0.55), y: 0, z: rotationFromDown(landmarks.rHip, landmarks.rKnee, 0.55) },
    mixamorigRightLeg: { x: bendAmount(landmarks.rHip, landmarks.rKnee, landmarks.rAnkle, -0.75), y: 0, z: 0 },
    mixamorigRightFoot: { x: clamp((segmentAngleDeg(landmarks.rAnkle, landmarks.rFoot) - 175) * 0.35, -35, 35), y: 0, z: 0 },
  };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const start = (withCrossOrigin: boolean) => {
      const image = new Image();
      if (withCrossOrigin) image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (settled) return;
        settled = true;
        resolve(image);
      };
      image.onerror = () => {
        if (settled) return;
        if (withCrossOrigin) {
          start(false);
          return;
        }
        settled = true;
        reject(new Error('图片载入失败，无法识别姿态'));
      };
      image.src = src;
    };
    start(true);
  });
}

async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(DIRECTOR_MEDIAPIPE_WASM_BASE);
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: DIRECTOR_MEDIAPIPE_POSE_MODEL },
          runningMode: 'IMAGE',
          numPoses: 4,
        }) as PoseLandmarkerLike;
      } catch (error) {
        poseLandmarkerPromise = null;
        throw error;
      }
    })();
  }
  return poseLandmarkerPromise;
}

export async function detectDirectorPoseFromImage(src: string) {
  const [landmarker, image] = await Promise.all([getPoseLandmarker(), loadHtmlImage(src)]);
  const result = landmarker.detect(image);
  const landmarksList = Array.isArray(result?.landmarks) ? result.landmarks : [];
  const landmarks = landmarksList
    .map((item) => directorPoseLandmarksFromMediaPipe(item as any[]))
    .find((item): item is DirectorPoseLandmarks => Boolean(item));
  if (!landmarks) return null;
  return {
    landmarks,
    boneRotations: directorPoseToMixamoBoneRotations(landmarks),
  };
}

export async function detectPosePeopleFromImage(src: string, bounds: { width: number; height: number }, limit = 5): Promise<PoseMasterPoints[]> {
  const [landmarker, image] = await Promise.all([getPoseLandmarker(), loadHtmlImage(src)]);
  const result = landmarker.detect(image);
  const landmarksList = Array.isArray(result?.landmarks) ? result.landmarks : [];
  return landmarksList
    .map((item) => poseMasterPointsFromMediaPipe(item as any[], bounds))
    .filter((item): item is PoseMasterPoints => Boolean(item))
    .slice(0, Math.max(1, limit));
}

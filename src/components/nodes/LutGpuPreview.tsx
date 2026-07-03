import { useEffect, useRef } from 'react';
import type { LutCurveMap, LutCurvePoint } from '../../services/imageOps';

type LutHslRange = 'master' | 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta';
type LutCurve = 'linear' | 'soft-contrast' | 'matte' | 'film-fade' | 'deep-shadow';

export type LutGpuPreviewProps = {
  imageUrl: string;
  lutText: string;
  lutEnabled?: boolean;
  amount?: number;
  adjustEnabled?: boolean;
  hslHue?: number;
  hslSaturation?: number;
  hslLightness?: number;
  hslRange?: LutHslRange;
  hslColorize?: boolean;
  brightness?: number;
  contrast?: number;
  curve?: LutCurve;
  curveAmount?: number;
  curves?: LutCurveMap;
  className?: string;
  onFallback?: (reason: string) => void;
};

type CubeLut = { size: number; data: Uint8Array; domainMin: [number, number, number]; domainMax: [number, number, number] };
type GpuState = {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  imageTexture: WebGLTexture;
  lutTexture: WebGLTexture;
  curveTexture: WebGLTexture;
  positionBuffer: WebGLBuffer | null;
  texCoordBuffer: WebGLBuffer | null;
  lutKey: string;
  curveKey: string;
  uniforms: {
    lutSize: WebGLUniformLocation | null;
    domainMin: WebGLUniformLocation | null;
    domainMax: WebGLUniformLocation | null;
    lutEnabled: WebGLUniformLocation | null;
    lutAmount: WebGLUniformLocation | null;
    adjustEnabled: WebGLUniformLocation | null;
    hue: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    lightness: WebGLUniformLocation | null;
    rangeHue: WebGLUniformLocation | null;
    colorize: WebGLUniformLocation | null;
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
  };
};

const DEFAULT_CURVE: LutCurvePoint[] = [[0, 0], [255, 255]];
const RANGE_HUE: Record<LutHslRange, number> = {
  master: -1,
  red: 0,
  yellow: 60,
  green: 120,
  cyan: 180,
  blue: 240,
  magenta: 300,
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform sampler2D u_lut;
uniform sampler2D u_curve;
uniform float u_lutSize;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
uniform float u_lutEnabled;
uniform float u_lutAmount;
uniform float u_adjustEnabled;
uniform float u_hue;
uniform float u_saturation;
uniform float u_lightness;
uniform float u_rangeHue;
uniform float u_colorize;
uniform float u_brightness;
uniform float u_contrast;

float hueDistance(float a, float b) {
  float d = abs(mod(a - b + 540.0, 360.0) - 180.0);
  return d;
}

float rangeWeight(float hue) {
  if (u_rangeHue < 0.0) return 1.0;
  float d = hueDistance(hue, u_rangeHue);
  if (d <= 30.0) return 1.0;
  if (d >= 50.0) return 0.0;
  return 1.0 - ((d - 30.0) / 20.0);
}

vec3 rgb2hsl(vec3 c) {
  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float h = 0.0;
  float s = 0.0;
  float l = (maxc + minc) * 0.5;
  if (maxc != minc) {
    float d = maxc - minc;
    s = l > 0.5 ? d / (2.0 - maxc - minc) : d / (maxc + minc);
    if (maxc == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxc == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = mod(hsl.x, 360.0) / 360.0;
  float s = clamp(hsl.y, 0.0, 1.0);
  float l = clamp(hsl.z, 0.0, 1.0);
  if (s == 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}

float adjustSigned(float value, float delta) {
  return delta >= 0.0 ? value + (1.0 - value) * delta : value * (1.0 + delta);
}

vec3 sampleCube(vec3 color) {
  float size = u_lutSize;
  vec3 inputColor = clamp((color - u_domainMin) / (u_domainMax - u_domainMin), 0.0, 1.0);
  vec3 scaled = inputColor * (size - 1.0);
  vec3 low = floor(scaled);
  vec3 high = min(vec3(size - 1.0), low + 1.0);
  vec3 fracv = scaled - low;

  float rx0 = low.r;
  float rx1 = high.r;
  float gy0 = low.g;
  float gy1 = high.g;
  float bz0 = low.b;
  float bz1 = high.b;

  vec3 c000 = texture2D(u_lut, vec2((gy0 * size + rx0 + 0.5) / (size * size), (bz0 + 0.5) / size)).rgb;
  vec3 c100 = texture2D(u_lut, vec2((gy0 * size + rx1 + 0.5) / (size * size), (bz0 + 0.5) / size)).rgb;
  vec3 c010 = texture2D(u_lut, vec2((gy1 * size + rx0 + 0.5) / (size * size), (bz0 + 0.5) / size)).rgb;
  vec3 c110 = texture2D(u_lut, vec2((gy1 * size + rx1 + 0.5) / (size * size), (bz0 + 0.5) / size)).rgb;
  vec3 c001 = texture2D(u_lut, vec2((gy0 * size + rx0 + 0.5) / (size * size), (bz1 + 0.5) / size)).rgb;
  vec3 c101 = texture2D(u_lut, vec2((gy0 * size + rx1 + 0.5) / (size * size), (bz1 + 0.5) / size)).rgb;
  vec3 c011 = texture2D(u_lut, vec2((gy1 * size + rx0 + 0.5) / (size * size), (bz1 + 0.5) / size)).rgb;
  vec3 c111 = texture2D(u_lut, vec2((gy1 * size + rx1 + 0.5) / (size * size), (bz1 + 0.5) / size)).rgb;

  vec3 c00 = mix(c000, c100, fracv.r);
  vec3 c10 = mix(c010, c110, fracv.r);
  vec3 c01 = mix(c001, c101, fracv.r);
  vec3 c11 = mix(c011, c111, fracv.r);
  vec3 c0 = mix(c00, c10, fracv.g);
  vec3 c1 = mix(c01, c11, fracv.g);
  return mix(c0, c1, fracv.b);
}

void main() {
  vec4 src = texture2D(u_image, v_texCoord);
  vec3 color = src.rgb;
  if (u_lutEnabled > 0.5) {
    color = mix(color, sampleCube(color), u_lutAmount);
  }
  if (u_adjustEnabled > 0.5) {
    vec3 hsl = rgb2hsl(color);
    float w = rangeWeight(hsl.x);
    if (w > 0.0 && (abs(u_hue) > 0.01 || abs(u_saturation) > 0.001 || abs(u_lightness) > 0.001 || u_colorize > 0.5)) {
      vec3 adjusted = hsl;
      if (u_colorize > 0.5) {
        adjusted.x = mod(u_hue + 360.0, 360.0);
        adjusted.y = clamp(0.5 + u_saturation * 0.5, 0.0, 1.0);
      } else {
        adjusted.x = mod(adjusted.x + u_hue + 360.0, 360.0);
        adjusted.y = adjustSigned(adjusted.y, u_saturation);
      }
      adjusted.z = adjustSigned(adjusted.z, u_lightness);
      color = mix(color, hsl2rgb(adjusted), w);
    }
    color = clamp(color + u_brightness, 0.0, 1.0);
    if (u_contrast > 0.0) color = (color - 0.5) / max(0.001, 1.0 - u_contrast) + 0.5;
    else if (u_contrast < 0.0) color = (color - 0.5) * (1.0 + u_contrast) + 0.5;
    color = clamp(color, 0.0, 1.0);
    float curveR = (floor(clamp(color.r, 0.0, 1.0) * 255.0 + 0.5) + 0.5) / 256.0;
    float curveG = (floor(clamp(color.g, 0.0, 1.0) * 255.0 + 0.5) + 0.5) / 256.0;
    float curveB = (floor(clamp(color.b, 0.0, 1.0) * 255.0 + 0.5) + 0.5) / 256.0;
    color.r = texture2D(u_curve, vec2(curveR, 0.125)).r;
    color.g = texture2D(u_curve, vec2(curveG, 0.375)).g;
    color.b = texture2D(u_curve, vec2(curveB, 0.625)).b;
  }
  gl_FragColor = vec4(color, src.a);
}
`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseNumberTriplet(parts: string[]): [number, number, number] {
  return [
    Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 0,
    Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 0,
    Number.isFinite(Number(parts[2])) ? Number(parts[2]) : 0,
  ];
}

function safeDomainMax(domainMin: [number, number, number], domainMax: [number, number, number]): [number, number, number] {
  return [
    domainMax[0] === domainMin[0] ? domainMin[0] + 1 : domainMax[0],
    domainMax[1] === domainMin[1] ? domainMin[1] + 1 : domainMax[1],
    domainMax[2] === domainMin[2] ? domainMin[2] + 1 : domainMax[2],
  ];
}

function normalizeCurvePoints(points?: LutCurvePoint[]): LutCurvePoint[] {
  if (!Array.isArray(points)) return DEFAULT_CURVE;
  const parsed = points.map((point) => [
    Math.round(clamp(Array.isArray(point) ? Number(point[0]) : 0, 0, 255)),
    Math.round(clamp(Array.isArray(point) ? Number(point[1]) : 0, 0, 255)),
  ] as LutCurvePoint);
  parsed.push([0, 0], [255, 255]);
  const byX = new Map<number, number>();
  parsed.forEach(([x, y]) => byX.set(x, y));
  return [...byX.entries()].sort((a, b) => a[0] - b[0]) as LutCurvePoint[];
}

function buildCurve(points?: LutCurvePoint[]) {
  const normalized = normalizeCurvePoints(points);
  const out = new Uint8Array(256);
  let segment = 0;
  for (let x = 0; x < 256; x += 1) {
    while (segment < normalized.length - 2 && x > normalized[segment + 1][0]) segment += 1;
    const [x0, y0] = normalized[segment];
    const [x1, y1] = normalized[Math.min(segment + 1, normalized.length - 1)];
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    out[x] = Math.round(clamp(y0 + (y1 - y0) * t, 0, 255));
  }
  return out;
}

function buildCurveTextureData(curves?: LutCurveMap, preset?: LutCurve, presetAmount?: number) {
  const rgb = buildCurve(curves?.rgb);
  const r = buildCurve(curves?.r);
  const g = buildCurve(curves?.g);
  const b = buildCurve(curves?.b);
  const mix = clamp((presetAmount ?? 100) / 100, 0, 1);
  const data = new Uint8Array(256 * 4 * 4);
  for (let x = 0; x < 256; x += 1) {
    const presetValue = applyTonePresetValue(x / 255, preset, mix);
    const presetByte = Math.round(clamp(presetValue, 0, 1) * 255);
    const rv = r[rgb[presetByte]];
    const gv = g[rgb[presetByte]];
    const bv = b[rgb[presetByte]];
    data[(x + 0 * 256) * 4] = rv;
    data[(x + 0 * 256) * 4 + 3] = 255;
    data[(x + 1 * 256) * 4 + 1] = gv;
    data[(x + 1 * 256) * 4 + 3] = 255;
    data[(x + 2 * 256) * 4 + 2] = bv;
    data[(x + 2 * 256) * 4 + 3] = 255;
    data[(x + 3 * 256) * 4] = rv;
    data[(x + 3 * 256) * 4 + 1] = gv;
    data[(x + 3 * 256) * 4 + 2] = bv;
    data[(x + 3 * 256) * 4 + 3] = 255;
  }
  return data;
}

function applyTonePresetValue(value: number, preset?: LutCurve, amount = 1) {
  if (!preset || preset === 'linear' || amount <= 0) return value;
  let shaped = value;
  if (preset === 'soft-contrast') shaped = value * value * (3 - 2 * value);
  else if (preset === 'matte') shaped = 0.08 + value * 0.86;
  else if (preset === 'film-fade') shaped = Math.pow(value, 0.86) * 0.94 + 0.035;
  else if (preset === 'deep-shadow') shaped = Math.pow(value, 1.18);
  return value + (shaped - value) * clamp(amount, 0, 1);
}

function parseCubeLut(text: string): CubeLut | null {
  if (!text.trim()) return null;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const table: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    if (!clean) continue;
    const parts = clean.split(/\s+/);
    const keyword = parts[0].toUpperCase();
    if (keyword === 'LUT_3D_SIZE') {
      size = Number.parseInt(parts[1], 10);
      continue;
    }
    if (keyword === 'DOMAIN_MIN') {
      domainMin = parseNumberTriplet(parts.slice(1));
      continue;
    }
    if (keyword === 'DOMAIN_MAX') {
      domainMax = parseNumberTriplet(parts.slice(1));
      continue;
    }
    if (keyword === 'TITLE' || keyword === 'LUT_1D_SIZE') continue;
    if (/^[A-Z_]+$/i.test(parts[0])) continue;
    if (parts.length >= 3) table.push(clamp(Number(parts[0]) || 0, 0, 1), clamp(Number(parts[1]) || 0, 0, 1), clamp(Number(parts[2]) || 0, 0, 1));
  }
  if (!size || table.length !== size * size * size * 3) return null;
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const source = (r + g * size + b * size * size) * 3;
        const target = (b * size * size + g * size + r) * 4;
        data[target] = Math.round(table[source] * 255);
        data[target + 1] = Math.round(table[source + 1] * 255);
        data[target + 2] = Math.round(table[source + 2] * 255);
        data[target + 3] = 255;
      }
    }
  }
  return { size, data, domainMin, domainMax: safeDomainMax(domainMin, domainMax) };
}

function identityLut(size = 16): CubeLut {
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const target = (b * size * size + g * size + r) * 4;
        data[target] = Math.round((r / (size - 1)) * 255);
        data[target + 1] = Math.round((g / (size - 1)) * 255);
        data[target + 2] = Math.round((b / (size - 1)) * 255);
        data[target + 3] = 255;
      }
    }
  }
  return { size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}

function compileShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建 WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader 编译失败');
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建 WebGL program');
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'WebGL program 链接失败');
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, unit: number, filter?: number) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('无法创建 WebGL texture');
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter ?? gl.LINEAR);
  return texture;
}

function bindPreviewTextures(state: GpuState) {
  const { gl } = state;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.imageTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.lutTexture);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, state.curveTexture);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('GPU 预览加载图片失败'));
    img.src = url;
  });
}

export default function LutGpuPreview(props: LutGpuPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GpuState | null>(null);
  const rafRef = useRef<number | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const scheduleDraw = (state: GpuState) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const { gl } = state;
      gl.useProgram(state.program);
      bindPreviewTextures(state);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  };

  const applyPreviewProps = (state: GpuState, nextProps: LutGpuPreviewProps) => {
    const { gl } = state;
    gl.useProgram(state.program);

    const lutKey = `${nextProps.lutEnabled === false ? 'off' : 'on'}\n${nextProps.lutText || ''}`;
    if (state.lutKey !== lutKey) {
      const cube = (nextProps.lutEnabled === false ? null : parseCubeLut(nextProps.lutText)) || identityLut();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.lutTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cube.size * cube.size, cube.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, cube.data);
      gl.uniform1f(state.uniforms.lutSize, cube.size);
      gl.uniform3f(state.uniforms.domainMin, cube.domainMin[0], cube.domainMin[1], cube.domainMin[2]);
      gl.uniform3f(state.uniforms.domainMax, cube.domainMax[0], cube.domainMax[1], cube.domainMax[2]);
      state.lutKey = lutKey;
    }

    const curveKey = JSON.stringify([nextProps.curves || null, nextProps.curve || 'linear', nextProps.curveAmount ?? 100]);
    if (state.curveKey !== curveKey) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, state.curveTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurveTextureData(nextProps.curves, nextProps.curve, nextProps.curveAmount));
      state.curveKey = curveKey;
    }

    gl.uniform1f(state.uniforms.lutEnabled, nextProps.lutEnabled === false || !nextProps.lutText ? 0 : 1);
    gl.uniform1f(state.uniforms.lutAmount, clamp(nextProps.amount ?? 1, 0, 1));
    gl.uniform1f(state.uniforms.adjustEnabled, nextProps.adjustEnabled === false ? 0 : 1);
    gl.uniform1f(state.uniforms.hue, clamp(nextProps.hslHue ?? 0, -180, 180));
    gl.uniform1f(state.uniforms.saturation, clamp(nextProps.hslSaturation ?? 0, -100, 100) / 100);
    gl.uniform1f(state.uniforms.lightness, clamp(nextProps.hslLightness ?? 0, -100, 100) / 100);
    gl.uniform1f(state.uniforms.rangeHue, RANGE_HUE[nextProps.hslRange || 'master']);
    gl.uniform1f(state.uniforms.colorize, nextProps.hslColorize ? 1 : 0);
    gl.uniform1f(state.uniforms.brightness, clamp(nextProps.brightness ?? 0, -100, 100) / 100);
    gl.uniform1f(state.uniforms.contrast, clamp(nextProps.contrast ?? 0, -100, 100) / 100);

    scheduleDraw(state);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !props.imageUrl) return;
    let disposed = false;
    const gl = (canvas.getContext('webgl2', { premultipliedAlpha: false }) || canvas.getContext('webgl', { premultipliedAlpha: false })) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) {
      props.onFallback?.('当前环境不支持 WebGL 实时预览');
      return;
    }

    const run = async () => {
      try {
        const img = await loadImage(props.imageUrl);
        if (disposed) return;
        const program = createProgram(gl);
        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const aPosition = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
        const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

        const imageTexture = createTexture(gl, gl.TEXTURE0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        const lutTexture = createTexture(gl, gl.TEXTURE1, gl.NEAREST);
        const cube = identityLut();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cube.size * cube.size, cube.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, cube.data);

        const curveTexture = createTexture(gl, gl.TEXTURE2, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurveTextureData(undefined, undefined, undefined));

        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
        gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1);
        gl.uniform1i(gl.getUniformLocation(program, 'u_curve'), 2);

        const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
        const rect = canvas.getBoundingClientRect();
        const maxW = Math.max(1, Math.floor(rect.width || 960));
        const maxH = Math.max(1, Math.floor(rect.height || 540));
        let width = maxW;
        let height = Math.round(width / ratio);
        if (height > maxH) {
          height = maxH;
          width = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);

        const state: GpuState = {
          gl,
          program,
          imageTexture,
          lutTexture,
          curveTexture,
          positionBuffer,
          texCoordBuffer,
          lutKey: '',
          curveKey: '',
          uniforms: {
            lutSize: gl.getUniformLocation(program, 'u_lutSize'),
            domainMin: gl.getUniformLocation(program, 'u_domainMin'),
            domainMax: gl.getUniformLocation(program, 'u_domainMax'),
            lutEnabled: gl.getUniformLocation(program, 'u_lutEnabled'),
            lutAmount: gl.getUniformLocation(program, 'u_lutAmount'),
            adjustEnabled: gl.getUniformLocation(program, 'u_adjustEnabled'),
            hue: gl.getUniformLocation(program, 'u_hue'),
            saturation: gl.getUniformLocation(program, 'u_saturation'),
            lightness: gl.getUniformLocation(program, 'u_lightness'),
            rangeHue: gl.getUniformLocation(program, 'u_rangeHue'),
            colorize: gl.getUniformLocation(program, 'u_colorize'),
            brightness: gl.getUniformLocation(program, 'u_brightness'),
            contrast: gl.getUniformLocation(program, 'u_contrast'),
          },
        };
        stateRef.current = state;
        bindPreviewTextures(state);
        applyPreviewProps(state, propsRef.current);
      } catch (error: any) {
        if (!disposed) props.onFallback?.(error?.message || 'WebGL 实时预览失败');
      }
    };
    void run();

    return () => {
      disposed = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const state = stateRef.current;
      if (state) {
        const { gl } = state;
        gl.deleteTexture(state.imageTexture);
        gl.deleteTexture(state.lutTexture);
        gl.deleteTexture(state.curveTexture);
        gl.deleteBuffer(state.positionBuffer);
        gl.deleteBuffer(state.texCoordBuffer);
        gl.deleteProgram(state.program);
      }
      stateRef.current = null;
    };
  }, [props.imageUrl, props.onFallback]);

  useEffect(() => {
    const state = stateRef.current;
    if (state) applyPreviewProps(state, props);
  }, [props.lutText, props.lutEnabled, props.amount, props.adjustEnabled, props.hslHue, props.hslSaturation, props.hslLightness, props.hslRange, props.hslColorize, props.brightness, props.contrast, props.curve, props.curveAmount, props.curves]);

  return <canvas ref={canvasRef} className={props.className || 'h-full w-full object-contain'} />;
}

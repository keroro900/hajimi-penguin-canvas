function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseNumberTriplet(parts, lineNo, label) {
  if (parts.length < 3) throw new Error(`${label} 第 ${lineNo} 行需要 3 个数值`);
  const values = parts.slice(0, 3).map((part) => Number(part));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} 第 ${lineNo} 行包含无效数值`);
  }
  return values;
}

function stripComment(line) {
  const index = line.indexOf('#');
  return (index >= 0 ? line.slice(0, index) : line).trim();
}

function parseCubeLut(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('LUT 内容为空');

  let title = '';
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const table = [];
  let saw1d = false;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const clean = stripComment(lines[i]);
    if (!clean) continue;
    const parts = clean.split(/\s+/);
    const keyword = parts[0].toUpperCase();
    if (keyword === 'TITLE') {
      title = clean.slice(parts[0].length).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (keyword === 'LUT_1D_SIZE') {
      saw1d = true;
      continue;
    }
    if (keyword === 'LUT_3D_SIZE') {
      size = Number.parseInt(parts[1], 10);
      if (!Number.isInteger(size) || size < 2 || size > 128) {
        throw new Error('LUT_3D_SIZE 范围必须在 2-128');
      }
      continue;
    }
    if (keyword === 'DOMAIN_MIN') {
      domainMin = parseNumberTriplet(parts.slice(1), i + 1, 'DOMAIN_MIN');
      continue;
    }
    if (keyword === 'DOMAIN_MAX') {
      domainMax = parseNumberTriplet(parts.slice(1), i + 1, 'DOMAIN_MAX');
      continue;
    }
    if (/^[A-Z_]+$/i.test(parts[0])) {
      continue;
    }
    table.push(parseNumberTriplet(parts, i + 1, 'LUT 数据'));
  }

  if (!size) {
    throw new Error(saw1d ? '只支持 3D LUT，请提供 LUT_3D_SIZE' : '缺少 LUT_3D_SIZE');
  }
  const expected = size * size * size;
  if (table.length !== expected) {
    throw new Error(`LUT 数据数量不匹配：需要 ${expected} 行，实际 ${table.length} 行`);
  }
  for (let i = 0; i < 3; i++) {
    if (domainMax[i] === domainMin[i]) throw new Error('DOMAIN_MIN 和 DOMAIN_MAX 不能相同');
  }
  return { title, size, domainMin, domainMax, table };
}

function tableIndex(size, ri, gi, bi) {
  return ri + gi * size + bi * size * size;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleCubeLut(lut, r, g, b) {
  const size = lut.size;
  const input = [r, g, b].map((value, index) => (
    clamp01((value - lut.domainMin[index]) / (lut.domainMax[index] - lut.domainMin[index]))
  ));
  const scaled = input.map((value) => value * (size - 1));
  const low = scaled.map((value) => Math.floor(value));
  const high = low.map((value) => Math.min(size - 1, value + 1));
  const frac = scaled.map((value, index) => value - low[index]);

  const out = [0, 0, 0];
  for (let bz = 0; bz <= 1; bz++) {
    const bi = bz ? high[2] : low[2];
    const bw = bz ? frac[2] : 1 - frac[2];
    for (let gy = 0; gy <= 1; gy++) {
      const gi = gy ? high[1] : low[1];
      const gw = gy ? frac[1] : 1 - frac[1];
      for (let rx = 0; rx <= 1; rx++) {
        const ri = rx ? high[0] : low[0];
        const rw = rx ? frac[0] : 1 - frac[0];
        const sample = lut.table[tableIndex(size, ri, gi, bi)];
        const weight = rw * gw * bw;
        out[0] += sample[0] * weight;
        out[1] += sample[1] * weight;
        out[2] += sample[2] * weight;
      }
    }
  }
  return out.map(clamp01);
}

function toByte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function applyCubeLutToRgba(buffer, lut, amount = 1) {
  if (!Buffer.isBuffer(buffer)) throw new Error('RGBA 数据必须是 Buffer');
  if (buffer.length % 4 !== 0) throw new Error('RGBA 数据长度必须是 4 的倍数');
  const strength = clamp01(Number(amount));
  const output = Buffer.from(buffer);
  for (let i = 0; i < output.length; i += 4) {
    const r = output[i] / 255;
    const g = output[i + 1] / 255;
    const b = output[i + 2] / 255;
    const sampled = sampleCubeLut(lut, r, g, b);
    output[i] = toByte(lerp(r, sampled[0], strength));
    output[i + 1] = toByte(lerp(g, sampled[1], strength));
    output[i + 2] = toByte(lerp(b, sampled[2], strength));
  }
  return output;
}

function createCubeLutText(title, size, transform) {
  if (!Number.isInteger(size) || size < 2 || size > 64) {
    throw new Error('生成 LUT 的 size 范围必须在 2-64');
  }
  const lines = [
    `TITLE "${String(title || 'Untitled').replace(/"/g, '')}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
  ];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rgb = transform(r / (size - 1), g / (size - 1), b / (size - 1)).map(clamp01);
        lines.push(rgb.map((value) => value.toFixed(6)).join(' '));
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  applyCubeLutToRgba,
  createCubeLutText,
  parseCubeLut,
  sampleCubeLut,
};

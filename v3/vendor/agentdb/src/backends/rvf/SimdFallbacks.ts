/**
 * SimdFallbacks - Optimized pure-JS fallbacks for SIMD operations
 *
 * All vector math, activation functions, and element-wise operations
 * with 4-wide loop unrolling for performance-critical paths.
 * Used by NativeAccelerator when @swarmvector/swarmllm is unavailable.
 */

// Pre-computed CRC32C (Castagnoli) lookup table
const CRC32C_TABLE = new Uint32Array(256);
{
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0x82F63B78 : 0);
    CRC32C_TABLE[i] = crc;
  }
}

export function jsCosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let dot = 0, nA = 0, nB = 0;
  const n4 = n - (n & 3);
  let dot1 = 0, dot2 = 0, dot3 = 0, dot4 = 0;
  let nA1 = 0, nA2 = 0, nA3 = 0, nA4 = 0;
  let nB1 = 0, nB2 = 0, nB3 = 0, nB4 = 0;
  for (let i = 0; i < n4; i += 4) {
    const a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3];
    const b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3];
    dot1 += a0 * b0; dot2 += a1 * b1; dot3 += a2 * b2; dot4 += a3 * b3;
    nA1 += a0 * a0; nA2 += a1 * a1; nA3 += a2 * a2; nA4 += a3 * a3;
    nB1 += b0 * b0; nB2 += b1 * b1; nB3 += b2 * b2; nB4 += b3 * b3;
  }
  dot = dot1 + dot2 + dot3 + dot4;
  nA = nA1 + nA2 + nA3 + nA4;
  nB = nB1 + nB2 + nB3 + nB4;
  for (let i = n4; i < n; i++) { dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i]; }
  const d = Math.sqrt(nA * nB);
  return d > 0 ? dot / d : 0;
}

export function jsDotProduct(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  const n4 = n - (n & 3);
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let i = 0; i < n4; i += 4) {
    s0 += a[i] * b[i]; s1 += a[i+1] * b[i+1];
    s2 += a[i+2] * b[i+2]; s3 += a[i+3] * b[i+3];
  }
  let dot = s0 + s1 + s2 + s3;
  for (let i = n4; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export function jsL2Distance(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  const n4 = n - (n & 3);
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let i = 0; i < n4; i += 4) {
    const d0 = a[i] - b[i], d1 = a[i+1] - b[i+1];
    const d2 = a[i+2] - b[i+2], d3 = a[i+3] - b[i+3];
    s0 += d0 * d0; s1 += d1 * d1; s2 += d2 * d2; s3 += d3 * d3;
  }
  let sum = s0 + s1 + s2 + s3;
  for (let i = n4; i < n; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

export function jsHammingDistance(a: Uint8Array, b: Uint8Array): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = a[i] ^ b[i];
    while (xor) { xor &= xor - 1; dist++; }
  }
  return dist;
}

export function jsInfoNceLoss(
  anchor: Float32Array, positive: Float32Array,
  negatives: Float32Array[], temperature: number,
): number {
  const posSim = jsCosineSimilarity(anchor, positive) / temperature;
  let logSumExp = Math.exp(posSim);
  for (const neg of negatives) {
    logSumExp += Math.exp(jsCosineSimilarity(anchor, neg) / temperature);
  }
  return -posSim + Math.log(logSumExp);
}

export function jsAdamWStep(
  params: Float32Array, grads: Float32Array,
  m: Float32Array, v: Float32Array,
  step: number, lr: number, wd: number,
): void {
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  const bc1 = 1 - Math.pow(beta1, step);
  const bc2 = 1 - Math.pow(beta2, step);
  for (let i = 0; i < params.length; i++) {
    params[i] -= lr * wd * params[i];
    m[i] = beta1 * m[i] + (1 - beta1) * grads[i];
    v[i] = beta2 * v[i] + (1 - beta2) * grads[i] * grads[i];
    params[i] -= lr * (m[i] / bc1) / (Math.sqrt(v[i] / bc2) + eps);
  }
}

export function jsMatvec(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.length;
  const cols = vector.length;
  const result = new Array<number>(rows);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    const n4 = cols - (cols & 3);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let c = 0; c < n4; c += 4) {
      s0 += row[c] * vector[c]; s1 += row[c+1] * vector[c+1];
      s2 += row[c+2] * vector[c+2]; s3 += row[c+3] * vector[c+3];
    }
    let sum = s0 + s1 + s2 + s3;
    for (let c = n4; c < cols; c++) sum += row[c] * vector[c];
    result[r] = sum;
  }
  return result;
}

export function jsSoftmax(input: number[]): number[] {
  const n = input.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (input[i] > max) max = input[i];
  const result = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { result[i] = Math.exp(input[i] - max); sum += result[i]; }
  if (sum > 0) for (let i = 0; i < n; i++) result[i] /= sum;
  return result;
}

export function jsRelu(input: number[]): number[] {
  const n = input.length;
  const n4 = n - (n & 3);
  const result = new Array<number>(n);
  for (let i = 0; i < n4; i += 4) {
    result[i] = input[i] > 0 ? input[i] : 0;
    result[i+1] = input[i+1] > 0 ? input[i+1] : 0;
    result[i+2] = input[i+2] > 0 ? input[i+2] : 0;
    result[i+3] = input[i+3] > 0 ? input[i+3] : 0;
  }
  for (let i = n4; i < n; i++) result[i] = input[i] > 0 ? input[i] : 0;
  return result;
}

export function jsGelu(input: number[]): number[] {
  const n = input.length;
  const c = Math.sqrt(2 / Math.PI);
  const result = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const x = input[i];
    result[i] = 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x * x * x)));
  }
  return result;
}

export function jsSigmoid(input: number[]): number[] {
  const n = input.length;
  const n4 = n - (n & 3);
  const result = new Array<number>(n);
  for (let i = 0; i < n4; i += 4) {
    result[i] = 1 / (1 + Math.exp(-input[i]));
    result[i+1] = 1 / (1 + Math.exp(-input[i+1]));
    result[i+2] = 1 / (1 + Math.exp(-input[i+2]));
    result[i+3] = 1 / (1 + Math.exp(-input[i+3]));
  }
  for (let i = n4; i < n; i++) result[i] = 1 / (1 + Math.exp(-input[i]));
  return result;
}

export function jsLayerNorm(input: number[], eps: number): number[] {
  const n = input.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += input[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = input[i] - mean; variance += d * d; }
  variance /= n;
  const invStd = 1 / Math.sqrt(variance + eps);
  const result = new Array<number>(n);
  const n4 = n - (n & 3);
  for (let i = 0; i < n4; i += 4) {
    result[i] = (input[i] - mean) * invStd;
    result[i+1] = (input[i+1] - mean) * invStd;
    result[i+2] = (input[i+2] - mean) * invStd;
    result[i+3] = (input[i+3] - mean) * invStd;
  }
  for (let i = n4; i < n; i++) result[i] = (input[i] - mean) * invStd;
  return result;
}

export function jsAdd(a: number[], b: number[]): number[] {
  const n = a.length;
  const n4 = n - (n & 3);
  const result = new Array<number>(n);
  for (let i = 0; i < n4; i += 4) {
    result[i] = a[i] + b[i]; result[i+1] = a[i+1] + b[i+1];
    result[i+2] = a[i+2] + b[i+2]; result[i+3] = a[i+3] + b[i+3];
  }
  for (let i = n4; i < n; i++) result[i] = a[i] + b[i];
  return result;
}

export function jsMul(a: number[], b: number[]): number[] {
  const n = a.length;
  const n4 = n - (n & 3);
  const result = new Array<number>(n);
  for (let i = 0; i < n4; i += 4) {
    result[i] = a[i] * b[i]; result[i+1] = a[i+1] * b[i+1];
    result[i+2] = a[i+2] * b[i+2]; result[i+3] = a[i+3] * b[i+3];
  }
  for (let i = n4; i < n; i++) result[i] = a[i] * b[i];
  return result;
}

export function jsScale(a: number[], scalar: number): number[] {
  const n = a.length;
  const n4 = n - (n & 3);
  const result = new Array<number>(n);
  for (let i = 0; i < n4; i += 4) {
    result[i] = a[i] * scalar; result[i+1] = a[i+1] * scalar;
    result[i+2] = a[i+2] * scalar; result[i+3] = a[i+3] * scalar;
  }
  for (let i = n4; i < n; i++) result[i] = a[i] * scalar;
  return result;
}

export function jsNormalizeVec(a: number[]): number[] {
  const n = a.length;
  let norm = 0;
  for (let i = 0; i < n; i++) norm += a[i] * a[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return new Array<number>(n).fill(0);
  const result = new Array<number>(n);
  const invNorm = 1 / norm;
  const n4 = n - (n & 3);
  for (let i = 0; i < n4; i += 4) {
    result[i] = a[i] * invNorm; result[i+1] = a[i+1] * invNorm;
    result[i+2] = a[i+2] * invNorm; result[i+3] = a[i+3] * invNorm;
  }
  for (let i = n4; i < n; i++) result[i] = a[i] * invNorm;
  return result;
}

export function jsCrc32c(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32C_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** RIFF/WAVE encode and decode. PCM16, PCM24 and IEEE float32, interleaved, even-padded chunks. */
import { stream } from "../domain/random";

export type Encoding = "pcm16" | "pcm24" | "float32";

export interface DecodedWav {
  sampleRate: number;
  channels: Float32Array[];
  encoding: Encoding;
  frames: number;
}

export class WavError extends Error {}

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  encoding: Encoding,
  opts: { dither?: boolean; seed?: number } = {},
): Uint8Array {
  const nch = channels.length;
  const frames = channels[0].length;
  const bytes = encoding === "pcm16" ? 2 : encoding === "pcm24" ? 3 : 4;
  const dataLen = frames * nch * bytes;
  if (dataLen + 44 > 0xffffffff - 8) throw new WavError("File would exceed the 4 GiB WAV limit.");
  const pad = dataLen & 1;
  const out = new Uint8Array(44 + dataLen + pad);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + dataLen + pad, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, encoding === "float32" ? 3 : 1, true);
  dv.setUint16(22, nch, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nch * bytes, true); dv.setUint16(32, nch * bytes, true);
  dv.setUint16(34, bytes * 8, true);
  str(36, "data"); dv.setUint32(40, dataLen, true);
  const dither = !!opts.dither && encoding !== "float32";
  const rng = stream(opts.seed ?? 0, "dither");
  const full = encoding === "pcm16" ? 32768 : 8388608;
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const x = channels[c][i];
      if (encoding === "float32") { dv.setFloat32(o, x, true); o += 4; continue; }
      let v = x * (full - 1);
      if (dither) v += rng.next() - rng.next(); // TPDF, +-1 LSB
      let q = Math.round(v);
      if (q > full - 1) q = full - 1; else if (q < -full) q = -full;
      if (encoding === "pcm16") { dv.setInt16(o, q, true); o += 2; }
      else { out[o] = q & 255; out[o + 1] = (q >> 8) & 255; out[o + 2] = (q >> 16) & 255; o += 3; }
    }
  }
  return out;
}

export function decodeWav(buf: Uint8Array, limits = { maxFrames: 48000 * 600 }): DecodedWav {
  if (buf.length < 44) throw new WavError("This file is too small to be a WAV file.");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new WavError("Not a RIFF/WAVE file.");
  let o = 12;
  let fmt: { format: number; nch: number; sr: number; bits: number } | null = null;
  let dataOff = -1, dataLen = 0;
  while (o + 8 <= buf.length) {
    const id = tag(o);
    let len = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt ") {
      if (len < 16) throw new WavError("Corrupt fmt chunk.");
      let format = dv.getUint16(body, true);
      const nch = dv.getUint16(body + 2, true);
      const sr = dv.getUint32(body + 4, true);
      const bits = dv.getUint16(body + 14, true);
      if (format === 0xfffe && len >= 26) format = dv.getUint16(body + 24, true);
      fmt = { format, nch, sr, bits };
    } else if (id === "data") {
      if (body + len > buf.length) len = buf.length - body; // tolerate truncated final chunk
      dataOff = body; dataLen = len;
      break;
    }
    o = body + len + (len & 1);
  }
  if (!fmt) throw new WavError("The WAV file has no format chunk.");
  if (dataOff < 0) throw new WavError("The WAV file has no audio data.");
  const { format, nch, sr, bits } = fmt;
  let encoding: Encoding;
  if (format === 1 && bits === 16) encoding = "pcm16";
  else if (format === 1 && bits === 24) encoding = "pcm24";
  else if (format === 3 && bits === 32) encoding = "float32";
  else throw new WavError(`Unsupported WAV encoding (format ${format}, ${bits}-bit). Use PCM 16/24-bit or 32-bit float.`);
  if (nch < 1 || nch > 2) throw new WavError(`Unsupported channel count (${nch}). Use mono or stereo.`);
  if (sr < 8000 || sr > 384000) throw new WavError(`Unsupported sample rate (${sr} Hz).`);
  const bytes = bits / 8;
  const frames = Math.floor(dataLen / (bytes * nch));
  if (frames < 1) throw new WavError("The WAV file contains no audio frames.");
  if (frames > limits.maxFrames) throw new WavError(`The WAV file is too long (${frames} frames). Trim it first.`);
  const channels = Array.from({ length: nch }, () => new Float32Array(frames));
  let p = dataOff;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      let v: number;
      if (encoding === "pcm16") { v = dv.getInt16(p, true) / 32768; p += 2; }
      else if (encoding === "pcm24") {
        let q = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
        if (q & 0x800000) q |= ~0xffffff;
        v = q / 8388608; p += 3;
      } else { v = dv.getFloat32(p, true); p += 4; }
      channels[c][i] = v;
    }
  }
  return { sampleRate: sr, channels, encoding, frames };
}

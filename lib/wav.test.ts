import { describe, it, expect } from "vitest";
import { downsample, encodeWav, looksLikeWav, mixToMono } from "./wav";

// The sounds check sends exactly what these build. A wrong header and the
// model hears noise or nothing; a wrong rate and it hears a sentence sped
// up or slowed down — and judges the "pronunciation" of that.

const header = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset);
const text = (bytes: Uint8Array, from: number) =>
    String.fromCharCode(...bytes.subarray(from, from + 4));

describe("encodeWav", () => {
    it("writes a 16-bit mono PCM header for the given rate", () => {
        const wav = encodeWav(new Float32Array(10), 16000);
        const view = header(wav);
        expect(text(wav, 0)).toBe("RIFF");
        expect(text(wav, 8)).toBe("WAVE");
        expect(view.getUint16(20, true)).toBe(1); // PCM
        expect(view.getUint16(22, true)).toBe(1); // mono
        expect(view.getUint32(24, true)).toBe(16000);
        expect(view.getUint32(28, true)).toBe(32000); // bytes per second
        expect(view.getUint16(34, true)).toBe(16);
    });

    it("sizes the file from the samples: 44 bytes of header, 2 per sample", () => {
        const wav = encodeWav(new Float32Array(1000), 16000);
        expect(wav.length).toBe(44 + 2000);
        expect(header(wav).getUint32(40, true)).toBe(2000);
        expect(header(wav).getUint32(4, true)).toBe(36 + 2000);
    });

    it("turns -1…1 into the full 16-bit range, and clips beyond it", () => {
        const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16000);
        const view = header(wav);
        expect(view.getInt16(44, true)).toBe(0);
        expect(view.getInt16(46, true)).toBe(32767);
        expect(view.getInt16(48, true)).toBe(-32768);
        expect(view.getInt16(50, true)).toBe(32767);
        expect(view.getInt16(52, true)).toBe(-32768);
    });
});

describe("looksLikeWav", () => {
    it("accepts what encodeWav writes", () => {
        expect(looksLikeWav(encodeWav(new Float32Array(10), 16000))).toBe(true);
    });

    // The recordings in this project's own test turned out to be MP4 with a
    // .wav name; a name proves nothing, the first bytes do.
    it("refuses anything that only claims to be WAV", () => {
        const mp4 = new Uint8Array(64);
        mp4.set([0, 0, 0, 24, ...Array.from("ftypmp42", (c) => c.charCodeAt(0))]);
        expect(looksLikeWav(mp4)).toBe(false);
        expect(looksLikeWav(new Uint8Array(10))).toBe(false);
    });
});

describe("mixToMono", () => {
    it("averages the channels into one", () => {
        const mono = mixToMono([new Float32Array([1, 0.5]), new Float32Array([0, 0.5])]);
        expect(Array.from(mono)).toEqual([0.5, 0.5]);
    });

    it("leaves a single channel as it is", () => {
        const only = new Float32Array([0.25]);
        expect(mixToMono([only])).toBe(only);
    });
});

describe("downsample", () => {
    it("brings 48 kHz down to 16 kHz by averaging each group of three", () => {
        const result = downsample(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48000, 16000);
        expect(result).toHaveLength(2);
        expect(result[0]).toBeCloseTo(0.3);
        expect(result[1]).toBeCloseTo(1);
    });

    it("keeps the length in step with the time: one second stays one second", () => {
        expect(downsample(new Float32Array(44100), 44100, 16000)).toHaveLength(16000);
    });

    it("returns the same samples when the rate already matches", () => {
        const samples = new Float32Array([0.1, 0.2]);
        expect(downsample(samples, 16000, 16000)).toBe(samples);
    });

    it("refuses to go up, which would only invent samples", () => {
        expect(() => downsample(new Float32Array(10), 8000, 16000)).toThrow();
    });
});

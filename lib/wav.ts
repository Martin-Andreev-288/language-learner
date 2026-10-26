// Turning recorded sound into the one format the sounds check sends: a WAV
// file of 16 kHz, 16-bit, mono samples (item 10 in directions2.md).
//
// WAV rather than what the browser records natively (WebM in Chrome and
// Firefox, MP4 in Safari) because it is the one format every browser can be
// turned into and Google's audio input accepts without question — and 16 kHz
// mono is all speech needs, which keeps a twelve-second sentence near 380 KB,
// comfortably inside the 1 MB a server action accepts.
//
// Plain functions with no browser APIs, so they can be tested directly.

export const SOUNDS_SAMPLE_RATE = 16000;

// Averages every channel into one, for a recording that arrived in stereo.
export function mixToMono(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) return channels[0];
    const length = Math.min(...channels.map((channel) => channel.length));
    const mono = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        let sum = 0;
        for (const channel of channels) sum += channel[i];
        mono[i] = sum / channels.length;
    }
    return mono;
}

// From the rate a recording was decoded at down to `toRate`, by averaging
// the samples that fall into each output step. Only ever used to go down:
// the browser normally decodes straight to 16 kHz, and this is the fallback
// for one that won't.
export function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return samples;
    if (fromRate < toRate) {
        throw new Error(`Can't downsample from ${fromRate} Hz up to ${toRate} Hz.`);
    }
    const ratio = fromRate / toRate;
    const length = Math.floor(samples.length / ratio);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += samples[j];
        result[i] = end > start ? sum / (end - start) : samples[start] ?? 0;
    }
    return result;
}

// Samples between -1 and 1, as the Web Audio API gives them, into a complete
// 16-bit PCM WAV file: a 44-byte header that says what follows, then the
// samples. Anything outside -1…1 is clipped rather than wrapped around.
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
    const dataBytes = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeText = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true); // size of the format section
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // bytes per second
    view.setUint16(32, 2, true); // bytes per sample
    view.setUint16(34, 16, true); // bits per sample
    writeText(36, "data");
    view.setUint32(40, dataBytes, true);

    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Uint8Array(buffer);
}

// Whether these bytes start like a WAV file. Checked on the server before
// anything is sent on, so a file that merely claims to be WAV is refused.
export function looksLikeWav(bytes: Uint8Array): boolean {
    if (bytes.length < 44) return false;
    const text = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
    return text(0) === "RIFF" && text(8) === "WAVE";
}

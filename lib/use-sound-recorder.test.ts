// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSoundRecorder } from "./use-sound-recorder";

// The recorder on its own, and above all what it does when something goes
// wrong (item 10, iteration 4): until now the page's tests replaced it with
// a stand-in, so none of these had ever run. The browser's microphone,
// MediaRecorder and audio decoding are stand-ins here, each told by the test
// whether to work.

class FakeTrack {
    stop = vi.fn();
}

class FakeMediaRecorder {
    static last: FakeMediaRecorder | null = null;
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(public stream: { getTracks: () => FakeTrack[] }) {
        FakeMediaRecorder.last = this;
    }
    start() {
        this.state = "recording";
    }
    stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])]) });
        this.onstop?.();
    }
}

let track: FakeTrack;
let microphone: () => Promise<unknown>;
let decode: () => Promise<unknown>;

const decoded = (seconds: number) => ({
    numberOfChannels: 1,
    sampleRate: 16000,
    duration: seconds,
    getChannelData: () => new Float32Array(Math.round(16000 * seconds)).fill(0.25),
});

class FakeAudioContext {
    decodeAudioData() {
        return decode();
    }
    close() {
        return Promise.resolve();
    }
}

beforeEach(() => {
    track = new FakeTrack();
    microphone = () => Promise.resolve({ getTracks: () => [track] });
    decode = () => Promise.resolve(decoded(3));
    FakeMediaRecorder.last = null;
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("OfflineAudioContext", FakeAudioContext);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: vi.fn(() => microphone()) },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// Starts a recording and waits until the microphone has answered.
async function record(result: { current: ReturnType<typeof useSoundRecorder> }) {
    act(() => result.current.start());
    await waitFor(() => expect(FakeMediaRecorder.last?.state).toBe("recording"));
}

describe("useSoundRecorder", () => {
    it("keeps a finished recording as a WAV file, and lets go of the microphone", async () => {
        const { result } = renderHook(() => useSoundRecorder());
        await record(result);
        act(() => result.current.stop());

        await waitFor(() => expect(result.current.sound).not.toBeNull());
        const wav = result.current.sound!.wav;
        expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
        expect(result.current.sound!.seconds).toBe(3);
        // How loud it was, so the page can leave a silent one out.
        expect(result.current.sound!.peak).toBeCloseTo(0.25, 2);
        expect(result.current.recording).toBe(false);
        expect(result.current.preparing).toBe(false);
        expect(track.stop).toHaveBeenCalled();
    });

    it("has no sound, and isn't stuck recording, when the microphone is refused", async () => {
        microphone = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
        const { result } = renderHook(() => useSoundRecorder());
        act(() => result.current.start());

        await waitFor(() => expect(result.current.recording).toBe(false));
        expect(result.current.sound).toBeNull();
        expect(FakeMediaRecorder.last).toBeNull();
    });

    it("has no sound, and isn't stuck preparing, when the recording can't be decoded", async () => {
        decode = () => Promise.reject(new Error("Unable to decode audio data"));
        const { result } = renderHook(() => useSoundRecorder());
        await record(result);
        act(() => result.current.stop());

        await waitFor(() => expect(result.current.preparing).toBe(false));
        expect(result.current.sound).toBeNull();
        expect(result.current.tooLong).toBe(false);
        expect(track.stop).toHaveBeenCalled();
    });

    it("marks a recording past the cap as too long, and keeps no sound", async () => {
        decode = () => Promise.resolve(decoded(14));
        const { result } = renderHook(() => useSoundRecorder());
        await record(result);
        act(() => result.current.stop());

        await waitFor(() => expect(result.current.tooLong).toBe(true));
        expect(result.current.sound).toBeNull();
    });

    it("keeps nothing from a recording thrown away mid-way", async () => {
        const { result } = renderHook(() => useSoundRecorder());
        await record(result);
        act(() => result.current.clear());

        expect(FakeMediaRecorder.last!.state).toBe("inactive");
        expect(track.stop).toHaveBeenCalled();
        // Given time to decode, there is still nothing.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(result.current.sound).toBeNull();
        expect(result.current.recording).toBe(false);
    });

    it("lets go of the microphone when you leave the page mid-recording", async () => {
        const { result, unmount } = renderHook(() => useSoundRecorder());
        await record(result);
        unmount();
        expect(FakeMediaRecorder.last!.state).toBe("inactive");
        expect(track.stop).toHaveBeenCalled();
    });

    it("does nothing in a browser that can't record", () => {
        vi.stubGlobal("MediaRecorder", undefined);
        const { result } = renderHook(() => useSoundRecorder());
        expect(result.current.supported).toBe(false);
        act(() => result.current.start());
        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(result.current.recording).toBe(false);
    });
});

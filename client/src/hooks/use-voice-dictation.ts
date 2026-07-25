import { useCallback, useEffect, useRef, useState } from "react";

/** Voice dictation with two engines behind one API:
 *
 *  1. Web Speech API — live interim transcript, no server round-trip. Used
 *     wherever it actually works (desktop Chrome/Edge, Android Chrome).
 *  2. MediaRecorder + server Whisper (`/api/voice/transcribe-with-context`) —
 *     records audio and transcribes on stop. This is the ONLY path that works
 *     in an iOS home-screen PWA: Safari defines webkitSpeechRecognition there
 *     but the OS refuses to service it in standalone mode, so we force the
 *     recorder up front on iOS standalone and also fall back at runtime if a
 *     recognizer reports "service-not-allowed".
 *
 *  Either way the session is push-to-talk: start() opens the mic, stop()
 *  finalizes and delivers the text via onFinal. The speech engine's habit of
 *  ending itself after a pause is papered over by relaunching it and
 *  accumulating finals until the user stops it.
 */

type VoiceDictationOptions = {
  /** Live transcript while dictating (speech-API engine only — the recorder
   *  engine has nothing to show until transcription finishes). */
  onTranscript?: (text: string) => void;
  /** Final text after stop(). Empty string when nothing usable was heard. */
  onFinal: (text: string) => void;
  /** Human-readable failure ("mic blocked", "couldn't transcribe", …). */
  onError?: (message: string) => void;
};

const SpeechRecognitionImpl =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const canRecord =
  typeof window !== "undefined" &&
  typeof MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

const isIOS =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true);

const preferRecorder = canRecord && (!SpeechRecognitionImpl || (isIOS && isStandalone));

/** Merge a newly delivered recognition chunk into accumulated text.
 *
 *  Browsers disagree about what a "result" is: Chrome delivers disjoint
 *  segments that must be joined, while iOS Safari delivers CUMULATIVE chunks —
 *  each one repeats the whole transcript so far plus the new words. Blindly
 *  joining iOS chunks turns "create a work order" into a staircase of every
 *  prefix. So: a chunk that extends the accumulated text replaces it, a chunk
 *  the accumulated text already ends with is dropped (Android re-delivers the
 *  same final repeatedly), and only genuinely new speech is appended. */
function mergeDictationChunk(acc: string, chunk: string): string {
  const a = acc.trim();
  const b = chunk.trim();
  if (!a) return b;
  if (!b) return a;
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (nb.startsWith(na)) return b;
  if (na === nb || na.endsWith(nb)) return a;
  return a + " " + b;
}

export function useVoiceDictation({ onTranscript, onFinal, onError }: VoiceDictationOptions) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [usesRecorder, setUsesRecorder] = useState(preferRecorder);

  // Callbacks live in a ref so the engine internals never close over stale ones.
  const cbRef = useRef({ onTranscript, onFinal, onError });
  cbRef.current = { onTranscript, onFinal, onError };

  const recorderModeRef = useRef(preferRecorder);
  const listeningRef = useRef(false);
  const setListen = (v: boolean) => {
    listeningRef.current = v;
    setListening(v);
  };

  // --- Speech-API engine state ---
  const recognitionRef = useRef<any>(null);
  // Finals from recognizer sessions that already ended (we relaunch on silent
  // self-stops) + the CURRENT session's finals. The current session is fully
  // REBUILT from e.results on every event instead of appended to — Android
  // Chrome re-delivers the same final results repeatedly in continuous mode,
  // and incremental appending turns one sentence into twenty.
  const prevSessionsRef = useRef("");
  const sessionFinalRef = useRef("");
  const manualStopRef = useRef(false);
  const switchingToRecorderRef = useRef(false);

  // --- Recorder engine state ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const finalizeSpeech = () => {
    setListen(false);
    const spoken = mergeDictationChunk(prevSessionsRef.current, sessionFinalRef.current)
      .replace(/\s+/g, " ")
      .trim();
    prevSessionsRef.current = "";
    sessionFinalRef.current = "";
    cbRef.current.onFinal(spoken);
  };

  const transcribeBlob = async (blob: Blob, type: string) => {
    if (blob.size < 1000) {
      cbRef.current.onError?.("I didn't catch any speech — try again.");
      cbRef.current.onFinal("");
      return;
    }
    setProcessing(true);
    try {
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `dictation.${ext}`);
      form.append("context", "A spoken question or instruction for the CRM's AI assistant");
      const res = await fetch("/api/voice/transcribe-with-context", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const data = await res.json();
      const text = (data?.summary || "").trim();
      if (!text || text === "NO_AUDIO_DETECTED") {
        cbRef.current.onError?.("I didn't catch any speech — try again.");
        cbRef.current.onFinal("");
      } else {
        cbRef.current.onFinal(text);
      }
    } catch {
      cbRef.current.onError?.("Couldn't transcribe that recording — try again in a moment.");
      cbRef.current.onFinal("");
    } finally {
      setProcessing(false);
    }
  };

  const startRecorder = async () => {
    cancelledRef.current = false;
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // iOS Safari records audio/mp4 (AAC); Chrome records audio/webm.
      const mimeType = ["audio/webm", "audio/mp4"].find(
        (t) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t),
      );
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setListen(false);
        if (cancelledRef.current) return;
        const type = rec.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        void transcribeBlob(blob, type);
      };
      // Timeslice so iOS delivers chunks as it goes instead of one blob at the
      // end (some versions drop the final blob without it).
      rec.start(1000);
    } catch {
      setListen(false);
      cbRef.current.onError?.("Microphone unavailable — check the mic permission for this app.");
    }
  };

  const launchRecognition = () => {
    const rec = new SpeechRecognitionImpl();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      // Rebuild this session's transcript from scratch every event —
      // idempotent, so duplicate deliveries of the same results can never
      // stack — and merge chunks with cumulative-delivery detection so iOS's
      // repeat-everything-so-far results don't staircase.
      let sessionFinal = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = (e.results[i][0]?.transcript || "").trim();
        if (!t) continue;
        if (e.results[i].isFinal) sessionFinal = mergeDictationChunk(sessionFinal, t);
        else interim = mergeDictationChunk(interim, t);
      }
      sessionFinalRef.current = sessionFinal;
      cbRef.current.onTranscript?.(
        mergeDictationChunk(mergeDictationChunk(prevSessionsRef.current, sessionFinal), interim)
          .replace(/\s+/g, " ")
          .trimStart(),
      );
    };
    rec.onend = () => {
      recognitionRef.current = null;
      if (cancelledRef.current) return;
      if (switchingToRecorderRef.current) {
        // The recognizer exists but the OS refuses to service it (iOS PWA) —
        // hand this same session to the recorder without finalizing.
        switchingToRecorderRef.current = false;
        void startRecorder();
        return;
      }
      // Fold the finished session's finals into the carried text exactly once.
      prevSessionsRef.current = mergeDictationChunk(prevSessionsRef.current, sessionFinalRef.current);
      sessionFinalRef.current = "";
      if (manualStopRef.current) {
        finalizeSpeech();
      } else {
        // The recognizer gave up on its own (silence/network hiccup) — the
        // user didn't stop it, so spin a fresh one up seamlessly.
        try {
          launchRecognition();
        } catch {
          finalizeSpeech();
        }
      }
    };
    rec.onerror = (e: any) => {
      if (e?.error === "service-not-allowed" && canRecord) {
        recorderModeRef.current = true;
        setUsesRecorder(true);
        switchingToRecorderRef.current = true;
        rec.abort?.();
        return;
      }
      // Fatal permission errors end the session; transient ones ("no-speech",
      // "network", "aborted") fall through to onend and restart.
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        manualStopRef.current = true;
        prevSessionsRef.current = "";
        sessionFinalRef.current = "";
        setListen(false);
        cbRef.current.onError?.("Microphone unavailable — check the mic permission for this app.");
      }
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const start = useCallback(() => {
    if (listeningRef.current) return;
    manualStopRef.current = false;
    cancelledRef.current = false;
    switchingToRecorderRef.current = false;
    prevSessionsRef.current = "";
    sessionFinalRef.current = "";
    setListen(true);
    if (recorderModeRef.current) {
      void startRecorder();
      return;
    }
    try {
      launchRecognition();
    } catch {
      if (canRecord) {
        recorderModeRef.current = true;
        setUsesRecorder(true);
        void startRecorder();
      } else {
        setListen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop?.();
    } else if (listeningRef.current) {
      // A speech-engine restart was mid-flight — finalize directly.
      finalizeSpeech();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tear the session down without delivering anything (sheet closed, etc.). */
  const cancel = useCallback(() => {
    manualStopRef.current = true;
    cancelledRef.current = true;
    switchingToRecorderRef.current = false;
    prevSessionsRef.current = "";
    sessionFinalRef.current = "";
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setListen(false);
    setProcessing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    /** Some engine can capture voice on this device. */
    supported: !!SpeechRecognitionImpl || canRecord,
    listening,
    /** Recorder engine only: audio uploaded, waiting on transcription. */
    processing,
    /** True when the record-then-transcribe engine is active (no live transcript). */
    usesRecorder,
    start,
    stop,
    cancel,
  };
}

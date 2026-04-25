'use client';

import { useEffect, useRef, useState } from 'react';
import { DimensionKey, Language, sendMessageStream, getSession, BACKEND_URL } from '../lib/api';

interface Props {
  token: string;
  language: Language;
  initialDimension: DimensionKey;
}

// ─── VAD constants ────────────────────────────────────────────────────────────
const SILENCE_THRESHOLD = 0.008;   // RMS below this = silence
const SILENCE_AFTER_SPEECH = 2000; // ms of silence after speech → submit
const NO_SPEECH_TIMEOUT = 10000;   // ms with no speech at all → skip
const VAD_INTERVAL = 100;          // ms between RMS checks

const LANG_CODE: Record<Language, string> = { en: 'en-US', ru: 'ru-RU', tr: 'tr-TR' };

const INTRO: Record<Language, string> = {
  en: "Hey — thanks for taking the time. This is a short anonymous conversation about your work experience. No right or wrong answers, just your honest take. Ready to start?",
  ru: "Привет — спасибо, что нашёл время. Это короткий анонимный разговор о твоём рабочем опыте. Нет правильных или неправильных ответов — только твой честный взгляд. Готов начать?",
  tr: "Merhaba — zaman ayırdığın için teşekkürler. Bu, iş deneyimin hakkında kısa ve anonim bir konuşma. Doğru ya da yanlış cevap yok — sadece dürüst görüşün. Başlamaya hazır mısın?",
};

const OUTRO: Record<Language, string> = {
  en: "That's everything — thank you so much for your time and for sharing so openly. It was a pleasure speaking with you. Take care, and goodbye!",
  ru: "Это всё — большое спасибо за твоё время и за то, что так открыто поделился. Было приятно пообщаться. Береги себя, до свидания!",
  tr: "Hepsi bu kadar — zaman ayırdığın ve bu kadar açık paylaştığın için çok teşekkür ederim. Seninle konuşmak bir zevkti. Kendine iyi bak, güle güle!",
};

export default function FaceToFaceInterview({ token, language, initialDimension }: Props) {
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentDim, setCurrentDim] = useState<DimensionKey>(initialDimension);
  const [isRecording, setIsRecording] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false); // transcribing audio
  const [botMessage, setBotMessage] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);

  // always-current refs
  const loadingRef = useRef(false);
  const finishedRef = useRef(false);
  const botSpeakingRef = useRef(false);
  const micEnabledRef = useRef(false);
  const sendingRef = useRef(false);

  // recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // timers
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechDetectedRef = useRef(false); // true once user starts speaking

  // misc
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const introPlayedRef = useRef(false);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);

  // sync state → refs
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { finishedRef.current = finished; }, [finished]);
  useEffect(() => { botSpeakingRef.current = botSpeaking; }, [botSpeaking]);
  useEffect(() => { micEnabledRef.current = microphoneEnabled; }, [microphoneEnabled]);

  // ─── cleanup helpers ────────────────────────────────────────────────────────

  const clearVAD = () => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };
  const clearNoSpeechTimer = () => {
    if (noSpeechTimerRef.current) { clearTimeout(noSpeechTimerRef.current); noSpeechTimerRef.current = null; }
  };

  const clearAllTimers = () => { clearVAD(); clearSilenceTimer(); clearNoSpeechTimer(); };

  const stopTTSAudio = () => {
    window.speechSynthesis.cancel();
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.stop(); } catch {}
      ttsSourceRef.current = null;
    }
    if (ttsAudioCtxRef.current) {
      ttsAudioCtxRef.current.close().catch(() => {});
      ttsAudioCtxRef.current = null;
    }
    setBotSpeaking(false);
    botSpeakingRef.current = false;
  };

  const stopRecording = () => {
    clearAllTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsRecording(false);
  };

  // ─── submit audio to Whisper ────────────────────────────────────────────────

  const submitAudio = async (chunks: Blob[]) => {
    if (sendingRef.current || loadingRef.current || finishedRef.current) return;
    if (chunks.length === 0) {
      // no speech detected — skip silently, use 'skip' as the answer
      if (!finishedRef.current) {
        sendingRef.current = true;
        setLoading(true); loadingRef.current = true;
        setBotSpeaking(true); botSpeakingRef.current = true;
        try {
          let botReply = '';
          await sendMessageStream(token, '__skip__', chunk => { botReply += chunk; });
          setBotMessage(botReply);
          const session = await getSession(token);
          if (session.currentDimension) setCurrentDim(session.currentDimension);
          if (session.finished) { setFinished(true); finishedRef.current = true; }
          if (botReply.trim()) await speakText(botReply);
          else { setBotSpeaking(false); botSpeakingRef.current = false; afterSpeak(); }
        } catch (e) {
          console.error(e);
          setBotSpeaking(false); botSpeakingRef.current = false;
          afterSpeak();
        } finally {
          sendingRef.current = false;
          setLoading(false); loadingRef.current = false;
        }
      }
      return;
    }

    sendingRef.current = true;
    setProcessing(true);
    setLoading(true);
    loadingRef.current = true;
    setBotSpeaking(true);
    botSpeakingRef.current = true;

    try {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });

      // transcribe via backend Whisper
      const arrayBuffer = await audioBlob.arrayBuffer();
      const transcribeRes = await fetch(`${BACKEND_URL}/survey/${token}/voice/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: arrayBuffer,
      });

      let userText = '__skip__';
      if (transcribeRes.ok) {
        const data = await transcribeRes.json();
        userText = (data.text ?? '').trim() || '__skip__';
      } else {
        const errData = await transcribeRes.json().catch(() => ({}));
        console.error('[Transcribe] server error:', transcribeRes.status, errData);
      }

      // send to interview
      let botReply = '';
      await sendMessageStream(token, userText, chunk => { botReply += chunk; });
      setBotMessage(botReply);

      const session = await getSession(token);
      if (session.currentDimension) setCurrentDim(session.currentDimension);
      if (session.finished) { setFinished(true); finishedRef.current = true; }

      // If finished and backend sent no closing message, speak our own outro
      const replyToSpeak = botReply.trim() || (finishedRef.current ? OUTRO[language] : '');

      if (replyToSpeak) {
        await speakText(replyToSpeak);
      } else {
        setBotSpeaking(false);
        botSpeakingRef.current = false;
        if (!finishedRef.current) setTimeout(startListening, 300);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setBotSpeaking(false);
      botSpeakingRef.current = false;
      if (!finishedRef.current) setTimeout(startListening, 1000);
    } finally {
      sendingRef.current = false;
      setProcessing(false);
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // ─── start listening (MediaRecorder + VAD) ──────────────────────────────────

  const startListening = async () => {
    if (
      sendingRef.current ||
      loadingRef.current ||
      botSpeakingRef.current ||
      finishedRef.current ||
      !micEnabledRef.current
    ) return;

    stopRecording(); // clean up any previous session

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      micStreamRef.current = stream;

      // AudioContext for VAD
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      // MediaRecorder — use opus if supported, fall back to browser default
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = new MediaRecorder(stream, ...(mimeType ? [{ mimeType }] : []));
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        submitAudio(chunks);
      };

      recorder.start(200); // collect chunks every 200ms
      setIsRecording(true);
      speechDetectedRef.current = false;

      // ── VAD loop ──────────────────────────────────────────────────────────
      const buf = new Float32Array(analyser.fftSize);

      // 10s no-speech → skip
      noSpeechTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && !sendingRef.current) {
          stopRecording();
          submitAudio([]); // empty → skip
        }
      }, NO_SPEECH_TIMEOUT);

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);

        if (rms > SILENCE_THRESHOLD) {
          // ── speech detected ──
          speechDetectedRef.current = true;
          clearNoSpeechTimer(); // cancel skip timer
          clearSilenceTimer();  // reset silence countdown
          // arm silence-after-speech timer
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (!sendingRef.current) stopRecording(); // triggers onstop → submitAudio
          }, SILENCE_AFTER_SPEECH);
        }
      }, VAD_INTERVAL);

    } catch (err) {
      console.error('Mic/recording setup error:', err);
      setIsRecording(false);
    }
  };

  // ─── speakText ───────────────────────────────────────────────────────────────

  const afterSpeak = () => {
    if (finishedRef.current) {
      sessionStorage.removeItem("interview_token");
      // give the user a moment to hear the farewell before redirecting
      setTimeout(() => { window.location.href = '/'; }, 5000);
    } else if (micEnabledRef.current) {
      setTimeout(startListening, 300);
    } else {
      setTimeout(() => submitAudio([]), NO_SPEECH_TIMEOUT);
    }
  };

  const speakWithBrowser = (text: string, resolve: () => void) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_CODE[language];
    u.rate = 1.0;
    const done = () => {
      setBotSpeaking(false); botSpeakingRef.current = false;
      resolve();
      afterSpeak();
    };
    u.onend = done;
    u.onerror = e => { if (e.error === 'interrupted') return; console.error('TTS:', e.error); done(); };
    window.speechSynthesis.speak(u);
  };

  const speakText = (text: string): Promise<void> => new Promise(resolve => {
    if (!text?.trim()) {
      setBotSpeaking(false); botSpeakingRef.current = false;
      resolve(); return;
    }
    setBotSpeaking(true); botSpeakingRef.current = true;

    const done = () => {
      setBotSpeaking(false); botSpeakingRef.current = false;
      resolve();
      afterSpeak();
    };

    // Try server TTS first, fall back to browser
    fetch(`${BACKEND_URL}/survey/${token}/voice/speak/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed: 1.0, voiceGender: language === 'ru' ? 'female' : 'male' }),
    })
      .then(async res => {
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength <= 1000) throw new Error('Empty audio');
        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        ttsSourceRef.current = source;
        ttsAudioCtxRef.current = audioCtx;
        source.onended = () => {
          ttsSourceRef.current = null;
          ttsAudioCtxRef.current = null;
          audioCtx.close();
          done();
        };
        source.start();
      })
      .catch(err => {
        console.warn('[Server TTS failed, using browser TTS]', err.message);
        speakWithBrowser(text, resolve);
      });
  });

  // ─── init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (introPlayedRef.current) return;
    introPlayedRef.current = true;

    setBotMessage(INTRO[language]);
    window.speechSynthesis.cancel();
    speakText(INTRO[language]);

    const stopAll = () => {
      stopTTSAudio();
      stopRecording();
      camStreamRef.current?.getTracks().forEach(t => t.stop());
    };

    window.addEventListener('beforeunload', stopAll);

    return () => {
      stopAll();
      window.removeEventListener('beforeunload', stopAll);
    };
  }, []);

  // ─── UI handlers ─────────────────────────────────────────────────────────────

  const toggleMicrophone = () => {
    if (microphoneEnabled) {
      // just stop recording — interview continues, bot still speaks
      setMicrophoneEnabled(false);
      micEnabledRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
        analyserRef.current = null;
      }
      clearAllTimers();
      setIsRecording(false);
    } else {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          setMicrophoneEnabled(true);
          micEnabledRef.current = true;
          if (!botSpeakingRef.current && !loadingRef.current && !finishedRef.current)
            setTimeout(startListening, 100);
        })
        .catch(err => console.error('Mic denied:', err));
    }
  };

  const toggleCamera = async () => {
    if (cameraOn) {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = null; setCameraOn(false);
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) { videoRef.current.srcObject = s; camStreamRef.current = s; setCameraOn(true); }
      } catch (e) { console.error('Camera:', e); }
    }
  };

  const handleExit = () => {
    stopTTSAudio();
    stopRecording();
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    sessionStorage.removeItem("interview_token");
    window.location.href = '/';
  };


  // ─── render ──────────────────────────────────────────────────────────────────

  if (finished && !botSpeaking) {
    const thanks = {
      en: "Thank you for your time.",
      ru: "Спасибо за уделённое время.",
      tr: "Zaman ayırdığın için teşekkürler.",
    }[language];
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <p className="text-white/60 text-lg">{thanks}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-black">

      {/* ── Bot panel ── */}
      <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-black overflow-hidden flex flex-col items-center justify-center py-6 px-4">
        <div className="relative overflow-hidden rounded-2xl" style={{ width: '100%', aspectRatio: '3/4', maxHeight: '75%' }}>
          <img
            src={language === 'ru' ? '/woman.jpg' : '/man.jpg'}
            alt="Interviewer"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 20%' }}
          />
          {/* bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
          {/* Status pill — bottom center */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
            {isRecording && (
              <div className="flex items-center gap-2 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />
                {language === 'en' ? 'Listening…' : language === 'ru' ? 'Слушаю…' : 'Dinliyorum…'}
              </div>
            )}
            {botSpeaking && !isRecording && (
              <div className="flex items-center gap-2 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
                <span className="w-2 h-2 bg-white rounded-full animate-bounce shrink-0" />
                {language === 'en' ? 'Speaking…' : language === 'ru' ? 'Говорит…' : 'Konuşuyor…'}
              </div>
            )}
            {loading && !botSpeaking && (
              <div className="flex items-center gap-2 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                {processing
                  ? (language === 'en' ? 'Processing…' : language === 'ru' ? 'Обработка…' : 'İşleniyor…')
                  : (language === 'en' ? 'Thinking…' : language === 'ru' ? 'Думает…' : 'Düşünüyor…')
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── User panel ── */}
      <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-black border-t md:border-t-0 md:border-l border-white/10 overflow-hidden flex flex-col items-center justify-center py-6 px-4">
        <div className="relative overflow-hidden rounded-2xl" style={{ width: '100%', aspectRatio: '3/4', maxHeight: '75%' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${cameraOn ? 'block' : 'hidden'}`}
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1c1c2e] to-[#2a2a3e]">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center mb-4 shadow-2xl">
                <svg viewBox="0 0 24 24" className="w-14 h-14 text-white/30" fill="currentColor">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                </svg>
              </div>
              <div className="flex items-center gap-2 text-white/30 text-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M18 10.48V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4.48l4 3.98v-11l-4 3.98zm-2-.79V18H4V6h12v3.69zM2.1 3.51L.69 4.92 3 7.23V18c0 1.1.9 2 2 2h10.77l2.31 2.31 1.41-1.41L2.1 3.51z"/>
                </svg>
                {language === 'en' ? 'Camera off' : language === 'ru' ? 'Камера выключена' : 'Kamera kapalı'}
              </div>
            </div>
          )}
          {/* Controls — bottom center */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleMicrophone}
            title={microphoneEnabled ? 'Mic On' : 'Mic Off'}
            className={`p-2.5 sm:p-3 rounded-xl transition-all ${
              microphoneEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-black/60 hover:bg-black/80 opacity-60'
            }`}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              {microphoneEnabled
                ? <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z" />
                : <g>
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z" />
                    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </g>
              }
            </svg>
          </button>
          <button
            onClick={toggleCamera}
            title={cameraOn ? 'Camera On' : 'Camera Off'}
            className="p-2.5 sm:p-3 rounded-xl bg-black/60 hover:bg-black/80 transition-all"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              {cameraOn
                ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                : <g>
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                    <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </g>
              }
            </svg>
          </button>
          <button
            onClick={handleExit}
            className="p-2.5 sm:p-3 rounded-xl bg-red-500 hover:bg-red-600 transition-all flex items-center gap-1.5 sm:gap-2"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            <span className="text-white text-xs sm:text-sm font-semibold">
              {language === 'en' ? 'Exit' : language === 'ru' ? 'Выход' : 'Çıkış'}
            </span>
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

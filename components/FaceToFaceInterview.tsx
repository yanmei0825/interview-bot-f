'use client';

import { useEffect, useRef, useState } from 'react';
import { DimensionKey, Language, SessionState, sendMessageStream, getSession, BACKEND_URL } from '../lib/api';
import type { InterviewMode } from './ModeSelect';

interface Props {
  token: string;
  language: Language;
  initialDimension: DimensionKey;
  mode: InterviewMode;
}

// ─── VAD constants ────────────────────────────────────────────────────────────
const SILENCE_THRESHOLD = 0.012;   // RMS below this = silence
const SILENCE_AFTER_SPEECH = 3500; // ms of silence after speech → submit
const VAD_INTERVAL = 100;          // ms between RMS checks

// Silence escalation timings (ms from start of listening with no speech)
const SILENCE_NUDGE_MS    = 20000; // 20s → soft nudge
const SILENCE_OFFER_MS    = 30000; // 30s → offer to skip
const SILENCE_AUTO_SKIP_MS = 40000; // 40s → auto-skip
const NO_SPEECH_TIMEOUT = 10000;   // 10s → auto-advance when mic is off

const NUDGE_TEXT: Record<Language, string> = {
  en: "Take your time, no rush.",
  ru: "Не торопись, всё в порядке.",
  tr: "Acele etme, vakit var.",
};

const OFFER_TEXT: Record<Language, string> = {
  en: "Would you like to skip this question and move on?",
  ru: "Хочешь пропустить этот вопрос и перейти дальше?",
  tr: "Bu soruyu geçip devam etmek ister misin?",
};

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

export default function FaceToFaceInterview({ token, language, initialDimension, mode }: Props) {
  // voice mode: mic on by default; chat/hybrid mode: mic off until user enables it
  const [microphoneEnabled, setMicrophoneEnabled] = useState(mode === 'voice');
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentDim, setCurrentDim] = useState<DimensionKey>(initialDimension);
  const [coverage, setCoverage] = useState<SessionState['coverage'] | null>(null);
  const [painLockDim, setPainLockDim] = useState<DimensionKey | null>(null);
  const [messages, setMessages] = useState<{ role: 'bot' | 'user'; text: string; time: string; audioUrl?: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [deviceWarning, setDeviceWarning] = useState<'mic' | 'camera' | null>(null);
  const [textInput, setTextInput] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);

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
  const nudgeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const offerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSkipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechDetectedRef = useRef(false);
  const silenceStageRef = useRef<'idle' | 'nudged' | 'offered'>('idle');

  // misc
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const introPlayedRef = useRef(false);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const manualStopRef = useRef(false); // true when mic toggled off manually — skip transcription
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // sync state → refs
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { finishedRef.current = finished; }, [finished]);
  useEffect(() => { botSpeakingRef.current = botSpeaking; }, [botSpeaking]);
  useEffect(() => { micEnabledRef.current = microphoneEnabled; }, [microphoneEnabled]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ─── cleanup helpers ────────────────────────────────────────────────────────

  const clearVAD = () => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };
  const clearSilenceEscalation = () => {
    if (nudgeTimerRef.current)    { clearTimeout(nudgeTimerRef.current);    nudgeTimerRef.current = null; }
    if (offerTimerRef.current)    { clearTimeout(offerTimerRef.current);    offerTimerRef.current = null; }
    if (autoSkipTimerRef.current) { clearTimeout(autoSkipTimerRef.current); autoSkipTimerRef.current = null; }
    silenceStageRef.current = 'idle';
  };

  const clearAllTimers = () => { clearVAD(); clearSilenceTimer(); clearSilenceEscalation(); };

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
    if (sendingRef.current || loadingRef.current) return;
    // mic was toggled off manually — don't transcribe or skip, just stop
    if (manualStopRef.current) { manualStopRef.current = false; return; }
    // when finished, only real audio (possible continue_request) goes through — drop __skip__
    if (finishedRef.current && chunks.length === 0) return;
    if (chunks.length === 0) {
      // no speech detected — skip silently, use 'skip' as the answer
      if (!finishedRef.current) {
        sendingRef.current = true;
        setLoading(true); loadingRef.current = true;
        setBotSpeaking(true); botSpeakingRef.current = true;
        try {
          let botReply = '';
          await sendMessageStream(token, '__skip__', chunk => { botReply += chunk; });
          const session = await getSession(token);
          if (session.currentDimension) setCurrentDim(session.currentDimension);
          if (session.coverage) setCoverage(session.coverage);
          setPainLockDim(session.painLockDim ?? null);
          if (session.finished) { setFinished(true); finishedRef.current = true; }
          if (botReply.trim()) {
            setMessages(m => [...m, { role: 'bot', text: botReply, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
            sendingRef.current = false;
            setLoading(false); loadingRef.current = false;
            await speakText(botReply);
          } else { setBotSpeaking(false); botSpeakingRef.current = false; afterSpeak(); }
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

    // Show a "transcribing" placeholder immediately so user sees activity
    const placeholderTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const PLACEHOLDER = '…';
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(audioBlob);
    setMessages(m => [...m, { role: 'user', text: PLACEHOLDER, time: placeholderTime, audioUrl }]);

    try {
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
        if (data.wrongLanguage) {
          // User spoke in wrong language — show warning, don't send
          const wrongLangMsg = ({
            en: '⚠️ Please speak in English.',
            ru: '⚠️ Пожалуйста, говорите на русском.',
            tr: '⚠️ Lütfen Türkçe konuşun.',
          } as Record<string, string>)[language] ?? '⚠️ Wrong language detected.';
          setMessages(m => {
            const copy = [...m];
            const idx = copy.map(x => x.text).lastIndexOf('…');
            if (idx !== -1) copy[idx] = { role: 'bot', text: wrongLangMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            return copy;
          });
          setBotSpeaking(false); botSpeakingRef.current = false;
          sendingRef.current = false; setLoading(false); loadingRef.current = false; setProcessing(false);
          if (mode === 'voice') setTimeout(startListening, 800);
          return;
        }
        userText = (data.text ?? '').trim() || '__skip__';
      } else {
        console.warn('[Transcribe] server error:', transcribeRes.status, '— treating as skip');
      }

      // If audio was substantial but transcription returned nothing — likely wrong language
      // (Whisper returns empty when forced to transcribe speech in a different language)
      if (userText === '__skip__' && audioBlob.size > 5000) {
        const wrongLangWarning = ({
          en: '⚠️ Please speak in English.',
          ru: '⚠️ Пожалуйста, говорите на русском.',
          tr: '⚠️ Lütfen Türkçe konuşun.',
        } as Record<string, string>)[language] ?? '⚠️ Please speak in the selected language.';
        setMessages(m => {
          const copy = [...m];
          const idx = copy.map(x => x.text).lastIndexOf(PLACEHOLDER);
          if (idx !== -1) copy[idx] = { role: 'bot', text: wrongLangWarning, time: placeholderTime };
          return copy;
        });
        setBotSpeaking(false); botSpeakingRef.current = false;
        sendingRef.current = false; setLoading(false); loadingRef.current = false; setProcessing(false);
        if (mode === 'voice') setTimeout(startListening, 800);
        return;
      }

      // Replace placeholder with real transcription, or keep a fallback
      if (userText !== '__skip__') {
        setMessages(m => {
          const copy = [...m];
          const idx = copy.map(x => x.text).lastIndexOf(PLACEHOLDER);
          if (idx !== -1) copy[idx] = { ...copy[idx], text: userText };
          return copy;
        });
      } else {
        // Transcription failed — show voice message bubble with playable audio
        setMessages(m => {
          const copy = [...m];
          const idx = copy.map(x => x.text).lastIndexOf(PLACEHOLDER);
          if (idx !== -1) copy[idx] = { ...copy[idx], text: '__voice__' };
          return copy;
        });
      }

      // send to interview
      let botReply = '';
      await sendMessageStream(token, userText, chunk => { botReply += chunk; });

      const session = await getSession(token);
      if (session.currentDimension) setCurrentDim(session.currentDimension);
      if (session.coverage) setCoverage(session.coverage);
      setPainLockDim(session.painLockDim ?? null);
      if (session.finished) {
        setFinished(true); finishedRef.current = true;
      } else {
        if (redirectTimerRef.current) { clearTimeout(redirectTimerRef.current); redirectTimerRef.current = null; }
        setFinished(false); finishedRef.current = false;
      }

      const replyToSpeak = botReply.trim() || (finishedRef.current ? OUTRO[language] : '');
      if (replyToSpeak) {
        setMessages(m => [...m, { role: 'bot', text: replyToSpeak, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        sendingRef.current = false;
        setProcessing(false);
        setLoading(false); loadingRef.current = false;
        await speakText(replyToSpeak);
      } else {
        setBotSpeaking(false);
        botSpeakingRef.current = false;
        if (!finishedRef.current) setTimeout(startListening, 800);
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
      silenceStageRef.current = 'idle';

      // ── VAD loop ──────────────────────────────────────────────────────────
      const buf = new Float32Array(analyser.fftSize);

      // Silence escalation: 20s nudge → 30s offer → 40s auto-skip
      const logSilenceEvent = (event: string) =>
        fetch(`${BACKEND_URL}/survey/${token}/silence-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event }),
        }).catch(() => {});

      logSilenceEvent('silence_start');

      nudgeTimerRef.current = setTimeout(async () => {
        if (speechDetectedRef.current || sendingRef.current) return;
        silenceStageRef.current = 'nudged';
        logSilenceEvent('silence_20s');
        // Speak nudge without stopping recording
        await speakNudge(NUDGE_TEXT[language]);
      }, SILENCE_NUDGE_MS);

      offerTimerRef.current = setTimeout(async () => {
        if (speechDetectedRef.current || sendingRef.current) return;
        silenceStageRef.current = 'offered';
        logSilenceEvent('silence_30s');
        await speakNudge(OFFER_TEXT[language]);
      }, SILENCE_OFFER_MS);

      autoSkipTimerRef.current = setTimeout(() => {
        if (speechDetectedRef.current || sendingRef.current) return;
        logSilenceEvent('auto_skip_triggered');
        if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
        stopRecording();
        submitAudio([]);
      }, SILENCE_AUTO_SKIP_MS);

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);

        if (rms > SILENCE_THRESHOLD) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            clearSilenceEscalation(); // cancel all nudge/offer/auto-skip timers
          }
          clearSilenceTimer();
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (!sendingRef.current) stopRecording();
          }, SILENCE_AFTER_SPEECH);
        }
      }, VAD_INTERVAL);

    } catch (err) {
      console.error('Mic/recording setup error:', err);
      setIsRecording(false);
    }
  };

  // ─── speakText ───────────────────────────────────────────────────────────────

  // Speak a short nudge without interrupting recording or changing bot state
  const speakNudge = (text: string): Promise<void> => new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_CODE[language];
    u.rate = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });

  const afterSpeak = () => {
    if (finishedRef.current) {
      sessionStorage.removeItem("interview_token");
      // Keep listening for a continue_request for 15s before redirecting
      if (micEnabledRef.current && mode === 'voice') setTimeout(startListening, 800);
      redirectTimerRef.current = setTimeout(() => {
        if (finishedRef.current) window.location.href = '/';
      }, 15000);
    } else if (micEnabledRef.current && mode === 'voice') {
      // Voice-only mode: auto-start listening after bot speaks
      setTimeout(startListening, 800);
    }
    // hybrid mode: mic is available but don't auto-start — user decides to speak or type
    // chat mode: no mic, user types
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
    setMessages([{ role: 'bot', text: INTRO[language], time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
    window.speechSynthesis.cancel();
    speakText(INTRO[language]);

    // Auto-enable mic for voice-only mode
    if (mode === 'voice') {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => { micEnabledRef.current = true; })
        .catch(() => {});
    }

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
      if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null; // don't transcribe on manual stop
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }      if (micStreamRef.current) {
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
        .catch(err => {
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setDeviceWarning('mic');
          } else {
            console.error('Mic denied:', err);
          }
        });
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
      } catch (e: any) {
        if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setDeviceWarning('camera');
        } else {
          console.error('Camera:', e);
        }
      }
    }
  };

  const handleExit = () => {
    // Stop all ongoing operations immediately
    if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
    sendingRef.current = true; // prevent any pending callbacks from firing
    loadingRef.current = true;

    // Kill TTS audio
    window.speechSynthesis.cancel();
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.stop(); } catch {}
      ttsSourceRef.current = null;
    }
    if (ttsAudioCtxRef.current) {
      ttsAudioCtxRef.current.close().catch(() => {});
      ttsAudioCtxRef.current = null;
    }

    // Kill recording
    stopRecording();
    camStreamRef.current?.getTracks().forEach(t => t.stop());

    // Kill redirect timer
    if (redirectTimerRef.current) { clearTimeout(redirectTimerRef.current); redirectTimerRef.current = null; }

    sessionStorage.removeItem("interview_token");
    window.location.href = '/';
  };





  // ─── elapsed timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  // ─── send text message ────────────────────────────────────────────────────────
  const sendText = async () => {
    const msg = textInput.trim();
    if (!msg || sendingRef.current || loadingRef.current) return;
    setTextInput('');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(m => [...m, { role: 'user', text: msg, time: now }]);
    sendingRef.current = true;
    setLoading(true); loadingRef.current = true;
    setBotSpeaking(true); botSpeakingRef.current = true;
    try {
      let botReply = '';
      await sendMessageStream(token, msg, chunk => { botReply += chunk; });
      const session = await getSession(token);
      if (session.currentDimension) setCurrentDim(session.currentDimension);
      if (session.coverage) setCoverage(session.coverage);
      setPainLockDim(session.painLockDim ?? null);
      if (session.finished) {
        setFinished(true); finishedRef.current = true;
      } else {
        if (redirectTimerRef.current) { clearTimeout(redirectTimerRef.current); redirectTimerRef.current = null; }
        setFinished(false); finishedRef.current = false;
      }
      if (botReply.trim()) {
        setMessages(m => [...m, { role: 'bot', text: botReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        sendingRef.current = false; setLoading(false); loadingRef.current = false;
        await speakText(botReply);
      } else { setBotSpeaking(false); botSpeakingRef.current = false; afterSpeak(); }
    } catch (e) {
      console.error(e);
      setBotSpeaking(false); botSpeakingRef.current = false; afterSpeak();
    } finally {
      sendingRef.current = false; setLoading(false); loadingRef.current = false;
    }
  };

  // ─── render ──────────────────────────────────────────────────────────────────

  const ALL_DIMS: DimensionKey[] = ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10'];
  const DIM_LABELS: Record<DimensionKey, Record<Language, string>> = {
    D1:  { en: 'Success',     ru: 'Успех',          tr: 'Başarı'    },
    D2:  { en: 'Security',    ru: 'Безопасность',   tr: 'Güvenlik'  },
    D3:  { en: 'Relations',   ru: 'Отношения',      tr: 'İlişkiler' },
    D4:  { en: 'Autonomy',    ru: 'Автономия',      tr: 'Özerklik'  },
    D5:  { en: 'Engagement',  ru: 'Вовлечённость',  tr: 'Bağlılık'  },
    D6:  { en: 'Recognition', ru: 'Признание',      tr: 'Tanınma'   },
    D7:  { en: 'Learning',    ru: 'Обучение',       tr: 'Öğrenme'   },
    D8:  { en: 'Purpose',     ru: 'Смысл',          tr: 'Amaç'      },
    D9:  { en: 'Obstacles',   ru: 'Препятствия',    tr: 'Engeller'  },
    D10: { en: 'Voice',       ru: 'Голос',          tr: 'Ses'       },
  };
  const DIM_DESC: Record<DimensionKey, Record<Language, string>> = {
    D1:  { en: 'Success & achievements',    ru: 'Понимание успеха и достижений',   tr: 'Başarı ve başarımlar'     },
    D2:  { en: 'Security & stability',      ru: 'Чувство безопасности и стабильности', tr: 'Güvenlik ve istikrar' },
    D3:  { en: 'Relationships & support',   ru: 'Отношения и поддержка',           tr: 'İlişkiler ve destek'      },
    D4:  { en: 'Freedom & independence',    ru: 'Свобода и самостоятельность',     tr: 'Özgürlük ve bağımsızlık'  },
    D5:  { en: 'Work engagement & motivation', ru: 'Вовлечённость и мотивация',   tr: 'Bağlılık ve motivasyon'   },
    D6:  { en: 'Feedback & recognition',    ru: 'Обратная связь и признание',      tr: 'Geri bildirim ve tanınma' },
    D7:  { en: 'Growth & development',      ru: 'Рост и развитие',                 tr: 'Büyüme ve gelişim'        },
    D8:  { en: 'Meaning & values',          ru: 'Смысл и ценности',                tr: 'Anlam ve değerler'        },
    D9:  { en: 'Obstacles & challenges',    ru: 'Препятствия и сложности',         tr: 'Engeller ve zorluklar'    },
    D10: { en: 'Voice & influence',         ru: 'Голос и влияние',                 tr: 'Ses ve etki'              },
  };
  const currentIdx = ALL_DIMS.indexOf(currentDim);
  const coveredCount = ALL_DIMS.filter(d => coverage?.[d]?.covered).length;
  const totalSignals = ALL_DIMS.reduce((s, d) => s + (coverage?.[d]?.signals.length ?? 0), 0);
  const totalTurns = ALL_DIMS.reduce((s, d) => s + (coverage?.[d]?.turnCount ?? 0), 0);
  const progressPct = Math.round((currentIdx / 10) * 100);

  if (finished && !botSpeaking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="text-white/75 text-xl font-semibold">
            {({ en: 'Thank you for your time.', ru: 'Спасибо за уделённое время.', tr: 'Zaman ayırdığın için teşekkürler.' } as Record<Language,string>)[language]}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a12] text-white">

      {/* ── Device warning modal ── */}
      {deviceWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#13131f] rounded-2xl p-6 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            </div>
            <p className="text-white/90 font-semibold mb-2">
              {deviceWarning === 'mic'
                ? ({ en: 'No microphone found', ru: 'Микрофон не найден', tr: 'Mikrofon bulunamadı' } as Record<Language,string>)[language]
                : ({ en: 'No camera found', ru: 'Камера не найдена', tr: 'Kamera bulunamadı' } as Record<Language,string>)[language]}
            </p>
            <p className="text-white/45 text-sm mb-5">
              {deviceWarning === 'mic'
                ? ({ en: 'Connect a microphone and try again.', ru: 'Подключи микрофон и попробуй снова.', tr: 'Mikrofon bağla ve tekrar dene.' } as Record<Language,string>)[language]
                : ({ en: 'Connect a camera and try again.', ru: 'Подключи камеру и попробуй снова.', tr: 'Kamera bağla ve tekrar dene.' } as Record<Language,string>)[language]}
            </p>
            <button onClick={() => setDeviceWarning(null)} className="px-5 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/75 text-sm font-medium transition-all">
              {({ en: 'OK', ru: 'Понятно', tr: 'Tamam' } as Record<Language,string>)[language]}
            </button>
          </div>
        </div>
      )}

      {/* ══ TOP HEADER ══ */}
      <header className="shrink-0 flex items-center justify-between px-6 py-5 bg-[#13131f] border-b border-white/8">
        <div className="flex items-center gap-4">
          {/* Bot avatar icon — rounded square with smiley bot face */}
          <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shrink-0">
            <svg className="w-9 h-9 text-white" viewBox="0 0 36 36" fill="currentColor">
              {/* head */}
              <rect x="6" y="10" width="24" height="18" rx="6" fill="white" fillOpacity="0.95"/>
              {/* eyes */}
              <circle cx="13" cy="18" r="2.2" fill="#6366f1"/>
              <circle cx="23" cy="18" r="2.2" fill="#6366f1"/>
              {/* smile */}
              <path d="M13 23 Q18 27 23 23" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
              {/* antenna */}
              <line x1="18" y1="10" x2="18" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="18" cy="5" r="1.5" fill="white"/>
            </svg>
          </div>
          <div>
            <p className="text-xl font-bold text-white leading-tight">AI Interview</p>
            <p className="text-sm text-white/45 mt-0.5">Personal Growth Interview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/60 hover:bg-white/6 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {language === 'ru' ? 'Русский' : language === 'tr' ? 'Türkçe' : 'English'}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <button
            onClick={toggleMicrophone}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${microphoneEnabled ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white/8 text-white/40'}`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              {microphoneEnabled
                ? <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z"/>
                : <><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z"/><line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>
              }
            </svg>
          </button>
        </div>
      </header>

      {/* ══ MAIN BODY ══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT + CENTER ── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* ── Current dimension banner ── */}
          <div className="shrink-0 mx-4 mt-4 mb-1 rounded-2xl bg-[#13131f] border border-white/8 shadow-lg overflow-hidden">
            <div className="flex items-stretch divide-x divide-white/8">

              {/* Left: current section */}
              <div className="flex-1 basis-0 min-w-0 px-5 py-4">
                <p className="text-xs text-white/40 font-medium mb-2">
                  {({ en: 'Current section', ru: 'Текущий раздел', tr: 'Mevcut bölüm' } as Record<Language,string>)[language]}
                </p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[22px] font-bold text-white leading-none">{currentDim}. {DIM_LABELS[currentDim][language]}</h2>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 text-[11px] font-bold uppercase tracking-wider border border-indigo-500/25">
                    {({ en: 'Active', ru: 'Активный', tr: 'Aktif' } as Record<Language,string>)[language]}
                  </span>
                </div>
                <p className="text-sm text-white/40 mt-1.5 leading-none">{DIM_DESC[currentDim][language]}</p>
              </div>

              {/* Center: progress */}
              <div className="flex-1 basis-0 min-w-0 px-5 py-4">
                <p className="text-xs text-white/40 font-medium mb-2">
                  {({ en: 'Interview progress', ru: 'Прогресс интервью', tr: 'Mülakat ilerlemesi' } as Record<Language,string>)[language]}
                </p>
                <p className="text-[28px] font-bold text-white leading-none mb-2">{progressPct}%</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="text-xs text-white/40 shrink-0 tabular-nums">{currentIdx} / 10</span>
                </div>
              </div>

              {/* Right: status */}
              <div className="flex-1 basis-0 min-w-0 px-5 py-4">
                <p className="text-xs text-white/40 font-medium mb-2">
                  {({ en: 'Interview status', ru: 'Статус интервью', tr: 'Mülakat durumu' } as Record<Language,string>)[language]}
                </p>
                <div className="flex items-center gap-2 mb-1.5">
                  {/* shield-check icon */}
                  <svg className="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M9 12l2 2 4-4"/>
                  </svg>
                  <span className="text-base font-bold text-white/90">
                    {({ en: 'Active', ru: 'Активно', tr: 'Aktif' } as Record<Language,string>)[language]}
                  </span>
                </div>
                <p className="text-xs text-white/40 leading-snug">
                  {botSpeaking
                    ? ({ en: 'Bot speaking…', ru: 'Говорит…', tr: 'Konuşuyor…' } as Record<Language,string>)[language]
                    : isRecording
                    ? ({ en: 'Listening…', ru: 'Слушаю…', tr: 'Dinliyorum…' } as Record<Language,string>)[language]
                    : loading
                    ? ({ en: 'Thinking…', ru: 'Думает…', tr: 'Düşünüyor…' } as Record<Language,string>)[language]
                    : ({ en: 'Continuing conversation', ru: 'Продолжаем разговор', tr: 'Konuşmaya devam' } as Record<Language,string>)[language]}
                </p>
              </div>

            </div>
          </div>

          {/* ── Card: stepper + chat + input ── */}
          <div className="flex flex-col flex-1 overflow-hidden mx-4 mb-3 rounded-2xl border border-white/8 bg-[#13131f]">

          {/* ── D1–D10 stepper ── */}
          <div className="shrink-0 px-4 py-3 border-b border-white/8">
            {/* Compact single row — dots only, no overflow */}
            <div className="relative flex items-center justify-between">
              {/* background track */}
              <div className="absolute inset-x-0 top-[14px] h-0.5 bg-white/8 z-0" />
              {/* filled track */}
              <div className="absolute left-0 top-[14px] h-0.5 bg-green-400 transition-all duration-500 z-0"
                style={{ width: currentIdx === 0 ? 0 : `${(currentIdx / 9) * 100}%` }} />
              {ALL_DIMS.map((dim, idx) => {
                const isActive = dim === currentDim;
                const isDone = idx < currentIdx;
                return (
                  <div key={dim} className="relative z-10 flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isActive ? 'bg-indigo-600 border-indigo-600 shadow-[0_0_0_3px_rgba(99,102,241,0.25)]'
                      : isDone ? 'bg-green-500 border-green-500'
                      : 'bg-[#13131f] border-white/15'
                    }`}>
                      {isDone
                        ? <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        : <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-white/30'}`}>{idx + 1}</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Active dim label below */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-[10px] text-white/30">{currentIdx + 1}/10</span>
              <span className="text-[11px] font-semibold text-indigo-400">{currentDim} · {DIM_LABELS[currentDim][language]}</span>
            </div>
          </div>

          {/* ── Chat area ── */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 cursor-default" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                {/* Bot avatar */}
                {msg.role === 'bot' && (
                  <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0 shadow-md">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 36 36" fill="currentColor">
                      <rect x="6" y="10" width="24" height="18" rx="6" fill="white" fillOpacity="0.95"/>
                      <circle cx="13" cy="18" r="2.2" fill="#6366f1"/>
                      <circle cx="23" cy="18" r="2.2" fill="#6366f1"/>
                      <path d="M13 23 Q18 27 23 23" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                      <line x1="18" y1="10" x2="18" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="18" cy="5" r="1.5" fill="white"/>
                    </svg>
                  </div>
                )}

                {/* Bubble */}
                <div className="max-w-[480px] flex flex-col">
                  {msg.role === 'bot' && (
                    <p className="text-xs font-semibold text-indigo-400 mb-1.5 ml-1">{currentDim}. {DIM_LABELS[currentDim][language]}</p>
                  )}
                  <div className={`px-4 pt-3 pb-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'bot'
                      ? 'bg-[#1c1c2e] text-white/85 border border-white/8 rounded-tl-sm'
                      : 'bg-indigo-500/25 text-white/90 border border-indigo-500/20 rounded-tr-sm'
                  }`}>
                    {msg.text === '…'
                      ? <span className="flex items-center gap-1.5 px-1 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      : msg.text === '__voice__' && msg.audioUrl
                      ? <div className="flex items-center gap-2.5 py-0.5">
                          <svg className="w-4 h-4 text-indigo-300 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z"/></svg>
                          <audio controls src={msg.audioUrl} className="h-7 max-w-[180px]" style={{ filter: 'invert(0.8) hue-rotate(200deg)' }} />
                        </div>
                      : <p>{msg.text}</p>
                    }
                    <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-right text-indigo-300/60' : 'text-right text-white/30'}`}>
                      {msg.time}
                      {msg.role === 'user' && <span className="ml-1 text-indigo-400/80">✓✓</span>}
                    </p>
                  </div>
                </div>

              </div>
            ))}

            {/* Typing indicator */}
            {loading && !botSpeaking && (
              <div className="flex items-start gap-3 justify-start">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0 shadow-md">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 36 36" fill="currentColor">
                    <rect x="6" y="10" width="24" height="18" rx="6" fill="white" fillOpacity="0.95"/>
                    <circle cx="13" cy="18" r="2.2" fill="#6366f1"/>
                    <circle cx="23" cy="18" r="2.2" fill="#6366f1"/>
                    <path d="M13 23 Q18 27 23 23" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                    <line x1="18" y1="10" x2="18" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="18" cy="5" r="1.5" fill="white"/>
                  </svg>
                </div>
                <div className="bg-[#1c1c2e] border border-white/8 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5 mt-6">
                  {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 px-4 py-3 border-t border-white/8">
            <div className="flex items-center gap-2 bg-[#0a0a12] rounded-2xl px-4 py-2.5 border border-white/12 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all cursor-text" onClick={e => { const input = (e.currentTarget as HTMLElement).querySelector('input'); input?.focus(); }}>
              {/* Mic button — hidden in chat-only mode */}
              {mode !== 'chat' && (
                <button
                  onClick={toggleMicrophone}
                  className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                    microphoneEnabled
                      ? isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white'
                      : 'bg-white/12 text-white/40 hover:bg-white/20'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    {microphoneEnabled
                      ? <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z"/>
                      : <><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.5 14.56 16 12 16s-4.52-1.5-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1.01 1.14.49 3.41 3.85 5.86 7.92 5.86s7.43-2.45 7.92-5.86c.08-.6-.4-1.14-1.01-1.14z"/><line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>
                    }
                  </svg>
                </button>
              )}
              {/* Waveform / text input */}
              {isRecording
                ? <div className="flex-1 flex items-center gap-0.5 h-5 pointer-events-none">
                    {[12,6,14,8,16,5,13,9,15,7,11,6,14,8,16,5,13,9,15,7,11,6,14,8].map((h, i) => (
                      <div key={i} className="w-0.5 bg-indigo-400 rounded-full animate-pulse" style={{ height: `${h}px`, animationDelay: `${i * 0.05}s` }} />
                    ))}
                  </div>
                : mode === 'voice'
                ? <p className="flex-1 text-sm text-white/30 select-none">
                    {({ en: 'Press the mic to speak', ru: 'Нажмите на микрофон, чтобы говорить', tr: 'Konuşmak için mikrofona basın' } as Record<Language,string>)[language]}
                  </p>
                : <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendText()}
                    placeholder={({ en: 'Type your answer or press the mic', ru: 'Напишите ответ или нажмите на микрофон', tr: 'Cevabınızı yazın veya mikrofona basın' } as Record<Language,string>)[language]}
                    className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none cursor-text"
                  />
              }
              {/* Send — hidden in voice-only mode */}
              {mode !== 'voice' && (
                <button
                  onClick={sendText}
                  disabled={!textInput.trim() || loading}
                  className="shrink-0 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-sm"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              )}
            </div>
          </div>
          {/* ── end card ── */}
          </div>
        </div>

        {/* ── RIGHT: Interview progress panel ── */}
        <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col border-l border-white/8 bg-[#13131f] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <p className="text-sm font-bold text-white/90">
              {({ en: 'Interview progress', ru: 'Ход интервью', tr: 'Mülakat ilerlemesi' } as Record<Language,string>)[language]}
            </p>
          </div>

          {/* Dimension list */}
          <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
            {ALL_DIMS.map((dim, idx) => {
              const isActive = dim === currentDim;
              const isDone = idx < currentIdx;
              const cov = coverage?.[dim];
              const score = cov ? Math.round(cov.coverageScore * 100) : 0;
              const isPainLocked = painLockDim === dim;

              return (
                <div key={dim} className={`mx-2 mb-1 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-indigo-500/15 border border-indigo-500/25' : 'border border-transparent hover:bg-white/6'
                }`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Status icon */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-indigo-600 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
                      : isDone ? 'bg-green-500'
                      : 'bg-white/8 border border-white/12'
                    }`}>
                      {isDone
                        ? <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        : isActive
                        ? <span className="w-2 h-2 rounded-full bg-white" />
                        : <span className="text-white/25 text-[10px] font-bold">{idx + 1}</span>
                      }
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold leading-none ${isActive ? 'text-indigo-300' : isDone ? 'text-white/75' : 'text-white/40'}`}>
                          {dim}. {DIM_LABELS[dim][language]}
                        </p>
                        {isActive && (
                          <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-md uppercase">
                            {({ en: 'Current', ru: 'Текущий', tr: 'Mevcut' } as Record<Language,string>)[language]}
                          </span>
                        )}
                        {isPainLocked && (
                          <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                        )}
                      </div>
                      <p className={`text-[10px] mt-0.5 leading-none ${isActive ? 'text-indigo-400' : isDone ? 'text-white/40' : 'text-white/25'}`}>
                        {DIM_DESC[dim][language]}
                      </p>
                      {/* Coverage bar for done/active */}
                      {(isDone || isActive) && (
                        <div className="mt-1.5 w-full h-1 bg-white/8 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isActive ? 'bg-indigo-400'
                              : score >= 70 ? 'bg-green-400'
                              : score >= 40 ? 'bg-amber-400'
                              : 'bg-gray-300'
                            }`}
                            style={{ width: isActive ? `${Math.min((cov?.turnCount ?? 0) * 20, 100)}%` : `${score}%` }}
                          />
                        </div>
                      )}
                      {/* Signal tags */}
                      {isDone && cov && cov.signals.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {cov.signals.slice(0, 3).map((s, si) => (
                            <span key={si} className="text-[8px] bg-white/8 text-white/45 px-1.5 py-0.5 rounded-full truncate max-w-[72px]">{s}</span>
                          ))}
                          {cov.signals.length > 3 && <span className="text-[8px] text-white/40">+{cov.signals.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    {/* Score badge */}
                    {isDone && cov && (
                      <span className={`text-[10px] font-bold shrink-0 ${score >= 70 ? 'text-green-400' : score >= 40 ? 'text-amber-600' : 'text-white/40'}`}>
                        {score}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pain lock alert */}
          {painLockDim && (
            <div className="mx-3 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                <span className="text-xs font-bold text-red-400">Pain Lock: {painLockDim} ({DIM_LABELS[painLockDim][language]})</span>
                <span className="ml-auto text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-md uppercase">
                  {({ en: 'Active', ru: 'Активен', tr: 'Aktif' } as Record<Language,string>)[language]}
                </span>
              </div>
              <p className="text-[10px] text-red-400 leading-relaxed">
                {({ en: 'Signs of burnout detected. Staying attentive to your wellbeing.', ru: 'Ранее были обнаружены признаки выгорания. Я остаюсь внимательным к вашему состоянию.', tr: 'Tükenmişlik belirtileri tespit edildi. Durumunuza dikkat ediyorum.' } as Record<Language,string>)[language]}
              </p>
              <button className="mt-1.5 text-[10px] font-semibold text-red-400 hover:text-red-400 flex items-center gap-0.5">
                {({ en: 'Learn more', ru: 'Подробнее', tr: 'Daha fazla' } as Record<Language,string>)[language]}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          )}

          {/* Footer stats */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-white/8 bg-[#0a0a12]">
            <div className="flex items-center gap-1 text-white/45">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span className="text-[11px] font-mono font-semibold">{fmtTime(elapsedSec)}</span>
            </div>
            <div className="flex items-center gap-1 text-white/45">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span className="text-[11px] font-semibold">{totalSignals} {({ en: 'signals', ru: 'сигналов', tr: 'sinyal' } as Record<Language,string>)[language]}</span>
            </div>
            <div className="flex items-center gap-1 text-white/45">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              <span className="text-[11px] font-semibold">{totalTurns} {({ en: 'messages', ru: 'сообщений', tr: 'mesaj' } as Record<Language,string>)[language]}</span>
            </div>
            <button onClick={handleExit} className="flex items-center gap-1 text-red-500 hover:text-red-400 transition-all">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              <span className="text-[11px] font-semibold">{({ en: 'Exit', ru: 'Выйти', tr: 'Çıkış' } as Record<Language,string>)[language]}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}









"use client";

import LanguageSelect from "../components/LanguageSelect";
import DemographicsForm from "../components/DemographicsForm";
import ModeSelect, { InterviewMode } from "../components/ModeSelect";
import FaceToFaceInterview from "../components/FaceToFaceInterview";
import { createSession, getSession, setLanguage, submitDemographics, Language, type DimensionKey } from "../lib/api";
import { useEffect, useState } from "react";

type Step = "lang" | "mode" | "demo" | "chat" | "error";

interface ChatReady {
  token: string;
  language: Language;
  initialDimension: DimensionKey;
  mode: InterviewMode;
}

export default function Home() {
  const [step, setStep] = useState<Step>("lang");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [language, setLang] = useState<Language | null>(null);
  const [pendingDemo, setPendingDemo] = useState(false);
  const [chatReady, setChatReady] = useState<ChatReady | null>(null);

  useEffect(() => {
    const startFresh = () =>
      createSession()
        .then((r) => {
          try { sessionStorage.setItem("interview_token", r.token); } catch {}
          setToken(r.token);
        })
        .catch((e) => { setErrorMsg(e.message); setStep("error"); });

    let saved: string | null = null;
    try { saved = sessionStorage.getItem("interview_token"); } catch {}
    if (saved) {
      getSession(saved)
        .then((s) => {
          if (s.finished) {
            sessionStorage.removeItem("interview_token");
            startFresh();
          } else if (s.language) {
            setToken(saved);
            setChatReady({ token: saved, language: s.language, initialDimension: s.currentDimension ?? "D1", mode: "hybrid" });
            setStep("chat");
          } else {
            setToken(saved);
          }
        })
        .catch(() => { sessionStorage.removeItem("interview_token"); startFresh(); });
    } else {
      startFresh();
    }
  }, []);

  const handleLanguage = async (lang: Language) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await setLanguage(token, lang);
      setLang(lang);
      setPendingDemo(!res.intro); // true if demographics needed
      setStep("mode");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleMode = (mode: InterviewMode) => {
    if (!language) return;
    if (pendingDemo) {
      // store mode, go to demographics
      setChatReady({ token, language, initialDimension: "D1", mode });
      setStep("demo");
    } else {
      setChatReady({ token, language, initialDimension: "D1", mode });
      setStep("chat");
    }
  };

  const handleDemographics = async (data: Record<string, string>) => {
    if (!token || !language) return;
    setLoading(true);
    try {
      await submitDemographics(token, data);
      setStep("chat");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] flex flex-col">
      {step !== "chat" && (
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          {step === "lang" && (
            <LanguageSelect onSelect={handleLanguage} loading={loading || !token} />
          )}
          {step === "mode" && language && (
            <ModeSelect language={language} onSelect={handleMode} />
          )}
          {step === "demo" && language && (
            <DemographicsForm language={language} onSubmit={handleDemographics} loading={loading} />
          )}
          {step === "error" && (
            <div className="text-center">
              <p className="text-red-400 text-sm max-w-sm">{errorMsg}</p>
            </div>
          )}
        </div>
      )}

      {step === "chat" && chatReady && (
        <FaceToFaceInterview
          token={chatReady.token}
          language={chatReady.language}
          initialDimension={chatReady.initialDimension}
          mode={chatReady.mode}
        />
      )}
    </div>
  );
}

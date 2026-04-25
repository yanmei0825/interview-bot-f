"use client";

import LanguageSelect from "../components/LanguageSelect";
import DemographicsForm from "../components/DemographicsForm";
import FaceToFaceInterview from "../components/FaceToFaceInterview";
import { createSession, getSession, setLanguage, submitDemographics, Language, type DimensionKey } from "../lib/api";
import { useEffect, useState } from "react";

type Step = "lang" | "demo" | "chat" | "error";

interface ChatReady {
  token: string;
  language: Language;
  initialDimension: DimensionKey;
}

export default function Home() {
  const [step, setStep] = useState<Step>("lang");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [language, setLang] = useState<Language | null>(null);
  const [chatReady, setChatReady] = useState<ChatReady | null>(null);

  useEffect(() => {
    const startFresh = () =>
      createSession()
        .then((r) => {
          sessionStorage.setItem("interview_token", r.token);
          setToken(r.token);
        })
        .catch((e) => {
          setErrorMsg(e.message);
          setStep("error");
        });

    const saved = sessionStorage.getItem("interview_token");
    if (saved) {
      // Verify the saved token still exists on the backend
      getSession(saved)
        .then((s) => {
          if (s.finished) {
            sessionStorage.removeItem("interview_token");
            startFresh();
          } else if (s.language) {
            // session already in progress — resume directly
            setToken(saved);
            setChatReady({
              token: saved,
              language: s.language,
              initialDimension: s.currentDimension ?? "D1",
            });
            setStep("chat");
          } else {
            // session exists but language not yet chosen
            setToken(saved);
          }
        })
        .catch(() => {
          // token no longer valid — start fresh
          sessionStorage.removeItem("interview_token");
          startFresh();
        });
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

      if (res.intro) {
        setChatReady({ token, language: lang, initialDimension: "D1" });
        setStep("chat");
      } else {
        setStep("demo");
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleDemographics = async (data: Record<string, string>) => {
    if (!token || !language) return;
    setLoading(true);
    try {
      await submitDemographics(token, data);
      setChatReady({ token, language, initialDimension: "D1" });
      setStep("chat");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {step !== "chat" && (
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          {step === "lang" && (
            <LanguageSelect onSelect={handleLanguage} loading={loading || !token} />
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
        />
      )}
    </div>
  );
}

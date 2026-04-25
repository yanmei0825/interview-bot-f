"use client";

import React from "react";
import { Language } from "../lib/api";

const LANGS: { code: Language; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
];

interface Props {
  onSelect: (lang: Language) => void;
  loading?: boolean;
}

export default function LanguageSelect({ onSelect, loading }: Props) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm mx-auto">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center mx-auto mb-6">
          <svg className="w-9 h-9 text-white" viewBox="0 0 36 36" fill="currentColor">
            <rect x="6" y="10" width="24" height="18" rx="6" fill="white" fillOpacity="0.95"/>
            <circle cx="13" cy="18" r="2.2" fill="#6366f1"/>
            <circle cx="23" cy="18" r="2.2" fill="#6366f1"/>
            <path d="M13 23 Q18 27 23 23" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <line x1="18" y1="10" x2="18" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="18" cy="5" r="1.5" fill="white"/>
          </svg>
        </div>
        <h1 className="text-white text-3xl font-semibold">Choose your language</h1>
        <p className="text-white/50 mt-2 text-sm">
          This cannot be changed once the interview starts.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => onSelect(l.code)}
            disabled={loading}
            className="w-full py-4 px-6 rounded-2xl border border-white/8 bg-[#13131f] hover:bg-[#1c1c2e] transition text-left flex items-center justify-between group disabled:opacity-50"
          >
            <span className="text-white font-medium text-base">{l.native}</span>
            <span className="text-white/40 text-sm group-hover:text-white/70 transition">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

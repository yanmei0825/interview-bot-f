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
        <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto mb-6">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
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
            className="w-full py-4 px-6 rounded-2xl border border-white/10 bg-[#141414] hover:bg-[#1f1f1f] transition text-left flex items-center justify-between group disabled:opacity-50"
          >
            <span className="text-white font-medium text-base">{l.native}</span>
            <span className="text-white/40 text-sm group-hover:text-white/70 transition">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

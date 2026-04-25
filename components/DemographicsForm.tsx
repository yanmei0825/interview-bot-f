"use client";

import React, { useState } from "react";
import { Language } from "../lib/api";

const LABELS: Record<Language, { title: string; fullName: string; department: string; position: string; submit: string; skip: string }> = {
  en: { title: "A bit about you", fullName: "Full name", department: "Department", position: "Position", submit: "Continue", skip: "Skip" },
  ru: { title: "Немного о вас", fullName: "ФИО", department: "Отдел", position: "Должность", submit: "Продолжить", skip: "Пропустить" },
  tr: { title: "Hakkınızda", fullName: "Ad Soyad", department: "Departman", position: "Pozisyon", submit: "Devam", skip: "Atla" },
};

interface Props {
  language: Language;
  onSubmit: (data: Record<string, string>) => void;
  loading?: boolean;
}

export default function DemographicsForm({ language, onSubmit, loading }: Props) {
  const t = LABELS[language];
  const [form, setForm] = useState({ fullName: "", department: "", position: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (form.fullName.trim()) data["fullName"] = form.fullName.trim();
    if (form.department.trim()) data["department"] = form.department.trim();
    if (form.position.trim()) data["position"] = form.position.trim();
    onSubmit(data);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-white text-2xl font-semibold">{t.title}</h2>
        <p className="text-white/40 text-sm mt-1">
          {language === "ru" ? "Необязательно" : language === "tr" ? "İsteğe bağlı" : "Optional"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {(["fullName", "department", "position"] as const).map((field) => (
          <input
            key={field}
            type="text"
            placeholder={t[field]}
            value={form[field]}
            onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
            className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/30 transition text-sm"
          />
        ))}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full py-3 rounded-xl bg-[#222] hover:bg-[#2e2e2e] text-white font-medium transition disabled:opacity-50"
        >
          {t.submit}
        </button>
      </form>
    </div>
  );
}

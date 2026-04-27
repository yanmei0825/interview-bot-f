"use client";
import { Language } from "../lib/api";

export type InterviewMode = "chat" | "voice" | "hybrid";

const LABELS: Record<Language, {
  title: string; subtitle: string;
  chat: string; chatDesc: string;
  voice: string; voiceDesc: string;
  hybrid: string; hybridDesc: string;
}> = {
  en: {
    title: "How would you like to respond?",
    subtitle: "You can change this at any time during the interview.",
    chat: "Chat", chatDesc: "Type your answers",
    voice: "Voice", voiceDesc: "Speak your answers",
    hybrid: "Hybrid", hybridDesc: "Type or speak — your choice",
  },
  ru: {
    title: "Как вы хотите отвечать?",
    subtitle: "Вы можете изменить это в любой момент во время интервью.",
    chat: "Чат", chatDesc: "Печатайте ответы",
    voice: "Голос", voiceDesc: "Говорите ответы",
    hybrid: "Гибрид", hybridDesc: "Печатайте или говорите — на ваш выбор",
  },
  tr: {
    title: "Nasıl yanıt vermek istersiniz?",
    subtitle: "Bunu görüşme sırasında istediğiniz zaman değiştirebilirsiniz.",
    chat: "Sohbet", chatDesc: "Yanıtlarınızı yazın",
    voice: "Ses", voiceDesc: "Yanıtlarınızı söyleyin",
    hybrid: "Hibrit", hybridDesc: "Yazın veya konuşun — seçim sizin",
  },
};

const MODES: { id: InterviewMode; icon: string }[] = [
  { id: "chat",   icon: "💬" },
  { id: "voice",  icon: "🎙️" },
  { id: "hybrid", icon: "⚡" },
];

interface Props {
  language: Language;
  onSelect: (mode: InterviewMode) => void;
}

export default function ModeSelect({ language, onSelect }: Props) {
  const t = LABELS[language];
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-white text-2xl font-semibold">{t.title}</h2>
        <p className="text-white/40 text-sm mt-2">{t.subtitle}</p>
      </div>
      <div className="flex flex-col gap-3 w-full">
        {MODES.map(({ id, icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="w-full py-4 px-6 rounded-2xl border border-white/8 bg-[#13131f] hover:bg-[#1c1c2e] transition text-left flex items-center gap-4 group"
          >
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-white font-semibold text-base">{(t as any)[id]}</p>
              <p className="text-white/40 text-sm group-hover:text-white/60 transition">{(t as any)[`${id}Desc`]}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

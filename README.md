# Interview Bot — Frontend

Next.js frontend for the anonymous workplace interview bot. Hybrid chat + voice UI with real-time D1–D10 analytics panel.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Voice input | Browser MediaRecorder + VAD + OpenAI Whisper (via backend) |
| Voice output | OpenAI TTS-1 (via backend) with browser Speech Synthesis fallback |

## Local Setup

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`. Backend must be running at `http://localhost:5000`.

To point at a different backend:

```ts
// lib/api.ts
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://interview-bot-b.vercel.app";
```

## Pages

| Route | Description |
|---|---|
| `/` | Full interview flow: language → demographics → interview |
| `/report?token=` | Individual session report |
| `/company-report?companyId=` | Company-wide analytics |
| `/comparison?companyId=&projectId=` | Multi-interview comparison |

## Interview Flow

1. **Language select** — ru / en / tr (cannot change after start)
2. **Demographics** (optional) — name, department, position
3. **Interview** — 3-column hybrid UI:
   - Left: interviewer avatar + user camera preview
   - Center: chat history + input bar
   - Right: D1–D10 live analytics panel

## UI Layout

```
┌─────────────────┬──────────────────────────┬──────────────────┐
│  Interviewer    │  Chat messages            │  D1–D10 Engine   │
│  avatar         │  - bot bubbles (dark)     │  - progress bars │
│                 │  - user bubbles (indigo)  │  - coverage %    │
│  User camera    │  - voice message player   │  - depth level   │
│  preview        │  - typing indicator       │  - signal tags   │
│                 │                           │  - pain lock     │
│                 ├──────────────────────────┤  - elapsed timer │
│                 │  Input bar               │                  │
│                 │  mic | text | send        │                  │
└─────────────────┴──────────────────────────┴──────────────────┘
```

Right panel hidden on `< lg`. Left panel hidden on `< md`.

## Voice Mode

1. Click mic button → recording starts
2. Speak your answer
3. Stop talking → **3.5s silence** triggers auto-submit
4. Audio sent to `/voice/transcribe` → Whisper → text shown in chat
5. If transcription fails → voice message bubble with playable audio player
6. Bot reply spoken via TTS, then mic reopens automatically (800ms delay to clear echo)

### VAD Constants

| Constant | Value | Meaning |
|---|---|---|
| `SILENCE_THRESHOLD` | 0.012 RMS | Below this = silence |
| `SILENCE_AFTER_SPEECH` | 3500ms | Silence after speech → submit |
| `SILENCE_NUDGE_MS` | 20s | Soft nudge if no speech |
| `SILENCE_OFFER_MS` | 30s | Offer to skip |
| `SILENCE_AUTO_SKIP_MS` | 40s | Auto-skip |

## Text Mode

Type answer in the input bar and press Enter or the send button. No time limit — bot waits indefinitely.

## D1–D10 Stepper

Top of the chat card shows all 10 dimensions:
- ✅ Green dot = completed (with coverage bar + score %)
- 🔵 Indigo dot = active (with turn counter)
- ⚪ Grey dot = upcoming

Hover completed dims to see coverage % and depth level tooltip.

## Right Panel Analytics

Live per-dimension data updated after each exchange:
- Coverage bar (green ≥70%, amber 40–69%, grey <40%)
- Signal tags (key themes extracted from answers)
- Pain lock indicator (amber badge when burnout detected)
- Footer: elapsed time · signal count · message count · exit

## Components

| Component | Description |
|---|---|
| `FaceToFaceInterview` | Main interview UI — all state, VAD, TTS, chat |
| `LanguageSelect` | Language picker screen |
| `DemographicsForm` | Optional demographics form |
| `ReportDisplay` | Individual session report |
| `CompanyReportDisplay` | Company analytics report |
| `ComparisonAnalysisDisplay` | Multi-interview comparison |

## Deployment (Vercel)

```bash
npm run build
```

Push to repo and connect to Vercel. Set `NEXT_PUBLIC_BACKEND_URL=https://interview-bot-b.vercel.app` as an environment variable in the Vercel project settings (or leave it unset — the default fallback in `lib/api.ts` already points there).

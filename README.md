# Interview Bot — Frontend

Next.js frontend for the anonymous workplace interview bot. Conducts a face-to-face style voice interview across 10 engagement dimensions.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Voice**: Browser MediaRecorder API + OpenAI Whisper (via backend) + OpenAI TTS (via backend) with browser Speech Synthesis fallback

## Local Setup

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

The backend must be running at `http://localhost:5000` (or update `BACKEND_URL` in `lib/api.ts`).

## Pages

| Route | Description |
|---|---|
| `/` | Main interview flow — language select → demographics → interview |
| `/report?token=` | Individual interview report |
| `/company-report?companyId=` | Company-wide analytics report |
| `/comparison?companyId=&projectId=` | Multi-interview comparison analysis |

## Configuration

Backend URL and project ID are set in `lib/api.ts`:

```ts
export const BACKEND_URL = "https://your-backend.vercel.app";
export const PROJECT_ID = "AI-Interview";
```

## Interview Flow

1. User selects language (English / Russian / Turkish)
2. Optional demographics form (if enabled on the project)
3. Face-to-face interview — bot speaks via TTS, user responds via microphone
4. Voice Activity Detection (VAD) auto-submits after silence
5. Responses transcribed via Whisper, sent to backend, bot replies via TTS

## Deployment (Vercel)

```bash
npm run build
```

Push to your repo and connect to Vercel. No environment variables required — the backend URL is hardcoded in `lib/api.ts`.

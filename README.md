# StudyMax

**Full-stack study companion — spaced-repetition flashcards, notes, sessions and progress tracking. Offline-first, installable as a PWA.**

🔗 **Live demo:** [studymax-ten.vercel.app](https://studymax-ten.vercel.app)

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Due-card widget, daily review heatmap (last 26 weeks), streak counter with auto-tracking from reviews, session stats with themed loaders |
| **Subjects** | Organize material into subjects with per-subject progress, custom color + 12-icon picker |
| **Flashcards** | Spaced-repetition review engine with 3D flip animation and leech auto-detection |
| **Bundles** | Group cards into study bundles with checkbox select + floating bulk action bar (tag / move / reset / delete) |
| **Notes** | Markdown notes linked to subjects; "AI IMPORT" generates flashcards from any note via NotebookLM |
| **Sessions** | Timed study sessions with auto-logging from the Focus Zone Pomodoro |
| **Stats** | Dedicated `/stats` page with 52-week heatmap, retention curve SVG, hardest cards table (with per-card reset), forecast widget, per-bundle mastery ranking |
| **Focus Zone** | Pomodoro timer, ambient soundscapes, "Remind Me" browser-notification button (15m/1h/4h presets) |
| **Offline-first** | Dexie/IndexedDB — everything lives in the browser, works without internet |
| **PWA** | Installable app with manifest + offline fallback route |

## 🎨 Design System

StudyMax ships with a documented design system ([`DESIGN.md`](DESIGN.md)): *calm depth, one hot signal* — deep cool-slate glass surfaces with a single hot accent per theme carrying focus state. All tokens are CSS custom properties consumed through Tailwind v4 `@theme`.

## 🧱 Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Dexie.js** (IndexedDB — local-first data)
- **Zustand** (UI state)
- **GSAP** + **Framer Motion** + **anime.js** (motion)
- **Tailwind CSS v4**
- **Zod** (validation)
- Fonts: Inter, JetBrains Mono, Plus Jakarta Sans, Space Grotesk

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No account, no server — data stays in your browser.

## 📄 License

MIT — see [LICENSE](LICENSE).

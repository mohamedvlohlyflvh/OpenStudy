# StudyMax

**Full-stack study companion — spaced-repetition flashcards, notes, sessions and progress tracking. Offline-first, installable as a PWA.**

🔗 **Live demo:** [studymax-ten.vercel.app](https://studymax-ten.vercel.app)

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Widgets for due cards, streaks and session stats with themed loaders |
| **Subjects** | Organize material into subjects with per-subject progress |
| **Flashcards** | Spaced-repetition review engine |
| **Notes** | Markdown notes linked to subjects |
| **Sessions** | Timed study sessions with history |
| **Bundles** | Group cards into study bundles |
| **Offline-first** | Dexie/IndexedDB — everything lives in the browser, works without internet |
| **PWA** | Installable app with manifest + offline fallback route |
| **Theming** | "Aurora Glass" design system — see [`DESIGN.md`](DESIGN.md) |

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

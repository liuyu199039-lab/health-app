# Health Tracker

A full-stack health and nutrition tracking app built with **React Native (Expo)** and **Supabase**, running on **iOS, Android, and the web from a single codebase**. It uses the **Claude API** to analyze meal photos and automatically estimate nutrition.

> Log what you eat with a photo, let AI break down the calories and macros, track workouts and body metrics, and watch your progress on a calendar — with all data synced to the cloud across every device.

## Features

- 📸 **AI meal analysis** — snap a photo of a meal and Claude returns a description plus estimated calories, protein, carbs, and fat.
- 🏃 **Exercise tracking** — log workouts; calories burned are estimated by AI from the activity, duration, and your body weight.
- 📊 **Body metrics & trends** — record weight, waist, hip and more each day, and view trend charts over time.
- 📅 **Calendar overview** — a monthly heat-map of daily net calories (intake − BMR − exercise) against a weight-loss goal.
- 🍳 **Recipe book** — save recipes with a finished-dish photo and a how-to photo on a flip card, then add a recipe straight into a meal.
- 🎨 **Four themes** — dark, light, pink, and blue.
- ☁️ **Cloud sync** — every device (phone and web) reads and writes the same data in real time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native, Expo (SDK 54), React Native Web |
| Database | Supabase (PostgreSQL) |
| File storage | Supabase Storage (meal & recipe images) |
| AI | Anthropic Claude API (vision + text) |
| Charts | react-native-chart-kit, react-native-svg |
| Hosting (web) | Vercel |

## Architecture

```
  iOS / Android (Expo)  ┐
                        ├──►  Supabase  (Postgres tables + Storage bucket)
  Web (React Native Web)┘
                        └──►  Claude API (meal photo analysis, calorie estimates)
```

The app started as a local-only build (SQLite + on-device files) and was migrated to a cloud-backed architecture so that data and images sync across devices and the web. Images are uploaded to Supabase Storage and referenced by public URL; all structured data lives in Postgres tables.

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (Postgres + a public Storage bucket named `images`)
- An Anthropic API key

### Setup

```bash
git clone https://github.com/liuyu199039-lab/health-app.git
cd health-app
npm install
```

Copy the environment template and fill in your own values:

```bash
cp .env.example .env.local
```

```env
EXPO_PUBLIC_ANTHROPIC_KEY=your_anthropic_api_key
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_publishable_key
```

### Run

```bash
npx expo start        # phone via Expo Go (scan the QR code)
npx expo start --web  # browser
```

## Deployment (Web)

The web build is a static export deployed to Vercel:

| Setting | Value |
|---------|-------|
| Build Command | `npx expo export -p web` |
| Output Directory | `dist` |
| Environment Variables | the three `EXPO_PUBLIC_*` keys above |

## Roadmap / Known Limitations

- **Move API calls behind a backend.** The Claude API key is currently used from the client. A server-side proxy would keep the key fully private and is the next planned step.
- **User authentication.** Data is currently shared in a single space; adding Supabase Auth would scope data per user (the client is already wired for it).
- **Offline support** and richer analytics.

## License

Personal project, built for learning and self-use.

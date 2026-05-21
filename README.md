# Pulse Timer

Pulse Timer is a React + Vite + Tailwind CSS countdown app that works offline as an installable PWA.

## Features

- Countdown timers up to 24 hours
- Persists timer state in localStorage
- Uses absolute deadlines so long timers recover correctly after sleep or reload
- Offline-ready mobile app experience

## Scripts

- `pnpm dev` - start the development server
- `pnpm build` - type-check and build for production
- `pnpm preview` - preview the production build locally

## Notes

The app defaults to a 4-hour countdown preset so it satisfies long-running timer use cases immediately.
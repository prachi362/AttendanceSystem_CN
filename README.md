# Attendance System — Facial Recognition (Frontend)

Kiosk-style React app for worker punch-in/out and on-site self-registration.

## Features (frontend)
- **PIN lock** to start the system (default `0000`)
- **EN / ES** language toggle on every screen, with big touch-friendly buttons
- **Punch In/Out**: capture a photo, compress to JPEG (~480px wide, 0.6 quality), save locally with timestamp
- **Self-registration**: name + 5 pose captures (front, up, down, left, right) with a "remove glasses" prompt
- **3:4 kiosk frame** (tablet-ish, not landscape, not strict portrait) — adjust in `src/index.css` once the target device is confirmed
- Storage is `localStorage` for now; swap for backend later

## Run

```bash
npm install
npm run dev
```

Open the printed URL (camera requires `https://` or `localhost`).

## Default PIN
`12345` — change `ACCESS_CODE` in `src/screens/LockScreen.jsx`.

## Run with backend (saves images to disk)

```bash
npm install
npm run dev:all      # vite (5173) + express api (5174)
```

The Vite dev server proxies `/api` and `/data` to the Express server.
Files are written to:

```
data/
  db.json                       # workers + punches metadata
  workers/<id>_<name>/{front,up,down,left,right}.jpg
  punches/YYYY-MM-DD/<ts>_<workerId>.jpg
```

These are exactly the folders to point a classifier at (one subfolder per worker under `data/workers/` is the standard "ImageFolder" layout used by Keras/PyTorch).

## Where things live
- `src/App.jsx` — screen router
- `src/screens/LockScreen.jsx` — PIN entry
- `src/screens/HomeScreen.jsx` — main menu
- `src/screens/PunchScreen.jsx` — camera capture + worker selection (stub for face recog)
- `src/screens/RegisterScreen.jsx` — multi-pose registration
- `src/utils/image.js` — JPEG compression from `<video>` frame
- `src/utils/storage.js` — localStorage wrapper for workers & punches
- `src/i18n.js` — EN/ES strings

## Notes
- Face recognition matching is **not** done in the frontend yet — `PunchScreen` shows a worker list as a stand-in. The backend will replace `selectWorker` with an actual match.
- Photos are stored as data URLs in localStorage. For real deployments, upload to backend and clear local cache.

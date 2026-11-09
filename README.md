# Gym Log (web app / PWA)

Runs in iPhone Safari and installs to the home screen like an app. Works offline. All data is stored on the phone (IndexedDB). Nothing is uploaded anywhere.

## 1. Try it on your PC first
In this folder open a terminal and run `py -m http.server 8000` (Windows) or `python3 -m http.server 8000`, then open http://localhost:8000 in Chrome. Press F12 and click the phone icon to see it at phone size.

## 2. Put it online (free, needed to install on the iPhone)
It must be served over HTTPS. Easiest is GitHub Pages:
1. Create a new repository on github.com (public is fine: this folder contains no personal data).
2. Add file → Upload files, drag in everything inside this `GymLogWeb` folder (index.html, js, css, icons, data, sw.js, manifest.webmanifest), and commit.
3. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)` → Save.
4. After a minute your app is at `https://<your-username>.github.io/<repo-name>/`.
(Netlify or Cloudflare Pages also work: drag the folder in.)

## 3. Install on the iPhone
1. Open the URL in **Safari**, tap Share → **Add to Home Screen**.
2. Always open the app from the home-screen icon. Safari and the installed app keep **separate** storage, so load your history from the icon, not from Safari.
3. Get `my-history-backup.json` onto the phone (email it to yourself, or upload it to iCloud Drive/Google Drive/OneDrive).
4. In the app: Data → **Restore from backup…** → choose the file. This loads your Fitness Logbook history.

## Backups
iOS can clear a web app's storage if it hasn't been opened for several weeks. Use Data → **Save backup file** now and then (it can include photos) and keep the file in iCloud Drive. The app nudges you after 14 days.

## Updating the app
Replace the files in the repo. In `sw.js` change `VERSION` (e.g. gymlog-v2) so phones pick up the new files. Close and reopen the app twice.

## Import more Fitness Logbook history
Data → Import Fitness Logbook CSV… accepts the workouts and/or measurements CSVs from a new export. Only workouts/measurements not already in the app are added, and a partially imported workout is completed.

## Known limits
- The rest timer beeps and vibrates only while the app is open and the screen is on (the app asks iOS to keep the screen awake while it runs). iOS doesn't let web apps ring in the background.
- Exercises tagged with the wrong muscle group can be changed from the ⋯ menu on an exercise.

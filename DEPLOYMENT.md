# OFM — Run, Build and Deploy

## 1. Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or newer |
| npm | 9 or newer |
| Expo Go (phone) | supports **SDK 58** |
| EAS CLI | `npx eas-cli` (for APK builds) |
| Firebase CLI | `npm i -g firebase-tools` (for hosting) |

## 2. Install

```bash
git clone https://github.com/devahmedaqeel/Organization-Finance-Management.git
cd Organization-Finance-Management
npm install
```

Optional `.env` for your own Firebase project — see [README.md](README.md#environment-variables).

## 3. Run locally

```bash
npm start          # Expo dev server
#   w  → open web at http://localhost:8081
#   QR → scan with Expo Go (Android/iOS)
npm run web        # web only
```

### Expo Go checklist
1. Phone and computer on the **same network**.
2. On Windows, the network profile must be **Private** (Settings → Network & internet → your network → Private), otherwise the firewall blocks the phone.
3. Expo Go must support SDK 58 (update it from the store).
4. Alternative: USB with `adb reverse tcp:8081 tcp:8081` and open `exp://127.0.0.1:8081`, or install the APK.

## 4. Quality checks

```bash
npm run typecheck   # 0 errors expected
npm test            # 17/17 suites expected
```

## 5. Web → Firebase Hosting

```bash
npx expo export -p web                     # builds dist/
firebase deploy --only hosting --project ofmapp-main
# or: npm run deploy:hosting
```

- `firebase.json` → hosting site `ofmapp-main`, public folder `dist`.
- Live URL: https://ofmapp-main.web.app
- If you have several Google accounts in the Firebase CLI, add `--account <owner-email>` or run `firebase login:use <owner-email>`.

## 6. Android APK (EAS Build)

```bash
npx eas-cli login                                    # once
npx eas-cli build -p android --profile preview       # APK
# or: npm run build:apk
```

- Profiles in `eas.json`: `development` (dev client), `preview` (**APK**, internal), `production` (AAB for Play Store, `npm run build:aab`).
- The build page shows a download link and QR code for the APK.
- If the folder is not a git repository, set `EAS_NO_VCS=1` before the build command.

## 7. Firestore rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes --project ofmapp-main
```

> Review `firestore.rules` before deploying — the current rules are permissive (see FYP report §17).

## 8. Cloud Functions

```bash
cd functions
npm install
npx tsc            # compiles src/ → lib/ (entry: lib/index.js, Node 18)
cd ..
firebase deploy --only functions --project ofmapp-main
```

## 9. Release checklist

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm test` — 17/17
- [ ] Web export builds; hosting deploy succeeds; live site loads
- [ ] APK installs and signs in
- [ ] Web ↔ mobile sync checked with the same organization
- [ ] Version bumped in `app.json` (`version`, Android `versionCode`)

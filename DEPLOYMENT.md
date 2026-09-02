# OFM — Deployment & Production Build Guide

This document provides step-by-step instructions for deploying **OFM (Organization Finance Management)** across Web (Firebase Hosting) and Mobile (Android Standalone APK via EAS Build).

---

## 1. Production Web Deployment (Firebase Hosting)

### Prerequisites
* Node.js `>= 18`
* Firebase CLI installed (`npm install -g firebase-tools` or via `npx firebase`)

### Deployment Steps
```bash
# 1. Navigate to the project directory
cd "c:\Users\user\Downloads\Organization-Finance-Management-main (3)\Organization-Finance-Management-main"

# 2. Export static web bundle
npx expo export -p web

# 3. Deploy to Firebase Hosting
npx firebase deploy --only hosting
```

* **Live Production URL**: [https://ofmapp-main.web.app/](https://ofmapp-main.web.app/)

---

## 2. Standalone Android APK Build (EAS CLI)

The project includes preconfigured build profiles in `eas.json`.

### A. Cloud Build (Recommended — No Android Studio Required)
```bash
# 1. Login to your Expo account
npx eas-cli login

# 2. Trigger Android Standalone APK build
npx eas-cli build -p android --profile preview
```

* When the build finishes, EAS provides a direct download link and QR code for the `.apk` file.

### B. Local Build (Requires Android SDK & NDK)
```bash
npx eas-cli build -p android --profile preview --local
```

---

## 3. Cloud Firestore Security Rules Deployment

To deploy updated database security rules from `firestore.rules`:
```bash
npx firebase deploy --only firestore:rules
```

---

## 4. One-Line Deploy & GitHub Push Pipeline

To compile the web bundle, deploy to Firebase Hosting, and push all commits to GitHub in a single command:

```powershell
cd "c:\Users\user\Downloads\Organization-Finance-Management-main (3)\Organization-Finance-Management-main"
npx expo export -p web; npx firebase deploy --only hosting; git add .; git commit -m "Deploy: Update production web bundle and documentation"; git push origin main
```

# Talk to Juan

A small Spanish coach for a trip through Argentina, Chile, Bolivia and Peru. Plain HTML/JS, no build step, works offline once opened (it's a PWA: "Add to Home Screen").

- **Travel phrases**: buses, hostels and refugios, food (incl. gluten-free / no cow's milk), money, hiking, races, cycling, altitude, borders.
- **Argentine Spanish**: slang (tagged Argentine / Argentine + elsewhere / general Spanish, with rude words flagged), voseo drill, the "sh" sound, Argentine vs. general vocabulary, plus Chilean, Peruvian and Bolivian slang.
- **Everyday words** (public): 5,000 Spanish words ranked with the open [FrequencyWords](https://github.com/hermitdave/FrequencyWords) list (Hermit Dave, OpenSubtitles 2018, CC BY-SA 4.0), filtered against the LibreOffice Spanish dictionary and curated for travellers (names, slang-only and vulgar forms removed; the last ~200 are added trip vocabulary). Meanings were written for this app; the first 1,100 also have example sentences. `common.json` is shared under CC BY-SA 4.0.
- **Dictionary 5,000** (private, optional): the 5,000-word list from *A Frequency Dictionary of Spanish* (Mark Davies). That list is copyrighted, so `words.json` is **not** in this repo. Import your private copy once while signed in (Words → Import words.json): it's stored in Firestore, readable only by the accounts listed in the rules, and loads automatically on every device they sign in on.
- **Practice**: flashcards with spaced repetition, multiple choice, typing, listening (device text-to-speech, prefers an es-AR voice).

Progress is kept in the browser, and with an account it syncs across devices (see below). Without an account, Setup → "Copy progress code" moves it by hand.

## Accounts and sync (Firebase, free)
Each person creates an account (email + password) in Setup; their answers sync to every device where they sign in, also after studying offline. Sync uses Firebase (Spark plan: free, no card). One-time setup:

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it `talktojuan` (Google Analytics: off).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
3. **Authentication → Settings → Authorized domains → Add domain** → `donkuan.github.io`.
4. **Build → Firestore Database → Create database** → location `eur3 (europe-west)` → start in **production mode**.
5. **Firestore → Rules** → paste the contents of [`firestore.rules`](firestore.rules), put your travellers' sign-up emails in the `shared` rule (lower case; keep them out of this public repo) → **Publish**.
6. **Project settings (gear) → Your apps → Web `</>`** → nickname "Talk to Juan" (no Firebase Hosting) → copy the `firebaseConfig` values into [`firebase-config.js`](firebase-config.js) and push.

The config values are public by design; the Firestore rules make sure every user can only read and write their own data.

Slang topics follow [Franco Spanish School's Argentine slang list](https://francospanishschool.com/vocabulary/argentine-slang); meanings are paraphrased and the examples were written for this app.

## Hosting
Settings → Pages → Deploy from a branch → `main` / root. The site is then at `https://<user>.github.io/talktojuan/`.

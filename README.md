# Talk to Juan

A small Spanish coach for a trip through Argentina, Chile, Bolivia and Peru. Plain HTML/JS, no build step, works offline once opened (it's a PWA: "Add to Home Screen").

- **Travel phrases**: buses, hostels and refugios, food (incl. gluten-free / no cow's milk), money, hiking, races, cycling, altitude, borders.
- **Argentine Spanish**: slang (tagged Argentine / Argentine + elsewhere / general Spanish, with rude words flagged), voseo drill, the "sh" sound, Argentine vs. general vocabulary, plus Chilean, Peruvian and Bolivian slang.
- **Common words**: the 5,000 most frequent Spanish words, from *A Frequency Dictionary of Spanish* (Mark Davies). That list is copyrighted, so `words.json` is **not** in this repo: import your private copy in the app (Words → Import words.json). It's stored in your browser.
- **Practice**: flashcards with spaced repetition, multiple choice, typing, listening (device text-to-speech, prefers an es-AR voice).

Progress is kept in the browser (localStorage); use Setup → "Copy progress code" to move it between devices.

Slang topics follow [Franco Spanish School's Argentine slang list](https://francospanishschool.com/vocabulary/argentine-slang); meanings are paraphrased and the examples were written for this app.

## Hosting
Settings → Pages → Deploy from a branch → `main` / root. The site is then at `https://<user>.github.io/talktojuan/`.

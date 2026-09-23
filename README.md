# Digi Ultimate King of the Hill Overlay

OBS-ready static overlay for the three KOTH stages:

- Paid Subs + Gifters KOTH
- Non-Sub KOTH
- Final Battle

## URLs

- Public OBS overlay: `https://shiv295.github.io/koth-live-overlay/`
- Mod control panel: `https://shiv295.github.io/koth-live-overlay/mod.html`

## Live sync backend

This site uses Firebase Realtime Database when `firebase-config.js` is filled in.
The Firebase config values are safe to publish; Firebase security rules protect writes.
Do not put GitHub tokens, Firebase service-account keys, or any private secret in this repo.

### Firebase setup

1. Create a free Firebase project.
2. Add a Web app and copy its config into `firebase-config.js`.
3. Set `enabled: true`.
4. Create a Realtime Database.
5. Enable Google sign-in in Firebase Authentication.
6. Add `shiv295.github.io` as an authorized Authentication domain.
7. Open `mod.html`, sign in, and copy the UID shown in the yellow setup note.
8. Paste that UID into `firebase-rules.json` where it says `PASTE_MOD_UID_HERE`.
9. Publish those database rules in Firebase.

After that, the mod panel can update scores remotely and the OBS overlay updates live.

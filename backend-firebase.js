/* Firebase adapter: accounts (email + password) and one private progress document per user.
   Firestore keeps a local cache, so changes made offline sync when the phone is back online. */
window.TTJ_makeBackend = async function(cfg){
  const V = "10.12.2", base = "https://www.gstatic.com/firebasejs/" + V + "/";
  const [{initializeApp}, A, F] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch (e) { db = F.getFirestore(app); }
  const progressDoc = uid => F.doc(db, "users", uid);
  const wordsDoc = uid => F.doc(db, "users", uid, "private", "words");
  const sharedWordsDoc = () => F.doc(db, "shared", "words");
  const toUser = u => u ? {uid: u.uid, email: u.email || "", name: u.displayName || ""} : null;
  return {
    kind: "firebase",
    onAuth(cb){ return A.onAuthStateChanged(auth, u => cb(toUser(u))); },
    async signUp(name, email, pw){ const r = await A.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await A.updateProfile(r.user, {displayName: name}); return toUser(r.user); },
    async signIn(email, pw){ const r = await A.signInWithEmailAndPassword(auth, email, pw); return toUser(r.user); },
    signOut(){ return A.signOut(auth); },
    resetPassword(email){ return A.sendPasswordResetEmail(auth, email); },
    watch(uid, cb, onErr){ return F.onSnapshot(progressDoc(uid), {includeMetadataChanges: true},
      s => cb(s.exists() ? s.data() : null, {pending: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache}), onErr); },
    save(uid, data){ return F.setDoc(progressDoc(uid), Object.assign({}, data, {updatedAt: F.serverTimestamp()})); },
    async saveWords(uid, json){ return F.setDoc(wordsDoc(uid), {json, savedAt: F.serverTimestamp()}); },
    async loadWords(uid){ const s = await F.getDoc(wordsDoc(uid)); return s.exists() ? s.data().json : null; },
    /* Shared copy for the travel group: readable only by the accounts listed in firestore.rules. */
    async saveShared(json){ return F.setDoc(sharedWordsDoc(), {json, savedAt: F.serverTimestamp()}); },
    async loadShared(){ const s = await F.getDoc(sharedWordsDoc()); return s.exists() ? s.data().json : null; },
    errorText(e){ const c = (e && e.code) || "";
      return ({"auth/invalid-email":"That email address doesn't look right.","auth/missing-password":"Enter a password.",
        "auth/weak-password":"Use a password of at least 6 characters.","auth/email-already-in-use":"There's already an account with that email. Sign in instead.",
        "auth/invalid-credential":"Email or password is wrong.","auth/wrong-password":"Email or password is wrong.","auth/user-not-found":"No account with that email.",
        "auth/too-many-requests":"Too many tries. Wait a minute and try again.","auth/network-request-failed":"No connection. Try again when you're online.",
        "auth/unauthorized-domain":"This website isn't on the Firebase list of authorized domains yet (see README)."})[c] || (e && e.message) || "Something went wrong."; }
  };
};

/* Firebase adapter for the trip planner. Same project and accounts as Talk to Juan.
   Shared data lives under trip/state (readable only by the travellers listed in firestore.rules);
   each person's packing ticks live under users/{uid}/trip/packing.
   Tickets are stored in the database itself, split into ~700 KB pieces (Firebase file storage needs a paid plan). */
window.TRIP_makeBackend = async function(cfg){
  const V = "10.12.2", base = "https://www.gstatic.com/firebasejs/" + V + "/";
  const [{initializeApp, getApps}, A, F] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch (e) { db = F.getFirestore(app); }
  const stateDoc = () => F.doc(db, "trip", "state");
  const bookings = () => F.collection(db, "trip", "state", "bookings");
  const chunk = (id, i) => F.doc(db, "trip", "state", "chunks", id + "_" + i);
  const mineDoc = uid => F.doc(db, "users", uid, "trip", "packing");
  const toUser = u => u ? {uid: u.uid, email: u.email || "", name: u.displayName || ""} : null;
  const meta = s => ({fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites});
  return {
    kind: "firebase", CHUNK: 700 * 1024,
    onAuth(cb){ return A.onAuthStateChanged(auth, u => cb(toUser(u))); },
    async signUp(name, email, pw){ const r = await A.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await A.updateProfile(r.user, {displayName: name}); return toUser(r.user); },
    async signIn(email, pw){ const r = await A.signInWithEmailAndPassword(auth, email, pw); return toUser(r.user); },
    signOut(){ return A.signOut(auth); },
    resetPassword(email){ return A.sendPasswordResetEmail(auth, email); },
    watchBookings(cb, onErr){ return F.onSnapshot(bookings(), {includeMetadataChanges: true},
      s => cb(s.docs.map(d => [d.id, d.data()]), meta(s)), onErr); },
    watchShared(cb, onErr){ return F.onSnapshot(stateDoc(), s => cb(s.exists() ? s.data() : {}, meta(s)), onErr); },
    watchMine(uid, cb, onErr){ return F.onSnapshot(mineDoc(uid), s => cb(s.exists() ? s.data() : null), onErr); },
    /* Writes resolve when the server confirms. Offline they stay queued on the phone and the promise waits. */
    addBooking(data){ const ref = F.doc(bookings()); return {id: ref.id, done: F.setDoc(ref, data)}; },
    setBooking(id, data){ return F.setDoc(F.doc(bookings(), id), data, {merge: true}); },
    updateBooking(id, patch){ return F.updateDoc(F.doc(bookings(), id), patch); },
    addFileMeta(id, m){ return F.updateDoc(F.doc(bookings(), id), {files: F.arrayUnion(m)}); },
    deleteBooking(id){ return F.deleteDoc(F.doc(bookings(), id)); },
    writeShared(patch){ return F.setDoc(stateDoc(), patch, {merge: true}); },
    writeMine(uid, body){ return F.setDoc(mineDoc(uid), body); },
    putFile(id, bytes){ const n = Math.max(1, Math.ceil(bytes.length / this.CHUNK)); const ps = [];
      for (let i = 0; i < n; i++) ps.push(F.setDoc(chunk(id, i), {b: F.Bytes.fromUint8Array(bytes.subarray(i * this.CHUNK, (i + 1) * this.CHUNK)), i, n}));
      return {n, done: Promise.all(ps)}; },
    async getFile(id, n){ const parts = [];
      for (let i = 0; i < n; i++){ const s = await F.getDoc(chunk(id, i)); if (!s.exists()) throw Object.assign(new Error("missing"), {code: "missing"}); parts.push(s.data().b.toUint8Array()); }
      const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0)); let o = 0; for (const p of parts){ out.set(p, o); o += p.length; } return out; },
    deleteFile(id, n){ const ps = []; for (let i = 0; i < n; i++) ps.push(F.deleteDoc(chunk(id, i))); return Promise.all(ps); },
    errorText(e){ const c = (e && e.code) || "";
      return ({"auth/invalid-email":"That email address doesn't look right.","auth/missing-password":"Enter a password.",
        "auth/weak-password":"Use a password of at least 6 characters.","auth/email-already-in-use":"There's already an account with that email. Sign in instead (same account as Talk to Juan).",
        "auth/invalid-credential":"Email or password is wrong.","auth/wrong-password":"Email or password is wrong.","auth/user-not-found":"No account with that email.",
        "auth/too-many-requests":"Too many tries. Wait a minute and try again.","auth/network-request-failed":"No connection. Try again when you're online.",
        "auth/unauthorized-domain":"This website isn't on the Firebase list of authorized domains yet.",
        "permission-denied":"This account isn't on the travellers list. Add its email to the Firestore rules (see README)."})[c] || (e && e.message) || "Something went wrong."; }
  };
};

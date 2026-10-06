import { KOTH_FIREBASE_CONFIG } from '../firebase-config.js';

export const EVENT_ID = 'digi-secondary-koth';

function emptyState() {
  return { players: [], updatedAt: Date.now() };
}

export function normalizeState(value) {
  const next = emptyState();
  if (!value || typeof value !== 'object') return next;

  next.players = Array.isArray(value.players)
    ? value.players
      .filter(player => player && (player.name || player.win !== undefined))
      .map(player => ({
        id: String(player.id || crypto.randomUUID()),
        name: String(player.name || '').trim(),
        win: Number(player.win) || 0
      }))
    : [];
  next.updatedAt = Number(value.updatedAt) || Date.now();
  return next;
}

export function sortPlayers(players) {
  return [...(players || [])].sort((a, b) => {
    const winDiff = (Number(b.win) || 0) - (Number(a.win) || 0);
    return winDiff || String(a.name).localeCompare(String(b.name));
  });
}

export function money(value) {
  return `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

export async function createStore({ requireAuth = false } = {}) {
  if (KOTH_FIREBASE_CONFIG?.enabled && KOTH_FIREBASE_CONFIG?.databaseURL) {
    return createFirebaseStore({ requireAuth });
  }
  return createLocalStore();
}

function createLocalStore() {
  const listeners = new Set();
  const key = `koth-state:${EVENT_ID}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(key) : null;

  function read() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(key)));
    } catch {
      return emptyState();
    }
  }

  function emit(value) {
    const next = normalizeState(value);
    listeners.forEach(listener => listener(next));
  }

  channel?.addEventListener('message', event => emit(event.data));
  window.addEventListener('storage', event => {
    if (event.key === key) emit(read());
  });

  return {
    mode: 'local',
    onAuthChange: () => {},
    signIn: async () => null,
    signOut: async () => null,
    subscribe(listener) {
      listeners.add(listener);
      listener(read());
      return () => listeners.delete(listener);
    },
    async save(state) {
      const next = normalizeState({ ...state, updatedAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(next));
      channel?.postMessage(next);
      emit(next);
    }
  };
}

async function createFirebaseStore({ requireAuth }) {
  const [appModule, databaseModule, authModule] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js')
  ]);

  const { enabled, ...config } = KOTH_FIREBASE_CONFIG;
  const app = appModule.initializeApp(config, EVENT_ID);
  const database = databaseModule.getDatabase(app);
  const auth = authModule.getAuth(app);
  const stateRef = databaseModule.ref(database, `events/${EVENT_ID}`);
  const provider = new authModule.GoogleAuthProvider();

  const authReady = new Promise(resolve => {
    const stop = authModule.onAuthStateChanged(auth, user => {
      stop();
      resolve(user);
    });
  });

  if (requireAuth) await authReady;

  return {
    mode: 'firebase',
    onAuthChange(listener) {
      return authModule.onAuthStateChanged(auth, listener);
    },
    signIn() {
      return authModule.signInWithPopup(auth, provider);
    },
    signOut() {
      return authModule.signOut(auth);
    },
    subscribe(listener, onError) {
      return databaseModule.onValue(
        stateRef,
        snapshot => listener(normalizeState(snapshot.val())),
        error => onError?.(error)
      );
    },
    async save(state) {
      await databaseModule.set(stateRef, normalizeState({ ...state, updatedAt: Date.now() }));
    }
  };
}


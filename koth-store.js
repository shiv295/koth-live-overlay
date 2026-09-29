import { KOTH_EVENT_ID, KOTH_FIREBASE_CONFIG } from './firebase-config.js';

export const STAGES = {
  sub: 'Paid Subs + Gifters KOTH',
  non: 'Non-Sub KOTH',
  final: 'Final Battle'
};

export const MODES = {
  koth: 'KOTH',
  tournament: 'Tournament'
};

export const TOURNAMENT_ROUNDS = [
  { id: 'round1', label: 'Round 1', matches: 8 },
  { id: 'round2', label: 'Round 2', matches: 4 },
  { id: 'semifinal', label: 'Semifinals', matches: 2 },
  { id: 'final', label: 'Final', matches: 1 }
];

export function createTournamentState() {
  return {
    currentRound: 'round1',
    participants: Array.from({ length: 16 }, (_, index) => ({
      id: 'seed-' + (index + 1),
      name: '',
      seed: index + 1
    })),
    scores: Object.fromEntries(
      TOURNAMENT_ROUNDS.map(round => [
        round.id,
        Array.from({ length: round.matches }, () => ({ a: '', b: '' }))
      ])
    )
  };
}

export const DEFAULT_STATE = {
  mode: 'koth',
  activeStage: 'sub',
  stages: {
    sub: [],
    non: [],
    final: []
  },
  tournament: createTournamentState(),
  updatedAt: Date.now()
};

const LOCAL_KEY = 'koth-state:' + KOTH_EVENT_ID;

export function isFirebaseEnabled() {
  return Boolean(KOTH_FIREBASE_CONFIG?.enabled && KOTH_FIREBASE_CONFIG?.databaseURL);
}

export function normalizeState(value) {
  const next = structuredClone(DEFAULT_STATE);
  if (!value || typeof value !== 'object') return next;

  next.mode = MODES[value.mode] ? value.mode : 'koth';
  next.activeStage = STAGES[value.activeStage] ? value.activeStage : 'sub';
  for (const stage of Object.keys(STAGES)) {
    const players = Array.isArray(value.stages?.[stage]) ? value.stages[stage] : [];
    next.stages[stage] = players
      .filter(player => player && (player.name || player.win !== undefined))
      .map(player => ({
        id: String(player.id || crypto.randomUUID()),
        name: String(player.name || '').trim(),
        win: Number(player.win) || 0
      }));
  }
  next.tournament = normalizeTournament(value.tournament);
  next.updatedAt = Number(value.updatedAt) || Date.now();
  return next;
}

function normalizeTournament(value) {
  const next = createTournamentState();
  if (!value || typeof value !== 'object') return next;

  next.currentRound = TOURNAMENT_ROUNDS.some(round => round.id === value.currentRound)
    ? value.currentRound
    : 'round1';

  next.participants = next.participants.map((participant, index) => {
    const source = Array.isArray(value.participants) ? value.participants[index] : null;
    return {
      id: String(source?.id || participant.id),
      name: String(source?.name || '').trim(),
      seed: index + 1
    };
  });

  next.scores = Object.fromEntries(TOURNAMENT_ROUNDS.map(round => {
    const source = value.scores?.[round.id];
    return [round.id, Array.from({ length: round.matches }, (_, index) => ({
      a: scoreText(source?.[index]?.a),
      b: scoreText(source?.[index]?.b)
    }))];
  }));

  return next;
}

function scoreText(value) {
  return value === '' || value === null || value === undefined ? '' : String(value).replace(/[^0-9]/g, '');
}

export function tournamentMatches(tournament, roundId) {
  const roundIndex = TOURNAMENT_ROUNDS.findIndex(round => round.id === roundId);
  if (roundIndex < 0) return [];

  if (roundIndex === 0) {
    return Array.from({ length: 8 }, (_, index) => ({
      index,
      a: tournament.participants[index * 2] || null,
      b: tournament.participants[index * 2 + 1] || null
    }));
  }

  const previous = TOURNAMENT_ROUNDS[roundIndex - 1];
  const previousMatches = tournamentMatches(tournament, previous.id);
  return Array.from({ length: TOURNAMENT_ROUNDS[roundIndex].matches }, (_, index) => ({
    index,
    a: tournamentPlayer(tournament, previous.id, previousMatches[index * 2]),
    b: tournamentPlayer(tournament, previous.id, previousMatches[index * 2 + 1])
  }));
}

export function tournamentPlayer(tournament, roundId, match) {
  if (!match) return null;
  const score = tournament.scores?.[roundId]?.[match.index];
  if (!match.a || !match.b || !score || score.a === '' || score.b === '') return null;
  if (Number(score.a) === Number(score.b)) return null;
  return Number(score.a) > Number(score.b) ? match.a : match.b;
}

export function tournamentChampion(tournament) {
  const final = tournamentMatches(tournament, 'final')[0];
  return tournamentPlayer(tournament, 'final', final);
}

export function sortPlayers(players) {
  return [...(players || [])].sort((a, b) => {
    const winDiff = (Number(b.win) || 0) - (Number(a.win) || 0);
    return winDiff || String(a.name).localeCompare(String(b.name));
  });
}

export function money(value) {
  return '$' + (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
  if (isFirebaseEnabled()) {
    return createFirebaseStore({ requireAuth });
  }
  return createLocalStore();
}

function createLocalStore() {
  const listeners = new Set();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(LOCAL_KEY) : null;

  function read() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(LOCAL_KEY)));
    } catch {
      return normalizeState(null);
    }
  }

  function emit(value) {
    const state = normalizeState(value);
    listeners.forEach(listener => listener(state));
  }

  channel?.addEventListener('message', event => emit(event.data));
  window.addEventListener('storage', event => {
    if (event.key === LOCAL_KEY) emit(read());
  });

  return {
    mode: 'local',
    authReady: Promise.resolve(null),
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
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
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

  const app = appModule.initializeApp(stripInternalConfig(KOTH_FIREBASE_CONFIG));
  const database = databaseModule.getDatabase(app);
  const auth = authModule.getAuth(app);
  const stateRef = databaseModule.ref(database, 'events/' + KOTH_EVENT_ID);
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
    authReady,
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

function stripInternalConfig(config) {
  const { enabled, ...firebaseConfig } = config;
  return firebaseConfig;
}

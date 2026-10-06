import { createStore, escapeHtml, money, normalizeState, sortPlayers } from './store.js';

const setupNotice = document.querySelector('#setupNotice');
const authState = document.querySelector('#authState');
const signInBtn = document.querySelector('#signInBtn');
const signOutBtn = document.querySelector('#signOutBtn');
const addPlayer = document.querySelector('#addPlayer');
const resetAll = document.querySelector('#resetAll');
const playerRows = document.querySelector('#playerRows');
const kingLabel = document.querySelector('#kingLabel');
const saveState = document.querySelector('#saveState');

let store;
let state = normalizeState(null);
let saveTimer;
let editingInput = false;
let pendingRender = false;

boot();

async function boot() {
  store = await createStore({ requireAuth: true });
  signInBtn.hidden = store.mode !== 'firebase';
  setupNotice.hidden = store.mode !== 'firebase';
  store.onAuthChange?.(renderAuth);
  store.subscribe(next => {
    state = next;
    if (editingInput || isEditingInput()) {
      pendingRender = true;
      return;
    }
    render();
  }, error => setSaveState(error.message || 'Live sync error'));
}

signInBtn.addEventListener('click', async () => {
  try { await store.signIn(); } catch (error) { setSaveState(error.message || 'Sign in failed'); }
});

signOutBtn.addEventListener('click', () => store.signOut());

addPlayer.addEventListener('click', () => {
  state.players.push({ id: crypto.randomUUID(), name: '', win: 0 });
  render();
  save('Player added');
});

resetAll.addEventListener('click', () => {
  if (!confirm('Clear every player from this KOTH?')) return;
  clearTimeout(saveTimer);
  state = normalizeState({ ...state, players: [], updatedAt: Date.now() });
  render();
  save('KOTH cleared');
});

function renderAuth(user) {
  if (store.mode !== 'firebase') {
    authState.textContent = 'Local preview mode';
    return;
  }
  signInBtn.hidden = Boolean(user);
  signOutBtn.hidden = !user;
  authState.textContent = user ? `Signed in: ${user.email || user.uid}` : 'Sign in to publish';
}

function render() {
  const players = sortPlayers(state.players);
  const leader = players[0];
  kingLabel.textContent = leader ? `${leader.name || 'Unnamed player'} is leading with ${money(leader.win)}` : 'Waiting for results';
  playerRows.innerHTML = state.players.map(player => {
    const rank = players.findIndex(item => item.id === player.id) + 1 || '-';
    return `
      <div class="table-row" data-id="${escapeHtml(player.id)}">
        <div class="rank">${rank}</div>
        <input class="name-input" value="${escapeHtml(player.name)}" placeholder="Kick name" aria-label="Kick name">
        <input class="win-input" value="${escapeHtml(player.win)}" inputmode="decimal" aria-label="Actual win">
        <button class="danger remove-player" type="button" aria-label="Remove player">Remove</button>
      </div>
    `;
  }).join('') || '<div class="empty">No players yet</div>';
  bindRows();
}

function bindRows() {
  playerRows.querySelectorAll('.table-row[data-id]').forEach(row => {
    const player = state.players.find(item => item.id === row.dataset.id);
    if (!player) return;
    row.querySelector('.name-input').addEventListener('input', event => {
      player.name = event.target.value;
      debouncedSave('Player updated');
    });
    row.querySelector('.win-input').addEventListener('input', event => {
      player.win = parseMoney(event.target.value);
      debouncedSave('Player updated');
    });
    row.querySelector('.remove-player').addEventListener('click', () => {
      state.players = state.players.filter(item => item.id !== player.id);
      render();
      save('Player removed');
    });
  });
}

playerRows.addEventListener('focusin', event => {
  if (event.target.matches('.name-input, .win-input')) editingInput = true;
});
playerRows.addEventListener('focusout', event => {
  if (!event.target.matches('.name-input, .win-input')) return;
  setTimeout(() => {
    editingInput = isEditingInput();
    if (!editingInput && pendingRender) {
      pendingRender = false;
      render();
    }
  }, 0);
});

function debouncedSave(message) {
  clearTimeout(saveTimer);
  setSaveState('Saving...');
  saveTimer = setTimeout(() => save(message), 350);
}

async function save(message) {
  try {
    await store.save(state);
    setSaveState(message);
  } catch (error) {
    setSaveState(error.message || 'Save failed');
  }
}

function isEditingInput() {
  return document.activeElement?.classList.contains('name-input')
    || document.activeElement?.classList.contains('win-input');
}

function setSaveState(message) { saveState.textContent = message; }
function parseMoney(value) { return Number(String(value).replace(/[^0-9.-]/g, '')) || 0; }


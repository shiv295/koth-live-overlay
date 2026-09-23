import {
  STAGES,
  createStore,
  isFirebaseEnabled,
  money,
  normalizeState,
  sortPlayers
} from './koth-store.js';

const setupNotice = document.querySelector('#setupNotice');
const authState = document.querySelector('#authState');
const signInBtn = document.querySelector('#signInBtn');
const signOutBtn = document.querySelector('#signOutBtn');
const activeStage = document.querySelector('#activeStage');
const publishStage = document.querySelector('#publishStage');
const resetCurrent = document.querySelector('#resetCurrent');
const resetAll = document.querySelector('#resetAll');
const stageTabs = [...document.querySelectorAll('.stage-tab')];
const stageLabel = document.querySelector('#stageLabel');
const kingLabel = document.querySelector('#kingLabel');
const addPlayer = document.querySelector('#addPlayer');
const playerRows = document.querySelector('#playerRows');
const saveState = document.querySelector('#saveState');

let store;
let state = normalizeState(null);
let editStage = 'sub';
let saveTimer;

boot();

async function boot() {
  store = await createStore({ requireAuth: true });
  setupNotice.hidden = isFirebaseEnabled();
  signInBtn.hidden = store.mode !== 'firebase';
  store.onAuthChange?.(user => renderAuth(user));

  store.subscribe(
    next => {
      state = next;
      render();
    },
    error => setSaveState(error.message || 'Live sync error')
  );
}

signInBtn.addEventListener('click', async () => {
  try {
    await store.signIn();
  } catch (error) {
    setSaveState(error.message || 'Sign in failed');
  }
});

signOutBtn.addEventListener('click', () => store.signOut());

publishStage.addEventListener('click', () => {
  state.activeStage = activeStage.value;
  save('Live stage switched');
});

resetCurrent.addEventListener('click', () => {
  if (!confirm(`Clear all players from ${STAGES[editStage]}?`)) return;
  state.stages[editStage] = [];
  save('Current stage cleared');
});

resetAll.addEventListener('click', () => {
  if (!confirm('Reset every KOTH stage and live score?')) return;
  state = normalizeState(null);
  save('Everything reset');
});

addPlayer.addEventListener('click', () => {
  state.stages[editStage].push({ id: crypto.randomUUID(), name: '', win: 0 });
  render();
  save('Player added');
});

stageTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    editStage = tab.dataset.stage;
    render();
  });
});

function renderAuth(user) {
  if (store.mode !== 'firebase') {
    authState.textContent = 'Local preview mode';
    return;
  }

  signInBtn.hidden = Boolean(user);
  signOutBtn.hidden = !user;
  authState.textContent = user
    ? `Signed in: ${user.email || user.uid}`
    : 'Sign in to publish';

  if (user) {
    setupNotice.hidden = false;
    setupNotice.innerHTML = `Signed in. If saves are blocked, add this UID to your Firebase rules: <code>${user.uid}</code>`;
  }
}

function render() {
  activeStage.value = state.activeStage;
  stageTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.stage === editStage));
  stageLabel.textContent = STAGES[editStage];

  const sorted = sortPlayers(state.stages[editStage]);
  const king = sorted[0];
  kingLabel.textContent = king ? `${king.name || 'Unnamed player'} is leading with ${money(king.win)}` : 'Waiting for results';

  playerRows.innerHTML = state.stages[editStage].map(player => {
    const rank = sorted.findIndex(item => item.id === player.id) + 1 || '-';
    return `
      <div class="table-row" data-id="${player.id}">
        <div class="rank">${rank}</div>
        <input class="name-input" value="${attr(player.name)}" placeholder="Kick name" aria-label="Kick name">
        <input class="win-input" value="${attr(player.win)}" inputmode="decimal" aria-label="Actual win">
        <button class="icon-danger" type="button" aria-label="Remove player">Remove</button>
      </div>
    `;
  }).join('') || '<div class="empty table-empty">No players yet</div>';

  bindRows();
}

function bindRows() {
  playerRows.querySelectorAll('.table-row[data-id]').forEach(row => {
    const id = row.dataset.id;
    const player = state.stages[editStage].find(item => item.id === id);
    if (!player) return;

    row.querySelector('.name-input').addEventListener('input', event => {
      player.name = event.target.value;
      debouncedSave('Player updated');
    });
    row.querySelector('.win-input').addEventListener('input', event => {
      player.win = parseMoney(event.target.value);
      debouncedSave('Player updated');
    });
    row.querySelector('.icon-danger').addEventListener('click', () => {
      state.stages[editStage] = state.stages[editStage].filter(item => item.id !== id);
      save('Player removed');
    });
  });
}

function debouncedSave(message) {
  clearTimeout(saveTimer);
  setSaveState('Saving...');
  saveTimer = setTimeout(() => save(message), 350);
}

async function save(message) {
  try {
    await store.save(state);
    setSaveState(message);
    render();
  } catch (error) {
    setSaveState(error.message || 'Save failed');
  }
}

function setSaveState(message) {
  saveState.textContent = message;
}

function parseMoney(value) {
  return Number(String(value).replace(/[^0-9.-]/g, '')) || 0;
}

function attr(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

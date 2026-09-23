import {
  STAGES,
  createStore,
  escapeHtml,
  money,
  sortPlayers
} from './koth-store.js';

const app = document.querySelector('#app');
const syncStatus = document.querySelector('#syncStatus');
const tabs = [...document.querySelectorAll('.tab')];
const urlStage = new URLSearchParams(location.search).get('stage');
let manualStage = STAGES[urlStage] ? urlStage : null;
let lastState = null;

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    manualStage = tab.dataset.stage;
    render(lastState);
  });
});

createStore().then(store => {
  syncStatus.textContent = store.mode === 'firebase'
    ? 'Live sync connected'
    : 'Local preview mode';

  store.subscribe(
    state => {
      lastState = state;
      render(state);
    },
    () => {
      syncStatus.textContent = 'Live sync needs Firebase setup';
    }
  );
});

function render(state) {
  if (!state) return;
  const stage = manualStage || state.activeStage || 'sub';

  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.stage === stage);
  });

  app.innerHTML = stage === 'final'
    ? renderFinal(state)
    : renderLeaderboard(stage, state.stages[stage]);
}

function renderLeaderboard(stage, players) {
  const sorted = sortPlayers(players);
  const king = sorted[0] || { name: '-', win: 0 };

  return `
    <article class="overlay-card">
      <div class="eyebrow">${STAGES[stage]}</div>
      <div class="king">
        <div>
          <div class="eyebrow">Current King</div>
          <div class="kingname">${escapeHtml(king.name || '-')}</div>
        </div>
        <div class="kingwin">${money(king.win)}</div>
      </div>
      <div class="rows">${renderRows(sorted)}</div>
    </article>
  `;
}

function renderFinal(state) {
  const subKing = sortPlayers(state.stages.sub)[0] || { name: '-', win: 0 };
  const nonKing = sortPlayers(state.stages.non)[0] || { name: '-', win: 0 };
  const finalRows = sortPlayers(state.stages.final);
  const champion = finalRows[0] || { name: '-', win: 0 };

  return `
    <article class="overlay-card">
      <div class="crown">
        <div class="eyebrow">Ultimate Crown</div>
        <div class="champ">${escapeHtml(champion.name || '-')}</div>
        <div class="score">${champion.name ? money(champion.win) : 'Awaiting final battle'}</div>
      </div>
      <div class="final">
        <div class="box">
          <div class="cat">Sub King</div>
          <div class="name">${escapeHtml(subKing.name || '-')}</div>
          <div class="win">${money(subKing.win)}</div>
        </div>
        <div class="box">
          <div class="cat">Non-Sub King</div>
          <div class="name">${escapeHtml(nonKing.name || '-')}</div>
          <div class="win">${money(nonKing.win)}</div>
        </div>
      </div>
      <div class="rows final-rows">${renderRows(finalRows)}</div>
    </article>
  `;
}

function renderRows(players) {
  if (!players.length) return '<div class="empty">Waiting for results...</div>';

  return players.map((player, index) => `
    <div class="row">
      <div class="rank">${index + 1}</div>
      <div class="name">${escapeHtml(player.name || '-')}</div>
      <div class="win">${money(player.win)}</div>
    </div>
  `).join('');
}

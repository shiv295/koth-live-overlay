import { createStore, escapeHtml, money, sortPlayers } from './store.js';

const app = document.querySelector('#app');
const syncStatus = document.querySelector('#syncStatus');

boot();

async function boot() {
  const store = await createStore();
  store.subscribe(render, error => {
    syncStatus.textContent = error.message || 'Live sync unavailable';
  });
}

function render(state) {
  const players = sortPlayers(state.players);
  const leader = players[0];
  app.innerHTML = `
    <section class="panel">
      <div class="eyebrow">Live KOTH</div>
      <div class="king">
        <div class="king-name">${escapeHtml(leader?.name || 'Waiting for players')}</div>
        <div class="king-win">${leader ? money(leader.win) : '$0.00'}</div>
      </div>
      <div class="rows">
        ${players.map((player, index) => `
          <div class="row">
            <div class="rank">${index + 1}</div>
            <div class="name">${escapeHtml(player.name || 'Unnamed player')}</div>
            <div class="win">${money(player.win)}</div>
          </div>
        `).join('') || '<div class="empty">No players yet</div>'}
      </div>
    </section>
  `;
  syncStatus.textContent = 'Live updates connected';
}


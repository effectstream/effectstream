/* global document */
/* eslint-disable no-unused-vars */

// <!-- HELP -->
function help_show() {
  document.getElementById('help_selection').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function help_hide() {
  document.getElementById('help_selection').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}

// <!-- GAME OPTIONS -->
let lobbyId = null;
let surrender_callback = options => {};
function game_options_show(surrender_callback_) {
  if (surrender_callback) {
    document.getElementById('surrender').classList.remove('hide');
    surrender_callback = surrender_callback_;
  } else {
    document.getElementById('surrender').classList.add('hide');
  }
  document.getElementById('game_options').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function game_options_hide() {
  lobbyId = null;

  document.getElementById('game_options').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function game_options_surrender() {
  surrender_callback();
  game_options_hide();
}

// <!-- LEADERBOARD -->
function leaderboard_show(players) {
  // <div>2. 1234...3443 6 wins of 20 games</div>
  document.getElementById('leaderboard_list').innerHTML =
    `
  <div class="leaderboard-head">
    <div class="leaderboard-row" style="width:100px;">Rank</div> 
    <div class="leaderboard-row" style="width:400px;">Player</div>
    <div class="leaderboard-row" style="width:120px;">Wins</div>
    <div class="leaderboard-row" style="width:120px;">Losses</div>
    <div class="leaderboard-row" style="width:120px;">Draws</div>
  </div>` +
    players
      .map(p => {
        const short = `${p.wallet.substring(0, 4)}...${p.wallet.substring(
          p.wallet.length - 4,
          p.wallet.length
        )}`;
        return `
        <div style="display:flex; flex-direction: row;">
          <div class="leaderboard-row leaderboard-item" style="">
            <div class="leaderboard-rank">${p.rank}</div>
          </div> 
          <div class="leaderboard-row leaderboard-name" style="">
            <div style="overflow:hidden">${p.name}</div>
            <div style="font-size:18px; font-family:monospace;">${short}</div>
          </div>
          <div class="leaderboard-row" style="width:120px;">${p.wins}</div>
          <div class="leaderboard-row" style="width:120px;">${p.losses}</div>
          <div class="leaderboard-row" style="width:120px;">${p.draws}</div>
        </div>`;
      })
      .join('');
  document.getElementById('leaderboard').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function leaderboard_hide() {
  document.getElementById('leaderboard').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
// <!-- WALLET SELECTION -->
let wallet_selection_callback = options => {};
function wallet_selection_show(callback) {
  wallet_selection_callback = callback;
  document.getElementById('wallet_selection').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function wallet_selection_hide() {
  wallet_selection_callback = null;
  document.getElementById('wallet_selection').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function select_wallet() {
  wallet_selection_callback({
    wallet: document.getElementById('wallet_dropdown').value,
  });
  wallet_selection_hide();
}

// <!-- PRACTICE OPTIONS -->
let practice_options_callback = options => {};
function practice_options_show(callback) {
  practice_options_callback = callback;
  document.getElementById('practice_options').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function practice_options_hide() {
  practice_options_callback = null;
  document.getElementById('practice_options').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function practive_options_create() {
  practice_options_callback({
    number_of_players: document.getElementById('p_number_of_players').value,
    units: document.getElementById('p_units').value,
    gold: document.getElementById('p_gold').value,
    map_size: document.getElementById('p_map_size').value,
  });
  practice_options_hide();
}

// <!-- NEW GAME OPTIONS -->
let new_game_options_callback = options => {};
function new_game_options_show(callback) {
  new_game_options_callback = callback;
  document.getElementById('new_game_options').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function new_game_options_hide() {
  new_game_options_callback = null;
  document.getElementById('new_game_options').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function new_game_options_create() {
  new_game_options_callback({
    number_of_players: document.getElementById('number_of_players').value,
    units: document.getElementById('units').value,
    gold: document.getElementById('gold').value,
    map_size: document.getElementById('map_size').value,
  });
  new_game_options_hide();
}
// <!-- JOIN LOBBY -->
let join_lobby_callback = lobby_id => {};
function join_lobby_show(lobbies, callback) {
  join_lobby_callback = callback;
  const list_of_lobbies = document.getElementById('list_of_lobbies');
  list_of_lobbies.innerHTML = '';

  if (lobbies.length === 0) {
    list_of_lobbies.innerHTML =
      '<div style="text-align:center; opacity:0.7; font-size:20px; margin-top:40px;">No open lobbies.<br>Create a new game to start one.</div>';
  } else {
    list_of_lobbies.innerHTML = lobbies
      .map(l => {
        const wallet = l.lobby_creator;
        const shortWallet = `${wallet.substring(0, 6)}...${wallet.substring(
          wallet.length - 4
        )}`;
        return `
        <div style="display:flex; flex-direction:row; align-items:center; gap:16px; padding:14px 16px; margin-bottom:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(120,210,235,0.18); border-radius:12px;">
          <div style="flex:1; min-width:0; font-size:20px; line-height:1.5;">
            <div style="font-weight:bold; font-size:22px; color:#eafcff; margin-bottom:6px; word-break:break-all;">Lobby ${l.lobby_id}</div>
            <div style="color:#cfe7f0;">Players ${l.num_of_players} &middot; Units ${l.units.length} &middot; Buildings ${l.buildings.length - 1} &middot; Gold ${l.gold}</div>
            <div style="color:#9fd9e6; font-family:monospace; font-size:16px; margin-top:4px;">Creator ${shortWallet}</div>
          </div>
          <button style="width:130px; flex:0 0 auto;" class="button_ok" onclick="join_lobby_join('${l.lobby_id}')">Join</button>
        </div>`;
      })
      .join('');
  }
  document.getElementById('join_lobby_options').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function join_lobby_hide() {
  join_lobby_callback = null;
  document.getElementById('join_lobby_options').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function join_lobby_join(lobby_id) {
  join_lobby_callback(lobby_id);
  join_lobby_hide();
}
// <!-- REJOIN LOBBY -->
let rejoin_lobby_callback = lobby_id => {};
function rejoin_lobby_show(lobbies, callback) {
  rejoin_lobby_callback = callback;
  const list_of_lobbies = document.getElementById('list_of_rejoin_lobbies');
  list_of_lobbies.innerHTML = '';
  if (lobbies.length === 0) {
    list_of_lobbies.innerHTML =
      '<div style="text-align:center; opacity:0.7; font-size:20px; margin-top:40px;">You have no active games.<br>Join or create a new game.</div>';
  } else {
    list_of_lobbies.innerHTML = lobbies
      .map(
        l => `
        <div style="display:flex; flex-direction:row; align-items:center; gap:16px; padding:14px 16px; margin-bottom:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(120,210,235,0.18); border-radius:12px;">
          <div style="flex:1; min-width:0; font-size:20px; line-height:1.5;">
            <div style="font-weight:bold; font-size:22px; color:#eafcff; margin-bottom:6px; word-break:break-all;">Lobby ${l.lobby_id}</div>
            <div style="color:#cfe7f0;">Players ${l.activePlayers}/${l.num_of_players}</div>
          </div>
          <button style="width:130px; flex:0 0 auto;" class="button_ok" onclick="rejoin_lobby_join('${l.lobby_id}')">Rejoin</button>
        </div>`
      )
      .join('');
  }
  document.getElementById('rejoin_lobby_options').classList.remove('hide');
  document.getElementById('dark-background').classList.remove('hide');
}
function rejoin_lobby_hide() {
  rejoin_lobby_callback = null;
  document.getElementById('rejoin_lobby_options').classList.add('hide');
  document.getElementById('dark-background').classList.add('hide');
}
function rejoin_lobby_join(lobby_id) {
  rejoin_lobby_callback(lobby_id);
  rejoin_lobby_hide();
}

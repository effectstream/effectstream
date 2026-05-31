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
      'Sorry no lobbies are open.<br>Create a new game.';
  } else {
    list_of_lobbies.innerHTML = lobbies
      .map(l => {
        const wallet = l.lobby_creator;
        const shortWallet = `${wallet.substring(0, 6)}...${wallet.substring(
          wallet.length - 4
        )}`;
        // Time Limit: ${l.timelimit}<br>
        // Round Limit: ${l.roundlimit}<br>
        const item = `
        <div style="font-size:18px; margin-right:20px; margin-top:10px; margin-bottom:10px;">
          <span style="font-weight:bold"> Lobby ${l.lobby_id}</span><br>
          Players: ${l.num_of_players}<br>
          Units: ${l.units.length}<br>
          Buildings: ${l.buildings.length - 1}<br>
          Gold: ${l.gold}<br>
          Creator: ${shortWallet}<br>
        </div>`;

        const button = `
        <button 
          style="width:100px; height:40px; margin-left:auto" class="item button_ok" 
          onclick="join_lobby_join('${l.lobby_id}')">Join</button>`;

        return `
        <div style="display: flex; flex-direction: row;">
          ${item} ${button}
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
      'You have no active games.<br>Join or Create a new game.';
  } else {
    // <br>State ${l.lobby_state}
    // <br>Round #${l.current_round}</div>
    list_of_lobbies.innerHTML = lobbies
      .map(
        l => `
          <div style="display: flex; flex-direction: row; margin-top: 10px;  margin-top:10px; margin-bottom:10px;>
          <div style="margin-right:20px;">
              Players ${l.activePlayers}/${l.num_of_players}</br>
              Lobby Id: ${l.lobby_id}</br>
          <button style="margin-left:auto; height: 40px;" class="item button_ok" onclick="rejoin_lobby_join('${l.lobby_id}')">
              Rejoin
          </button>
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

/// @description Init room controller.

walletAddress = "";
walletStatus = "";
experience = -1;
blockHeight = 0;

timer = 0;

game_set_speed(30, gamespeed_fps);

function on_wallet_connected(walletAddress) {
    self.walletAddress = walletAddress;
    update_status_label();
    fetch_experience();
}

function update_log_label() {
    inst_log.text = PaimaMW("exportLogs")();
}

function update_status_label() {
    inst_state_label.text = $"Block height: {blockHeight}\n";
    if (string_length(walletAddress)) {
        inst_state_label.text += $"Wallet: {string_copy(walletAddress, 1, 22)}\n";
        var i = 1 + 22;
        while (i <= string_length(walletAddress)) {
            inst_state_label.text += $"        {string_copy(walletAddress, i, 22)}\n";
            i += 22;
        }
        if (experience >= 0) {
            inst_state_label.text += $"Experience: {experience}\n";
        }
    }
}

function fetch_block_height() {
    PaimaMW("getLatestProcessedBlockHeight")()[$"then"](method(self, function (response) {
        if (response.success) {
            self.blockHeight = response.result;
            update_status_label();
        } else {
            // it self-logs, no need to repeat
        }
    }));
}

function fetch_experience() {
    PaimaMW("getUserState")(walletAddress)[$"then"](method(self, function (response) {
        if (response.success) {
            if (response.result.wallet == walletAddress) {
                experience = response.result.experience;
                update_status_label();
            } else {
                PaimaMW("pushLog")($"getUserState server error: {response.result.message}");
            }
        } else {
            PaimaMW("pushLog")($"getUserState error: {response.message}");
        }
    }));
}

update_status_label();

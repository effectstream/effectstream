/// @description Set description and action

event_inherited();

if (mode == 0) {
    button_text = "EVM";
} else if (mode == 1) {
    button_text = "Ethers";
} else if (mode == 2) {
    button_text = "Truffle";
} else if (mode == 3) {
    button_text = "Cardano";
} else if (mode == 4) {
    button_text = "Polkadot";
} else if (mode == 5) {
    button_text = "Algorand";
}

function activate_button() {
    PaimaMW("pushLog")("Calling userWalletLogin...");
    PaimaMW("userWalletLogin")({"mode": mode})[$"then"](function(response) {
        if (response.success) {
            PaimaMW("pushLog")("userWalletLogin succeeded!");
            inst_controller.on_wallet_connected(response.result.walletAddress);
        } else {
            PaimaMW("pushLog")("userWalletLogin error #" + string(response.errorCode) + ": " + response.errorMessage);
        }
    });
}

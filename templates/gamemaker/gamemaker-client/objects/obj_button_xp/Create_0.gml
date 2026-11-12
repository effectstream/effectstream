/// @description Set description and action

event_inherited();

button_text = $"Gain {xp_amount * 10} experience";

function activate_button() {
    PaimaMW("pushLog")("Calling gainExperience...");
    PaimaMW("gainExperience")(xp_amount)[$"then"](function(response) {
        if (response.success) {
            PaimaMW("pushLog")("gainExperience succeeded!");
            inst_controller.fetch_experience();
        } else {
            PaimaMW("pushLog")($"gainExperience error #{response.errorCode}: {response.errorMessage}");
        }
    }, function(error) {
        // example: "User rejected the request."
        PaimaMW("pushLog")($"gainExperience error: {error.message}");
    });
}

/// @description Draw button UI

draw_self();  // We're handling it.
draw_set_color(c_black);
// Manually center-align so we can floor() to make things less blurry.
draw_text(
    floor(x + (sprite_width - string_width(button_text)) / 2),
    floor(y + (sprite_height - string_height(button_text)) / 2) - 2 + (image_index == 2 ? 4 : 0),
    button_text
);

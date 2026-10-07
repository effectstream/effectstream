/// @description Draw label UI

draw_self();  // We're handling it.
draw_set_color(c_black);
draw_text_ext(x, y, text, -1, room_width - x - 32);

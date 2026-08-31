/// @description Controller step

if (timer % 60 == 0) {
    fetch_block_height();
}

update_log_label();

timer += 1;

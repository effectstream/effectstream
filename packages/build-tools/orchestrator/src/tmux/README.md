# TMux @ Orchestrator

This is a Tmux wrapper for Deno.

* By default it loads `tmux.launch.json` to setup the initial panes and programs. 

Format:
```json
{
    name: string,
    command: string,
    split_horizontal?: boolean,
    split_vertical?: boolean,
}[]
```
If neither split_vertical or split_horizontal is defined, then the command is executed in the first pane.

* It uses the `tmux.confg` as configuracion file.
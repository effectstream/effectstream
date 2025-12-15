# Logs

Effectstream sends logs by default to a Open Telemetry Collector. 

## Local Viewer Storage

When you run `packages/build-tools/tui/src/logs-standalone.ts` (used for the standalone log viewer/TUI), it now writes rotating log files under `${INIT_CWD}/logs` by default, where `INIT_CWD` is the directory that started the process. That means the log directory is colocated with whatever project or script launched the viewer.

If you want to store the viewer logs elsewhere, set `LOGS_PATH` in the environment before launching the viewer. `LOGS_PATH` takes precedence over the default paths and can point to any directory you control.
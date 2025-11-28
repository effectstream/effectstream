#!/bin/bash

# This is a workaround to build the frontend in a separate process
# We are seeing other processes corrupted after running vite/esbuild

print "Building frontend... (do not launch other deno processes until this process exits)"
deno run -A --node-modules-dir=auto npm:vite build &
PID=$!
wait $PID
EXIT_CODE=$?
sleep 2
print "Frontend built"
exit $EXIT_CODE


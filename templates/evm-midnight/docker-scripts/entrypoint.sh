#!/bin/sh

# Start the Nginx reverse proxy in the background
echo "🚀 Starting Nginx proxy..."
nginx -g 'daemon off;' &

# Start your application binary
echo "▶️ Starting the main binary..."
exec deno task dev
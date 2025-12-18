# Rock Paper Scissors Wars - Frontend

Paima Game Template built with:
- Phaser 3 (https://phaser.io/phaser3)
- TypeScript
- esbuild for bundling
- Paima Middleware

## Prerequisites

- Node.js 24.x (for npm dependencies)
- Deno 2.5.4+ (for task running)

## Development

The frontend is managed via Deno tasks defined in `deno.json`:

```bash
# Install npm dependencies
deno task install

# Build the frontend bundle
deno task build

# Serve the frontend (development server)
deno task serve
```

## Integration

This frontend is automatically built and served when running `deno task dev` from the project root. The orchestrator handles:
1. Installing dependencies
2. Building the bundle
3. Serving on http://localhost:8080

## Structure

- `/src` - TypeScript source files
- `/public` - Static assets and compiled bundles
- `esbuild.js` - Build configuration
- `paimaMiddleware.src.js` - Middleware entry point

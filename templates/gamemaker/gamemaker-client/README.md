# Frontend - GameMaker integration

This package contains example integration with [GameMaker Studio 2](https://gamemaker.io).

# Middleware

The Middleware is the component of the stack that enables your game frontend to interact with both the blockchain and the game node.

When you do any changes to the middleware module you need to make it available for GameMaker. We prepared a script that compiles every piece of JS into a single file with `process.env` calls replaced by their values.

- If you followed the initial standalone guide then you should have a `.env.localhost` configuration ready in the parent folder of this template.
- Run `npm run pack:middleware` from the root of this template or `npm run build` within the middleware module.
- If you wish to use another config file set `NETWORK` to a custom value and make sure `.env.{NETWORK}` file is present in the parent folder of this template. Example: `NETWORK=test npm run pack:middleware` to use `.env.test`.
- The build script will automatically put the middleware JS where the GameMaker extension will find it.

The JS middleware communicates with the GML game through the GML `PaimaMW` extension function which accepts the name of a middleware export (one of the fields of `export default endpoints` in `middleware/src/index.ts`) and returns a function that can be called with arguments normally. See the frontend GML code for examples. These JS endpoints are then responsible for performing network requests to read from the game node and write to the batcher.

![gm-flow](https://github.com/PaimaStudios/paima-game-templates/assets/2608559/81d3bfb6-2385-4092-9458-728fef411836)

# GameMaker IDE gameplay

Because the middleware is written in JS targeting browsers, you should use GameMaker's HTML5 export. This requires an account. After selecting the HTML5 export, "Build" > "Run" will build and host the export and open a browser pointing to it.

![Screenshot of selecting HTML5/JavaScript export](html5-export-screenshot.png)

# Command-line builds and deployment

Use `npm run build:frontend` (after packing middleware) to perform a command-line build. This requires having logged in to the GameMaker IDE in order to supply runtime and license files for the HTML5 export. The exported files will be placed in `frontend/gm_cli_build/` and can be treated as static files with no further server configuration.

Example: `python3 -m http.server -d frontend/gm_cli_build/ 51264`

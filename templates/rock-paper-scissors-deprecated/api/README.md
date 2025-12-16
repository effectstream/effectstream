# Webserver

This package implements the REST API that serves data from the game node database to the middleware (which is then used by the game frontend).

## How to run

This package uses [tsoa](https://github.com/lukeautry/tsoa) to generate type safe API endpoints.
`tsoa` requires a configuration file, `tsoa.json`. Every endpoint (called "controller" in `tsoa` convention) needs to be a single TypeScript file. To generate the endpoints, you must run the `tsoa` CLI. You can do that by running `npm run compile`.

The CLI will generate a `routes.ts` file, which exports a function called `RegisterRoutes`. The function takes an Express server as its sole argument. This package exports that function, to be imported by the game backend and passed to Paima Engine to run the server.

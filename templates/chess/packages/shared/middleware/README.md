# Middleware

The middleware is a bridge for your game which enables a frontend (ex. Unity, JS, etc.) to interact with your game node and the user's blockchain wallet.

## Compilation

Before building the middleware, make sure there is a `.env.localhost` file in the root's parent directory, or set the `NETWORK` variable to a value specifying a different config (see [root directory's `README.md`](/README.md) for details.). The default `.env.localhost` file is created during initialization process of the template.

To finally build the middleware, navigate to this directory and execute the build script:

```
cd middleware
npm install
npm run build
```

The compiled middleware will appear in the [packaged](./packaged/) directory.

If you want to deploy your game, we recommend using the `paimaMiddleware.js` which will work inside of browsers automatically. If you would like to do testing or import your generated middleware into an existing JS/TS project, we recommend using `middleware.js` (both have the same code, just different exports to support both use cases).

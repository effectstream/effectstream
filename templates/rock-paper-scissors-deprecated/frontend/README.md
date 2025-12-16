# Rock Paper Scissors Wars Frontend Game Template

Paima Game Template built with:
Phaser 3 https://phaser.io/phaser3
Typescript
Webpack
Typescript Paima-Middleware

## Installation

Install dependencies with `npm ci`

Tested with:
node v16.19.1
npm 8.19.3

## Prerequisites

Game Node running (database/game backend)
middleware located `./../middleware/`

## Env Setup:

.env.localhost or .env.mainnet must be in `./../../.env.name`

## Development

`npm run dev` to start the frontend game.
Changes to the `/src/**/*.ts` files will reload the browser.

## Production

`npm run prod` to build the game.
`/public` contains the public compiled files.

This template does not provide the file server.
But you can test it with http-server:
`npm install -g http-server && http-server ./public`

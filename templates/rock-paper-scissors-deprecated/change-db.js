const fs = require('fs');
const http = require('http');
const https = require('https');

// RPC command
const getBlockHeight = (url, command) =>
  new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify(command).length,
      },
    };

    const protocol = new URL(url).protocol;
    const lib = protocol === 'https:' ? https : http;
    const req = lib.request(url, options, response => {
      let result = '';
      response.on('data', chunk => (result += chunk));
      response.on('end', () => resolve(parseInt(JSON.parse(result).result.number, 16)));
    });
    req.on('error', err => reject(err));
    req.write(JSON.stringify(command));
    req.end();
  });

// Update .env START_BLOCKHEIGHT with latest value from RPC command: "eth_getBlockByNumber"
const updateEnvFile = async file => {
  const dataEnv = await fs.promises.readFile(__dirname + '/' + file, 'utf8');
  const url = dataEnv.match(/\nCHAIN_URI="(.+)"/)[1];
  if (!url) throw new Error('CHAIN_URI not found');
  const START_BLOCKHEIGHT = await getBlockHeight(url, {
    jsonrpc: '2.0',
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
    id: 1,
  });
  const ndataEnv = dataEnv.replace(
    /\nSTART_BLOCKHEIGHT="\d+"/,
    `\nSTART_BLOCKHEIGHT="${START_BLOCKHEIGHT}"`
  );
  await fs.promises.writeFile(file, ndataEnv, 'utf8');
};

// Update docker compose volume with unique new name.
const updateDockerFile = async file => {
  const data = await fs.promises.readFile(__dirname + '/' + file, 'utf8');
  const ndata = data.replace(
    /rockpaperscissors-.+?-db/g,
    'rockpaperscissors-' + new Date().getTime() + '-db'
  );
  await fs.promises.writeFile(file, ndata, 'utf8');
};

const start = async () => {
  await updateEnvFile(`../.env.${process.env.NETWORK ?? 'localhost'}`);
  await updateDockerFile('db/docker/docker-compose.yml');
};

start()
  .then()
  .catch(e => console.log('Error:', e));
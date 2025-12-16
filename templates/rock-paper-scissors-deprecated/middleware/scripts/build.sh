set -eu

cd ..
npm run build
cd middleware

DOTENV_CONFIG_PATH=../../.env.${NETWORK:-localhost} npx paima-build-middleware
echo "Finished Packaging"

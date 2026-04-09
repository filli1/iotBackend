module.exports = {
  apps: [
    {
      name: 'store-attention',
      script: './backend/src/index.ts',
      interpreter: './node_modules/.bin/tsx',
      node_args: '--env-file=backend/.env',
    },
  ],
}

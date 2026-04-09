module.exports = {
  apps: [
    {
      name: 'store-attention',
      script: './backend/src/index.ts',
      interpreter: './node_modules/.bin/tsx',
      interpreter_args: '--env-file=backend/.env',
    },
  ],
}

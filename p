oolflow/package.json{
  "name": "poolflow",
  "version": "0.1.0",
  "private": true,
  "description": "PoolFlow - scheduling + SMS booking website for pool service operators (MVP v1)",
  "type": "commonjs",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "migrate": "node db/migrate.js",
    "seed": "node db/seed.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  }
}

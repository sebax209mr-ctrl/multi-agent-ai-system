'use strict';

// npm run migrate
require('dotenv').config();

const { migrate, DB_FILE } = require('./index');

migrate();
console.log('[poolflow] schema applied to ' + DB_FILE);


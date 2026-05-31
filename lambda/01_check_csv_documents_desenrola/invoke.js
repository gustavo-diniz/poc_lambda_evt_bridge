'use strict';

require('dotenv').config();

const { handler } = require('./src/index');

console.log('Invocando Lambda 1 — csv-reader...\n');

handler()
  .then(() => console.log('\nLambda 1 finalizado.'))
  .catch((err) => console.error('\nErro:', err));

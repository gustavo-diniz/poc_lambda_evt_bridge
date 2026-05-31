'use strict';

require('dotenv').config();

const { handler } = require('./src/index');

console.log('Invocando Lambda 02 FGO — fgo-csv-reader...\n');

handler()
  .then(() => console.log('\nLambda 02 FGO finalizado.'))
  .catch((err) => console.error('\nErro:', err));

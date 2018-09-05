'use strict';

const path = require('path');

// Allows for environment variables to be set using a .env file
console.warn("reading .env file");
require('dotenv').config({
  silent: true,
  path: path.join(__dirname, '.env')
});
console.warn(process.env);
// If no NODE_ENV was specified, we are in development
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

console.log('Loading ' + process.env.NODE_ENV + ' configuration');
module.exports = require('./config/env/' + process.env.NODE_ENV);

'use strict';
// Requiring collections-online and loading configuration
const co = require('./collections-online');
co.config(__dirname);
// Register collections-online plugins
require('./plugins').register();

// Creating an express app
const express = require('express');
const app = express();

co.initialize(app).then(() => {
  require('./routes')(app);
  co.registerRoutes(app);
  co.registerErrors(app);
}).then(null, console.error);

'use strict';

const index = require('collections-online-cumulus/controllers/index');

module.exports = function (app) {
  app.post('/index/asset', index.asset);
};

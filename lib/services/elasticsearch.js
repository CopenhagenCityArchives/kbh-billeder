'use strict';

var elasticsearch = require('elasticsearch');
var config = require('../config');
var Q = require('q');
var Agent = require('agentkeepalive');

var es = new elasticsearch.Client({
  host: config.es.host,
  createNodeAgent(connection, config) {
    return new Agent(connection.makeAgentConfig(config));
  }
});

es.scrollSearch = function(body, hitCallback) {
  return this.search({
    index: config.es.assetsIndex,
    scroll: '30s', // Set to 30 seconds because we are calling right back
    size: 1000,
    body: body
  }).then(function getMoreUntilDone(response) {
    // If we are still getting hits - let's iterate over them.
    if (response.hits.hits.length > 0) {
      return response.hits.hits.map(hitCallback).reduce(Q.when, null)
      .then(function() {
        // Next scroll page please.
        var scrollId = response._scroll_id;
        return es.scroll({
          scrollId: scrollId,
          scroll: '30s'
        }).then(getMoreUntilDone);
      });
    }
  });
};

module.exports = es;
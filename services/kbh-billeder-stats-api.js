'use strict';
const request = require('request');
const config = require('collections-online/shared/config');
const assert = require('assert');
const mailgun = require('collections-online/lib/services/mailgun');
const _ = require('lodash');
const NodeCache = require('node-cache');

// Pull in configuration and verify that all required values are present.
const {baseUrl, fallbackEmailTo, fallbackEmailFrom, cacheTTL, cacheTTLCheck} = config.kbhBillederStatsApi;
assert.ok(baseUrl, 'KBH Billeder stat api url');
assert.ok(fallbackEmailTo, 'Fallback email to undefined');
assert.ok(fallbackEmailFrom, 'Fallback email from undefined');

const responsecache = new NodeCache({stdTTL: cacheTTL, checkperiod: cacheTTLCheck});

// Setup urls for each endpoint.
const URL_TAGS = baseUrl + '/tags';
const URL_GEOLOCATIONS = baseUrl + '/geolocations';
const URL_USERS_POINTS = baseUrl + '/users/points';
const URL_USERS = baseUrl + '/users';

// The API integration.
const kbhStatsApi = {
  // Current score for the user.
  userPoints: function(id) {
    return this._doGet(`${URL_USERS}/${id}/points`).then(result => {
      return result.points;
    });
  },

  // Number of tags on assets.
  // Expected response structure:
  // {
  //   "geolocations": {
  //     "geolocations": 1,
  //     "assets": 1
  //   },
  //   "tags": {
  //     "tags": 9,
  //     "assets": 9
  //   },
  //   "totalAssets": 10
  // }
  userStats: function(id) {
    // Path: /users/{id}
    return this._doGet(URL_USERS + '/' + id).then(function(result) {
      // We go a bit defensive and ensure that the entrie structure is always
      // returned.
      return {
        geolocations: {
          geolocations: (result.geolocations && result.geolocations.geolocations) || 0,
          assets: (result.geolocations && result.geolocations.assets) || 0,
        },
        tags: {
          tags: (result.tags && result.tags.tags) || 0,
          assets:  (result.tags && result.tags.assets) || 0,
        },
        totalAssets: result.totalAssets || 0,
      };
    });
  },

  allUsersPoints: function(timespan = 'all', limit = 10) {
    return this._doGet(URL_USERS_POINTS, {'timespan': timespan, 'limit': limit}).then((data) => {
      return _.chain(data).sortBy('points').reverse().value();
    }, () => {return []});
  },

  motifTags: function(timespan = 'all') {
    return this._doGet(URL_TAGS, {'type': 'tag', 'timespan': timespan});
  },

  geotags: function(timespan = 'all') {
    return this._doGet(URL_TAGS, {'type': 'geolocation', 'timespan': timespan});
  },

  // Store a user-submitted geotag.
  saveGeoTag: function(metadata) {
    const id = metadata.id;
    const collection = metadata.collection;
    const assetId = collection + '-' + id;
    const userId = metadata.userId;
    const latitude = metadata.latitude;
    const longitude = metadata.longitude;
    const heading = metadata.heading;

    return this._doPost(URL_GEOLOCATIONS, {
      'user_id': userId,
      'asset_id': assetId,
      'geolocation': {
        'latitude': latitude,
        'longitude': longitude,
        'direction': heading
      }
    }).then(() => {
      // Log success.
      console.log('Reported geotag on asset ' + assetId + ' for user ' + userId);
      // Successive entries in the promise-chain expects the metadata to passed
      // along.
      return metadata;
    }, () => {
      // Log error.
      console.error('Error while reporting geotag on asset ' + assetId + ' for user ' + userId);
    });
  },

  // Store a number of tags for a user on a asset.
  saveTags: function({id, collection, userTags, userId}) {
    const assetId = collection + '-' + id;
    return this._doPost(URL_TAGS, {
      'user_id': userId,
      'asset_id': assetId,
      'tags': userTags,
    }).then(() => {
      // Log success.
      console.log('Reported ' + userTags.length + ' tags on asset ' + assetId + ' for user ' + userId);
    }, () => {
      // Log error.
      console.error('Error while reporting ' + userTags.length + ' tags on asset ' + assetId + ' for user ' + userId);
    });
  },

  // Perform a GET request, returns a promise.
  _doGet: function(url, parameters = {})  {
    return new Promise((resolve, reject) => {
      const cacheKey = url + JSON.stringify(parameters);
      const cachedResponse = responsecache.get(cacheKey);
      if (cachedResponse !== undefined) {
        resolve(cachedResponse);
      } else {
        const callback = (error, response, body) => {
          if (error || (response.statusCode < 200 || response.statusCode > 299)) {
            const errorString = response.statusCode + ': ' + response.statusMessage;
            console.warn('Failed call to API ' + url);
            console.warn('Error: ' + errorString);
            console.warn('Response: ');
            console.log(response);
            reject(response.statusMessage);
          } else {
            const parsedBody = JSON.parse(body);
            responsecache.set(cacheKey, parsedBody);
            resolve(parsedBody);
          }
        };
        request(
          {
            'url': url,
            'qs': parameters,
          }, callback
        );

      }
    });
  },

  // Perform a POST request, returns a promise.
  _doPost: function(url, object)  {
    return new Promise((resolve, reject) => {
      console.log('Posting to ' + url);
      request.post(url, {form: object}, (error, response, body) => {
        if (error || (response.statusCode < 200 || response.statusCode > 299)) {
          const payload = JSON.stringify(object);
          const errorString = response.statusCode + ': ' + response.statusMessage;

          // Log the error.
          console.warn('Failed call to API ' + url);
          console.warn('Error: ' + errorString);
          console.warn('Payload: \n' + payload);

          // Send an error-mail.
          let mailBody = '';
          mailBody += 'Endpoint: ' + url + '<br>--<br>';
          mailBody += 'Response: ' + errorString + '<br>--<br>';
          mailBody += 'Response body: <br>' + body + '<br>--<br>';
          mailBody += 'Attempted Payload:<br>' + payload + '<br>--<br>';

          mailgun.sendMessage(fallbackEmailFrom, fallbackEmailTo, 'Failed API Request', mailBody);
          reject(response.statusMessage, body);
        } else {
          resolve(response, body);
        }
      });
    });
  },
};

// Perform an initial request to ensure we have connectivity.
kbhStatsApi.allUsersPoints().then(() => {
  console.log('API connectivity OK');
}, (err) => {
  console.log('Could not connect to the KBH Billeder Stats API error: ' + err);
});

module.exports = kbhStatsApi;
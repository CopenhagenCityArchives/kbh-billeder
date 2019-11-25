'use strict';

/**
 * This controller handles trigger requests from the Cumulus system that fires
 * when assets are updated, inserted or deleted.
 *
 * An example request is:
 *
 * req.body = {
 *   id: 'FHM-25757',
 *   action: 'asset-update',
 *   collection: 'Frihedsmuseet',
 *   apiKey: ''
 * }
 */

const ds = require('collections-online/lib/services/documents');
const config = require('collections-online/lib/config');
const es = require('collections-online/lib/services/elasticsearch');

if(!config.es || !config.es.index || typeof(config.es.index) !== 'string') {
  throw new Error('Need exactly one index for Cumulus triggers to work.');
}

const indexing = require('../indexing/modes/run');

var helpers = {
  thousandsSeparator: function(number) {
    return number.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1.');
  }
};

function createAsset(catalogAlias, assetId) {
  var state = {
    context: {
      index: config.es.index,
      geocoding: {
        enabled: true
      },
      vision: {
        enabled: true
      }
    },
    es: ds,
    mode: 'single',
    reference: catalogAlias + '/' + assetId
  };
  return indexing(state);
}

// Re-index an asset by retriving it from Cumulus and updating Elastic Search.
function updateAsset(catalogAlias, assetId) {
  var state = {
    context: {
      index: config.es.index,
      geocoding: {
        enabled: true
      }
    },
    es: ds,
    mode: 'single',
    reference: catalogAlias + '/' + assetId
  };
  return indexing(state);
}

// Update an already indexed asset with partial data providede by the caller.
function updateAssetsFromData(partials) {
  // Support both a single document and a list.
  if (!Array.isArray(partials)) {
    partials = [partials];
  }

  // Construct an array of bulk-updates. Each document update is prefixed with
  // an update action object.
  let items = [];
  partials.forEach((partial) => {
    const updateAction = {
      'update': {
        _index: config.es.index,
        _type: 'asset',
        '_id': partial.collection + '-' + partial.id
      }
    };
    items.push(updateAction);
    items.push({doc: partial});
  });

  const query = {
    body: items
  };

  return es.bulk(query).then(response => {
    const indexedIds = [];
    let errors = [];
    // Go through the items in the response and replace failures with errors
    // in the assets
    response.items.forEach(item => {
      if (item.update.status >= 200 && item.update.status < 300) {
        indexedIds.push(item.update._id);
      } else {
        // TODO: Consider using the AssetIndexingError instead
        errors.push(new Error('Failed update ' + item.update._id));
      }
    });
    console.log('Updated ', indexedIds.length, 'assets in ES');
    // Return the result
    return {errors, indexedIds};
  });
}

function deleteAsset(catalogAlias, assetId) {
  return ds.delete({
    index: config.es.index,
    type: 'asset',
    id: catalogAlias + '-' + assetId
  });
}

module.exports.asset = function(req, res, next) {
  const action = req.body.action || null;
  const catalogName = req.body.collection || null;
  let id = req.body.id || '';
  let catalogAlias = null;

  console.log('Index asset called with body: ', JSON.stringify(req.body));

  // If the catalog alias is not sat in the ID
  if(id.indexOf('-') > -1) {
    [catalogAlias, id] = id.split('-');
  } else if(catalogName) {
    // No slash in the id - the catalog should be read from .collection
    catalogAlias = Object.keys(config.cip.catalogs)
    .reduce(function(result, alias) {
      const candidateCatalogName = config.cip.catalogs[alias];
      if(candidateCatalogName === catalogName) {
        return alias;
      } else {
        return result;
      }
    }, null);
  }

  if (!catalogAlias) {
    throw new Error('Failed to determine catalog alias');
  }

  function success() {
    res.json({
      'success': true
    });
  }

  if (id && action) {
    if (action === 'asset-update') {
      updateAsset(catalogAlias, id).then(success, next);
    } else if (action === 'asset-create') {
      createAsset(catalogAlias, id).then(success, next);
    } else if (action === 'asset-delete') {
      deleteAsset(catalogAlias, id).then(success, next);
    } else {
      next(new Error('Unexpected action from Cumulus: ' + action));
    }
  } else {
    var requestBody = JSON.stringify(req.body);
    next(new Error('Missing an id or an action, requested: ' + requestBody));
  }
};

module.exports.createAsset = createAsset;
module.exports.updateAsset = updateAsset;
module.exports.updateAssetsFromData = updateAssetsFromData;
module.exports.deleteAsset = deleteAsset;

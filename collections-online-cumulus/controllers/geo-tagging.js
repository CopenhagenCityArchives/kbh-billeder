const assert = require('assert');

const cip = require('../services/cip');
const config = require('collections-online/lib/config');

if(config.features.geoTagging) {
  assert.ok(config.geoTagging, 'Expected a config.geoTagging');
  assert.ok(config.geoTagging.coordinatesField,
            'Expected config.geoTagging.coordinatesField');
  assert.ok(config.geoTagging.headingField,
            'Expected config.geoTagging.headingField');
}

const geoTagging = {
  save: metadata => {
    var values = {};

    assert.equal(typeof(metadata.latitude), 'number', 'Missing latitude');
    assert.equal(typeof(metadata.longitude), 'number', 'Missing longitude');

    // Heading is normalized to be either an actual heading or an explicit null
    // by the geo-tagging controller in collections-online. Only verify the
    // heading if it is non-null.
    if (metadata.heading !== null ) {
      assert.equal(typeof(metadata.heading), 'number', 'Missing nummeric heading');
    }

    const coordinates = [metadata.latitude, metadata.longitude];
    values[config.geoTagging.coordinatesField] = coordinates.join(', ');
    values[config.geoTagging.headingField] = metadata.heading;

    return cip.setFieldValues(metadata.collection, metadata.id, values)
    .then(function(response) {
      if (response.statusCode !== 200) {
        console.error(response.body);
        throw new Error('Failed to set the field values');
      } else {
        console.log('Saved geo-tag on asset: ' +
                    metadata.collection + '/' + metadata.id);
        return metadata;
      }
    })
  },
  // Update an asset in Elastic Search by retriving a fresh copy from Cumulus.
  updateIndex: metadata => {
    const indexController = require('./index');
    return indexController.updateAsset(metadata.collection, metadata.id)
    .then(response => {
      return metadata;
    });
  },
  // Update an asset in Elastic Search with data provided by caller.
  updateIndexFromData: metadata => {
    const indexController = require('./index');
    return indexController.updateAssetsFromData(metadata)
    .then(response => {
      return metadata;
    });
  }
};

module.exports = geoTagging;

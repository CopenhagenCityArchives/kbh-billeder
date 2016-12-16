'use strict';
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const config = require('./config');
const pug = require('./pug')(config);

const sectionPath = path.join('includes', 'section.pug');
const sectionTemplate = pug.compileFile(sectionPath);

module.exports = (type, helpers) => {
  if(helpers) {
    helpers = _.merge(require('./helpers.js'), helpers);
  } else {
    helpers = require('./helpers.js');
  }
  const layout = config.types[type].layout;
  // Find all sections used in the configuration
  const sections = layout.sections;
  var typesInConfiguration = _.flatten(
    Object.keys(sections).map((sectionName) => {
      var section = sections[sectionName];
      return section.rows.map((row) => {
        return row.type;
      });
    })
  );

  // Add the default single type and use only unique values
  var rowTypes = _.uniq(_.concat(['simple'], typesInConfiguration))
  .filter((rowType) => {
    return !!rowType; // Filter out undefined
  });

  // For every type a template should be compiled
  var templates = {};
  rowTypes.forEach((rowType) => {
    try {
      var relativePath = path.join('includes', 'row-types', rowType);
      templates[rowType] = pug.compileFile(relativePath);
    } catch(err) {
      console.error('Error compiling asset row type template: ', err);
    }
  });

  Object.keys(layout.sections).forEach((sectionName) => {
    var section = layout.sections[sectionName];

    section.hasValues = (options, metadata) => {
      return section.rows.reduce((result, row) => {
        return result || row.hasValue(options, metadata);
      }, false);
    };

    section.rows.forEach((row) => {
      if (!row.type) {
        row.type = 'simple';
      }

      // Compile any template for later use & injecting the helpers
      var template = pug.compile(row.template);
      row.template = row.template ? (options, metadata) => {
        var locals = {};
        _.assign(locals, metadata, options, helpers);
        return template(locals);
      } : null;

      row.render = (options, metadata) => {
        if(row.type in templates) {
          return templates[row.type]({
            row: row,
            options: options,
            metadata: metadata,
            helpers: helpers
          });
        } else {
          throw new Error('Missing a template for row type: ' + row.type);
        }
      };

      row.hasValue = (options, metadata) => {
        // The type map-coordinates should always be shown, if we want to show
        // call to actions
        // TODO: Move this to a less generic place.
        if (options.showCallToAction === true &&
            row.type === 'map-coordinates') {
          return true;
        }
        // If the rendered version of the row is different when given the
        // metadata, then we assume the row has a value.
        var withMetadata;
        var withoutMetadata;
        const ERROR_TOKEN = null;
        try {
          withMetadata = row.render(options, metadata);
        } catch (err) {
          console.warn('Error was thrown when rendering the template:', err);
          withMetadata = ERROR_TOKEN;
        }
        try {
          withoutMetadata = row.render(options, {});
        } catch (err) {
          withoutMetadata = ERROR_TOKEN;
        }
        return withMetadata !== withoutMetadata;
      };
    });
  });

  return (options) => {
    // Returns a function that renders the asset layout.
    return (sectionName, metadata) => {
      if(!sectionName || !(sectionName in layout.sections)) {
        throw new Error('Section named "' + sectionName + '" not configured');
      }
      // Returns the markup for the layout, rendering each of the sections.
      return sectionTemplate({
        section: layout.sections[sectionName],
        options: options,
        metadata: metadata
      });
    };
  };
};
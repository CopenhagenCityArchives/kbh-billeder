'use strict';

const fields = [
  'tags',
  'tags_vision'
]

module.exports = metadata => {
  fields.forEach(field => {
    const value = metadata[field];
    if(typeof(value) === 'string' && value !== '') {
      metadata[field] = value.split(',');
    } else {
      metadata[field] = [];
    }
  });
  return metadata;
};

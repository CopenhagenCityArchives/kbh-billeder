const config = require('collections-online/shared/config');

/**
 * This module generates queries that can be sent to elastic search
 * TODO: Move everything that is specific to the field names configurable
 */

module.exports = function(parameters) {
  var result = {};
  var query = {};

  var queries = [];

  // Start with any base query specified in the config
  if(config.search.baseQuery) {
    queries.push(config.search.baseQuery);
  }
  Object.keys(parameters.filters).forEach(function(field) {
    var filter = config.search.filters[field];
    if(filter) {
      if(filter.type === 'term') {
        var query = {
          terms: {}
        };
        query.terms[filter.field] = parameters.filters[field];
        queries.push(query);
      } else if(filter.type === 'date-range' ||
                filter.type === 'date-interval-range') {
        var intervalQueries = parameters.filters[field].map(function(interval) {
          var intervalSplit = interval.split('-');
          var range = {
            format: 'yyyy/MM/dd||yyy'
          };
          if(intervalSplit[0] && intervalSplit[0] !== '*') {
            range.gte = intervalSplit[0];
          }
          if(intervalSplit[1] && intervalSplit[1] !== '*') {
            if(intervalSplit[1].indexOf('/') === -1) {
              // intervalSplit[1] might be 1919 .. that is no slashes
              // Let's ask for dates less than the year+1, as ex '1919-02-01'
              // is not less than or equal to 1919 which is 1919-01-01
              range.lt = (parseInt(intervalSplit[1], 10) + 1).toString();
            } else {
              range.lt = intervalSplit[1];
            }
          }
          // Construct the query object
          if(filter.type === 'date-range') {
            var singlefieldRange = {
              range: {}
            };
            singlefieldRange.range[filter.field] = range;

            if (filter.range && filter.range.to && filter.range.from) {
              // Prepare an additional filter for the multifield range.
              var multifieldRange = {
                bool: {
                  must: [
                    {
                      range: {}
                    },
                    {
                      range: {}
                    }
                  ]
                }
              };

              // Fill in the field names.
              multifieldRange.bool.must[0].range[filter.range.from] = {
                gte: range.gte
              };
              multifieldRange.bool.must[1].range[filter.range.to] = {
                lt: range.lt
              };

              // Should give us something like.
              // {
              //   bool: {
              //     must: [
              //       {
              //         range: {
              //           'creation_time_from.year': {
              //             gte: 1940
              //           }
              //         }
              //       },
              //       {
              //         range: {
              //           'creation_time_to.year': {
              //             lt: 1950
              //           }
              //         }
              //       }
              //     ]
              //   }
              // };

              // Then combine the single-field singlefieldRange with the multifield, and
              // return that instead.
              var combinedQuery = {
                bool: {
                  should: [singlefieldRange, multifieldRange]
                }
              };

              return combinedQuery;
            } else {
              // Just return the single-field singlefieldRange.
              return singlefieldRange;
            }

          } else if(filter.type === 'date-interval-range') {

            if(!filter.fields || !filter.fields.from || !filter.fields.to) {
              throw new Error('Expected filter to have fields.from and .to');
            }
            // We query based on the follwing rules:

            // a | |       Excluded of as it's too old
            // b       | | Excluded of as it's too new
            // c   |   |   Included as the we are within the interval
            // d     ||    Included as the interval is enclosed
            // e |   |     Included as its not quarenteed that it's not too old
            // f     |  |  Included as its not quarenteed that it's not too new
            //      ^ ^
            //      A B

            var queries = [];
            // If the user has selected a lower bound
            if(range.gte) {
              var tooOldQuery = {
                range: {}
              };
              // It must be the case that the documents interval's to date is
              // after the selected lower bound
              tooOldQuery.range[filter.fields.to] = {
                gte: range.gte
              };
              queries.push(tooOldQuery);
            }
            if(range.lt) {
              var tooNewQuery = {
                range: {}
              };
              // It must be the case that the documents interval's from date is
              // before the selected upper bound
              tooNewQuery.range[filter.fields.from] = {
                lt: range.lt
              };
              queries.push(tooNewQuery);
            }
            return {
              bool: {
                must: queries
              }
            };
          }
        });

        queries.push({
          bool: {
            should: intervalQueries
          }
        });
      } else if(filter.type === 'querystring') {
        if(parameters.filters[field]) {
          queries.push({
            'query_string': {
              'query': parameters.filters[field],
              'default_operator': 'OR'
            }
          });
        }
      } else if(filter.type === 'geobounds') {
        if(parameters.filters[field]) {
          queries.push({
            "geo_bounding_box": {
              "location": parameters.filters[field]
            }
          });
        }
      } else if(filter.type === 'filters') {
        var sizeQueries = parameters.filters[field].map(function(size) {
          return filter.filters[size] || {};
        });
        if(sizeQueries.length > 0) {
          queries.push({
            bool: {
              should: sizeQueries
            }
          });
        }
      } else {
        console.error('Filtering on unexpected type of filter: ', filter.type);
      }
    } else {
      console.error('Requested filtering on an unexpected field: ', field);
    }
  });

  if(queries.length > 0) {
    query.bool = {
      must: queries
    };
  }

  if(parameters.sorting) {
    var sortOption = config.sortOptions[parameters.sorting];
    result.sort = sortOption.method;
  }

  if(Object.keys(query).length > 0) {
    result.query = query;
  }

  return result;
};

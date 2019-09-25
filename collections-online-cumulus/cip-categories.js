'use strict';

const cip = require('./services/cip');
const Q = require('q');
const config = require('collections-online/lib/config');
const ds = require('collections-online/lib/services/documents');

function Categories(tree) {
  this.getPath = function(x) {
    function traverse(tree, path) {
      path.push(tree);

      if (tree.id === x) {
        return path;
      }

      for (var i = 0; i < tree.children.length; ++i) {
        var result = traverse(tree.children[i], path.slice(0));

        if (result !== null) {
          return result;
        }
      }

      return null;
    }

    return traverse(this.tree, []);
  };

  this.getNode = function(x) {
    function traverse(tree) {
      if (tree.id === x) {
        return tree;
      }

      for (var i = 0; i < tree.children.length; ++i) {
        var result = traverse(tree.children[i]);

        if (result !== null) {
          return result;
        }
      }

      return null;
    }

    return traverse(this.tree);
  };

  this.dumpTree = function(tree) {
    console.log(tree.id + ':' + tree.name);
    for (var i = 0; i < tree.children.length; ++i) {
      this.dumpTree(tree.children[i]);
    }
  };

  this.buildTree = function(tree) {
    // If the category id is in the blacklist, just return null.
    if (config.categoryBlacklist.indexOf(tree.id) !== -1) {
      return null;
    }
    var name = tree['Category Name'] || tree['CategoryName'];

    var result = {
      id: tree.id,
      name: name,
      children: []
    };

    if (!tree.hassubcategories) {
      return result;
    }

    for (var i = 0; i < tree.subcategories.length; ++i) {
      var subcategories = this.buildTree(tree.subcategories[i]);
      if (subcategories !== null) {
        result.children.push(subcategories);
      }
    }

    return result;
  };

  this.tree = {};
  this.tree = this.buildTree(tree);
}

async function loadCategories() {
  if(config.cip.client.authMechanism !== 'http-basic') {
    await cip.initSession()
  }

  // Then - let's fetch some categories
  var catalogPromises = Object.keys(config.cip.catalogs).map((alias) => {
    response = await cip.request([
      'metadata',
      'getcategories',
      alias,
      'categories'
    ], {
      levels: 'all'
    })

    var categories = new Categories(response.body);
    categories.id = alias;
    return categories;
  });
  console.log('Fetching categories for', catalogPromises.length, 'catalogs.');

  result = await Q.allSettled(catalogPromises)

  var finalResult = [];

  for (var i = 0; i < result.length; ++i) {
    if (result[i].state === 'fulfilled') {
      finalResult.push(result[i].value);
    } else {
      console.error('Error fetching categories:', result[i].reason);
    }
  }
  console.log('Got categories for', finalResult.length, 'catalogs.');

  if (catalogPromises.length !== finalResult.length &&
      config.env !== 'development') {
    throw new Error('Could not load categories for all the catalogs.');
  }

  return finalResult;
}

exports.loadCategories = loadCategories;

function fetchCategoryCounts(esClient, catalogs) {

  function handleCategoryNode(categoryCounts, node) {
    var categoryCount = categoryCounts[node.id];
    if (categoryCount > 0) {
      node.count = categoryCount;
    } else {
      node.count = 0;
    }
    // Progress recursively ..
    for (var c in node.children) {
      handleCategoryNode(categoryCounts, node.children[c]);
    }
  }

  function handleEsAggregations(response) {
    var categoryCounts = {};
    var categoryAggregations = response.aggregations.catalog.categories.buckets;
    for (var f in categoryAggregations) {
      var categoryId = categoryAggregations[f].key;
      var categoryCount = categoryAggregations[f].doc_count;
      categoryCounts[categoryId] = categoryCount;
    }
    handleCategoryNode(categoryCounts, this.tree);
  }

  var promises = [];
  for (var c in catalogs) {
    var catalog = catalogs[c];
    var catalogAlias = catalog.id;

    var countPromise = esClient.search({
      index: config.types.asset.index,
      body: {
        'size': 0,
        'aggs': {
          'catalog': {
            'filter': {
              'and': [
                {'query': {'match': {'catalog': catalogAlias}}},
                {'query': {'match': {'is_searchable': true}}}
              ]
            },
            'aggs': {
              'categories': {
                'terms': {
                  'field': 'categories_int',
                  'size': 1000000000 // A very large number
                },
              }
            }
          }
        }
      }
    }).then(handleEsAggregations.bind(catalog));

    promises.push(countPromise);
  }

  // When all the facet searches for assets are ready.
  return Q.all(promises).then(function() {
    // Return the new catalogs with counts.
    return catalogs;
  });
}

exports.formatCategories = function(allCategories, categories) {
  var result = [];

  for (var c in categories) {
    var category = categories[c];
    if (category.path.indexOf('$Categories') === 0 && category.id !== 1) {
      result.push(allCategories.getPath(category.id));
    }
  }

  // Sort by lexicographical order of the concatinated names.
  result.sort(function(x, y) {
    if (x && y) {
      var xStr = x.map(function(value) { return value.name; }).join(':');
      var yStr = y.map(function(value) { return value.name; }).join(':');
      return xStr.localeCompare(yStr);
    }
  });

  return result;
};

exports.initialize = (app) => {
  var categories = {};

  return loadCategories().then(function(result) {
    for (var i = 0; i < result.length; ++i) {
      if (result[i] && result[i].id) {
        categories[result[i].id] = result[i];
      } else {
        console.error(result);
        throw new Error('Could not read id from the result of loadCategories');
      }
    }
    // Fetch the number of assets in the category.
    return fetchCategoryCounts(ds, categories)
    .then(function(categoriesWithCounts) {
      app.set('categories', categoriesWithCounts);
    });
  }).then(function() {
    return cip.getCatalogs().then(function(catalogs) {
      app.set('catalogs', catalogs);
    });
  });
};

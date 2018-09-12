/**
 * This module handles all clientside searching
 */

const config = require('collections-online/shared/config');
const helpers = require('../../../shared/helpers');

const MapController = require('map-controller');
require('./search-freetext-form');

const getSearchParams = require('./get-parameters');
const elasticsearchQueryBody = require('./es-query-body');
const elasticsearchAggregationsBody = require('./es-aggregations-body');
const generateQuerystring = require('./generate-querystring');
const resultsHeader = require('./results-header');
const sorting = require('./sorting');
const navigator = require('../document/navigator');

const templates = {
  searchResultItem: require('views/includes/search-results-item')
};

// How many assets should be loaded at once?
const PAGE_SIZE = 24;
module.exports.PAGE_SIZE = PAGE_SIZE;

let resultsDesired = PAGE_SIZE;
let resultsLoaded = [];
let resultsTotal = Number.MAX_SAFE_INTEGER;
let loadingResults = false;

// Controls whether we should fetch search-results for a map or a list.
let viewMode = 'list';

let elasticsearch = require('elasticsearch');
let es = new elasticsearch.Client({
  host: location.origin + '/api'
});

function initialize() {
  const $searchInput = $('.search-freetext-form__input');
  const $results = $('#results');
  // Button shown at the end of the list search result that triggers the load
  // of more results.
  const $loadMoreBtn = $('#load-more-btn');
  const $noResultsText = $('#no-results-text');

  function reset() {
    resultsLoaded = [];
    resultsTotal = Number.MAX_SAFE_INTEGER;
    resultsDesired = PAGE_SIZE;
    $(window).off('scroll');
    $loadMoreBtn.addClass('invisible');
  }

  /**
   * Perform a search and update the map or list.
   *
   * @param updateWidgets
   *   Whether this update should trigger refresh of the related widgets.
   *
   * @param indicateLoading
   *   Whether to show a overlay as the results are loading.
   *
   * @param searchParams
   *   Optional override search parameters.
   */
  function update(updateWidgets, indicateLoading, searchParams) {
    // If the indicateLoading is not set - default to true
    if(typeof(indicateLoading) === 'undefined') {
      indicateLoading = true;
    }

    // If we've not explicitly been passed searchParameters (which right now
    // only happens when the map calls us back after adding a geo bounding-
    // box), get it from the url, and see if we should have the mapcontroller
    // update it.
    if (!searchParams) {
      // Get search parameters from the url.
      searchParams = getSearchParams();

      // Let the map alter our search-parameters if they have not been
      // overridden and have it call us back with the update parameters.
      if (viewMode === 'map') {
        mapController.onUpdate(searchParams, function(updatedParams){
          update(updateWidgets, indicateLoading, updatedParams);
        });
        return;
      }
    }

    // Update the sort-menu in the filter-bar.
    sorting.update(searchParams);

    // Update the freetext search input, q contains the querystring.
    $searchInput.val(searchParams.filters.q);

    // Update the page title
    const title = helpers.generateSearchTitle(searchParams.filters);
    $('head title').text(title + ' - ' + config.siteTitle);
    loadingResults = true;

    // A fresh update is the first of potentially many updates with the same
    // search parameters.
    updateWidgets = resultsLoaded.length === 0 || updateWidgets;

    if(updateWidgets) {
      if(config.features.filterSidebar) {
        const sidebar = require('./filter-sidebar');
        // Update the sidebar right away, as we're going of doing async work
        // with searchParams, work on a clone.
        const clonedSearchParams = JSON.parse(JSON.stringify(searchParams));
        sidebar.update(clonedSearchParams.filters, null);
        // Get aggragations for the sidebar
        es.search({
          body: elasticsearchAggregationsBody(clonedSearchParams),
          size: 0
        }).then(function (response) {
          sidebar.update(clonedSearchParams.filters, response.aggregations);
        }, function (error) {
          console.trace(error.message);
        });
      }
    }


    let resultCallback = function (resultsTotal) {
      // Update the results header with the result
      if(updateWidgets) {
        resultsHeader.update(searchParams, resultsTotal);
        if(indicateLoading) {
          $('.search-results').removeClass('search-results--loading');
        }
      }
    };

    // Do search depending on current viewmode.
    if (viewMode === 'map') {
      // Generate the query body, this will inject a bounds filter if we added
      // one above.
      let queryBody = elasticsearchQueryBody(searchParams);

      // Let plugins modify the search body.
      if(typeof(helpers.modifySearchQueryBody) === 'function') {
        // If a modifySearchQueryBody helper is defined, call it
        queryBody = helpers.modifySearchQueryBody(queryBody, searchParams);
      }

      if (searchParams.geohash) {
        queryBody.aggregations = {
          'geohash_grid' : {
            'geohash_grid' : {
              'field' : 'location',
              'precision' : config.search.geohashPrecision
            }
          }
        };
      }

      const maxAssets = config.search.maxAssetMarkers;
      // We've configured our search, now setup the query and execute it.
      const searchObject = {
        body: queryBody,
        // We only want the aggregation so we don't care about the hits.
        size: searchParams.geohash ? 0 : maxAssets,
        _source: [
          'location',
          'longitude',
          'latitude',
          'collection',
          'id',
          'short_title',
          'type',
          'heading',
          'description'
        ],
      };

      // Make sure we persist, but replace state so that we don't end up in
      // the back/forward history.
      persistChangedParams(searchParams, true);

      es.search(searchObject).then(function (response) {
        resultsTotal = response.hits.total;
        loadingResults = false;
        mapController.onResults(response, searchParams);
      }, function (error) {
        console.trace(error.message);
      });
    } else if (viewMode === 'list') {
      if (updateWidgets) {
        // Start updating the results header
        resultsHeader.update(searchParams, resultsTotal);
        // Update the results header before the result comes in
        if(indicateLoading) {
          $('.search-results').addClass('search-results--loading');
        }
      }
      resultsTotal = updateList(searchParams, updateWidgets, resultCallback);
    }
  }

  /**
   * Update the search result list.
   */
  function updateList(searchParams, updateWidgets, resultCallback) {
    // Generate the query body
    let queryBody = elasticsearchQueryBody(searchParams);

    if(typeof(helpers.modifySearchQueryBody) === 'function') {
      // If a modifySearchQueryBody helper is defined, call it
      queryBody = helpers.modifySearchQueryBody(queryBody, searchParams);
    }

    const searchObject = {
      body: queryBody,
      from: resultsLoaded.length,
      _source: ['collection', 'id', 'short_title', 'type', 'description'],
      size: resultsDesired - resultsLoaded.length
    };

    // Pull in the search results.
    es.search(searchObject).then(function (response) {
      // If no results are loaded yet, it might be because we just called reset
      if(resultsLoaded.length === 0) {
        // Remove all search result items from $results, that might be there
        $results.find('.search-results-item').remove();
      }
      resultsTotal = response.hits.total;
      loadingResults = false;

      response.hits.hits.forEach(function(hit) {
        const item = {
          type: hit._type,
          metadata: hit._source
        };
        const markup = templates.searchResultItem(item);
        $results.append(markup);
        resultsLoaded.push(item);
      });

      // Save the results loaded in the session storage, so we can use them on
      // out other places.
      navigator.save({
        resultsLoaded, queryBody
      });

      // Replace the state of in the history if supported
      if(history.replaceState) {
        history.replaceState({
          resultsLoaded,
          resultsTotal
        }, null, null);
      }

      // Show some text if we don't have any results
      if (resultsTotal === 0) {
        $noResultsText.removeClass('hidden');
      } else {
        $noResultsText.addClass('hidden');
      }

      // If we have not loaded all available results, let's show the btn to load
      if(updateWidgets && resultsLoaded.length < resultsTotal) {
        $loadMoreBtn.removeClass('invisible');
      } else {
        $loadMoreBtn.addClass('invisible');
      }

      resultCallback(resultsTotal);
    }, function (error) {
      console.trace(error.message);
    });
  }

  /**
   * Store changed params into the browser history.
   *
   * @param searchParams
   *   The search params to persist.
   * @param replaceState
   *   Whether to replace state or push a new (the latter lets the browser move
   *   back and forth between states).
   */
  function persistChangedParams (searchParams, replaceState = false) {
    // Change the URL
    if (history) {
      reset();
      // Update the browser history and the url with our new parameters.

      var state = {searchParams: searchParams};
      var url = location.pathname + generateQuerystring(searchParams);
      if (replaceState) {
        history.replaceState(state, '', url);
      }
      else {
        history.pushState(state, '', url);
      }
    }
    else {
      throw new Error('History API is required');
    }
  }

  function enableEndlessScrolling() {
    $loadMoreBtn.addClass('invisible');
    $(window).on('scroll', function(e) {
      var $lastResult = $('#results .search-results-item:last-child');
      if($lastResult.length > 0) {
        var lastResultOffset = $lastResult.offset();
        var scrollTop = $(window).scrollTop();
        var scrollBottom = scrollTop + $(window).height();
        if(scrollBottom > lastResultOffset.top && !loadingResults) {
          resultsDesired += PAGE_SIZE;
          update();
        }
      }
    }).scroll();
  }

  /**
   * Check if the user has any relevant history data during init and use it.
   *
   * @param state
   *   The history.state.
   */
  function inflateHistoryState(state) {
    // Render results from the state
    if(state.resultsLoaded) {
      reset();
      // Remove all the search result items right away
      $results.find('.search-results-item').remove();

      // Append rendered markup, once per asset loaded from the state.
      resultsLoaded = state.resultsLoaded;
      resultsDesired = resultsLoaded.length;
      resultsLoaded.forEach(function(item) {
        var markup = templates.searchResultItem(item);
        $results.append(markup);
      });

      // Replace the resultsTotal from the state
      resultsTotal = state.resultsTotal;

      // Using the updateWidgets=true, updates the header as well
      // Using the indicateLoading=false makes sure the UI doesn't blink
      update(true, false);
    }
  }

  // When the user navigates the state, update it
  window.addEventListener('popstate', function(event) {
    inflateHistoryState(event.state);
  }, false);


  const searchControllerCallbacks = {
    // Allow the caller to refresh the current search-results.
    refresh: function() {
      update(true, false);
    },

    getCurrentSearchParameters: function (){
      return getSearchParams();
    },
  };

  // Get any initial parameters from the url and pass the relevant part to the
  // map.
  var options = {};

  // Set initial center if specified via config.
  if (config.geoTagging && config.geoTagging.initialCenter && config.geoTagging.initialCenter['lon'] && config.geoTagging.initialCenter['lat']) {
    options.initialCenter = [
      config.geoTagging.initialCenter['lon'],
      config.geoTagging.initialCenter['lat']
    ];
  }

  var searchParams = getSearchParams();
  if (searchParams.map) {
    options.mapInitParam = searchParams.map;
  }
  // Setup the map with a callback it can use when it needs a new search
  // triggered and a configuration for when we switch between hash and asset
  // search-results.
  const mapController = MapController(document.getElementById('map'), searchControllerCallbacks, options);

  // *** Register event handlers ***
  $('#sidebar, #sidebarmobile, #filters, #filtersmobile').on('click', '.btn', function() {
    var action = $(this).data('action');
    var field = $(this).data('field');
    var filter = config.search.filters[field];
    var value = $(this).data('value');
    if(!value && filter.type === 'date-interval-range') {
      var $form = $(this).closest('.form-group');
      var from = $form.find('[name='+field+'-from]').val() || '*';
      var to = $form.find('[name='+field+'-to]').val() || '*';
      if(from !== '*' || to !== '*') {
        value = from.replace(/-/g, '/') + '-' + to.replace(/-/g, '/');
      } else {
        return;
      }
    }
    var searchParams = getSearchParams();
    var filters = searchParams.filters;
    if(action === 'add-filter') {
      if(typeof(filters[field]) === 'object') {
        filters[field].push(value);
      } else {
        filters[field] = [value];
      }
      // Store changed parameters and trigger a search.
      persistChangedParams(searchParams);
      update();
    } else if(action === 'remove-filter') {
      if(typeof(filters[field]) === 'object') {
        filters[field] = filters[field].filter(function(v) {
          return v !== value;
        });
      } else {
        delete filters[field];
      }
      // Store changed parameters and trigger a search.
      persistChangedParams(searchParams);
      update();
    }
  });

  $('#sorting-menu').on('click', '.dropdown__options a', function() {
    var sorting = $(this).data('value');
    var searchParams = getSearchParams();
    searchParams.sorting = sorting;
    // Store changed parameters and trigger a search.
    persistChangedParams(searchParams);
    update();
  });

  // Enabled the load-more button
  $loadMoreBtn.on('click', function() {
    enableEndlessScrolling();
  });

  // Toggle filtersection visibility on mobile
  $('#sidebar, #sidebarmobile').on('click', '[data-action="show-filters"]', function() {
    var filterSection = $(this).data('id') + '-filters';
    var $filterSection = $('[data-id="' + filterSection + '"]');
    var wasExpanded = $(this).hasClass('expanded');
    var visibleClass = 'search-filter-sidebar__filters--expanded';

    if (!wasExpanded) {
      $(this).addClass('expanded');
      $filterSection.addClass(visibleClass);
    } else {
      $(this).removeClass('expanded');
      $filterSection.removeClass(visibleClass);
    }
  });

  // Toggle filterbar menus
  $('.filterbar--mobile__button--filters').on('click', function() {
    $('body').addClass('has-filter-open');
  });

  $('.filterbar--mobile__button--close').on('click', function() {
    $('body').removeClass('has-filter-open');
  });

  // When the view-mode is changed by the view-mode selector (view-mode.js),
  // store the new value and trigger a search update.
  $('body').on('search:viewModeChanged', function(e, eventViewMode) {
    viewMode = eventViewMode;
    $('body').trigger('search:update');
  });

  // Let anyone with access to the body element trigger search-updates.
  $('body').on('search:update', function() {
    update(true, true);
  });

  $('.search-filter-sidebar__tab').on('click', '[data-action="show-filterbar-menu"]', function() {
    var wasExpanded = $(this).hasClass('expanded');
    var $parentItem = $(this).closest('.filterbar__item');
    var $filterbar = $(this).closest('.filterbar');

    $filterbar.find('.filterbar__menu').hide();
    $filterbar.find('.expanded').each(function() {
      $(this).removeClass('expanded');
    });

    if (!wasExpanded) {
      $(this).addClass('expanded');
      $parentItem.find('.filterbar__tab').addClass('expanded');
      $parentItem.find('.filterbar__menu').show();
    } else {
      $(this).removeClass('expanded');
      $parentItem.find('.filterbar__tab').removeClass('expanded');
      $parentItem.find('.filterbar__menu').hide();
    }
  });

  // Take control over the search form.
  $searchInput.closest('form').submit(function(e) {
    e.preventDefault();
    var queryString = $searchInput.val() || '';
    var searchParams = getSearchParams();
    searchParams.filters.q = queryString;
    // Store changed parameters and trigger a search.
    persistChangedParams(searchParams);
    update();
  });

  const currentParams = getSearchParams();
  if (currentParams.map) {
    // If the url contains a map parameter, set us in map mode.
    $('body').trigger('search:viewModeChanged', ['map']);
  } else {
    // Default view-mode, so no need to switch, just go ahead and do a search.
    update();
  }
}

// If the path is right - let's initialize
if(decodeURIComponent(location.pathname) === '/' + config.search.path) {
  $(initialize);
}

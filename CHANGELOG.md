# Changelog

This is where we capture breaking changes

## October 2016

- Removed bootstrap as a direct dependency of collections-online and added it as
  a peer dependency instead. I.e. packages that depends on collections-online
  need to depend on the 'bootstrap-sass' in the specified version.

## September 2016

- Removed size properties from the .box class on search results (add bootstrap col classes instead)
- Removed the "enableGeotagging" config parameter, use "features.geotagging" instead.
- Moved favicons (apart from favicon.ico) from root to images/favicons
$('[data-content="asset-download"] .btn').on('click', function(){
  var href = $(this).attr('href');
  var hrefArray = href.split("/");
  var size = hrefArray[hrefArray.length-1];
  var id = $('.asset').data('id');
  var catalog = $('.asset').data('catalog');
  var catalogIdSize = catalog + '-' + id + '-' + size;
  ga('send', 'event', 'asset', 'download', catalogIdSize);
});

$('.search-box').submit(function() {
  var text = $('.search-box input').val();
  ga('send', 'event', 'search', 'text', text);
});

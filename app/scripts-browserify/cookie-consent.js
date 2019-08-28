const config = require('collections-online/shared/config');
require('cookieconsent/build/cookieconsent.min.js');

// We're using http://cookieconsent.wpengine.com/documentation/javascript-api/

window.cookieconsent.initialise({
  cookie: {
    name: 'cookie-consented'
  },
  content: {
    message: 'Vi bruger cookies for at give dig en bedre brugeroplevelse.',
    ok: 'OK',
    link: 'Læs mere om vores cookiepolitik',
    href: '/cookies',
  },
  elements: {
    dismiss: '<a aria-label="Ok til cookies" tabindex="0" class="cc-btn cc-dismiss">{{ok}}</a>',
    messagelink: '<span id="cookieconsent:desc">{{message}} <a href="{{href}}">{{link}}</a></span>',
  }
});

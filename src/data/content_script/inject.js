/* globals self */
'use strict';

var xul = (function () {
  var onCommand = (function () {
    var id;
    return function () {
      if (id) {
        return;
      }
      this.style['transition-duration'] = '0.8s';
      this.style.transform = 'rotate(360deg)';
      id = window.setTimeout(function (image) {
        image.style['transition-duration'] = '0s';
        image.style.transform = 'rotate(0deg)';
        id = null;
        self.port.emit('image');
      }, 800, this);
    };
  })();

  function onMouseEnter () {
    xul.container.classList.remove('nochrome');
  }
  function onMouseLeave () {
    xul.container.classList.add('nochrome');
  }

  return {
    get html () {
      return document.documentElement;
    },
    get panel () {
      return document.getElementById('newtab-customize-panel');
    },
    get body () {
      return document.getElementById('newtab-scrollbox');
    },
    get container () {
      return document.getElementById('artworks-container');
    },
    get title () {
      return document.querySelector('#artworks-container a[type=title]');
    },
    get creator () {
      return document.querySelector('#artworks-container a[type=creator]');
    },
    get attribution () {
      return document.querySelector('#artworks-container a[type=attribution]');
    },
    get image () {
      return document.querySelector('#artworks-container image');
    },

    isBlank: function () {
      var hbox = [].filter.call(xul.panel.querySelectorAll('hbox'), function (hbox) {
        return hbox.getAttribute('selected') === 'true';
      });
      if (hbox.length && hbox[0].id === 'newtab-customize-blank') {
        return true;
      }
      else {
        return false;
      }
    },
    insert: function (callback) {
      if (xul.container) {
        callback(true);
      }
      else {
        document.loadOverlay(self.options.overlay, {
          observe: function () {
            callback(false);
          }
        });
      }
    },
    fill: function (obj) {
      if (xul.title) {
        xul.title.textContent = obj.title;
        xul.title.setAttribute(
          'href',
          'https://www.google.com/culturalinstitute/' + obj.link + '?utm_source=firefox_extension'
        );
      }
      if (xul.creator) {
        xul.creator.setAttribute('href', 'https://www.google.com/search?q=' + obj.creator);
        xul.creator.textContent = obj.creator;
      }
      if (xul.attribution) {
        xul.attribution.setAttribute(
          'href',
          'https://www.google.com/culturalinstitute/' + obj.attribution_link + '?utm_source=firefox_extension'
        );
        xul.attribution.textContent = obj.attribution;
      }
    },
    observe: function (callback) {
      xul.panel.addEventListener('click', callback);
    },
    addEventListeners: function () {
      xul.image.addEventListener('click', onCommand, false);
      xul.html.addEventListener('mouseenter', onMouseEnter, false);
      xul.html.addEventListener('mouseleave', onMouseLeave, false);
    },
    cleanup: function () {
      if (xul.image) {
        xul.image.removeEventListener('click', onCommand, false);
      }
      if (xul.body) {
        xul.body.removeEventListener('mouseenter', onMouseEnter, false);
        xul.body.removeEventListener('mouseleave', onMouseLeave, false);
        xul.body.style['background-image'] = 'none';
      }
      if (xul.container) {
        xul.container.parentNode.removeChild(xul.container);
      }
    },
  };
})();

self.port.on('image', function (obj) {
  if (xul.body && xul.isBlank()) {
    xul.body.style['background-image'] = 'url(' + obj.path + ')';
    xul.insert(function (old) {
      xul.fill(obj);
      xul.container.style.display = 'block';
      if (!old) {
        xul.addEventListeners();
      }
    });
  }
});

function check () {
  if (xul.isBlank()) {
    self.port.emit('image');
  }
  else {
    xul.body.style['background-image'] = 'none';
    if (xul.container) {
      xul.container.style.display = 'none';
    }
  }
}
xul.observe(check);
check();

self.port.on('detach', function () {
  xul.cleanup();
});

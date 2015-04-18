'use strict';

var tabs = require('sdk/tabs');
var self = require('sdk/self');
var timers = require('sdk/timers');
var xhr = require('sdk/net/xhr');
var userstyles = require('./userstyles');
var hiddenWindow = require('sdk/window/utils').getHiddenWindow();
var data = self.data;
var sp = require('sdk/simple-prefs');
var prefs = sp.prefs;
var prefsService = require('sdk/preferences/service');
var {defer, resolve, reject} = require('sdk/core/promise');
var {components, Cc, Ci, Cu} = require('chrome');
var {on, off, once, emit} = require('sdk/event/core');
var {FileUtils} = Cu.import('resource://gre/modules/FileUtils.jsm');
var {NetUtil} = Cu.import('resource://gre/modules/NetUtil.jsm');
var {Services} = Cu.import('resource://gre/modules/Services.jsm');

userstyles.load(data.url('content_script/inject.css'));

var app = {
  collections: (function () {
    var dataset = {
      a: JSON.parse(prefs.a || '[]'),
      b: JSON.parse(prefs.b || '[]')
    };
    return {
      read: function (id) {
        return dataset[id];
      },
      write: function (id, arr) {
        arr = arr.filter((a, i, l) => l.indexOf(a) === i);
        dataset[id] = arr;
        prefs[id] = JSON.stringify(arr);
      }
    };
  })(),
  storage: {
    read: function (id) {
      return (prefs[id] || prefs[id] + '' === 'false' || !isNaN(prefs[id])) ? (prefs[id] + '') : null;
    },
    write: function (id, data) {
      data = data + '';
      if (data === 'true' || data === 'false') {
        prefs[id] = data === 'true' ? true : false;
      }
      else if (parseInt(data) + '' === data) {
        prefs[id] = parseInt(data);
      }
      else {
        prefs[id] = data + '';
      }
    }
  },
  get: function (url, isBinary) {
    var d = defer();
    var req = new xhr.XMLHttpRequest();
    req.open('get', url);
    if (isBinary) {
      req.responseType = 'arraybuffer';
    }
    req.onreadystatechange = function () {
      if (req.readyState === 4) {
        if (req.status === 200) {
          d.resolve(req);
        }
        else {
          d.reject(req)
        }
      }
    };
    req.send();
    return d.promise;
  }
};
app.on = on.bind(null, app);
app.once = once.bind(null, app);
app.emit = emit.bind(null, app);
app.removeListener = function removeListener (type, listener) {
  off(app, type, listener);
};

var imax = (function () {
  var cache;
  return function () {
    if (cache) {
      return resolve(cache);
    }
    return app.get(data.url('assets/imax.json')).then(function (req) {
      var json = JSON.parse(req.responseText);
      cache = json;
      return json;
    });
  };
})();

var file = {
  read: function (name) {
    let f = FileUtils.getFile('ProfD', ['artworks', name]);
    if (f.exists()) {
      return resolve(Services.io.newFileURI(f).spec);
    }
    else {
      return reject();
    }
  },
  write(name, content) {
    var d = defer();
    var f = FileUtils.getFile('ProfD', ['artworks', name]);
    var ostream = FileUtils.openSafeFileOutputStream(f);
    var istream = Cc['@mozilla.org/io/arraybuffer-input-stream;1']
      .createInstance(Ci.nsIArrayBufferInputStream);
    istream.setData(content, 0, content.byteLength);
    var bstream = Cc['@mozilla.org/binaryinputstream;1']
      .createInstance(Ci.nsIBinaryInputStream);
    bstream.setInputStream(istream);
    NetUtil.asyncCopy(bstream, ostream, function (status) {
      if (!components.isSuccessCode(status)) {
        d.reject();
        return;
      }
      d.resolve(Services.io.newFileURI(f).spec);
    });
    return d.promise;
  }
};

function get (id) {
  return imax().then(function (json) {
    var obj = json[id];
    return file.read(obj.link.split('/')[1] + '.png').then(
      function (path) {
        obj.path = path;
        return obj;
      },
      function () {
        return app.get(obj.image + '=s1200', true).then(
          function (req) {
            var arrayBuffer = req.response;
            return file.write(obj.link.split('/')[1] + '.png', arrayBuffer).then(function (path) {
              obj.path = path;
              return obj;
            });
          }
        );
      }
    );
  });
}

function inject (tab) {
  var worker = tab.attach({
    contentScriptFile: data.url('content_script/inject.js'),
    contentStyleFile: data.url('content_script/inject.css'),
    contentScriptOptions: {
      overlay: data.url('content_script/overlay.xul')
    }
  });
  worker.port.on('image', function () {
    var index;
    var a = app.collections.read('a');
    var b = app.collections.read('b');

    function getIndex () {
      return Math.floor(Math.random() * 95);
    }
    function getNewIndex () {
      if (a.length === 94) {  // already got all images
        return;
      }
      var index = getIndex();
      while (a.indexOf(index) !== -1 || b.indexOf(index) !== -1) {
        index = getIndex();
      }
      return index;
    }
    // get an item from not-shown but downloaded list
    if (app.collections.read('b').length) {
      index = b.shift();
      app.collections.write('b', b);
      app.emit('store', getNewIndex());
      //console.error('from not-shown list', index, 'Number of not-shown left', b.length);
    }
    // get an item randomly from shown list
    else if (app.collections.read('a').length) {
      index = a[Math.floor(Math.random() * a.length)];
      app.emit('store', getNewIndex());
      //console.error('from shown', index, 'Number of shown list', a.length);
    }
    else {
      index = getNewIndex();
      //console.error('from web', index);
    }

    get(index).then(function (obj) {
      a.push(index);
      app.collections.write('a', a);
      worker.port.emit('image', obj);
    }).catch(function (e) {
      //console.error('failed to fetch a new image/1', e);
    });
  });
}
app.on('store', function (index) {
  if (!index) {
    //console.error('noting more to get!');
    return;
  }
  get(index).then(function () {
    //console.error('storing image for later use', index);
    var b = app.collections.read('b');
    b.push(index);
    app.collections.write('b', b);
  }).catch(function (e) {
    //console.error('failed to fetch a new image/2', e);
  });
});

tabs.on('open', function (tab) {
  if (tab.url === 'about:newtab') {
    inject(tab);
  }
});
tabs.on('ready', function (tab) {
  if (tab.url === 'about:newtab') {
    inject(tab);
  }
});
for (let tab of tabs) {
  if (tab.url === 'about:newtab') {
    inject(tab);
  }
}

exports.main = function (options) {
  if (options.loadReason === 'install' || options.loadReason === 'enable') {
    prefsService.set('browser.newtabpage.enabled', false);
  }
  if (options.loadReason === 'install') {
    // storing two items after first install
    app.emit('store', 1);
    timers.setTimeout(function () {
      app.emit('store', 15);
    }, 2000);
  }
}
exports.onUnload = function (reason) {
  if (reason === 'uninstall' || reason === 'disable') {
    prefsService.reset('browser.newtabpage.enabled');
  }
}

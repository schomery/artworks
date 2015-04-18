/* globals self */
'use strict';

self.port.on('dataURL', function (url) {
  var img = new Image();
  img.onload = function () {
    var canvas = document.querySelector('canvas');
    canvas.width = this.width;
    canvas.height = this.height;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(this, 0, 0);

    var dataURL = canvas.toDataURL('image/png');
    self.port.emit('dataURL', dataURL);
  };
  img.src = url + '=s1200';
});

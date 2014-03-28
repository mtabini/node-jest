'use strict';

var assert = require('assert');
var Q = require('q');
var util = require('util');


var Request = function JestServerRequest (socket, line) {
  this.socket = socket;
  this.line = line;
  this.id = null;
  this.startTime = this.lastTime = process.hrtime();
  this.timers = [];
};

Request.prototype.time = function(name) {
  var lastTime = process.hrtime(this.lastTime);
  this.timers.push([{ name : name , time : ~~((lastTime[0] * 1e9 + lastTime[1]) / 1000) }]);
  this.lastTime = process.hrtime();
}

Request.prototype.computeTimes = function() {
  var totalTime = process.hrtime(this.startTime);

  return {
    total: ~~((totalTime[0] * 1e9 + totalTime[1]) / 1000),
    steps: this.timers
  };
}

Request.prototype.error = function(err) {
  var socket = this.socket;

  socket.server.emit('jestError', err, this.computeTimes(), socket._jestContext, this.id);

  socket.write(JSON.stringify({
    result : null,
    error : err.toString(),
    id : this.id
  }));
  socket.write('\n');
};

Request.prototype.result = function(payload) {
  var socket = this.socket;

  socket.write(JSON.stringify({
    result : payload,
    error : null,
    id : this.id
  }));
  socket.write('\n');

  if (this.method) {
    socket.server.emit('jestAudit', this.method, this.params, payload, this.computeTimes(), socket._jestContext, this.id);
  }
};

Request.prototype.auth = function() {
  var self = this;
  var socket = this.socket;

  Q.fcall(function() {
    var data = JSON.parse(self.line);
    self.id = data.id;

    assert(data.auth, 'This server requires authentication (the `auth` property is missing). ');

    self.time('parse');

    return [data.auth];
  })

  .then(function(authData) {
    switch (socket.server.auth.length) {
      case 1:
        return socket.server.auth(authData);

      case 2:
        return Q.denodeify(socket.server.auth)(authData);

      default:
        throw new Error('The auth handler must take exactly one or two arguments.');
    }
  })

  .then(function(context) {
    self.time('auth');

    socket._jestContext = context;
    socket._jestAuth = true;
    socket._readline.on('line', performRequest.bind(void 0, socket));

    self.result({ api : socket.server._jestDescriptions });
  })

  .fail(function(err) {
    self.time('error');

    self.error(err);
    socket.end();
  })

  .done();
};

Request.prototype.perform = function() {
  var self = this;

  Q.fcall(function() {
    var data = JSON.parse(self.line);

    assert(data.method, 'Missing `method` property.');

    self.id = data.id;
    self.method = data.method;
    self.params = data.params;

    var handler = self.socket.server._jestRoutes[data.method];

    assert(handler, 'Unknown method `' + data.method + '`');
    assert(util.isArray(self.params), 'The `params` property must be an array.');

    self.time('parse');

    return handler(data.params, self.socket._jestContext);
  })

  .then(function(result) {
    self.time('process');

    if (self.id) {
      self.result(result);
    }
  })

  .fail(function(err) {
    self.time('error');

    self.error(err);
  })

  .done();
};

function handleAuth (socket, line) {
  new Request(socket, line).auth();
}

function performRequest (socket, line) {
  new Request(socket, line).perform();
}

module.exports = {
  auth : handleAuth,
  perform : performRequest
};
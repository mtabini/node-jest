'use strict';

var assert = require('assert');
var Q = require('q');
var util = require('util');


var Request = function JestServerRequest (socket, line) {
  this.socket = socket;
  this.line = line;
  this.id = null;
  this.lastTime = process.hrtime();
  this.timers = [{ name : 'start' , time : this.lastTime[0] * 1e9 + this.lastTime[1] }];
};

Request.prototype.error = function(err) {
  var socket = this.socket;

  socket.server.emit('jestError', err, this.timers, socket._jestContext, this.id);

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
    var lastTime = process.hrtime();
    this.timers.push({ name : 'end' , time : lastTime[0] * 1e9 + lastTime[1] });

    socket.server.emit('jestAudit', this.method, this.params, payload, this.timers, socket._jestContext, this.id);
  }
};

Request.prototype.auth = function() {
  var self = this;
  var socket = this.socket;

  Q.fcall(function() {
    var data = JSON.parse(self.line);
    self.id = data.id;

    assert(data.auth, 'This server requires authentication (the `auth` property is missing). ');

    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'parse' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

    return [data.auth];
  })

  .then(socket.server.auth)

  .then(function(context) {
    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'auth' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

    socket._jestContext = context;
    socket._jestAuth = true;
    socket._readline.on('line', performRequest.bind(void 0, socket));

    self.result({ api : socket.server._jestDescriptions });
  })

  .fail(function(err) {
    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'error' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

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

    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'parse' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

    return handler(data.params, self.socket._jestContext);
  })

  .then(function(result) {
    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'process' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

    if (self.id) {
      self.result(result);
    }
  })

  .fail(function(err) {
    var lastTime = process.hrtime(self.lastTime);
    self.timers.push([{ name : 'error' , time : lastTime[0] * 1e9 + lastTime[1] }]);
    self.lastTime = process.hrtime();

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
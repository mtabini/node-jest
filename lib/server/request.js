'use strict';

var assert = require('assert');
var Q = require('q');

var Request = function JestServerRequest (socket, line) {
  this.socket = socket;
  this.line = line;
  this.id = null;
};

Request.prototype.error = function(err) {
  var socket = this.socket;

  socket.server.emit('jestError', err, socket._jestContext, this.id);

  socket.write(JSON.stringify({
    result : null,
    error : err.toString(),
    id : this.id
  }));
  socket.write('\n');
};

Request.prototype.result = function(payload) {
  var socket = this.socket;

  if (this.method) {
    socket.server.emit('jestAudit', this.method, this.params, payload, socket._jestContext, this.id);
  }

  socket.write(JSON.stringify({
    result : payload,
    error : null,
    id : this.id
  }));
  socket.write('\n');
};

Request.prototype.auth = function() {
  var self = this;
  var socket = this.socket;

  Q.fcall(function() {
    var data = JSON.parse(self.line);
    self.id = data.id;

    assert(data.auth, 'This server requires authentication (the `auth` property is missing). ');

    return data.auth;
  })

  .then(socket.server.auth)

  .then(function(context) {
    socket._jestContext = context;
    socket._jestAuth = true;
    socket._readline.on('line', performRequest.bind(void 0, socket));

    self.result({ api : socket.server._jestDescriptions });
  })

  .fail(function(err) {
    self.error(err);
    socket.end();
  })

  .done();
};

Request.prototype.perform = function() {
  var self = this;

  Q.fcall(function() {
    var data = JSON.parse(self.line);

    assert(data.method, 'Missing `method` property');

    self.id = data.id;
    self.method = data.method;
    self.params = data.params;

    var handler = self.socket.server._jestRoutes[data.method];

    return handler(data.params);
  })

  .then(function(result) {
    self.result(result);
  })

  .fail(function(err) {
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
'use strict';

var assert = require('assert');
var crypto = require('crypto');
var events = require('events');
var net = require('net');
var Q = require('q');
var readline = require('readline');
var util = require('util');

var errors = require('../errors');
var proxy = require('./proxy');


var Client = function JestClient (config) {
  assert(config.servers, 'Missing `server` specification.');

  events.EventEmitter.call(this);

  this._sockets = {
    open: [],
    pending: [],
    quarantined: []
  };

  this._nextSocket = 0;

  this._ready = false;

  this._requestTimeouts = {};
  this._pendingRequests = {};
  this.proxy = null;

  this.timeout = config.timeout || 10000;

  var self = this;

  config.servers.forEach(function(config) {
    self._connect(config);
  });
};

util.inherits(Client, events.EventEmitter);

Client.prototype.destroy = function() {
  var self = this;

  function disconnectSocket(socket) {
    socket.removeAllListeners();

    self.emit('disconnect', socket);

    socket.end();
    socket._readline.end();
  }

  this._sockets.open.forEach(disconnectSocket);
  this._sockets.pending.forEach(disconnectSocket);

  this._sockets.quarantined.forEach(function(socket) {
    clearTimeout(socket._reconnectionTimer);
  });

  this._sockets = {
    open: [],
    pending: [],
    quarantined: []
  };

  this.emit('offline');
};

// Socket management

Object.defineProperty(
  Client.prototype,

  'ready',

  {
    get: function() {
      return this._ready;
    },

    set: function(value) {
      this._ready = value;

      if (value) {
        this.emit('ready');
      } else {
        this.emit('offline');
      }
    }
  }
);

Client.prototype._sliceSocket = function(socket, destinationArray) {
  [this._sockets.open, this._sockets.pending, this._sockets.quarantined].some(function(array) {
    var index;

    while((index = array.indexOf(socket)) > -1) {
      array.splice(index, 1);
    }
  });

  if (destinationArray) {
    destinationArray.push(socket);
  }

  this.ready = this._sockets.open.length > 0;
};

Client.prototype._getSocket = function() {
  var sockets = this._sockets.open;
  var len = sockets.length;

  if (!len) {
    return null;
  }

  if (this._nextSocket >= len) {
    this._nextSocket = 0;
  }

  return sockets[this._nextSocket++];
};

// Connection events

Client.prototype._connected = function(socket) {
  this.emit('connect', socket);

  socket._remotemote = socket.remoteAddress + ':' + socket.remotePort;
  socket._retryPeriod = 0;

  var reader = readline.createInterface({ input : socket , output : socket });

  reader.on('line', this._receiveResponse.bind(this, socket));

  socket._readline = reader;

  this._performAuth(socket);
};

Client.prototype._disconnected = function(socket, err) {
  if (this._sockets.quarantined.indexOf(socket) > -1) {
    return;
  }

  this.emit('disconnect', socket, err);
  this._sliceSocket(socket, this._sockets.quarantined);

  if (socket._readline) {
    socket._readline.close();
    delete socket._readline;
  }

  var self = this;

  socket._reconnectionTimer = setTimeout(
    function() {
      self._connect(socket._config, socket._retryPeriod ? socket._retryPeriod * 1.5 : 100);
    },

    socket._retryPeriod || 0
  );
};

Client.prototype._connect = function(config, retryPeriod) {
  var socket = new net.Socket();

  socket._config = config;
  socket._retryPeriod = retryPeriod;
  socket._pendingRequests = {};

  socket.on('connect', this._connected.bind(this, socket));
  socket.on('close', this._disconnected.bind(this, socket));
  socket.on('error', this._disconnected.bind(this, socket));

  socket.connect(config);
};

Client.prototype._disconnect = function(socket) {
  socket.removeAllListeners();
  socket.destroy();

  var self = this;

  Object.keys(socket._pendingRequests).forEach(function(key) {
    self._failRequest(key);
  });
};

// Auth management

Client.prototype.auth = function(socket, cb) {
  process.nextTick(function() {
    cb(null, null);
  });
};

Client.prototype._performAuth = function(socket) {
  var deferred = Q.defer();

  this.auth(socket, deferred.makeNodeResolver());

  var self = this;

  deferred.promise

  .then(function(authData) {
    return self._sendRequest(
      socket,
      {
        auth: authData
      }
    );
  })

  .then(function(authResponse) {
    if (!self.proxy) {
      self.api = authResponse.api;
      self.proxy = proxy({}, self, authResponse.api);
    }

    self._sliceSocket(socket, self._sockets.open);
  })

  .fail(function(err) {
    self.emit('authError', new errors.auth(err.message), socket);
    self._disconnect(socket);
  })

  .done();
};

// Request management

Client.prototype._failRequest = function(id, socket) {
  var promise = this._pendingRequests[id];

  delete this._pendingRequests[id];
  delete this._requestTimeouts[id];

  if (socket) {
    delete socket._pendingRequests[id];
  }

  promise.reject(new errors.timeout('Method call did not return within timeout period,'));
};

Client.prototype._sendRequest = function(socket, payload, cb) {
  var deferred = Q.defer();
  var self = this;

  Q.nfcall(crypto.randomBytes, 16)

  .then(function(id) {
    id = id.toString('hex');

    payload.id = id;

    socket._pendingRequests[id] = 1;

    self._pendingRequests[id] = deferred;
    self._requestTimeouts[id] = setTimeout(self._failRequest.bind(self, id, socket), self.timeout);

    socket.write(JSON.stringify(payload));
    socket.write('\n');
  })

  .fail(deferred.reject)

  .done();

  return deferred.promise.nodeify(cb);
};

Client.prototype.sendRequest = function(methodName, args, cb) {
  var socket = this._getSocket();

  if (!socket) {
    var deferred = Q.defer();

    var err = new Error('No connections available');
    err.offline = true;

    deferred.reject(err);

    return deferred.promise.nodeify(cb);
  }

  return this._sendRequest(
    socket,
    {
      method: methodName,
      params: args,
    },
    cb
  );
};

Client.prototype._receiveResponse = function(socket, line) {
  var self = this;

  Q.fcall(function() {
    return JSON.parse(line);
  })

  .then(function(response) {
    var id = response.id;

    if (!id) {
      return;
    }

    var timeout = self._requestTimeouts[id];

    if (timeout) {
      clearTimeout(timeout);
      delete self._requestTimeouts[id];
    }

    var deferred = self._pendingRequests[id];

    if (!deferred) {
      return;
    }

    delete self._pendingRequests[id];
    delete socket._pendingRequests[id];

    if (response.error) {
      deferred.reject(new Error(response.error));
      return;
    }

    deferred.resolve(response.result);
  })

  .fail(function(err) {
    self.emit('error', new Error('Cannot decode response `' + line + '`: ' + err.message));
  })

  .done();
};

module.exports = function() {
  return new Client({ servers : Array.prototype.slice.apply(arguments) });
};
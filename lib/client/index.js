'use strict';

var assert = require('assert');
var crypto = require('crypto');
var events = require('events');
var net = require('net');
var Q = require('q');
var readline = require('readline');
var util = require('util');

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

  this._pendingRequests = {};
  this.proxy = null;

  var self = this;

  config.servers.forEach(function(config) {
    self._connect(config);
  });
};

util.inherits(Client, events.EventEmitter);

// Socket management

Object.defineProperty(
  Client.prototype,

  'ready',

  {
    get: function() {
      return this._ready;
    },

    set: function(value) {
      if (value != this._ready) {
        this._ready = value;

        this.emit('ready', value);
      }
    }
  }
);

Client.prototype._sliceSocket = function(socket, destinationArray) {
  [this._sockets.open, this._sockets.pending, this._sockets.quarantined].some(function(array) {
    var index = array.indexOf(socket);

    if (index >= 0) {
      array.slice(index, 1);
      return true;
    }
  });

  destinationArray.push(socket);

  this.ready = this._sockets.open.length > 0;
};

Client.prototype._getSocket = function() {
  var sockets = this._sockets.open;
  var len = sockets.length;

  if (len == 0) {
    return null;
  }

  if (this._nextSocket >= len) {
    this._nextSocket = 0;
  }

  return sockets[this._nextSocket++];
}

// Connection events

Client.prototype._connected = function(socket) {
  this.emit('connect', socket);

  var reader = readline.createInterface({ input : socket , output : socket });

  reader.on('line', this._receiveResponse.bind(this, socket));

  socket._readline = reader;

  this.performAuth(socket);
};

Client.prototype._disconnected = function(socket, err) {
  this.emit('disconnect', socket, err);
  this._sliceSocket(socket, this._sockets.quarantined);

  if (socket._readline) {
    socket._readline.close();
    delete socket._readline;
  }
};

Client.prototype._connect = function(config) {
  var socket = net.connect(config);

  socket.on('connect', this._connected.bind(this, socket));
  socket.on('end', this._disconnected.bind(this, socket));
  socket.on('error', this._disconnected.bind(this, socket));
};

Client.prototype._disconnect = function(socket) {
  this._sliceSocket(socket, this._sockets.quarantined);

  socket.removeAllListeners();
  socket.destroy();
};

// Auth management

Client.prototype.auth = function(socket, cb) {
  process.nextTick(function() {
    cb(null, null);
  });
};

Client.prototype.performAuth = function(socket) {
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
      self.proxy = proxy({}, self, authResponse.api);
    }

    self._sliceSocket(socket, self._sockets.open);
  })

  .fail(function(err) {
    self.emit('authError', socket, err);
    self._disconnect(socket);
  })

  .done();
};

// Request management

Client.prototype._sendRequest = function(socket, payload, cb) {
  var deferred = Q.defer();
  var self = this;

  Q.nfcall(crypto.randomBytes, 16)

  .then(function(id) {
    id = id.toString('hex');

    payload.id = id;

    self._pendingRequests[id] = deferred;

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

    deferred.reject(new Error('No connection available'));

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
}

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

    var deferred = self._pendingRequests[id];

    if (!deferred) {
      return;
    }

    delete self._pendingRequests[id];

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
'use strict';

var assert = require('assert');
var net = require('net');
var Q = require('q');
var readline = require('readline');
var stream = require('stream');

var request = require('./request');

// Promise management

function promisify(f) {
  return function() {
    var deferred = Q.defer();
    var args = Array.prototype.slice(arguments);

    args.push(deferred.makeNodeResolver());

    process.nextTick(function() {
      Q(f.apply(void 0, args)).then(deferred.resolve).fail(deferred.fail);
    });

    return deferred.promise;
  };
}

// Route management

function freezeRoutes (server) {
  var routes = server._jestRoutes;
  var descriptions = {};

  Object.keys(routes).forEach(function(key) {
    var handler = routes[key];

    descriptions[key] = handler.describe ? handler.describe() : { arity : handler.length , description : 'No description available.' };
  });

  Object.freeze(routes);

  server._jestDescriptions = descriptions;
}

function addRoute (server, name, handler) {
  assert(!server._jestRoutes[name], 'Duplicate route name `' + name + '`');

  server._jestRoutes[name] = promisify(handler);
}

// Auth management

function defaultAuthHandler () {
  throw new Error('Missing authentication handler');
}

function setupAuth (server) {
  server.requireAuth = true;
  server.auth = promisify(defaultAuthHandler);
}

// Connection management

function handleSocketClosure (socket) {
  socket._readline.close();
}

function handleConnection (socket) {
  socket._jestContext = {};
  socket._readline = readline.createInterface({
    input: socket,
    output: new stream()
  });

  if (socket.server.requireAuth) {
    socket._readline.once('line', request.auth.bind(void 0, socket));
  } else {
    socket._readline.on('line', request.perform.bind(void 0, socket));
  }

  socket.on('close', handleSocketClosure.bind(void 0, socket));
}

// Initialization

module.exports = function jestServer(server) {
  if (!server) {
    server = net.createServer();
  }

  server._jestRoutes = {};
  server.route = addRoute.bind(void 0, server);

  setupAuth(server);

  server.on('connection', handleConnection);
  server.once('listening', freezeRoutes.bind(void 0, server));

  return server;
};
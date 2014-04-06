'use strict';

var assert = require('assert');
var net = require('net');
var Q = require('q');
var readline = require('readline');
var stream = require('stream');
var tv4 = require('tv4');
var util = require('util');

var request = require('./request');
var schema = require('./schema');


// Promise management

function promisify(f) {
  return function(params, context) {
    var deferred = Q.defer();
    var cb = deferred.makeNodeResolver();
    var padding = f.length - params.length - 1;

    cb.context = context;

    params = params.concat(padding > 0 ? Array(padding) : [], cb, context);

    Q.nfapply(f, params).then(deferred.resolve).fail(deferred.reject);

    return deferred.promise;
  };
}

function preparePromisedRoute(f) {
  return function(params, context) {
    params = params.concat(Array(f.length - params.length), context);

    return f.apply(undefined, params);
  }
}

// Route management

function freezeRoutes (server) {
  var routes = server._jestRoutes;
  var descriptions = server._jestDescriptions;

  Object.keys(routes).forEach(function(key) {
    var handler = routes[key];

    if (!descriptions[key]) {
      describeRoute(server, key, 'No description available', []);
    }
  });

  Object.freeze(routes);
}

function describeRoute (server, route, description, args, retval) {
  assert(typeof description == 'string', 'The description is required and must be a string.');
  assert(server._jestRoutes[route], 'Unknown route `' + route + '`');

  if (args) {
    if (!util.isArray(args)) {
      args = [args];
    }

    if (!tv4.validate(args, schema)) {
      throw new Error('Unable to validate parameter descriptions for route `' + route + '`: ' + JSON.stringify(tv4.error, null, ' '));
    }
  } else {
    args = [];
  }

  if (retval && !tv4.validate(retval, schema)) {
    throw new Error('Unable to validate return value descriptions for route `' + route + '`: ' + JSON.stringify(tv4.error, null, ' '));
  }

  server._jestDescriptions[route] = {
    description: description,
    params: util.isArray(args) ? args : [args],
    retVal: retval
  };
}

function addRoute (server, name, handler) {
  assert(!server._jestRoutes[name], 'Duplicate route name `' + name + '`');

  server._jestRoutes[name] = promisify(handler);
}

function addPromisedRoute (server, name, handler) {
  assert(!server._jestRoutes[name], 'Duplicate route name `' + name + '`');

  server._jestRoutes[name] = preparePromisedRoute(handler);
}

function getContext(args) {
  return args[args.length - 1];
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

  var sockets = socket.server._jestSockets;
  var index = sockets.indexOf(socket);

  if (index >= 0) {
    sockets.splice(index, 1);
  }
}

function handleConnection (socket) {
  socket._jestContext = {};
  socket._readline = readline.createInterface({
    input: socket,
    output: new stream()
  });

  if (socket.server.requireAuth) {
    socket._readline.once('line', request.auth.bind(undefined, socket));
  } else {
    socket._readline.on('line', request.perform.bind(undefined, socket));
  }

  socket.on('close', handleSocketClosure.bind(undefined, socket));

  socket.server._jestSockets.push(socket);
}

function destroyServer (server, cb) {
  server.close(cb);

  server._jestSockets.forEach(function(socket) {
    socket.destroy();
  });

  server._jestSockets = [];
}

// Initialization

module.exports = function jestServer(server) {
  if (!server) {
    server = net.createServer();
  }

  server._jestSockets = [];
  server._jestRoutes = {};
  server._jestDescriptions = {};

  server.context = getContext;

  server.describe = describeRoute.bind(undefined, server);

  server.route = addRoute.bind(undefined, server);
  server.proute = addPromisedRoute.bind(undefined, server);

  server.destroy = destroyServer.bind(undefined, server);

  setupAuth(server);

  server.on('connection', handleConnection);
  server.once('listening', freezeRoutes.bind(undefined, server));

  return server;
};
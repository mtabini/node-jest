'use strict';

var Q = require('q');


function performProxiedRequest (client, methodName /* ... */) {
  var args = Array.prototype.slice.call(arguments, 2);

  var cb = args.pop();

  if (typeof cb != 'function') {
    args.push(cb);
    cb = undefined;
  }

  return client.sendRequest(methodName, args, cb);
}

module.exports = function populateJestProxy (proxy, client, spec) {
  Object.keys(spec).forEach(function(key) {
    var finalProxy = proxy;
    var keys = key.split('.');

    var methodName = keys.pop();

    keys.forEach(function(key) {
      if (!proxy[key]) {
        finalProxy[key] = {};
      }

      finalProxy = finalProxy[key];
    });

    finalProxy[methodName] = performProxiedRequest.bind(undefined, client, key);
  });

  return proxy;
};
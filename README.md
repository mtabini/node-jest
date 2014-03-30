# Jest: A JSON-RPC compatible client/server library for Node.js

Jest is a JSON-RPC compatible client/server library that allows a Node.js app execute methods on one or more server.

It provides these features:

- Client authentication
- Automatic load balancing and failover management
- Service discovery and introspection
- Compatibility with both promises and callback

(Note: client authentication and service discovery/introspections are not compatible with plain-vanilla JSON-RPC.)

## Installation

```
node install node-jest
```

## Instantiating a server

A server allows you to give an external client access to one or more methods of your choosing:

```javascript
var jest = require('node-jest');

var server = jest.server();

// Configure here

server.listen(8000, function() {
    console.log('Listening on port ' + server.address().port);
});
```

### Authenticating clients

Jest supports extending the base JSON-RPC model with a special `auth` payload that makes it possible for the server to authenticate clients prior to giving them access to the server's functionality.

By default, Jest turns this feature on, and prevents _any_ client from actually logging in. This is a simple security measure whose goal is to ensure that you don't accidentally forget about authentication.

You can turn on the authentication extension by setting `server.requireAuth` to `false`. If you want to keep it on, you must provide an authentication handler that validates your clients:

```javascript
server.auth = function authenticateClient(authData, cb) {
    // The `authData` parameter is arbitrary data sent by the client
    // during the authentication process

    process.nextTick(function() {
        if (authData == 'securekey') {
            cb(
                null, 
                { 
                    clientId : 'service-1', 
                    permissions: ['read', 'write'] 
                }
            );
        } else {
            cb(new Error('Forbidden!'));
        }
    });
}
```

When executing the callback from your authentication handler, you can attach arbitrary data to the connection that you can later retrieve when the client attempts to execute a method. You can use this data any way you want (or not at all), for example to manage access control.

### Registering routes

A routes represents a method that your server makes available to its clients. Routes can have completely arbitrary names, although Jest works best with methods that are namespaced using a dot notation.

Route handlers are asynchronous, and can either use a traditional callback or a promise:

```javascript

// Register a route using a callback

server.route('math.add', function(a, b, cb) {
    // Do something in here, and call `cb` when you're done.

    process.nextTick(function() {
        // The context returned by the authentication handler
        // can be retrieved from the server:

        if (server.context(arguments).indexOf('read') == -1) {
            cb(new Error('Forbidden'));
            return;
        }

        cb(null, a + b);
    });
});

// Register a route using promises

server.proute('math.mult', function(a, b) {
    // Here, the context is passed as the last parameter to the function.

    var deferred = Q.defer();

    process.nextTick(function() {
        if (server.context(arguments).permissions.indexOf('read') == -1) {
            deferred.reject(new Error('Forbidden'));
            return;
        }

        deferred.resolve(a * b);
    });

    return deferred.promise;
});
```

Note that the result that the authentication handler returned on success is passed in to the individual route handlers as an extra parameter. Jest will pad your function calls so that it will fall outside of the declared arguments of your route handlers (for example, if your function declares two arguments, the context is passed as the third, even if the caller only supplies a single argument). This is something you will probably want to keep in mind if you write methods that accept a variable number of arguments.

### Documenting methods

Jest allows you to document the methods exposed by a server. You can do so by calling the `describe` method:

```javascript
server.route('a.testAdd', function(a, b, cb) {
  process.nextTick(function() {
    cb(null, a + b);
  });
});

server.describe(
  'a.testAdd',

  'Adds two numbers together',

  [
    {
      name: 'a',
      type: 'number',
      description: 'The first operand',
      required: true
    },

    {
      name: 'b',
      type: 'number',
      description: 'The second operand',
      required: true
    }
  ],

  {
    type: 'number',
    description: 'The resulting value.'
  }
);
```

### Closing a server

You can completely close a server by calling its `destroy` method. This will close all sockets down and disconnect all clients immediately.

## Writing a client

Clients are meant to consume the methods provided by a server. Jest's client allows to connect to more than one server and automatically load balance method calls between them using a simple round-robin algorithm.

Note that Jest's client is _not_ compatible with generic JSON-RPC servers. It only works with Jest servers.

### Client basics

The typical client instantiation looks like this:

```javascript
var client = jest.client(
    { host : 'service-1.internal' , port : 1234 },
    { host : 'service-2.internal' , port : 3212 }
);

client.auth = function(socket, cb) {
    process.nextTick(function() {
        cb(null, { key : 'sekret-key' });
    });
};

client.on('authError', function(err, socket) {
    // An authentication error has occurred
});

client.once('ready', function() {
    // At least one socket is ready to accept requests
});
```

Jest assumes that authentication is on (this is required because, at least currently, Jest server provide service discovery in response to the authentication handshake). The `auth` method allows you to provide arbitrary data that the server can use to identify your client. In the event of an authentication failure, the client emits an `authError` event.

As soon as the client has connected to at least one server, the client emits the `ready` event, at which point you can start issuing method calls to the server.

Note that `ready` is called whenever the client transitions from a state in which no connections are available to a state in which there is at least one. Therefore, it's possible (and likely) that the event will be fired multiple times throughout the life of your app—and you should plan accordingly.

### Handling connectivity failures

Jest automatically handles connection failures by quarantining the offending socket and attempting to reconnect to the corresponding server. Because it is designed to work in environments that put a premium on availability, the reconnection retries are very aggressive: the first one occurs immediately upon disconnection; if that is unsuccessful, the next occurs after 100ms, and successive ones at intervals that increase geometrically at the rate of 1.5x.

When no connections are available, the client issues an `offline` event to advise you that it cannot perform any method calls. Attempts to execute methods will be met with an error that has a property called `offline` set to `true`.

### Executing methods

The client leverages Jest's service discovery and introspection features to greatly simplify the process of calling a method.

Upon authentication, the client asks the server to provide a map of the methods it exposes and automatically creates a proxy object that can be used to make calls from your JavaScript code. In the process, it automatically unwinds namespaces if your methods follow dot notation.

For example, suppose that your server supports two methods called `a.add` and `a.multiply`. You can use them like this:

```javascript

client.proxy.a.add(1, 2, function(err, result) {
    ...
});

client.proxy.a.multiply(1, 2, function(err, result) {
    ...
});
```

In addition to the traditional callback mechanism, the client also supports promises:

```javascript

client.proxy.a.add(1, 2)

.then(function(result) {
    ...
})

.fail(function(err) {
    ...
})

.done();
```

### Closing a client

You can call the `destroy` method to completely terminate a client. This will close all extant connections and shut down the load balancing mechanism.

## Using the documentation tool

Jest comes with a documentation tool, available in `bin/jest`, that allows you to quickly introspect a running service from the command line, discovering the methods it exposes and their signatures.

The service takes these parameters:

```
Usage: jest [options] <hostname> <port> [regex]

Options:

  -h, --help     output usage information
  -V, --version  output the version number
  -a <auth>      Set the authentication JSON payload
```

For example, this extracts every method available from a service running on `server-1.internal` at port 1234, with the authentication parameter `sekret`:

```
./bin/jest -a sekret server-1.internal 1234

    a.test    Adds one to a value
    a.testAdd Adds two numbers together
    b.test    Returns 10
```

If you want to learn more about a specific method, you can drill down further:

```

./bin/jest -a sekret server-1.internal 1234 a.test

Method a.test(s) void:

     s any The value 

    Return value: (any) The resulting value

```

## Server API

### jest.server([server])

Returns an instance of `net.Server` configured for Jest use.

You can optionally pass in a pre-configured `net.Server`; if you don't, Jest will create one for you.

### server.context(args)

Returns the context associated with a running method handler. 

The `args` parameter must be the `arguments` parameter of a method handler, or `context` will return an unpredictable value.

### server.describe(route, description, args, retval)

Provides a description for `route`, which must be registered prior to calling this method. The `description` parameter offers a general description of the route, while `args` can be one of:

- `null` or `undefined`, to indicate that the route takes no arguments
- A single argument descriptor, which indicates that the route takes exactly one argument
- An array of one or more argument descriptors, if the route takes more than one argument.

Argument descriptors are hashes that contain these properties:

- The `name` of the argument
- A `description` of its purpose
- An optional `type`
- An optional `required` Boolean if the argument is required

The `retval` argument describes the return value of the route. It can either be omitted, in which case the route is assumed to be `void`, or be a hash that contains `name`, `description`, and `type` properties.

### server.destroy()

Completely shuts down the server, immediately disconnecting all clients.

### server.proute(name, handler)

Adds a promises-based route handler.

Internally, Jest uses Kris Kowal's [Q](https://github.com/kriskowal/q) library to handle promise fulfillment.

### server.route(name, handler)

Adds a callback-based route handler.

The `name` must be unique.

### Event: jestAudit

`function(method, params, result, timeTrace, context, id)`

Emitted whenever a route completes successfully for audit purposes. `method` the name of the method being called, `params` the arguments that were passed to it, and `result` the route's return value. `timeTrace` provides information about execution times, `context` is the authentication context associated with the callign client, and `id` is the unique ID of the transaction.

### Event: jestError

`function(err, method, params, timeTrace, context, id)`

Emitted whenever a route completes with an error for audit purposes. `err` is the error that was emitted, `method` the name of the method being called, and `params` the arguments that were passed to it. `timeTrace` provides information about execution times, `context` is the authentication context associated with the callign client, and `id` is the unique ID of the transaction.

## Client API

### jest.client(options[, options...])

Creates and returns a new client.

`options` can be any combination of configuration options that can be passed to `net.Socket.connect()`. An arbitrary number of option sets can be used, each representing a server on which the client will load-balance requests.

### client.auth

A callback-based function that provides authentication data when challenged by a server. The function takes a `socket` and a `callback` parameter.

### client.destroy()

Completely shuts down and destroys a client, immediately terminating all extant connections and method calls.

### client.proxy

A proxy that exposes all the methods provided by the server. Any methods name that follow dot-notation will be unwound and represented as if they were properties of the proxy itself.

Methods can transparently be called using either a traditional callback syntax, or by using promises.

### client.ready

A Boolean property that indicates whether the client is capable of processing requests (that is, whether at least one server has been successfully contacted)

### Event: authError

`function(err, socket)`

Emitted when the client encounters `err` while attempting to authenticate itself to the server at `socket`. Note that the client will continue to attempt and authenticate with the remote host using a geometric retry interval.

### Event: connect

`function(socket)`

Emitted when `socket` connects successfully to a server, but before authentication is performed.

### Event: disconnect

`function(socket)`

Emitted when `socket` is disconnected.

### Event: error

`function(err)`

Emitted when a communication error occurs and the client cannot communicate with the server due to an unknown failure.

### Event: ready

`function()`

Emitted when the client goes from a state in which it cannot process requests to one in which it can. In practice, this event will be emitted any time the client goes from having zero active connection to one—which is likely to happen multiple times throughout the life of your app. 

It is, therefore, important to plan accordingly (for example by using `EventEmitter.once` instead of `EventEmitter.on` when listening to this event) to prevent handlers being fired more than once.

### Event: offline

`function()`

Emitted when the client goes from a state in which it can process requests to one in which it cannot. In practice, this event will be emitted any time the client goes from having at least on active connection to none—which is likely to happen multiple times throughout the life of your app if temporary network issues arise.

It is, therefore, important to plan accordingly (for example by using `EventEmitter.once` instead of `EventEmitter.on` when listening to this event) to prevent handlers being fired more than once.

## Limitations

The current version of Jest is experimental, and should not (yet) be used in production. In particular, it cannot effectively handle timeouts, and leaks resources in the event of network errors. These issues will be fixed in an upcoming release.

## Contributing

Fixes and contributions are warmly welcome, provided that they are accompanied by the appropriate test cases.
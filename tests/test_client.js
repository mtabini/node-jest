/*jshint expr:true*/

'use strict';

var expect = require('chai').expect;
var Q = require('q');

var jest = require('../index');

var defaultPort = 8003;
var testServer;


Q.longStackSupport = true;


describe('The Jest client', function() {

  function createClient () {
    var args = Array.prototype.slice.apply(arguments);

    if (!args.length) {
      args = [defaultPort];
    }

    var client = jest.client.apply(undefined, args);

    client.auth = function(socket, cb) {
      process.nextTick(function() {
        cb(null, 123);
      });
    };

    return client;
  }

  function createServer (port, cb) {
    var server;

    if (typeof port === 'function') {
      cb = port;
      port = defaultPort;
    }

    server = jest.server();

    server.addition = 1;

    server.route('a.test', function(s, cb) {
      process.nextTick(function() {
        cb(null, s + server.addition);
      });
    });

    server.route('a.error', function(s, cb) {
      process.nextTick(function() {
        cb(new Error('Nope'));
      });
    });

    server.route('a.wait', function(cb) {
      setTimeout(function() {
        cb(null, null);
      }, 1000);
    });

    server.requireAuth = true;
    server.auth = function(auth, cb) {
      if (auth[0] == 123) {
        cb(null, 'ok');
      } else {
        cb(new Error('Unauthorized'));
      }
    };

    server.listen(port, function() {
      cb(null, server);
    });
  }

  before(function(done) {
    Q.denodeify(createServer)()

    .then(function(server) {
      testServer = server;
      done();
    })

    .done();
  });
  
  it('should exist (you never know)', function() {
    expect(jest.client).to.be.a('function');
  });

  it('should support authentication', function(done) {
    var client = createClient();

    client.once('ready', function() {
      done();
    });
  });

  it('should support performing a proxied call using promises', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.test('a')
      .then(function(result) {
        expect(result).to.be.a('string');
        expect(result).to.equal('a1');

        done();
      })
      .done();
    });
  });

  it('should support performing a call using callbacks', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.test('a', function(err, result) {
        expect(err).to.be.null;
        expect(result).to.be.a('string');
        expect(result).to.equal('a1');

        done();
      });
    });
  });

  it('should properly handle errors', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.error('a', function(err, result) {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.match(/nope/i);
        expect(result).to.be.undefined;

        done();
      });
    });
  });

  it('should properly quarantine a failed connection', function(done) {
    Q.denodeify(createServer)(defaultPort + 1)

    .then(function(localServer) {

      var client = createClient(defaultPort + 1);

      client.once('ready', function() {
        localServer.destroy();
      });

      client.once('disconnect', function() {
        process.nextTick(function() {
          expect(client._sockets.quarantined).to.have.length(1);

          client.proxy.a.test('a', function(err, result) {
            expect(err).to.be.an.instanceOf(Error);
            expect(err.message).to.match(/no connections available/i);
            expect(result).to.be.undefined;

            done();
          });
        });
      });
    });
  });

  it('should reconnect on failure', function(done) {
    Q.denodeify(createServer)(defaultPort + 2)

    .then(function(localServer) {

      var client = createClient(defaultPort + 2);

      client.once('ready', function() {
        localServer.destroy();
      });

      client.once('disconnect', function() {
        Q.denodeify(createServer)(defaultPort + 2)

        .then(function() {
          return Q.delay(10);
        })

        .then(function() {
          expect(client.ready).to.be.true;

          return client.proxy.a.test('a');
        })

        .then(function(result) {
          expect(result).to.be.a('string');
          expect(result).to.equal('a1');

          done();
        })

        .done();
      });
    });
  });

  it('should load-balance connections', function(done) {
    Q.denodeify(createServer)(defaultPort + 3)

    .then(function(localServer) {

      localServer.addition = 2;

      var client = createClient(defaultPort, defaultPort + 3);

      client.once('ready', function() {
        Q.delay(10)

        .then(function() {
          return Q.all([
            client.proxy.a.test(0),
            client.proxy.a.test(0)
          ]);
        })

        .then(function(results) {
          expect(results).to.be.an('array');
          expect(results).to.include(1, 2);

          done();
        })

        .done();
      });
    });
  });

  it('should properly handle timeouts', function(done) {
    Q.denodeify(createServer)(defaultPort + 4)

    .then(function(localServer) {

      localServer.addition = 2;

      var client = createClient(defaultPort, defaultPort + 4);

      client.timeout = 100;

      client.once('ready', function() {
        client.proxy.a.wait()

        .then(function() {
          throw new Error('This should not succeed…');
        })

        .fail(function(err) {
          expect(err).to.be.an.instanceOf(jest.errors.timeout);

          done();
        })

        .done();
      });
    });
  });

  after(function(done) {
    testServer.destroy(done);
  });

});
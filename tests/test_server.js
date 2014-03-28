'use strict';

var expect = require('chai').expect;
var net = require('net');
var readline = require('readline');
var Q = require('q');

var jest = require('../index');

describe('The server', function() {
  var server = jest.server();
  var socket;

  var requests = {};
  var requestId = 0;

  function _sendRequest (data) {
    var deferred = Q.defer();

    var id = requestId++;

    requests[id] = deferred;
    data.id = id;

    socket.write(JSON.stringify(data));
    socket.write('\n');

    return deferred.promise;
  }

  function sendRequest (method, params) {
    return _sendRequest({
      method: method,
      params: params
    });
  }

  function receiveResponse (line) {
    line = JSON.parse(line);

    expect(line).to.have.keys('id', 'result', 'error');

    var id = line.id;

    var deferred = requests[id];

    expect(deferred).to.be.an('object');

    if (line.error) {
      deferred.reject(new Error(line.error));
    } else {
      deferred.resolve(line.result);
    }
  }

  before(function(done) {
    server.requireAuth = true;

    server.auth = function(auth, cb) {
      process.nextTick(function() {
        cb(null, 'CONTEXT');
      });
    };

    server.route('test.async.param', function(n, cb) {
      expect(cb).to.be.a('function');
      expect(cb).to.include.key('context');
      expect(cb.context).to.equal('CONTEXT');

      process.nextTick(function() {
        cb(null, n * 2);
      });
    });

    server.proute('test.async.promise', function(n, context) {
      expect(context).to.be.a('string');
      expect(context).to.equal('CONTEXT');
      
      var deferred = Q.defer();

      process.nextTick(function() {
        deferred.resolve(n * 4);
      });

      return deferred.promise;
    });

    server.route('test.async.error', function(cb) {
      cb(new Error('Error async'));
    });

    server.proute('test.promise.error', function() {
      var defer = Q.defer();

      process.nextTick(function() {
        defer.reject(new Error('Error promise'));
      });

      return defer.promise;
    });

    server.listen(8100, function() {
      socket = net.connect(8100, function() {
        _sendRequest({
          auth: '123'
        })
        .then(function(result) {
          expect(result).to.be.an('object');
          expect(result).to.have.key('api');
          expect(result.api).to.be.an('object');

          done();
        })
        .done();
      });

      readline = readline.createInterface({
        input: socket,
        output: socket
      });

      readline.on('line', receiveResponse);
    });
  });

  it('should allow adding new routes', function() {
    var server = jest.server();

    function test() {
      server.route('test', function() {});
    }

    expect(test).not.to.throw(Error);
  });

  it('should not allow adding two routes with the same name', function() {
    var server = jest.server();
    server.route('test', function() {});

    function test() {
      server.route('test', function() {});
    }

    expect(test).to.throw(Error);
  });

  it('should not allow adding new routes after listening', function() {
    function test() {
      server.route('test', function() {});
    }

    expect(test).to.throw(Error);
  });

  it('should properly handle an asynchronous method with parameters', function(done) {
    sendRequest('test.async.param', [2])

    .then(function(result) {
      expect(result).to.equal(4);
      done();
    })

    .done();
  });

  it('should properly handle an asynchronous promise-based method with parameters', function(done) {
    sendRequest('test.async.promise', [2])

    .then(function(result) {
      expect(result).to.equal(8);
      done();
    })

    .done();
  });

  it('should properly handle an asynchronous method that throws an error', function(done) {
    sendRequest('test.async.error', [2])

    .fail(function(err) {
      expect(err).to.be.an.instanceOf(Error);
      done();
    })

    .done();
  });

  it('should properly handle an asynchronous promise-based method that throws an error', function(done) {
    sendRequest('test.promise.error', [2])

    .fail(function(err) {
      expect(err).to.be.an.instanceOf(Error);
      done();
    })

    .done();
  });

  it('should properly audit transactions', function(done) {
    server.once('jestAudit', function(method, params, result, timers, context, id) {
      expect(method).to.equal('test.async.param');
      expect(params).to.be.an('array');
      expect(params).to.have.length(2);
      expect(result).to.equal(10);
      expect(timers).to.be.an('object');
      expect(timers).to.have.keys('total', 'steps');
      expect(context).to.equal('CONTEXT');
      expect(id).to.be.a('number');

      done();
    });

    sendRequest('test.async.param', [5]).done();
  });

  after(function(done) {
    server.destroy(done);
  });

});
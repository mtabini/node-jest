'use strict';

var expect = require('chai').expect;
var net = require('net');
var readline = require('readline');
var Q = require('q');

var jest = require('../index');

describe('The server authentication mechanism', function() {
  var server = jest.server();
  var socket;

  var requests = {};
  var requestId = 0;

  function _sendRequest (data, params) {
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

    server.auth = function() {
      return 'CONTEXT';
    }

    server.listen(8100, function() {
      socket = net.connect(8100, function() {
          done();
      });

      readline = readline.createInterface({
        input: socket,
        output: socket
      });

      readline.on('line', receiveResponse);
    });
  });

  it('should require auth', function(done) {
    sendRequest('test.async.param', [2])

    .fail(function(err) {
      expect(err).to.be.an.instanceOf(Error);
      expect(err.message).to.match(/this server requires authentication/i);

      done();
    })

    .done();
  });

  after(function(done) {
    server.destroy(done);
  })

});
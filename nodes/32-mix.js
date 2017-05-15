/* Copyright 2017 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var util = require('util');
var redioactive = require('node-red-contrib-dynamorse-core').Redioactive;
var TransValve = require('./transValve.js').TransValve;
var codecadon = require('codecadon');

module.exports = function (RED) {
  function Mix (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    var stamper = new codecadon.Stamper(function() {
      console.log('Stamper exiting');
    });
    stamper.on('error', function(err) {
      console.log('Stamper error: ' + err);
    });

    this.properties = {
      mix: +config.mix
    };

    this.setInfo = function (srcTags, dstTags) {
      return stamper.setInfo(srcTags, dstTags);
    }

    this.processGrain = function (srcBufArray, dstBuf, cb) {
      var paramTags = { pressure:this.properties.mix };
      var numQueued = stamper.mix(srcBufArray, dstBuf, paramTags, (err, result) => {
        cb(err, result);
      });
    }

    this.quit = function(cb) {
      stamper.quit(() => {
        cb();
      });
    }
  }
  util.inherits(Mix, TransValve);
  RED.nodes.registerType("mix", Mix);
}

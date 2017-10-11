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
var TransValve = require('./transValve.js').TransValve;
var codecadon = require('codecadon');

module.exports = function (RED) {
  function Stamp (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    var stamper = new codecadon.Stamper(() => this.log('Stamper exiting'));
    stamper.on('error', err => this.error('Stamper error: ' + err));

    this.findSrcTags = (cable) => {
      if (!Array.isArray(cable[0].video) && cable[0].video.length < 1) {
        return Promise.reject('Logical cable does not contain video');
      }
      return cable[0].video[0].tags;
    };

    this.setInfo = (srcTags, dstTags, logLevel) => {
      return stamper.setInfo(srcTags, dstTags, logLevel);
    };

    this.processGrain = function (srcBufArray, dstBufLen, cb) {
      var dstBuf = Buffer.alloc(dstBufLen);
      var paramTags = {};
      stamper.stamp(srcBufArray, dstBuf, paramTags, (err, result) => {
        cb(err, result);
      });
    };

    this.quit = (cb) => {
      stamper.quit(() => cb());
    };

    this.closeValve = done => {
      this.close(done);
    };
  }
  util.inherits(Stamp, TransValve);
  RED.nodes.registerType('stamp', Stamp);
};

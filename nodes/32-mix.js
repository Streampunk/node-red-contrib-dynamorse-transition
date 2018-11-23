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

const util = require('util');
const TransValve = require('./transValve.js').TransValve;
const codecadon = require('codecadon');
const oscServer = require('../util/oscServer.js');

module.exports = function (RED) {
  function Mix (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    const numInputs = 2;
    let dstBufLen = 0;
    let mixVal = +config.mix;

    const oscServ = oscServer.getInstance(this);
    oscServ.addControl(config.mixControl, val => mixVal = val);
    
    const stamper = new codecadon.Stamper(() => this.log('Stamper exiting'));
    stamper.on('error', err => this.error('Stamper error: ' + err));

    this.getProcessSources = cable => cable.filter((c, i) => i < numInputs);
    
    this.setInfo = (srcTags, dstTags, logLevel) => {
      const srcVideoTags = srcTags.filter(t => t.format === 'video');
      dstBufLen = stamper.setInfo(srcVideoTags, dstTags.video, logLevel);
    };

    this.processGrain = (flowType, srcBufArray, cb) => {
      if ('video' === flowType) {
        this.log(`Mix: ${mixVal}`);
        const dstBuf = Buffer.alloc(dstBufLen);
        const paramTags = { pressure: mixVal };
        stamper.mix(srcBufArray, dstBuf, paramTags, (err, result) => {
          cb(err, result);
        });
      } else {
        cb(null, srcBufArray[0]);
      }
    };

    this.quit = cb => {
      stamper.quit(() => cb());
    };

    this.closeValve = () => oscServ.removeControl(config.mixControl);
  }
  util.inherits(Mix, TransValve);
  RED.nodes.registerType('mix', Mix);
};

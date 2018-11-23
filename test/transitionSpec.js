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

const TestUtil = require('dynamorse-test');

const mixTestNode = () => ({
  type: 'mix',
  z: TestUtil.testFlowId,
  name: 'mix-test',
  maxBuffer: 10,
  x: 100.0,
  y: 100.0,
  mix: '0.5',
  wires: [[]]
});

const funnel1NodeId = '24fde3d7.b7544c';
const funnel2NodeId = 'ba156ff1.45ea9';
const mixNodeId = '145f639d.4b63ac';
const spoutNodeId = 'f2186999.7e5f78';

TestUtil.nodeRedTest('A srcx2->mix->spout flow is posted to Node-RED', {
  numPushes: 10,
  funnelMaxBuffer: 10,
  mixPressure: '0.5',
  spoutTimeout: 0
}, (params) => {
  const testFlow = TestUtil.testNodes.baseTestFlow();
  testFlow.nodes.push(Object.assign(TestUtil.testNodes.funnelGrainNode(), {
    id: funnel1NodeId,
    numPushes: params.numPushes,
    maxBuffer: params.funnelMaxBuffer,
    y: 100.0,
    wires: [ [ mixNodeId ] ]
  }));
  testFlow.nodes.push(Object.assign(TestUtil.testNodes.funnelGrainNode(), {
    id: funnel2NodeId,
    numPushes: params.numPushes,
    maxBuffer: params.funnelMaxBuffer,
    y: 200.0,
    wires: [ [ mixNodeId ] ]
  }));
  testFlow.nodes.push(Object.assign(mixTestNode(), {
    id: mixNodeId,
    mix: params.mixPressure,
    x: 300.0,
    wires: [ [ spoutNodeId ] ]
  }));
  testFlow.nodes.push(Object.assign(TestUtil.testNodes.spoutTestNode(), {
    id: spoutNodeId,
    timeout: params.spoutTimeout,
    x: 500.0
  }));
  return testFlow;
}, (t, params, msgObj, onEnd) => {
  //t.comment(`Message: ${JSON.stringify(msgObj)}`);
  if (msgObj.hasOwnProperty('receive')) {
    TestUtil.checkGrain(t, msgObj.receive);
    params.count++;
  }
  else if (msgObj.hasOwnProperty('end') && (msgObj.src === 'spout')) {
    t.equal(params.count, params.numPushes, 'received end after expected number of pushes');
    onEnd();
  }
});

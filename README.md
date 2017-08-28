# node-red-contrib-dynamorse-transition

An experimental set of nodes for IBM's [Node-RED](http://nodered.org) that provide processing for media transitions. This package is a component of Streampunk Media's [dynamorse](https://github.com/Streampunk/node-red-contrib-dynamorse-core#readme) suite.

## Installation

First follow the installation instructions for [dynamorse-core](https://github.com/Streampunk/node-red-contrib-dynamorse-core#readme).

This package can be installed from the 'manage palette' option in the Node-RED menu. Alternatively in your Node-RED user directory, typically ~/.node-red, run

    npm install node-red-contrib-dynamorse-transition

The transition value can be controlled via UDP messages from an [Open Sound Control](http://opensoundcontrol.org/introduction-osc) device such as [Lemur](https://liine.net/en/products/lemur/) or [TouchOSC](https://hexler.net/software/touchosc). Each node should be configured with a UDP Port number and the control string to use to indicate the value.

## Status, support and further development

Contributions can be made via pull requests and will be considered by the author on their merits. Enhancement requests and bug reports should be raised as github issues. For support, please contact [Streampunk Media](http://www.streampunk.media/).

## License

This software is released under the Apache 2.0 license. Copyright 2017 Streampunk Media Ltd.

This software uses the [osc.js](https://github.com/colinbdclark/osc.js) project under the MIT License.

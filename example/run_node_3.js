//-----------------------------------------------------------------------------
// Launches the node_3 and sets up the base account example.three.

//-----------------------------------------------------------------------------
// Module Requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const CONFIG_PATH = './node-config-3.json';
const ILP_ADDRESS = "example.three";
const ASSET_CODE = "COIN_B";
const HTTP_PORT = 3030
const BTP_PORT = 3031
const DB_ID = 3

//-----------------------------------------------------------------------------
// Main Logic

utils.setup(ILP_ADDRESS, ASSET_CODE, CONFIG_PATH, HTTP_PORT, BTP_PORT, DB_ID)
.catch( (err) => console.error(err) );

//-----------------------------------------------------------------------------
// Launches the node_1 and sets up the base account example.one.

//-----------------------------------------------------------------------------
// Module Requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const CONFIG_PATH = './node-config-1.json';
const ILP_ADDRESS = "example.one";
const ASSET_CODE = "COIN_A";
const HTTP_PORT = 3010;
const BTP_PORT = 3011;
const DB_ID = 1;

//-----------------------------------------------------------------------------
// Main Logic

utils.setup(ILP_ADDRESS, ASSET_CODE, CONFIG_PATH, HTTP_PORT, BTP_PORT, DB_ID)
.catch( (err) => console.error(err) );

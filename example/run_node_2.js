//-----------------------------------------------------------------------------
// Launches the node_2 but does not set up any additional accounts

//-----------------------------------------------------------------------------
// NOTES:
// 
// This maybe done incorrectly and why the payment failes to go through

//-----------------------------------------------------------------------------
// Module Requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const CONFIG_PATH = './node-config-2.json';
const ILP_ADDRESS = "example.two";
const HTTP_PORT = 3020
const BTP_PORT = 3021
const DB_ID = 2

//-----------------------------------------------------------------------------
// Main Logic

utils.setup(ILP_ADDRESS, undefined, CONFIG_PATH, HTTP_PORT, BTP_PORT, DB_ID, false)
    .catch( (err) => console.error(err) );


//-----------------------------------------------------------------------------
// Sets the exchange rate of COIN_A to COIN_B.  All this will be done on node 2
// because this node acts as a "bridge" between the two systems

//-----------------------------------------------------------------------------
// ASSUMPTIONS
//
// This script assumes you have Redis, all three of the Interledger nodes
// running, you have setup the accounts. To meet these assumptions you will need
// to run the following four scripts/commands (in different terminals because 
// they launch a server)
//
// $> node ./run_node_1.js
// $> node ./run_node_2.js
// $> node ./run_node_3.js
// $> node ./account_setup.js

//-----------------------------------------------------------------------------
// Module Requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const CONFIG_PATH = './node-config-2.json';
const HTTP_PORT_2 = 3020;
const ASSET_CODE_A = "COIN_A";
const RATE_FOR_A = 1;
const ASSET_CODE_B = "COIN_B"
const RATE_FOR_B = 2;

//-----------------------------------------------------------------------------
// Main Logic

// Load the config file for node 2
utils.loadConfig(CONFIG_PATH)
.then( (config) => {
    // Set the exhange rate of 1 COIN_A == 2 COIN_B's
    utils.setRates( HTTP_PORT_2, config.admin_auth_token, 
                    ASSET_CODE_A, RATE_FOR_A, 
                    ASSET_CODE_B, RATE_FOR_B).then( () => {
        console.log("Exchange rate set successful!");
    })
    .catch( (err) => console.error(err) );
})
.catch( (err) => console.error(err) );
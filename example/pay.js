//-----------------------------------------------------------------------------
// Executes a payment from accounts example.one to example.three for 100 COIN_A
// for 200 COIN_B's.  Then it will execute a payment from account example.three
// to example.one of 100 COIN_B's for 50 COIN_A's (based on the exchange rate
// setup in rates_setup.js command)

//-----------------------------------------------------------------------------
// ASSUMPTIONS
//
// This script assumes you have Redis, all three of the Interledger nodes
// running, you have setup the accounts and you have setup the exchange rates. 
// To meet these assumptions you will need to run the following four 
// scripts/commands (in different terminals because they launch a server)
//
// $> node ./run_node_1.js
// $> node ./run_node_2.js
// $> node ./run_node_3.js
// $> node ./account_setup.js && node ./rates_setup.js

//-----------------------------------------------------------------------------
// NOTES:
// 
// This script is currently not working!
//
// Error:
// [2019-06-05T22:23:48Z ERROR interledger_stream::client] Send money stopped because of error: SendMoneyError("Packet was rejected with error: F02 ")
// [2019-06-05T22:23:48Z ERROR interledger_spsp::client] Error sending payment: SendMoneyError("Packet was rejected with error: F02 ")
// [2019-06-05T22:23:48Z ERROR interledger_api::routes::spsp] Error sending SPSP payment: SendMoneyError(100)

//-----------------------------------------------------------------------------
// Module requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const HTTP_PORT_1 = 3010;
const HTTP_PORT_3 = 3030;
const AMOUNT = 100;

//-----------------------------------------------------------------------------
// Main Logic

// Send a payment of AMOUNT from node 1/account example.one to node 3/account
// example.three that should route through node 2/ account example.two
console.log(`Sending Payment 1 -> 3`);
utils.pay(HTTP_PORT_1, HTTP_PORT_3, AMOUNT)
.then( (rsp) => {
    console.log(`Payment 1 -> 3 Complete: ${rsp}`);
    console.log(`Sending Payment 3 -> 1`);

    // Now send the payment back out the other direction
    utils.pay(HTTP_PORT_1, HTTP_PORT_3, AMOUNT)
    .then( (rsp) => {
        console.log(`Payment 3 -> 1 Complete: ${rsp}`);
    })
    .catch( (err) => console.error(err) );
})
.catch( (err) => console.error(err) );
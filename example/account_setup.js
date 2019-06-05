//-----------------------------------------------------------------------------
// In order for use to send payments around the network we need to setup some
// account and how they can be routed.  This script will automate this a bit
// using a set of predefined acounts and configs.

//-----------------------------------------------------------------------------
// ASSUMPTIONS
//
// This script assumes you have Redis and all three of the Interledger nodes
// running. To meet these assumptions you just need to run the following three
// scripts (in different terminals because they launch a server)
//
// $> node ./run_node_1.js
// $> node ./run_node_2.js
// $> node ./run_node_3.js

//-----------------------------------------------------------------------------
// Module Requires
const utils = require('./utils');

//-----------------------------------------------------------------------------
// Module Consts
const CONFIG_PATH_ACC_ONE = './node-config-1.json';
const CONFIG_PATH_ACC_TWO = './node-config-2.json';
const CONFIG_PATH_ACC_THREE = './node-config-3.json';

const ILP_ADDRESS_ONE = "example.one";
const ILP_ADDRESS_TWO = "example.two";
const ILP_ADDRESS_THREE = "example.three";
const ASSET_CODE_A = "COIN_A";
const ASSET_CODE_B = "COIN_B";

const HTTP_PORT_1 = 3010;
const HTTP_PORT_2 = 3020;
const BTP_PORT_2 = 3021;
const HTTP_PORT_3 = 3030;

//-----------------------------------------------------------------------------
// Main Logic

// Load up Node 1's config file so we can read the admin token
utils.loadConfig(CONFIG_PATH_ACC_ONE).then( (config_1) => {
    // Load up Node 2's config file so we can read the admin token

    utils.loadConfig(CONFIG_PATH_ACC_TWO).then( (config_2) => {

        // Load up Node 3's config file so we can read the admin token
        utils.loadConfig(CONFIG_PATH_ACC_THREE).then( (config_3) => {
                
                // Now that we have the config files loaded, let's fire
                // off a request to create the account example.two on node 1 as
                // a "Peer" account
                console.log("All config files loaded:  Begin setting node one accounts.");
                let body = {
                    ilp_address: ILP_ADDRESS_TWO,

                    asset_code: ASSET_CODE_A,
                    asset_scale: 9,
                    http_endpoint: `http://localhost:${HTTP_PORT_2}/ilp`,
                    http_incoming_token: "two",
                    http_outgoing_token: "one",
                    max_packet_amount: 1000000000,
                    min_balance: -1000000000,
                    send_routes: true,
                    receive_routes: true,
                    routing_relation: "Peer"
                }
                utils.addAccount(HTTP_PORT_1, config_1.admin_auth_token, body)
                .then( () =>
                {

                    // Request to create the account example.one on node 2 as
                    // a "Peer" account
                    console.log("Node One setup complete:  Setting up Node two account 1 of 2.");
                    let body = {
                        ilp_address: ILP_ADDRESS_ONE,

                        asset_code: ASSET_CODE_A,
                        asset_scale: 9,
                        http_endpoint: `http://localhost:${HTTP_PORT_1}/ilp`,
                        http_incoming_token: "one",
                        http_outgoing_token: "two",
                        max_packet_amount: 1000000000,
                        send_routes: true,
                        receive_routes: true,
                        routing_relation: "Peer"
                    }
                    utils.addAccount(HTTP_PORT_2, config_2.admin_auth_token, body)
                    .then( () =>
                    {
                        // Request to create the account example.three on node 2 as
                        // a "Child" account
                        console.log("Setting up Node two account 2 of 2.");
                        let body = {
                            ilp_address: ILP_ADDRESS_THREE,
                            asset_code: ASSET_CODE_B,
                            asset_scale: 6,
                            max_packet_amount: 1000000000,
                            min_balance: -1000000000,
                            btp_incoming_token: "three",
                            send_routes: true,
                            receive_routes: false,
                            routing_relation: "Child"
                        }
                        utils.addAccount(HTTP_PORT_2, config_2.admin_auth_token, body)
                        .then( () =>
                        {
                            // Request to create the account example.two on node 3 as
                            // a "Parent" account
                            console.log("Setting up Node three account");
                            let body = {
                                ilp_address: ILP_ADDRESS_TWO,
                                asset_code: ASSET_CODE_B,
                                asset_scale: 6,
                                max_packet_amount: 1000000000,
                                min_balance: -1000000000,
                                btp_uri: `btp+ws://:three@localhost:${BTP_PORT_2}`,
                                btp_incoming_token: "three",
                                send_routes: false,
                                receive_routes: true,
                                routing_relation: "Parent"
                            }
                            utils.addAccount(HTTP_PORT_3, config_3.admin_auth_token, body)
                            .then( () =>
                            {
                                console.log("All Accounts Prepared!")
                            });
                        });
                    });
                });
            });
        });
    })
    .catch( (err) => console.error(err) );

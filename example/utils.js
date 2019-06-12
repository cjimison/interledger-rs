//-----------------------------------------------------------------------------
// A set of common utility function I will be using for all the example scripts.

//-----------------------------------------------------------------------------
// NOTES:
// 
// I am not up to date on the latest goings on in the NodeJS world and
// this should be updated to follow modern conventions used instead
// of this old 2011 style NodeJS export system.

//-----------------------------------------------------------------------------
// Module requires
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const { promisify } = require('util');
const localtunnel = require('localtunnel');
const request = require('request-promise-native');

//-----------------------------------------------------------------------------
// Module Consts
// [TODO] This value should use an environment variable so we can better support
//          docker based runs of redis in the future
const REDIS_UNIX_SOCKET = `${__dirname}/redis.sock`;

//-----------------------------------------------------------------------------
// Public Exported function for the module
module.exports = {
    //-------------------------------------------------------------------------
    // loadConfig
    //
    // Load a json configuration file.  It is expected that this file follow 
    // the follow json file schema:
    // ```
    //{
    //    "ilp_address":      "address",
    //    "secret_seed":      "seedinfo",
    //    "admin_auth_token": "Admin token",
    //    "redis_connection": "Redis connection info",
    //    "http_address":     "127.0.0.0:3010"
    //}
    // ```
    loadConfig: async function (configPath) {
        try {
            console.log(`Loading config ${configPath}`);
            const configFile = await promisify(fs.readFile)
                                .call(null, configPath, { encoding: 'utf8' });
            return JSON.parse(configFile);
        } catch (err) {
            console.log('No config loaded');
            return null;
        }
    }, // end of function loadConfig

    //-------------------------------------------------------------------------
    // GenerateTestnetCredentials
    //
    // Creates a testnet account for the user.
    generateTestnetCredentials: async function (ilp_address, configPath, httpPort, btpPort, db = 0)
    {
        console.log('Generating testnet credentials...');
        const nodeId = randomBytes(12).toString('hex');
        const admin_auth_token = randomBytes(32).toString('hex');
        const localTunnelSubdomain = `ilp-node-${nodeId}`;
        const secret_seed = randomBytes(32).toString('hex');
        const redis_connection = `unix:${REDIS_UNIX_SOCKET}?db=${db}`;
        const http_address = `127.0.0.1:${httpPort}`;
        const btp_address = `127.0.0.1:${btpPort}`;

        // Write config file
        try {
            await promisify(fs.writeFile).call(null, configPath, JSON.stringify({
                admin_auth_token,
                ilp_address,
                localTunnelSubdomain,
                secret_seed,
                redis_connection,
                btp_address,
                http_address,
                default_spsp_account: 0
            }, null, 4))
            console.log('Saved config to ', configPath)
        } catch (err) {
            console.error("Error writing to config file, configuration was not saved:", err)
            process.exit(1)
        }
        return {
            ilp_address,
            admin_auth_token,
            localTunnelSubdomain,
            secret_seed
        }
    }, // end of function generateTestnetCredentials

    //-------------------------------------------------------------------------
    // runLocalTunnel
    //
    // Localtunnel is a NodeJS lib that will allow a local server to be exposed
    // to the great world.
    runLocalTunnel: async function (subdomain, restartOnError)
    {
        if (!subdomain) {
            throw new Error('Cannot start localtunnel with undefined subdomain')
        }
        console.log(`Starting localtunnel and requesting subdomain ${subdomain}`)

        const tunnel = await promisify(localtunnel).call(null, 7770, { subdomain })

        tunnel.on('error', (err) => console.error('localtunnel error:', err))

        tunnel.on('close', function () {
            console.error('localtunnel closed')
            if (restartOnError) {
                runLocalTunnel(subdomain, restartOnError)
            }
        })
    }, // end of function runLocalTunnel

    //-------------------------------------------------------------------------
    // launchRedis
    //
    // Launches a local redis instance if one is not running.  Currently we are
    // determining if redis is running based on the existence of a local unix
    // socket file which maynot be the best.
    launchRedis: async function ()
    {
        if(!fs.existsSync(REDIS_UNIX_SOCKET))
        {
            console.log('Launching redis-server')
            switch(process.platform)
            {
                case "linux":
                    redisConfig = "../crates/interledger-store-redis/external/libredis_cell.so";
                    break;
                case "darwin":
                    redisConfig = "../crates/interledger-store-redis/external/libredis_cell.dylib";
                    break;
                default:
                    // My guess is you are on a windows or BSD based box.
                    // for now this example is not supporting those platforms but
                    // can be updated in the future to do so
                    throw new Error("Unsupported Platform");
            }
            // Boot up redis
            const redis = spawn('redis-server',
                [
                    //redisConfig,
                    // Use a unix socket instead of TCP
                    `--unixsocket ${REDIS_UNIX_SOCKET}`,
                    '--unixsocketperm 777',
                    // Turn off redis saves 
                    '--appendonly yes',
                    '--appendfsync everysec', 
                    `--dir ./`,
                    `--loadmodule ${redisConfig}`
                ],
                {
                    stdio: 'inherit'
                });
            redis.on('error', (err) => console.error('Redis error:', err));
            redis.on('exit', (code, signal) => console.error(`Redis exited with code: ${code} and signal: ${signal}`));
        }
        else
        {
            console.log('Redis already running');
        }
    }, // end of function launchRedis

    //-------------------------------------------------------------------------
    // launchInterledger
    //
    // Launches a local build of Interledger-rs "node" which is a sender, 
    // connector and a receiver based on the local generated config
    launchInterledger: async function(configPath)
    {
        const env =
        {
            ILP_DEFAULT_SPSP_ACCOUNT: 0,
            RUST_LOG: 'interledger/.*'
        }
        for (let key in process.env)
        {
            if (key.startsWith('RUST'))
            {
                env[key] = process.env[key];
            }
        }
        console.log('Launching Interledger node');
        // [NOTE]   This maybe broken on linux because I think the crate will
        //          output the results to a different path.  Need to very this.
        const node =spawn('../target/debug/interledger',
                    [ 'node', `--config=${configPath}`,],
                    {
                        stdio: 'inherit',
                        env
                    });
        node.on('error', (err) => console.error('Interledger node error:', err))
        node.on('exit', (code, signal) => console.error(`Interledger node exited with code: ${code} and signal: ${signal}`))

        await new Promise((resolve) => setTimeout(resolve, 500));
    }, // end of function launchInterledger

    //-------------------------------------------------------------------------
    // pay
    //
    // Sends a request to one local interledger node (defined by variable fromPort)
    // base account to another local interledger nodes base account.
    pay: async function(fromPort, toPort, amount)
    {
        try {
            let rsp = await request({
                method: 'POST',
                uri: `http://localhost:${fromPort}/pay`,
                headers: {
                    Authorization: `Bearer default account holder`
                },
                json: true,
                body: {
                    receiver: `http://localhost:${toPort}/.well-known/pay`,
                    source_amount: amount
                }
            });
            return rsp;
        } catch (err) {
            throw new Error(`Unable to create node operator account: ${err.message}`)
        }
        console.log('Created operator account')
    }, // end of function pay

    //-------------------------------------------------------------------------
    // setRates
    //
    // Sends a request to a local interledger node to set the exchange rates
    // between to currencies on this node
    setRates: async function(port, adminToken, assetCode1, rate1, assetCode2, rate2)
    {
        console.log('Sending Rate Set')
        try {
            // [TODO]   According to the docs this would be the correct format
            //          for the JSON object, however this will be rejected by
            //          the server.
            //let body = {};
            //body[assetCode1] = rate1;
            //body[assetCode2] = rate2;

            // This is the version that will work!
            let body = [ [assetCode1, rate1], [assetCode2, rate2] ]; 
            
            // Fire off the request
            await request({
                method: 'PUT',
                uri: `http://localhost:${port}/rates`,
                headers: {
                    Authorization: `Bearer ${adminToken}`
                },
                json: true,
                body: body 
            })
        } catch (err) {
            throw new Error(`Unable to set the rate due to error: ${err.message}`)
        }
    }, // end of function setRates

    //-------------------------------------------------------------------------
    // createBaseAccount
    //
    // Creates a "base" account for a local server.  What I am calling a "base"
    // account is something setup as the "default account holder" 
    createAccount: async function(port, adminToken, ilpAddress, assetCode)
    {
        console.log('Creating account for node operator')
        try {
            let rsp = await request({
                method: 'POST',
                uri: `http://localhost:${port}/accounts`,
                headers: {
                    Authorization: `Bearer ${adminToken}`
                },
                json: true,
                body: {
                    ilp_address: ilpAddress,
                    http_incoming_token: "default account holder",
                    asset_code: assetCode,
                    asset_scale: 9,
                    send_routes: false,
                    receive_routes: false
                }
            })
            console.log(`Response = ${rsp}`);
        } catch (err) {
            throw new Error(`Unable to create node operator account: ${err.message}`)
        }
        console.log('Created operator account')
    }, // end of function createBaseAccount

    //-------------------------------------------------------------------------
    // addAccount
    //
    // Adds an account to the node.  Because in some situations the payload can
    // varify this version is different from the "createAccount" implementation
    // in that the caller is responsible for sending the object that will
    // be json encoded into the body of the POST request
    addAccount: async function(port, adminToken, body)
    {
        console.log('Creating account')
        try {
            let rsp = await request({
                method: 'POST',
                uri: `http://localhost:${port}/accounts`,
                headers: {
                    Authorization: `Bearer ${adminToken}`
                },
                json: true,
                body: body
            })
        } catch (err) {
            throw new Error(`Unable to create node operator account: ${err.message}`)
        }
    }, // end of function addAccount

    //-------------------------------------------------------------------------
    // setup
    //
    // This is a recipe function that will load a config file (or generate it if
    // it does not exists), launch Redis if it is not running, create a localTunnel,
    // launch the interledger node and finally create a "base" account,
    setup: async function(ilpAddress, assetCode, configPath, httpPort, btpPort, db, skipAccountCreate = false)
    {
        let useLocaltunnel = true;
        let config = await this.loadConfig(configPath);
        let createAccounts = false;

        // Create a config file for us to use
        if (!config)
        {
            config = await this.generateTestnetCredentials(ilpAddress, configPath, httpPort, btpPort, db);
            createAccounts = true
        }

        // Make sure we are running redis
        await this.launchRedis();

        // Start the local tunnel
        if(useLocaltunnel)
        {
            await this.runLocalTunnel(config.localTunnelSubdomain, false)
        } 

        // Now let boot up the Interledger node
        await this.launchInterledger(configPath);

        // Create any root users for the node
        if (createAccounts && !skipAccountCreate)
        {
            await this.createAccount(httpPort, config.admin_auth_token, config.ilp_address, assetCode);
        }

        console.log('\n\n')

        // Print instructions
        const nodeDomain = useLocaltunnel ? `https://${config.localTunnelSubdomain}.localtunnel.me` : 'http://172.17.0.2:7770'
        console.log(`>>> Node is accessible on: ${nodeDomain} \n`)
        console.log(`>>> Admin API Authorization header: "Bearer ${config.admin_auth_token}"\n`)
        console.log('\n')

        return config;
    } // end of function setup

} // end of exports block
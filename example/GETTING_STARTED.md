<p align="center">
  <img src="../interledger-rs.svg" width="700" alt="Interledger.rs">
</p>

---
> Getting Started with Interledger-rs

# Introduction

This guide is to help you get started using interledger with a working example in a test environment.

By the end of this tutorial you be able to do the following:

* Setup and run 3 working interledger nodes 
* Create accounts on the node
* Set an exchange rate between 2 different currency types
* Send a payment from account to another using different currency types

## Reference Material

Before jumping into the example it would be good to get high level understanding of how the Interledger Protocol works.  Here are some useful links.

* [How to interconnect all blockchains and value networks](https://medium.com/xpring/interledger-how-to-interconnect-all-blockchains-and-value-networks-74f432e64543)
* [Layer 3 is for interoperability](https://medium.com/xpring/layer-3-is-for-interoperability-ca387fa5f7e2)
* [ILP Summit 2019: State of the Interledger](https://www.youtube.com/watch?v=HTXLAM3PCUY&feature=youtu.be) [video]

# Environment Setup

## Setting up NodeJS

If you are new to NodeJS you can following [this](https://medium.com/@js_tut/installing-node-js-on-pc-mac-and-linux-getting-started-with-react-from-scratch-ea24653e0ab4) guide to help you get things up and running in your local environment.

This guide and sample code was written with NodeJS version 12.3.1.

## NPM Modules

You will need to install the following NPM modules:
* localtunnel: Used to expose your localhost to the world for easy testing and sharing.  
  * `npm install -g localtunnel`
* Request-Promis-Native: Simplifed HTTP request client with Promise support using native ES6 promises
  * `npm install -g request`
  * `npm install -g request-promise-native`
* [TODO] Others?

### Additiona Help

On MacOSX when installing NPM packages in the global space I found that you needed to update your NODE_PATH environment variable.  I see mine up like so:

```export NODE="${HOME}/node_modules;/usr/local/lib/node_modules"```

## Setting up Redis

Interledger-rs needs a storage system and you have the option to use Redis and/or Postges ([TODO] this will only work in my fork for now until I PR up the interledger-storage-postgres crate).  For this tutorial we will be using the redis module so we can easily remove any old accounts, etc.  For this guide we will assume you are running Redis locally, however you may want to consider moving to a docker based environment in the future:

[Installing Redis](https://redis.io/topics/quickstart)

For macOS `brew install redis` should work fine.

After installing run the following command on a commandline: `redis-server --version`.  If you see the version number then you are ready to go.  If not then that means your installation failed or redis was install somewhere not exported in your $PATH environment variable.

For this was tested using Redis 5.0.5

## Files:

### Static Files:

These are the files that should be included in the repo.

* **clean.sh**:  This will clean up your local testing environment between testing.  This is a bash script and should work on any POSIX based OS.  Running this script will delete all the auto-generated files as well.
  * *execute*: `./clean.sh`

* **run_node_1.js**:  A NodeJS script file that will start up Redis if it is not already running and start up an Interledger node that we will refer to a "1"
  * *execute*: `node run_node_1.js`

* **run_node_2.js**:  A NodeJS script file that will start up Redis if it is not already running and start up an Interledger node that we will refer to a "2"
  * *execute*: `node run_node_2.js`

* **run_node_3.js**:  A NodeJS script file that will start up Redis if it is not already running and start up an Interledger node that we will refer to a "3"
  * *execute*: `node run_node_3.js`

* **account_setup.js**: A NodeJS script that will setup all the accounts needed to do to the payment transaction flow. 
  * *execute*: `node account_setup.js`

* **rates_setup.js**: A NodeJS script that will setup setup the exchange rates between 2 currencies: COIN_A and COIN_B. 
  * *execute*: `node rates_setup.js`

* **pay.js**: A NodeJS script run a payment transaction from account `example.one` to account `example_three` for 100 COIN_A's for COIN_B's based on the exchange rate set in the `rates_setup.js` script. 
  * *execute*: `node pay.js`

### Generate Files:

When you run this guide, these files will be auto-created for you.  If you want to clean up these files and start over, stop any running scripts and then run `./clean.sh`

* **appendonly.aof**: The redis database storage file for the database info

* **node-config-1.json**: The interledger configuration data for node 1

* **node-config-2.json**: The interledger configuration data for node 2

* **node-config-3.json**: The interledger configuration data for node 3

# Running the sample

## Building interledger-rs

Assuming you have Rust installed on your local environment, all you need to do is run the command:

```$> crate build```

This will download any dependencies and build the interledger binary

## Staring your first connector node

```$> node run_node_1.js```

Then this script runs for the first time it will generate a config for this node and create the base user `example.one`.

It will also setup a local tunnel for this node so the outside world can connect to it.

What does this script do?
* Generates a config file for node 1
* Launch and Configure Redis
* Launch the interledger node
* Creates a base user in the system
  * `example.one` using a fake currency called `CoinA`

## Starting your second connector node

```$> node run_node_2.js```

What does this script do?
* Generates a config file for node 2
* Launch and Configure Redis (if not already running locally)
* Launch the interledger node

## Starting your thrid connector node

```$> node run_node_3.js```

What does this script do?
* Generates a config file for node 3
* Launch and Configure Redis (if not already running locally)
* Launch the interledger node
* Creates a base user account on this node
  * `example.three` using a fake currency called `CoinB`

## Creating the Accounts

```$> node account_setup.js```

[TODO] Need to explain the whole routing relationship system.

Before we can start sending payments around we need to setup 3 accounts.  On Node 1 we will have an account `example.one` using 'CoinA' and an account for `example.two` (as a peer) using `CoinA`.  On Node 2 we will have an `example.one` (as a peer) account using `COIN_A` and an account `example.three` using `CoinB` (as a Child).  Finally on Node 3 we will have an account 'example.three' using `CoinB` and an account 'example.two' (as a Parent) using 'COIN_B'.

What does this script do?

* Creates all the needed accounts with the proper routing relation ship.

## Set the exchange rates

```$> node account_setup.js```

With our current routing flow model the exchange for `COIN_A` to `COIN_B` will happen on node 2.  As a node operator we would like to set the exchange rate here. 

What does this script do?

* On node 2 we will set the exchange rates of 1 `COIN_A` is equal to 2 `COIN_B's`

## Send a Payment

[NOTE] This command is currently not working

```$> node pay.js```

[TODO] Generate a diagram that shows the hops from the nodes

What does this script do?
* Runs a payment from `example.one` to `example.three`

## [TODO] Inspecting a users balance

# Additional examples/samples:

Other API endpoints I should explore:

* Listing all the Accounts
* ilp route?
* routes
  * `/routes`
  * `/routes/static`
  * `/routes/static/{prefix}`
* spsp
  * `/spsp/{id}`
  * `/.well-known/pay` (this api is used how it needs to be explained)

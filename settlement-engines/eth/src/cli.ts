#!/usr/bin/env node

import * as yargs from 'yargs'
import { EthSettlementEngine } from './index'

const testnetServer = 'wss://s.altnet.rippletest.net:51233'

const argv = yargs
    .option('private_key', {
        description: 'ETH account private key',
        type: 'string'
    }).option('provider', {
        description: 'Ethereum provider to connect to',
        default: 'wss://mainnet.infura.io/ws',
        type: 'string'
    }).option('redis', {
        description: 'Redis URI to connect to',
        // TODO maybe connect using a socket instead
        default: 'redis://localhost:6379',
        type: 'string'
    }).option('min_settlement_amount', {
        default: 1000000,
        type: 'number',
        description: 'Minimum amount, denominated in Gwei, to send in an ETH payment'
    }).option('poll_interval', {
        default: 60000,
        type: 'number',
        description: 'Interval, denominated in milliseconds, to poll the Redis database for changes in account balances'
    }).demandOption(['private_key'])
    .argv

const config = {
  privateKey: argv.private_key,
  provider: argv.provider,
  redisUri: argv.redis,
  minSettlementAmount: argv.min_settlement_amount,
  pollInterval: argv.poll_interval
}

const engine = new EthSettlementEngine(config)
engine.connect().then(() => {
  console.log('Listening for incoming ETH payments and polling Redis for accounts that need to be settled')
}).catch((err) => console.error(err))

import Web3 from 'web3'
import { RedisClient, createClient } from 'redis'
import { readFile } from 'fs'
import { promisify } from 'util'
import { createHash } from 'crypto'
import * as path from 'path'
const readFileAsync = promisify(readFile)
import Debug from 'debug'
const debug = Debug('eth-settlment-engine')
import BN from 'bn.js'

const DEFAULT_POLL_INTERVAL = 60000
const KEY_ARGS = 0
const ETH_SCALE = 9
const DEFAULT_PROVIDER = 'wss://mainnet.infura.io/ws'
const DEFAULT_REDIS_URI = 'redis://localhost:6379'
const DEFAULT_MIN_SETTLEMENT_GWEI = 1000 // TODO is this too small?

export interface EthSettlementEngineConfig {
  // address: string,
  privateKey: string,
  provider?: string,
  redisUri?: string,
  minSettlementGwei?: number | string | BN,
  pollInterval?: number
}

export class EthSettlementEngine {
  private web3: Web3
  private redisClient: RedisClient
  private address: string
  private privateKey: string
  private pollInterval: number
  private interval: NodeJS.Timer
  private getAccountsThatNeedSettlement: (cursor: string, minSettlementAmount: string) => Promise<any>
  private creditAccountForSettlement: (address: string, amount: string) => Promise<any>
  private updateBalanceAfterSettlement: (account: string, gwei: string) => Promise<any>
  private minSettlementGwei: string

  constructor (config: EthSettlementEngineConfig) {
    // this.address = config.address
    this.privateKey = config.privateKey
    this.web3 = new Web3(config.provider || DEFAULT_PROVIDER)
    this.address = this.web3.eth.accounts.wallet.add(this.privateKey).address
    this.pollInterval = config.pollInterval || DEFAULT_POLL_INTERVAL
    this.redisClient = createClient(config.redisUri || DEFAULT_REDIS_URI)
    this.minSettlementGwei = new BN(typeof config.minSettlementGwei !== 'undefined' ? config.minSettlementGwei : DEFAULT_MIN_SETTLEMENT_GWEI).toString()
  }

  async connect (): Promise<void> {
    await new Promise((resolve, reject) => {
      if (this.redisClient.connected) {
        resolve()
      }
      this.redisClient.once('ready', resolve)
      this.redisClient.once('error', reject)
    })

    await this.loadScripts()

    const subscription = this.web3.eth.subscribe('logs', {
      address: this.address
    })
    subscription.on('data', this.handleTransaction.bind(this))

    /* tslint:disable-next-line:no-floating-promises */
    this.checkAccounts()
    this.interval = setInterval(() => this.checkAccounts(), this.pollInterval)
  }

  private async loadScripts () {
    debug('Loading scripts into Redis')

    const loadScript = promisify(this.redisClient.script.bind(this.redisClient, 'load'))

    const checkAccountsScript = await readFileAsync(path.join(__dirname, '../../redis-common/get_accounts_that_need_settlement.lua'), 'utf8')
    await loadScript(checkAccountsScript)
    const checkAccountsScriptHash = createHash('sha1').update(checkAccountsScript).digest('hex')
    this.getAccountsThatNeedSettlement = promisify(this.redisClient.evalsha.bind(this.redisClient, checkAccountsScriptHash, KEY_ARGS, 'eth', ETH_SCALE))

    const creditAccountForSettlementScript = await readFileAsync(path.join(__dirname, '../../redis-common/credit_account_for_settlement.lua'), 'utf8')
    await loadScript(creditAccountForSettlementScript)
    const creditAccountForSettlementScriptHash = createHash('sha1').update(creditAccountForSettlementScript).digest('hex')
    this.creditAccountForSettlement = promisify(this.redisClient.evalsha.bind(this.redisClient, creditAccountForSettlementScriptHash, KEY_ARGS, 'eth', ETH_SCALE))

    const updateBalanceAfterSettlementScript = await readFileAsync(path.join(__dirname, '../../redis-common/update_balance_after_settlement.lua'), 'utf8')
    await loadScript(updateBalanceAfterSettlementScript)
    const updateBalanceAfterSettlementScriptHash = createHash('sha1').update(updateBalanceAfterSettlementScript).digest('hex')
    this.updateBalanceAfterSettlement = promisify(this.redisClient.evalsha.bind(this.redisClient, updateBalanceAfterSettlementScriptHash, KEY_ARGS, ETH_SCALE))

    debug('Loaded scripts')
  }

  async disconnect (): Promise<void> {
    debug('Disconnecting')
    if (this.interval) {
      clearInterval(this.interval)
    }
    await Promise.all([
      //   this.web3.clearSubscriptions(),
      promisify(this.redisClient.quit.bind(this.redisClient))().then(() => debug('Disconnected from Redis'))
    ])
    debug('Disconnected')
  }

  private async checkAccounts () {
    debug('Checking accounts')
    let cursor = '0'
    do {
      cursor = await this.scanAccounts(cursor)
    }
    while (cursor !== '0')
    debug('Finished checking accounts')
  }

  private async scanAccounts (cursor: string): Promise<string> {
    const [newCursor, accountsToSettle] = await this.getAccountsThatNeedSettlement(cursor, this.minSettlementGwei)

    for (let accountRecord of accountsToSettle) {
      const [account, address, amountToSettle] = accountRecord
      /* tslint:disable-next-line:no-floating-promises */
      this.settle(account, address, amountToSettle)
    }

    return newCursor
  }

  private async settle (account: string, ethAddress: string, gwei: string) {
    debug(`Sending settlement of ${gwei} gwei to account: ${account} (ethAddress: ${ethAddress})`)
    let receipt
    try {
      receipt = await this.web3.eth.sendTransaction({
        to: ethAddress,
        from: this.address,
        value: this.web3.utils.toWei(gwei, 'Gwei')
      })
      debug('Got receipt:', receipt)
    } catch (err) {
      console.error(`Error sending ETH transaction to account ${account} (ethAddress: ${ethAddress}):`, err)
      return
    }
    if (receipt.status) {
      debug(`Sent ${gwei} gwei payment to account: ${account} (ethAddress: ${ethAddress})`)
      const newBalance = await this.updateBalanceAfterSettlement(account, gwei)
      debug(`Account ${account} now has balance: ${newBalance}`)
    } else {
      console.error(`ETH transaction failed to account ${account} (ethAddress: ${ethAddress}):`, receipt)
      return
    }
  }

  private async handleTransaction (transaction: any) {
    console.log(transaction)
  }

}

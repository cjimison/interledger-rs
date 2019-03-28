local asset_code = ARGV[1]
local amount_scale = ARGV[2]
local address = ARGV[3]
local amount = ARGV[4]

if not (asset_code and amount_scale and address and amount) then
    error("asset_code, amount_scale, address, and amount are required")
end

asset_code = string.lower(asset_code)

local account = redis.call("HGET", asset_code .. "_addresses", address)
if account then
    local asset_scale = redis.call("HGET", "accounts:" .. account, "asset_scale")
    local scaled_amount = math.floor(amount * 10 ^ (asset_scale - amount_scale))
    local new_balance = redis.call("HINCRBY", "balances:" .. asset_code, "" .. account, scaled_amount)
    return {account, new_balance}
else
    error("No account associated with address: " .. address)
end

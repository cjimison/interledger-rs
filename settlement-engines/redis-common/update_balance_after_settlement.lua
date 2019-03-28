local amount_scale = ARGV[1]
local account = ARGV[2]
local amount = ARGV[3]

if not (amount_scale and account and amount) then
    error("amount_scale, account and amount are required")
end

local asset_code, asset_scale = redis.call("HGET", "accounts:" .. account, "asset_code", "asset_scale")
if not asset_scale then
    error("account " .. account .. " is missing asset_scale")
end

asset_code = string.lower(asset_code)

local amount = math.floor(drops * 10 ^ (asset_scale - amount_scale))
-- The balance represents how much we owe them so lower it to reflect that we settled
local new_balance = redis.call("HINCRBY", "balances:" .. asset_code, account, 0 - amount)

return new_balance

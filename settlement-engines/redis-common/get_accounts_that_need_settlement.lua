-- The cursor is used to page through the results.
-- This script should be called first with '0'.
-- If the cursor returned is '0', that means it has finished going through all of the accounts.
-- If the cursor returned is not '0', this script should be called again with
-- that returned value to iterate through the next set of accounts.
local asset_code = ARGV[1]
local amount_scale = ARGV[2]
local cursor = ARGV[3]
local min_amount_to_settle = tonumber(ARGV[4]) or 0

if not (asset_code and amount_scale and cursor) then
    error("asset_code, amount_scale, and cursor are required")
end

asset_code = string.lower(asset_code)

local accounts = {}

local new_cursor, balances = unpack(redis.call("HSCAN", "balances:" .. asset_code, 0))
for i = 1, table.getn(balances), 2 do
    local account = balances[i]
    local balance = balances[i + 1]
    local settle_threshold = redis.call("HGET", "accounts:" .. account, "settle_threshold")
    -- Note: this ignores accounts that are missing any of the required details
    if settle_threshold then
        -- Check whether this account needs to settle
        if balance >= settle_threshold then
            local address, asset_scale, settle_to =
                unpack(
                redis.call("HMGET", "accounts:" .. account, asset_code .. "_address", "asset_scale", "settle_to")
            )

            if (address and asset_scale and settle_to) then
                -- Calculate the amount that the account needs to settle
                local amount_to_settle = balance - settle_to

                if amount_to_settle >= min_amount_to_settle then
                    local scaled_amount = tostring(math.floor(amount_to_settle * 10 ^ (asset_scale - amount_scale)))
                    table.insert(accounts, {account, address, scaled_amount})
                end
            end
        end
    end
end

return {new_cursor, accounts}

/**
 * The Roblox server Script that reports an experience's developer product and game pass sales to Space Studio
 * (POST /api/space-studio/beacon). It sends only item ids, prices and times: no player names, no user ids.
 * Purchases made while testing in Roblox Studio are test purchases (no Robux change hands), so the script never reports them;
 * it only says hello from Studio so the setup can be checked.
 */
import { siteUrl } from "@/lib/site";

export const BEACON_PATH = "/api/space-studio/beacon";

const origin = () => {
  const base = (process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "");
  return base.startsWith("https://") ? base : "https://keplar.one";
};

export function beaconScript(token: string): string {
  if (!/^ssb_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("bad beacon token");
  const endpoint = `${origin()}${BEACON_PATH}`;
  return `--[[
	Space Studio sales beacon
	Put this Script in ServerScriptService.

	Required: Game Settings > Security > "Allow HTTP Requests" must be ON (then publish the game).

	It reports developer product and game pass purchases (item id, price in Robux, time) to your
	Space Studio dashboard every 15 seconds and when a server shuts down. It sends no player names
	or user ids, and it never slows down or blocks a purchase. Test purchases in Roblox Studio are
	not reported.

	Keep this token private: anyone who has it can post sales for this experience.
	If it leaks, make a new one in Space Studio (Experiences > Beacon) and replace this Script.
]]

local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")

local ENDPOINT = "${endpoint}"
local TOKEN = "${token}"
local FLUSH_EVERY = 15 -- seconds
local MAX_BATCH = 50

local IS_STUDIO = RunService:IsStudio()
local queue = {} -- sales waiting to be sent
local failed = {} -- batches that failed once; each is retried one more time
local priceCache = {}
local flushing = false

local function priceOf(id, infoType)
	local key = tostring(infoType) .. ":" .. tostring(id)
	if priceCache[key] ~= nil then
		return priceCache[key]
	end
	local ok, info = pcall(function()
		return MarketplaceService:GetProductInfo(id, infoType)
	end)
	if ok and type(info) == "table" and type(info.PriceInRobux) == "number" then
		priceCache[key] = info.PriceInRobux
		return info.PriceInRobux
	end
	return nil -- unknown price: the sale is not reported rather than guessed
end

local function record(kind, id, infoType)
	if IS_STUDIO then
		return
	end
	local at = os.time()
	-- Runs on its own thread so the purchase flow never waits for us.
	task.spawn(function()
		local price = priceOf(id, infoType)
		if price == nil then
			return
		end
		table.insert(queue, {
			id = HttpService:GenerateGUID(false),
			kind = kind,
			itemId = id,
			robux = price,
			at = at,
		})
	end)
end

MarketplaceService.PromptProductPurchaseFinished:Connect(function(userId, productId, isPurchased)
	if isPurchased then
		record("product", productId, Enum.InfoType.Product)
	end
end)

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamePassId, wasPurchased)
	if wasPurchased then
		record("gamepass", gamePassId, Enum.InfoType.GamePass)
	end
end)

local function post(events)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = ENDPOINT,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = "Bearer " .. TOKEN,
			},
			Body = HttpService:JSONEncode({ events = events }),
		})
	end)
	if not ok then
		return false, true
	end
	-- 400 and 401 will not get better by retrying (bad data or a replaced token).
	return res.Success, res.StatusCode ~= 400 and res.StatusCode ~= 401
end

local function flush()
	if flushing then
		return
	end
	flushing = true
	-- Batches that failed last time get their one retry first.
	local retry = failed
	failed = {}
	for _, batch in ipairs(retry) do
		post(batch) -- second failure: dropped
	end
	while #queue > 0 do
		local batch = {}
		for _ = 1, math.min(MAX_BATCH, #queue) do
			table.insert(batch, table.remove(queue, 1))
		end
		local sent, retryable = post(batch)
		if not sent and retryable then
			table.insert(failed, batch)
		end
	end
	flushing = false
end

-- Say hello once so Space Studio can show the beacon as connected (no sale data).
task.delay(5, function()
	post({})
end)

task.spawn(function()
	while true do
		task.wait(FLUSH_EVERY)
		flush()
	end
end)

game:BindToClose(function()
	local waited = 0
	while flushing and waited < 10 do
		task.wait(0.5)
		waited += 0.5
	end
	flush()
end)
`;
}

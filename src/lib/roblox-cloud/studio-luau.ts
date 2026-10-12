/**
 * The fixed Luau the Studio page runs through the desktop bridge for Roblox Cloud (never model-written code):
 *   indexLuau()      read-only: every script's path, class and size, plus a compact instance tree
 *   sourcesLuau(a,b) read-only: the sources of scripts a..b in the index's order (unsaved editor text included)
 *   readLuau(path)   read-only: one script's current source, to check for conflicts before applying
 *   applyLuau(...)   writes one change (edit, create or delete) as one undoable ChangeHistoryService step
 *
 * Paths: Service/Child/Child. A "/" inside a name is written as "∕" (U+2215); a name shared by several siblings gets #2, #3…
 * in sibling order, so every script has exactly one path.
 */

export const SERVICES = ["Workspace", "ServerScriptService", "ServerStorage", "ReplicatedStorage", "ReplicatedFirst", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "Chat", "TextChatService"] as const;

const PATH_FNS = `
local HttpService = game:GetService("HttpService")
local SES = game:GetService("ScriptEditorService")
local SERVICES = {${SERVICES.map((s) => `"${s}"`).join(", ")}}
local function seg(inst)
  local name = string.gsub(inst.Name, "/", "∕")
  local parent = inst.Parent
  if parent and parent ~= game then
    local n, mine = 0, 0
    for _, c in parent:GetChildren() do
      if c.Name == inst.Name then n += 1; if c == inst then mine = n end end
    end
    if n > 1 and mine > 1 then name ..= "#" .. mine end
  end
  return name
end
local function pathOf(inst)
  local parts = {}
  local cur = inst
  while cur and cur ~= game do table.insert(parts, 1, seg(cur)); cur = cur.Parent end
  return table.concat(parts, "/")
end
local function isScript(d) return d:IsA("LuaSourceContainer") and (d.ClassName == "Script" or d.ClassName == "LocalScript" or d.ClassName == "ModuleScript") end
local function allScripts()
  local out = {}
  for _, svcName in SERVICES do
    local ok, svc = pcall(function() return game:GetService(svcName) end)
    if ok and svc then for _, d in svc:GetDescendants() do if isScript(d) then table.insert(out, d) end end end
  end
  return out
end
local function sourceOf(s)
  local ok, text = pcall(function() return SES:GetEditorSource(s) end)
  if ok and type(text) == "string" then return text end
  return s.Source
end
local function resolve(path)
  local cur = game
  for part in string.gmatch(path, "[^/]+") do
    local name, idx = string.match(part, "^(.-)#(%d+)$")
    if not name then name, idx = part, "1" end
    name = string.gsub(name, "∕", "/")
    local want, n, found = tonumber(idx), 0, nil
    if cur == game then
      local ok, svc = pcall(function() return game:GetService(name) end)
      found = ok and svc or nil
    else
      for _, c in cur:GetChildren() do
        if c.Name == name then n += 1; if n == want then found = c; break end end
      end
    end
    if not found then return nil end
    cur = found
  end
  return cur
end
`;

/** Read-only: { place, scripts: [{ i, path, className, runContext, bytes }], tree } as JSON. */
export function indexLuau(maxTreeLines = 900): string {
  return `${PATH_FNS}
local scripts = {}
for i, s in allScripts() do
  local rc = nil
  if s.ClassName == "Script" then local ok, v = pcall(function() return s.RunContext.Name end); if ok then rc = v end end
  table.insert(scripts, { i = i, path = pathOf(s), className = s.ClassName, runContext = rc, bytes = #sourceOf(s) })
end
local lines, budget = {}, ${maxTreeLines}
local function walk(inst, depth)
  if budget <= 0 then return end
  local kids = inst:GetChildren()
  local counts = {}
  for _, c in kids do counts[c.ClassName] = (counts[c.ClassName] or 0) + 1 end
  local shown = {}
  for _, c in kids do
    if budget <= 0 then break end
    local many = counts[c.ClassName] > 12 and (c:IsA("BasePart") or c:IsA("Model") or c:IsA("Attachment") or c:IsA("Decal") or c:IsA("Texture"))
    if many then
      if not shown[c.ClassName] then
        shown[c.ClassName] = true
        table.insert(lines, string.rep("  ", depth) .. counts[c.ClassName] .. " x " .. c.ClassName); budget -= 1
      end
    else
      local n = #c:GetDescendants()
      table.insert(lines, string.rep("  ", depth) .. seg(c) .. " [" .. c.ClassName .. "]" .. (n > 0 and (" (" .. n .. " inside)") or "")); budget -= 1
      if depth < 5 and not c:IsA("BasePart") then walk(c, depth + 1) end
    end
  end
end
for _, svcName in SERVICES do
  local ok, svc = pcall(function() return game:GetService(svcName) end)
  if ok and svc then table.insert(lines, svcName); budget -= 1; walk(svc, 1) end
end
return HttpService:JSONEncode({ place = game.Name, placeId = game.PlaceId, scripts = scripts, tree = table.concat(lines, "\\n"), truncated = budget <= 0 })`;
}

/** Read-only: the sources of scripts from..to (1-based, inclusive) in the same order as indexLuau, as JSON. */
export function sourcesLuau(from: number, to: number): string {
  return `${PATH_FNS}
local out = {}
local list = allScripts()
for i = ${Math.max(1, Math.floor(from))}, math.min(#list, ${Math.max(1, Math.floor(to))}) do
  local s = list[i]
  table.insert(out, { i = i, path = pathOf(s), source = sourceOf(s) })
end
return HttpService:JSONEncode(out)`;
}

/** A Luau long-string literal that holds `text` exactly (a level of = signs the text never uses; the leading newline Luau drops). */
export function luauLongString(text: string): string {
  let eq = "";
  // The closing bracket must first appear exactly at the end: not inside the text, and not formed by a trailing "]" in it.
  while ((text + `]${eq}]`).indexOf(`]${eq}]`) !== text.length) eq += "=";
  return `[${eq}[\n${text}]${eq}]`;
}

const luauString = (s: string) => JSON.stringify(s);

/** Read-only: { missing: true } or { missing: false, source } for one script, as JSON (exact, whitespace included). */
export function readLuau(path: string): string {
  return `${PATH_FNS}
local s = resolve(${luauString(path)})
if not s or not isScript(s) then return HttpService:JSONEncode({ missing = true }) end
return HttpService:JSONEncode({ missing = false, source = sourceOf(s) })`;
}

export type ApplyChange = { path: string; status: "changed" | "created" | "deleted"; className: string; runContext?: string | null; next: string | null };

/** Writes one change in Studio as a single undoable step. Returns "ok" or "error: …". */
export function applyLuau(c: ApplyChange): string {
  const write = c.next === null ? "" : luauLongString(c.next);
  return `${PATH_FNS}
local CHS = game:GetService("ChangeHistoryService")
local rec = CHS:TryBeginRecording("Keplar Roblox Cloud: ${c.path.replace(/["\\\n]/g, "")}")
local function done(ok) if rec then CHS:FinishRecording(rec, ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel) end end
local okAll, err = pcall(function()
  local path = ${luauString(c.path)}
  ${c.status === "deleted" ? `
  local s = resolve(path)
  if s and isScript(s) then s:Destroy() end` : c.status === "changed" ? `
  local s = resolve(path)
  if not s or not isScript(s) then error("the script is no longer there") end
  local src = ${write}
  local ok = pcall(function() SES:UpdateSourceAsync(s, function() return src end) end)
  if not ok then s.Source = src end` : `
  local parentPath, name = string.match(path, "^(.*)/([^/]+)$")
  local parent = game
  for part in string.gmatch(parentPath, "[^/]+") do
    local found = resolve((parent == game and "" or pathOf(parent) .. "/") .. part)
    if not found then
      local f = Instance.new("Folder")
      f.Name = string.gsub(string.gsub(part, "#%d+$", ""), "∕", "/")
      f.Parent = parent
      found = f
    end
    parent = found
  end
  local s = Instance.new(${luauString(c.className)})
  s.Name = string.gsub(name, "∕", "/")
  ${c.runContext && c.className === "Script" ? `pcall(function() s.RunContext = Enum.RunContext[${luauString(c.runContext)}] end)` : ""}
  s.Source = ${write}
  s.Parent = parent`}
end)
done(okAll)
if okAll then return "ok" end
return "error: " .. tostring(err)`;
}

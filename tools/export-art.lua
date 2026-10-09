-- Exports every sprite in art/ to src/sprites.json, which is what the game reads: it needs no Aseprite to run.
--
--   aseprite -b --script tools/export-art.lua        (npm run art)
--
-- Each art/*.aseprite file is a sheet, drawn in INDEXED mode in the palette of art/palette.gpl. Its frames
-- are named by their tags: a tag over one frame names it, a tag over several numbers them (walk1, walk2…);
-- an untagged frame goes by its number. Hidden layers are left out. Slices are exported by name as
-- [x, y, w, h]: the game reads anchors from them (a doorway, where smoke rises).
-- A pixel is written as one character for its palette index: '.' for 0 (transparent), then 1-9, a-z, A-Z,
-- then the symbols #$%&*+-/:;<=>?@^_~ (80 colours in all).

local dir = app.params.dir or "art"
local out = app.params.out or "src/sprites.json"
local ALPHABET = ".123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/:;<=>?@^_~"

local function quote(s)
  return '"' .. s:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"'
end

local function hex(c)
  return string.format("#%02x%02x%02x", c.red, c.green, c.blue)
end

-- The palette's names, from art/palette.gpl: the game knows what glows by them.
local colorNames = {}
for line in io.lines(app.fs.joinPath(dir, "palette.gpl")) do
  local name = line:match("^%s*%d+%s+%d+%s+%d+%s+(.-)%s*$")
  if name then table.insert(colorNames, quote(name)) end
end

local names = {}
for _, name in ipairs(app.fs.listFiles(dir)) do
  if name:match("%.aseprite$") then table.insert(names, name) end
end
table.sort(names)

local master = nil
local sheets = {}
for _, file in ipairs(names) do
  local sprite = app.open(app.fs.joinPath(dir, file))
  if sprite.colorMode ~= ColorMode.INDEXED then error(file .. " is not in indexed colour mode") end
  local palette = sprite.palettes[1]
  local colors = {}
  for i = 0, #palette - 1 do table.insert(colors, quote(hex(palette:getColor(i)))) end
  local joined = table.concat(colors, ",")
  if master == nil then master = joined
  elseif master ~= joined then error(file .. " has its own palette: load art/palette.gpl into it") end

  -- Frame names from the tags.
  local frameNames = {}
  for _, tag in ipairs(sprite.tags) do
    local from = tag.fromFrame.frameNumber
    local to = tag.toFrame.frameNumber
    for f = from, to do
      frameNames[f] = (from == to) and tag.name or (tag.name .. (f - from + 1))
    end
  end

  local frames = {}
  local order = {}
  for _, frame in ipairs(sprite.frames) do
    local n = frame.frameNumber
    local name = frameNames[n] or tostring(n)
    local image = Image(sprite.spec)
    image:clear(sprite.transparentColor)
    image:drawSprite(sprite, n)
    local rows = {}
    for y = 0, image.height - 1 do
      local row = {}
      for x = 0, image.width - 1 do
        local i = image:getPixel(x, y)
        if i == sprite.transparentColor then i = 0 end
        if i >= #ALPHABET then error(file .. ": palette index " .. i .. " is past the end of the alphabet") end
        table.insert(row, ALPHABET:sub(i + 1, i + 1))
      end
      table.insert(rows, '      ' .. quote(table.concat(row)))
    end
    table.insert(order, quote(name))
    table.insert(frames, '    ' .. quote(name) .. ': [\n' .. table.concat(rows, ',\n') .. '\n    ]')
  end

  local slices = {}
  for _, slice in ipairs(sprite.slices) do
    local b = slice.bounds
    table.insert(slices, quote(slice.name) .. ': [' .. b.x .. ', ' .. b.y .. ', ' .. b.width .. ', ' .. b.height .. ']')
  end

  local sheet = file:gsub("%.aseprite$", "")
  table.insert(sheets, '  ' .. quote(sheet) .. ': {\n' ..
    '   "w": ' .. sprite.width .. ', "h": ' .. sprite.height .. ',\n' ..
    '   "order": [' .. table.concat(order, ', ') .. '],\n' ..
    '   "slices": {' .. table.concat(slices, ', ') .. '},\n' ..
    '   "frames": {\n' .. table.concat(frames, ',\n') .. '\n   }\n  }')
  sprite:close()
end

local f = io.open(out, "w")
f:write('{\n "palette": [' .. (master or '') .. '],\n "names": [' .. table.concat(colorNames, ",") .. '],\n "sprites": {\n' .. table.concat(sheets, ',\n') .. '\n }\n}\n')
f:close()
print("exported " .. #sheets .. " sheets to " .. out)

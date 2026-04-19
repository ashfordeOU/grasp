local M = {}
local ui = require('grasp.ui')

local function run_grasp(args, on_output)
  local output = {}
  vim.fn.jobstart(vim.list_extend({'grasp'}, args), {
    stdout_buffered = true,
    on_stdout = function(_, data)
      if data then for _, line in ipairs(data) do if line ~= '' then table.insert(output, line) end end end
    end,
    on_exit = function(_, code)
      if code ~= 0 then on_output(nil, 'grasp exited with code ' .. code)
      else on_output(table.concat(output, '\n'), nil) end
    end,
  })
end

M._last_result = nil

function M.analyze()
  local cwd = vim.fn.getcwd()
  vim.notify('Grasp: analyzing ' .. cwd .. '...', vim.log.levels.INFO)
  run_grasp({'analyze', cwd, '--format=json'}, function(output, err)
    if err then vim.notify('Grasp error: ' .. err, vim.log.levels.ERROR); return end
    local ok, data = pcall(vim.json.decode, output)
    if not ok then vim.notify('Grasp: failed to parse output', vim.log.levels.WARN); return end
    M._last_result = data
    local s = data.summary or {}
    local lines = {
      '  Health: ' .. (s.healthScore or '?') .. ' (' .. (s.healthGrade or '?') .. ')',
      '  Files: ' .. (s.fileCount or '?') .. '  |  Code: ' .. (s.codeFileCount or '?'),
      '  Issues: ' .. (s.issueCount or 0) .. '  |  Critical: ' .. (s.criticalIssueCount or 0),
      '  Circular Deps: ' .. (s.circularDepCount or 0),
      '  Security Issues: ' .. (s.securityIssueCount or 0),
      '', '  Press q to close',
    }
    ui.float('Grasp Analysis', lines)
    vim.g.grasp_health_score = s.healthScore
    vim.g.grasp_health_grade = s.healthGrade
  end)
end

function M.hotspots()
  run_grasp({'analyze', vim.fn.getcwd(), '--format=json'}, function(output, err)
    if err then vim.notify('Grasp error: ' .. err, vim.log.levels.ERROR); return end
    local ok, data = pcall(vim.json.decode, output)
    if not ok then return end
    local files = data.files or {}
    table.sort(files, function(a, b) return (a.avgComplexity or 0) > (b.avgComplexity or 0) end)
    local lines = {'  Top 10 Hotspots (by complexity):', ''}
    for i, f in ipairs(files) do
      if i > 10 then break end
      table.insert(lines, string.format('  %2d. %-50s  complexity: %s', i, f.path or '', f.avgComplexity or '?'))
    end
    table.insert(lines, ''); table.insert(lines, '  Press q to close')
    ui.float('Grasp Hotspots', lines)
  end)
end

function M.deps()
  local current_file = vim.fn.expand('%:p')
  run_grasp({'analyze', vim.fn.getcwd(), '--format=json'}, function(output, err)
    if err then vim.notify('Grasp error: ' .. err, vim.log.levels.ERROR); return end
    local ok, data = pcall(vim.json.decode, output)
    if not ok then return end
    local deps_out, deps_in = {}, {}
    for _, conn in ipairs(data.connections or {}) do
      local from = conn.from or ''; local to = conn.to or ''
      if from:find(current_file, 1, true) or current_file:find(from, 1, true) then table.insert(deps_out, '  → ' .. to) end
      if to:find(current_file, 1, true) or current_file:find(to, 1, true) then table.insert(deps_in, '  ← ' .. from) end
    end
    local lines = {'  File: ' .. vim.fn.expand('%:.'), '', '  Depends on:'}
    for _, d in ipairs(deps_out) do table.insert(lines, d) end
    if #deps_out == 0 then table.insert(lines, '  (none)') end
    table.insert(lines, ''); table.insert(lines, '  Depended on by:')
    for _, d in ipairs(deps_in) do table.insert(lines, d) end
    if #deps_in == 0 then table.insert(lines, '  (none)') end
    table.insert(lines, ''); table.insert(lines, '  Press q to close')
    ui.float('Grasp Deps', lines)
  end)
end

function M.stale()
  run_grasp({'analyze', vim.fn.getcwd(), '--format=json'}, function(output, err)
    if err then vim.notify('Grasp error: ' .. err, vim.log.levels.ERROR); return end
    local ok, data = pcall(vim.json.decode, output)
    if not ok then return end
    local files = data.files or {}
    table.sort(files, function(a, b) return (a.churn or 0) < (b.churn or 0) end)
    local lines = {'  Potentially Stale Files:', ''}
    local count = 0
    for _, f in ipairs(files) do
      if count >= 15 then break end
      if (f.churn or 0) == 0 then table.insert(lines, string.format('  %-55s  churn: %d', f.path or '', f.churn or 0)); count = count + 1 end
    end
    if count == 0 then table.insert(lines, '  No obviously stale files found.') end
    table.insert(lines, ''); table.insert(lines, '  Press q to close')
    ui.float('Grasp Stale Files', lines)
  end)
end

function M.health_score()
  local grade = vim.g.grasp_health_grade; local score = vim.g.grasp_health_score
  if grade and score then return 'grasp:' .. grade .. '(' .. score .. ')' end
  return ''
end

vim.api.nvim_create_user_command('GraspHotspots', function()
  local result = M._last_result
  if not result then vim.notify('Run :GraspAnalyze first', vim.log.levels.WARN) return end
  local hotspots = result.hotspots or {}
  local lines = {}
  for i, h in ipairs(hotspots) do
    if i > 10 then break end
    table.insert(lines, string.format('%d. %s (score: %s)', i, h.file, h.score or '?'))
  end
  vim.notify(table.concat(lines, '\n'), vim.log.levels.INFO)
end, {})

vim.api.nvim_create_user_command('GraspDeps', function()
  local file = vim.fn.expand('%:.')
  local result = M._last_result
  if not result then vim.notify('Run :GraspAnalyze first', vim.log.levels.WARN) return end
  local deps = {}
  for _, c in ipairs(result.connections or {}) do
    if c.source == file then table.insert(deps, c.target) end
  end
  if #deps == 0 then
    vim.notify('No deps for ' .. file, vim.log.levels.INFO)
  else
    vim.notify(file .. ' imports:\n' .. table.concat(deps, '\n'), vim.log.levels.INFO)
  end
end, {})

return M

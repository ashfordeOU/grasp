local M = {}

function M.float(title, lines)
  local width = math.min(math.max(#title + 4, 60), vim.o.columns - 4)
  local height = math.min(#lines + 2, vim.o.lines - 4)
  local row = math.floor((vim.o.lines - height) / 2)
  local col = math.floor((vim.o.columns - width) / 2)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.api.nvim_buf_set_option(buf, 'modifiable', false)
  vim.api.nvim_buf_set_option(buf, 'buftype', 'nofile')
  local win = vim.api.nvim_open_win(buf, true, {
    relative = 'editor', width = width, height = height,
    row = row, col = col, style = 'minimal', border = 'rounded',
    title = ' ' .. title .. ' ', title_pos = 'center',
  })
  vim.keymap.set('n', 'q', function() vim.api.nvim_win_close(win, true) end, { buffer = buf, silent = true })
  vim.keymap.set('n', '<Esc>', function() vim.api.nvim_win_close(win, true) end, { buffer = buf, silent = true })
  return buf, win
end

return M

if vim.g.grasp_loaded then return end
vim.g.grasp_loaded = 1

local grasp = require('grasp')

vim.api.nvim_create_user_command('GraspAnalyze', function() grasp.analyze() end, { desc = 'Run grasp analyze on cwd and show health score' })
vim.api.nvim_create_user_command('GraspHotspots', function() grasp.hotspots() end, { desc = 'List top 10 hotspot files' })
vim.api.nvim_create_user_command('GraspDeps', function() grasp.deps() end, { desc = 'Show deps/dependents for file under cursor' })
vim.api.nvim_create_user_command('GraspStale', function() grasp.stale() end, { desc = 'List stale files' })

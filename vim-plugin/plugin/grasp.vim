" Grasp — Code Architecture Visualizer
" https://github.com/ashfordeOU/grasp

if exists('g:loaded_grasp') | finish | endif
let g:loaded_grasp = 1

" Configuration
let g:grasp_executable = get(g:, 'grasp_executable', 'grasp')
let g:grasp_statusline = get(g:, 'grasp_statusline', 1)
let g:grasp_auto_analyze = get(g:, 'grasp_auto_analyze', 0)

" Commands
command! GraspAnalyze call grasp#analyze()
command! GraspDeps call grasp#show_deps()
command! GraspHealth call grasp#show_health()
command! GraspBlast call grasp#blast_radius()

" Statusline component
if g:grasp_statusline
  set statusline+=%{grasp#statusline()}
endif

" Auto-analyze on save (optional)
if g:grasp_auto_analyze
  autocmd BufWritePost * call grasp#auto_analyze()
endif

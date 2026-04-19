" Autoloaded functions for Grasp Vim plugin

function! grasp#analyze() abort
  let l:cmd = g:grasp_executable . ' analyze ' . shellescape(getcwd())
  let l:result = system(l:cmd)
  if v:shell_error != 0
    echoerr '[Grasp] Analysis failed: ' . split(l:result, "\n")[0]
    return
  endif
  echo '[Grasp] ' . split(l:result, "\n")[0]
endfunction

function! grasp#show_deps() abort
  let l:file = expand('%:.')
  if empty(l:file)
    echo '[Grasp] No file in current buffer'
    return
  endif
  let l:cmd = g:grasp_executable . ' deps ' . shellescape(l:file)
  let l:result = system(l:cmd)
  echo l:result
endfunction

function! grasp#show_health() abort
  let l:file = expand('%:.')
  if empty(l:file)
    echo '[Grasp] No file in current buffer'
    return
  endif
  let l:cmd = g:grasp_executable . ' health ' . shellescape(l:file)
  let l:result = system(l:cmd)
  echo split(l:result, "\n")[0]
endfunction

function! grasp#blast_radius() abort
  let l:file = expand('%:.')
  let l:cmd = g:grasp_executable . ' blast ' . shellescape(l:file)
  let l:result = system(l:cmd)
  echo l:result
endfunction

function! grasp#statusline() abort
  return exists('b:grasp_grade') ? '[Grasp:' . b:grasp_grade . ']' : ''
endfunction

function! grasp#auto_analyze() abort
  " Silent background analysis — only updates b:grasp_grade
  let l:result = system(g:grasp_executable . ' health ' . shellescape(expand('%:.')) . ' --quiet 2>/dev/null')
  let b:grasp_grade = trim(split(l:result, "\n")[0])
endfunction

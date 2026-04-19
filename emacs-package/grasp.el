;;; grasp.el --- Code architecture visualizer  -*- lexical-binding: t -*-

;; Copyright (C) 2026 Ashforde OÜ

;; Author: Ashforde OÜ <hello@ashforde.org>
;; Version: 3.1.2
;; Package-Requires: ((emacs "27.1"))
;; Keywords: tools, programming
;; URL: https://github.com/ashfordeOU/grasp
;; SPDX-License-Identifier: Elastic-2.0

;;; Commentary:
;; Grasp provides Emacs integration for code architecture analysis.
;; It requires the Grasp CLI (npm install -g grasp-mcp-server).

;;; Code:

(defgroup grasp nil
  "Grasp code architecture integration."
  :group 'tools
  :prefix "grasp-")

(defcustom grasp-executable "grasp"
  "Path to the grasp executable."
  :type 'string
  :group 'grasp)

(defcustom grasp-auto-analyze nil
  "If non-nil, run Grasp analysis on file save."
  :type 'boolean
  :group 'grasp)

;;;###autoload
(defun grasp-analyze ()
  "Analyse the current project with Grasp."
  (interactive)
  (let* ((dir (or (and (fboundp 'project-root)
                       (project-current)
                       (project-root (project-current)))
                  default-directory))
         (output (shell-command-to-string
                  (format "%s analyze %s" grasp-executable (shell-quote-argument dir)))))
    (with-current-buffer (get-buffer-create "*Grasp Analysis*")
      (erase-buffer)
      (insert output)
      (display-buffer (current-buffer)))))

;;;###autoload
(defun grasp-show-deps ()
  "Show dependencies for the current file."
  (interactive)
  (if (buffer-file-name)
      (let ((output (shell-command-to-string
                     (format "%s deps %s"
                             grasp-executable
                             (shell-quote-argument (buffer-file-name))))))
        (message "%s" (car (split-string output "\n"))))
    (message "[Grasp] No file associated with buffer")))

;;;###autoload
(defun grasp-show-health ()
  "Show health score for the current file."
  (interactive)
  (if (buffer-file-name)
      (let ((output (shell-command-to-string
                     (format "%s health %s"
                             grasp-executable
                             (shell-quote-argument (buffer-file-name))))))
        (message "%s" (car (split-string output "\n"))))
    (message "[Grasp] No file associated with buffer")))

(defvar grasp-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "C-c g a") #'grasp-analyze)
    (define-key map (kbd "C-c g d") #'grasp-show-deps)
    (define-key map (kbd "C-c g h") #'grasp-show-health)
    map)
  "Keymap for `grasp-mode'.")

;;;###autoload
(define-minor-mode grasp-mode
  "Minor mode for Grasp architecture analysis.

\\{grasp-mode-map}"
  :lighter " Grasp"
  :keymap grasp-mode-map
  :group 'grasp
  (when (and grasp-mode grasp-auto-analyze)
    (add-hook 'after-save-hook #'grasp-analyze nil t)))

(provide 'grasp)
;;; grasp.el ends here

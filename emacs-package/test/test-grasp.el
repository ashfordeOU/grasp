;;; test-grasp.el --- ERT tests for grasp.el  -*- lexical-binding: t -*-

(require 'ert)

;; Load the package under test
(load-file (expand-file-name "../grasp.el"
                             (file-name-directory
                              (or load-file-name buffer-file-name))))

(ert-deftest grasp-package-loads ()
  "Test that the grasp package loads without errors."
  (should (featurep 'grasp)))

(ert-deftest grasp-executable-default ()
  "Test that grasp-executable defaults to 'grasp'."
  (should (string= grasp-executable "grasp")))

(ert-deftest grasp-mode-is-defined ()
  "Test that grasp-mode is defined as a minor mode."
  (should (fboundp 'grasp-mode)))

(ert-deftest grasp-analyze-is-defined ()
  "Test that grasp-analyze command is defined."
  (should (fboundp 'grasp-analyze)))

(ert-deftest grasp-show-deps-is-defined ()
  "Test that grasp-show-deps command is defined."
  (should (fboundp 'grasp-show-deps)))

(ert-deftest grasp-mode-map-has-bindings ()
  "Test that grasp-mode-map has the expected key bindings."
  (should (keymapp grasp-mode-map))
  (should (lookup-key grasp-mode-map (kbd "C-c g a"))))

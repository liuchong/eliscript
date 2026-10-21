;;; compile-evidence.el --- Recompile maintained acceptance evidence -*- lexical-binding: t; -*-

;; Read-only verification: produce a fresh compiler result in memory.  Neither
;; the canonical output nor its source map is used as a compilation input.
(require 'json)
(declare-function eliscript-compile-string-with-source-map
                  "eliscript" (source &optional filename generated-name source-name))
(declare-function eliscript-emission-javascript "eliscript-source-map" (emission))
(declare-function eliscript-emission-source-map "eliscript-source-map" (emission))

(let* ((root (expand-file-name "../.." (file-name-directory (or load-file-name buffer-file-name))))
       (source-argument (pop command-line-args-left))
       (output-argument (pop command-line-args-left)))
  (unless (and (member (cons source-argument output-argument)
                      '(("tests/eliscript/bootstrap-compiler.eli" . "tests/bootstrap-compiler.test.mjs")
                        ("tools/integrity/eliscript/check.eli" . "tools/integrity/check.mjs")
                        ("tools/acceptance/finalize.eli" . "tools/acceptance/finalize.mjs")
                        ("tests/eliscript/conformance.eli" . "tests/conformance.test.mjs")
                        ("tests/eliscript/ci-contract.eli" . "tests/ci-contract.test.mjs")
                        ("tests/eliscript/compiler-parity-corpus.eli" . "tests/compiler-parity-corpus.test.mjs")
                        ("tests/eliscript/stable-compatibility-corpus.eli" . "tests/stable-compatibility-corpus.test.mjs")))
               (null command-line-args-left))
    (error "Unsupported generated acceptance evidence"))
  (add-to-list 'load-path (expand-file-name "compiler" root))
  (require 'eliscript)
  (let* ((source-file (expand-file-name source-argument root))
         (output-file (expand-file-name output-argument root))
         (map-file (concat output-file ".map"))
         (source (with-temp-buffer
                   (let ((coding-system-for-read 'utf-8-unix))
                     (insert-file-contents source-file))
                   (buffer-string)))
         (emission (eliscript-compile-string-with-source-map
                    source source-file
                    (file-relative-name output-file (file-name-directory map-file))
                    (file-relative-name source-file (file-name-directory map-file))))
         (javascript (concat (eliscript-emission-javascript emission)
                             "//# sourceMappingURL="
                             (file-relative-name map-file (file-name-directory output-file))
                             "\n")))
    (let ((encoded (json-serialize
                    `((javascript . ,javascript)
                      (sourceMap . ,(eliscript-emission-source-map emission))))))
      ;; The native serializer can return unibyte UTF-8.  Decode before princ
      ;; so Unicode text is not emitted as raw Emacs byte characters.
      (princ (if (multibyte-string-p encoded) encoded
               (decode-coding-string encoded 'utf-8-unix))))))

;;; compile-evidence.el ends here

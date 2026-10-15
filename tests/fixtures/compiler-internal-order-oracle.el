;;; compiler-internal-order-oracle.el --- Compiler-private ordering oracle -*- lexical-binding: t; -*-
(require 'json)
(require 'eliscript-project)
(require 'eliscript-transient-analysis)

(defun eliscript-order-oracle--units (text)
  "Return TEXT as numeric UTF-16 units, retaining isolated surrogates."
  (let ((bytes (encode-coding-string text 'utf-16be t)) (index 0) units)
    (while (< index (length bytes))
      (push (+ (ash (aref bytes index) 8) (aref bytes (1+ index))) units)
      (setq index (+ index 2)))
    (vconcat (nreverse units))))

(let* ((root (file-name-as-directory (getenv "ELISCRIPT_ORDER_ROOT")))
       (names (mapcar (lambda (points) (apply #'string points))
                      (json-parse-string (getenv "ELISCRIPT_ORDER_NAMES")
                                         :array-type 'list)))
       (dependencies
        (mapcar (lambda (name)
                  (eliscript-project-macro-dependency-create
                   :source (expand-file-name (concat "macro/" name ".eli") root)
                   :digest (make-string 64 ?a))) names))
       (modules
        (mapcar (lambda (name)
                  (eliscript-project-module-create
                   :source (expand-file-name (concat "src/" name ".eli") root)
                   :output (expand-file-name (concat "dist/src/" name ".mjs") root)
                   :source-map (expand-file-name (concat "dist/src/" name ".mjs.map") root)
                   :macro-dependencies dependencies :reason "source-changed"))
                names))
       (before-modules (copy-sequence modules))
       (before-dependencies (copy-sequence dependencies))
       (report
        (eliscript-project-build-report
         (eliscript-project-build-result-create
          :root root :out-dir (expand-file-name "dist" root) :entry (expand-file-name "main.eli" root)
          :entry-output (expand-file-name "dist/main.mjs" root) :modules modules
          :manifest (expand-file-name "dist/eliscript-project.json" root)
          :digest "supplied-identity-unchanged" :compiled-count (length modules)
          :reused-count 0 :mode "standard" :cache-status "disabled"
          :cache-reason "disabled" :cache-read-ms 0 :work-ms 0
          :manifest-write-ms 0 :total-ms 0)))
       (records (append (alist-get 'modules report) nil))
       (messages
        (mapcar
         (lambda (pair)
           (condition-case error-data
               (progn
                 (eliscript-compile-string
                  (format "(import \"./stdlib/core/transient.mjs\" transient) (defasync build (source promise) (let ((%s (transient source)) (%s (transient source))) (await promise) nil))"
                          (car pair) (cadr pair)) "order.eli")
                 (error "expected transient ownership error"))
             (eliscript-analyze-error
              (eliscript-order-oracle--units
               (eliscript-diagnostic-message
                (eliscript-diagnostic-from-condition error-data))))))
         (list (list "a" "A") (list "ä" "z") (list "阿" "中")
               (list (string #x10000) (string #xE000)))))
       (comparisons
        (mapcar (lambda (left)
                  (vconcat (mapcar (lambda (right)
                                     (if (equal left right) 0
                                       (if (eliscript-transient--utf16-less-p left right) -1 1)))
                                   names))) names)))
  (unless (and (equal modules before-modules)
               (equal dependencies before-dependencies))
    (error "report ordering mutated input module or macro lists"))
  (princ
   (json-encode
    `((modules . ,(vconcat (mapcar (lambda (record)
                                    (eliscript-order-oracle--units
                                     (alist-get 'source record))) records)))
      (macro . ,(vconcat (mapcar (lambda (record)
                                  (eliscript-order-oracle--units (alist-get 'path record)))
                                (append (alist-get 'macroDependencies (car records)) nil))))
      (unchangedIdentityRecords
       . ,(vconcat (mapcar (lambda (record)
                            (eliscript-order-oracle--units (alist-get 'path record)))
                          (append (eliscript-project--macro-dependency-records
                                   dependencies root) nil))))
      (comparisons . ,(vconcat comparisons))
      (messages . ,(vconcat messages))
      (digest . ,(alist-get 'digest report))))))

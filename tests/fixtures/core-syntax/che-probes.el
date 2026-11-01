;;; che-probes.el --- T15 probes over unmodified che modules -*- lexical-binding: t; no-byte-compile: t; -*-

;; The nine unmodified che modules are loaded first in both hosts; each probe
;; is then evaluated by the JS runtime and by native Emacs and compared.

;;;; case CHE-01-align
;;;; oracle
(list
 (che-align-column-widths '(("字段" "耗时") ("compiler" "120ms") ("运行时" "8ms")))
 (che-align-row '("字段" "耗时") '(8 5) '(left right))
 (che-align-fit-widths '(20 40 30) 50 10 4)
 (che-align-truncate "中文表格宽度截断测试" 9)
 (che-align-pad "中" 5 'center))

;;;; case CHE-02-delta
;;;; oracle
(let* ((prev '(("model" . "claude") ("tokens" . 100) ("tags" . ["a" "b"])))
       (next '(("model" . "claude") ("tokens" . 150) ("tags" . ["a" "b"])))
       (patch (che-session-delta-build next prev))
       (same (che-session-delta-build prev prev))
       (arr (che-session-delta-build [1 2 3] [1 5])))
  (list (alist-get 'kind patch)
        (length (alist-get 'members patch))
        (alist-get 'kind same)
        (alist-get 'kind arr)
        (length (alist-get 'items arr))))

;;;; case CHE-03-restore-codec-and-value
;;;; oracle
(let* ((rec (make-hash-table :test 'equal))
       (_ (puthash "id" "s-01" rec))
       (_ (puthash "turn" 3 rec))
       (_ (puthash "ok" t rec))
       (_ (puthash "items" (vector "α" "β") rec))
       (encoded (che-session-restore-codec-encode (list rec)))
       (packets (plist-get encoded :packets))
       (codec (che-session-restore-codec-create))
       (decoded-records nil))
  (dolist (pkt packets)
    (setq decoded-records
          (append decoded-records (che-session-restore-codec-feed codec pkt))))
  (let* ((raw-root (car decoded-records))
         (vstate (che-session-restore-value-create codec raw-root)))
    (while (not (che-session-restore-value-step vstate 64 1.0)))
    (let ((taken (che-session-restore-value-take vstate))
          (chain (plist-get encoded :chain))
          (finished (che-session-restore-codec-finish
                     codec
                     (plist-get encoded :bytes)
                     (plist-get encoded :packet-count)
                     (plist-get encoded :records)
                     (plist-get encoded :chain)))
          (key-ok (che-session-restore-codec-check-json-keys "{\"a\":1,\"b\":[true,\"x\"]}"))
          (dup (condition-case nil
                   (che-session-restore-codec-check-json-keys "{\"a\":1,\"a\":2}")
                 (error 'duplicate-refused))))
      (list finished key-ok dup
            (plist-get encoded :records)
            (plist-get encoded :bytes)
            chain
            (alist-get 'id taken)
            (alist-get 'turn taken)
            (alist-get 'ok taken)
            (alist-get 'items taken)))))

;;;; case CHE-04-publication-capture-and-json
;;;; oracle
(let* ((val '((id . "sess-9") (count . 42) (active . t) (items . ["x" "中文"])))
       (cap (che-session-publication-capture-create-value val)))
  (while (not (che-session-publication-capture-step cap 64 1.0)))
  (let* ((snap (che-session-publication-capture-snapshot cap))
         (matches-before (che-session-publication-capture-matches-value-p cap val))
         (enc (che-session-publication-json-create-records-encoder (list snap)))
         (chunks nil))
    (while (eq (che-session-publication-json-outcome enc) 'pending)
      (che-session-publication-json-step enc 64 1.0)
      (when-let ((ch (che-session-publication-json-take-chunk enc)))
        (push ch chunks)))
    (let* ((wire (apply #'concat (nreverse chunks)))
           (cmp (che-session-publication-json-create-records (list snap) wire))
           (bad (che-session-publication-json-create-records (list snap) (concat wire "x")))
           (pair (che-session-publication-json-pair-create (list snap) (list snap))))
      (while (eq (che-session-publication-json-outcome cmp) 'pending)
        (che-session-publication-json-step cmp 64 1.0))
      (while (eq (che-session-publication-json-outcome bad) 'pending)
        (che-session-publication-json-step bad 64 1.0))
      (while (eq (che-session-publication-json-pair-outcome pair) 'pending)
        (che-session-publication-json-pair-step pair))
      (list matches-before
            (decode-coding-string wire 'utf-8-unix)
            (che-session-publication-json-outcome cmp)
            (che-session-publication-json-outcome bad)
            (che-session-publication-json-pair-outcome pair)))))

;;;; case CHE-05-mdp
;;;; oracle
(let* ((doc "# Session\n- model: claude-opus\n- retries: 3\n- active: true\n- items:\n  | name | score |\n  | --- | --- |\n  | 中文 | 95 |\n  | beta | 88 |\n")
       (parsed (che-mdp-parse doc))
       (rt (che-mdp-parse (che-mdp-encode parsed)))
       (tool-mdp (che-mdp-encode-tool-result '(:status "ok" :count 2 :tags ["a" "b"])))
       (lview (che-mdp-limited-view "Prose note\n| 名称 | 值 |\n| a | 1 |"))
       (bad (che-mdp-parse "## orphan\n- a: 1")))
  (list (equal parsed rt)
        parsed
        tool-mdp
        (che-mdp-parse tool-mdp)
        lview
        (che-mdp-error-p bad)
        (che-mdp-error-message bad)
        (che-mdp--infer "\"q\\n\"")
        (che-mdp--infer "1.5e3")
        (che-mdp--infer "001")))

;;;; case CHE-06-context-budget
;;;; oracle
(let* ((usable (che-context-budget-usable 200000))
       (min-win (che-context-allocation-minimum-window 'tool-definitions 12000))
       (warn-msg (che-context-allocation-check 'tool-definitions 30000 100000))
       (table (che-context-allocation-table 100000))
       (first-row (car table))
       (rec (che-context-budget--snapshot-allocation-record first-row))
       (decoded (che-context-budget--snapshot-allocation rec)))
  (list usable min-win warn-msg (length table) (equal first-row decoded)
        (che-context-allocation-region-share 'fixed)
        (che-context-allocation-tokens 'conversation 100000)))

;;;; case CHE-07-cli
;;;; oracle
(list
 (che-cli-parse '("--model" "anthropic/claude-4" "--output-format" "json" "hello" "world"))
 (che-cli-parse '("-r" "--name" "demo" "fix" "bug"))
 (condition-case err (che-cli-parse '("--bogus")) (error (error-message-string err)))
 (condition-case err (che-cli-parse '("--model")) (error (error-message-string err))))

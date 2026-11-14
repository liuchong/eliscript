;;; prepared-worker-gates.el --- Artifact-stage prepared gate acceptance -*- lexical-binding: t; -*-

;;; Commentary:

;; Exercise the four maintained worker report gates without running their
;; workloads.  Each report tool is a script: read its top-level definitions,
;; evaluate everything except the final CLI condition-case, then call its own
;; private --require-prepared-stage3 function.
;;
;; The sentinel regression is made deterministic by wrapping make-process for
;; the duration of each gate call.  The real child is allowed to finish, then
;; its status sentinel is dispatched before make-process returns to the gate.
;; A gate that omits :sentinel #'ignore then receives the default
;; "Process ... finished" text in its stdout buffer and fails to parse its JSON;
;; a gate with the sentinel stays clean.
;;
;; This helper is intended for the installed-package artifact test, after
;; prepare-release-package has produced the final stage3 layout.  It prints one
;; compact JSON object and exits nonzero on any independent failure.

;;; Code:

(require 'cl-lib)
(require 'json)

(defconst prepared-worker-gates--schema-version 1)
(defconst prepared-worker-gates--format "eliscript-prepared-worker-gates")
(defconst prepared-worker-gates--child-timeout 10.0)
(defconst prepared-worker-gates--total-timeout 60.0)
(defconst prepared-worker-gates--identity-keys
  '(format version fixedPointFileCount sourceSha256 productSha256))

(defvar prepared-worker-gates--deadline nil)
(defvar prepared-worker-gates--baseline-processes nil)
(defvar prepared-worker-gates--baseline-buffers nil)

(defconst prepared-worker-gates--tools
  '(("analysis-benchmark"
     "tools/worker/analysis-benchmark.el"
     eliscript-analysis-benchmark--require-prepared-stage3)
    ("analysis-soak"
     "tools/worker/analysis-soak.el"
     eliscript-analysis-soak--require-prepared-stage3)
    ("worker-lifecycle-soak"
     "tools/worker/lifecycle-soak.el"
     eliscript-worker-soak--require-prepared-stage3)
    ("worker-value-stream-probe"
     "tools/worker/value-stream-probe.el"
     eliscript-value-stream-probe--require-prepared-stage3)))

(defun prepared-worker-gates--root ()
  "Return the repository root containing this helper."
  (expand-file-name
   "../.."
   (file-name-directory
    (expand-file-name (or load-file-name buffer-file-name)))))

(defun prepared-worker-gates--tool-path (relative)
  "Return the absolute path for RELATIVE inside the repository root."
  (expand-file-name relative (prepared-worker-gates--root)))

(defun prepared-worker-gates--read-top-level-forms (path)
  "Return the top-level forms of PATH as a list."
  (with-temp-buffer
    (insert-file-contents path)
    (goto-char (point-min))
    (let (forms)
      (condition-case nil
          (while (progn (skip-chars-forward " \t\r\n") (not (eobp)))
            (push (read (current-buffer)) forms))
        (end-of-file nil))
      (nreverse forms))))

(defun prepared-worker-gates--load-definitions (path)
  "Evaluate PATH's definitions but not its final CLI entry form.
Signal an error when the final form is not the expected CLI condition-case."
  (let* ((forms (prepared-worker-gates--read-top-level-forms path))
         (entry (car (last forms))))
    (unless (and (> (length forms) 1)
                 (consp entry)
                 (eq (car entry) 'condition-case))
      (error "expected a final CLI condition-case in %s" path))
    (let ((load-file-name path))
      (dolist (form (butlast forms))
        (eval form t)))
    t))

(defun prepared-worker-gates--gate-processes ()
  "Return live child processes that belong to the prepared gate bridges."
  (cl-remove-if-not
   (lambda (process)
     (and (process-live-p process)
          (string-match-p
           "prepared-stage3\\|prepared-worker-gates"
           (or (process-name process) ""))))
   (process-list)))

(defun prepared-worker-gates--gate-buffers ()
  "Return live buffers named by the prepared gate bridges."
  (cl-remove-if-not
   (lambda (buffer)
     (string-match-p "eliscript-prepared-stage3" (buffer-name buffer)))
   (buffer-list)))

(defun prepared-worker-gates--new-items (items baseline)
  "Return ITEMS not present in BASELINE, preserving identity."
  (cl-set-difference items baseline :test #'eq))

(defun prepared-worker-gates--dispatch-sentinel (process)
  "Force PROCESS's status notification before returning to the gate."
  (let ((sentinel (process-sentinel process)))
    (when (functionp sentinel)
      (funcall sentinel process "finished\n"))))

(defun prepared-worker-gates--start-and-drain (original args)
  "Start a child via ORIGINAL with ARGS, finish it, and dispatch its sentinel."
  (let ((process (apply original args))
        (deadline (+ (float-time) prepared-worker-gates--child-timeout)))
    (condition-case error-data
        (progn
          (while (and (process-live-p process)
                      (< (float-time) deadline))
            (accept-process-output process 0.02))
          (when (process-live-p process)
            (error "prepared gate child exceeded %.1fs"
                   prepared-worker-gates--child-timeout))
          ;; The real child has fully finished; dispatch the status notification
          ;; now, before make-process returns to the bridge.
          (prepared-worker-gates--dispatch-sentinel process)
          process)
      (error
       (when (process-live-p process)
         (delete-process process))
       (dolist (key '(:buffer :stderr))
         (let ((buffer (plist-get args key)))
           (when (buffer-live-p buffer)
             (kill-buffer buffer))))
       (signal (car error-data) (cdr error-data))))))

(defun prepared-worker-gates--call-gate (gate-function)
  "Call GATE-FUNCTION with make-process wrapped to force sentinel dispatch."
  (let ((original (symbol-function 'make-process)))
    (cl-letf (((symbol-function 'make-process)
               (lambda (&rest args)
                 (prepared-worker-gates--start-and-drain original args))))
      (funcall gate-function))))

(defun prepared-worker-gates--identity-keys-match-p (identity)
  "Return non-nil when IDENTITY has exactly the portable five-field shape."
  (and (listp identity)
       (equal (sort (mapcar (lambda (pair) (symbol-name (car pair))) identity)
                    #'string<)
              '("fixedPointFileCount" "format" "productSha256"
                "sourceSha256" "version"))))

(defun prepared-worker-gates--valid-identity-p (identity)
  "Return non-nil when IDENTITY is a valid portable prepared stage3 identity."
  (and (prepared-worker-gates--identity-keys-match-p identity)
       (equal (alist-get 'format identity) "eliscript-prepared-stage3")
       (integerp (alist-get 'version identity))
       (integerp (alist-get 'fixedPointFileCount identity))
       (stringp (alist-get 'sourceSha256 identity))
       (stringp (alist-get 'productSha256 identity))
       (string-match-p "\\`[0-9a-f]\\{64\\}\\'" (alist-get 'sourceSha256 identity))
       (string-match-p "\\`[0-9a-f]\\{64\\}\\'" (alist-get 'productSha256 identity))))

(defun prepared-worker-gates--same-identity-p (left right)
  "Return non-nil when LEFT and RIGHT have equal portable field values."
  (and left right
       (cl-every (lambda (key) (equal (alist-get key left)
                                      (alist-get key right)))
                 prepared-worker-gates--identity-keys)))

(defun prepared-worker-gates--record-leftovers (label failures)
  "Append leftover failures for LABEL to FAILURES and return FAILURES."
  (let ((process-count
         (length (prepared-worker-gates--new-items
                  (prepared-worker-gates--gate-processes)
                  prepared-worker-gates--baseline-processes)))
        (buffer-count
         (length (prepared-worker-gates--new-items
                  (prepared-worker-gates--gate-buffers)
                  prepared-worker-gates--baseline-buffers))))
    (when (> process-count 0)
      (push (format "%s: %d live gate process(es)" label process-count) failures))
    (when (> buffer-count 0)
      (push (format "%s: %d gate buffer(s)" label buffer-count) failures))
    failures))

(defun prepared-worker-gates--cleanup ()
  "Delete new gate processes and buffers left by this helper."
  (dolist (process (prepared-worker-gates--new-items
                    (prepared-worker-gates--gate-processes)
                    prepared-worker-gates--baseline-processes))
    (ignore-errors (delete-process process)))
  (dolist (buffer (prepared-worker-gates--new-items
                   (prepared-worker-gates--gate-buffers)
                   prepared-worker-gates--baseline-buffers))
    (when (buffer-live-p buffer)
      (ignore-errors (kill-buffer buffer)))))

(defun prepared-worker-gates--run ()
  "Run every gate bridge and return a result plist.

The plist contains :ok, :failures, :identities, :identity,
:live-processes, and :bridge-buffers."
  (setq prepared-worker-gates--deadline
        (+ (float-time) prepared-worker-gates--total-timeout)
        prepared-worker-gates--baseline-processes
        (prepared-worker-gates--gate-processes)
        prepared-worker-gates--baseline-buffers
        (prepared-worker-gates--gate-buffers))
  (let ((failures nil)
        (identities 0)
        (first nil))
    (catch 'prepared-worker-gates-stop
      (dolist (tool prepared-worker-gates--tools)
        (when (> (float-time) prepared-worker-gates--deadline)
          (push "prepared worker gates exceeded the total deadline" failures)
          (throw 'prepared-worker-gates-stop nil))
        (let ((label (nth 0 tool))
              (relative (nth 1 tool))
              (gate-function (nth 2 tool)))
          (condition-case error-data
              (progn
                (prepared-worker-gates--load-definitions
                 (prepared-worker-gates--tool-path relative))
                (unless (fboundp gate-function)
                  (error "gate function %s is not defined" gate-function))
                (let ((identity (prepared-worker-gates--call-gate gate-function)))
                  (cond
                   ((not (prepared-worker-gates--valid-identity-p identity))
                    (push (format "%s: invalid portable identity" label)
                          failures))
                   ((and first
                         (not (prepared-worker-gates--same-identity-p first identity)))
                    (push (format "%s: identity differs from the first gate" label)
                          failures))
                   (t
                    (unless first (setq first identity))
                    (setq identities (1+ identities))))))
            (error
             (push (format "%s: %s" label (error-message-string error-data))
                   failures)))
          (setq failures
                (prepared-worker-gates--record-leftovers label failures))
          (when (> (float-time) prepared-worker-gates--deadline)
            (push "prepared worker gates exceeded the total deadline" failures)
            (throw 'prepared-worker-gates-stop nil)))))
    (let* ((live-processes
            (length (prepared-worker-gates--new-items
                     (prepared-worker-gates--gate-processes)
                     prepared-worker-gates--baseline-processes)))
           (bridge-buffers
            (length (prepared-worker-gates--new-items
                     (prepared-worker-gates--gate-buffers)
                     prepared-worker-gates--baseline-buffers)))
           (ok (and (null failures)
                    (= identities (length prepared-worker-gates--tools))
                    (= live-processes 0)
                    (= bridge-buffers 0)
                    (prepared-worker-gates--valid-identity-p first))))
      (when (> live-processes 0)
        (push (format "%d live gate process(es) remain" live-processes) failures))
      (when (> bridge-buffers 0)
        (push (format "%d gate buffer(s) remain" bridge-buffers) failures))
      (prepared-worker-gates--cleanup)
      (list :ok (and ok (null failures))
            :failures (nreverse failures)
            :identities identities
            :identity first
            :live-processes live-processes
            :bridge-buffers bridge-buffers))))

(defun prepared-worker-gates--main ()
  "Run the helper, print one compact JSON object, and exit accordingly."
  (let* ((result
          (condition-case error-data
              (prepared-worker-gates--run)
            (error
             (prepared-worker-gates--cleanup)
             (list :ok nil
                   :failures (list (format "helper failed: %s"
                                           (error-message-string error-data)))
                   :identities 0
                   :identity nil
                   :live-processes 0
                   :bridge-buffers 0))))
         (failures (plist-get result :failures))
         (ok (plist-get result :ok))
         (identity (plist-get result :identity))
         (payload
          (list (cons 'schemaVersion prepared-worker-gates--schema-version)
                (cons 'format prepared-worker-gates--format)
                (cons 'ok (if ok t :false))
                (cons 'bridges (length prepared-worker-gates--tools))
                (cons 'identities (plist-get result :identities))
                (cons 'identity identity)
                (cons 'failures (vconcat failures))
                (cons 'liveProcesses (plist-get result :live-processes))
                (cons 'bridgeBuffers (plist-get result :bridge-buffers)))))
    (princ (json-serialize payload :null-object nil :false-object :false))
    (princ "\n")
    (kill-emacs (if ok 0 1))))

(when noninteractive
  (prepared-worker-gates--main))

;;; prepared-worker-gates.el ends here

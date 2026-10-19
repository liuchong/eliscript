;;; eliscript-reader-preprocess-tests.el --- Reader preprocessing boundaries -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript-reader)

(defun eliscript-reader-preprocess-tests--reference (source)
  "Apply the original character-at-a-time preprocessing contract to SOURCE."
  (let ((result (copy-sequence source)) (index 0) in-string escaped in-comment)
    (while (< index (length result))
      (let ((character (aref result index)))
        (cond
         (in-comment (when (= character ?\n) (setq in-comment nil)))
         (in-string
          (cond (escaped (setq escaped nil))
                ((= character ?\\) (setq escaped t))
                ((= character ?\") (setq in-string nil))))
         ((= character ?\;) (setq in-comment t))
         ((= character ?\") (setq in-string t))
         ((let ((opening (eliscript-reader--queue-opening-index source index)))
            (when opening
              (aset result index ?\() (aset result opening ?\s)
              (let ((closing (eliscript-reader--queue-closing-index source opening)))
                (when closing (aset result closing ?\))))
              t)))
         ((and (= character ?#) (< (1+ index) (length result))
               (= (aref result (1+ index)) ?\{))
          (aset result index ?\() (aset result (1+ index) ?\s))
         ((= character ?\{) (aset result index ?\())
         ((= character ?\}) (aset result index ?\)))))
      (setq index (1+ index)))
    result))

(defun eliscript-reader-preprocess-tests--outcome (source)
  "Retain all located forms or the exact public reader error for SOURCE."
  (condition-case condition
      (list 'forms (eliscript-read-located-string source "reader-runs.eli"))
    (error
     (list 'error (car condition)
           (eliscript-diagnostic-condition-message condition)
           (let ((diagnostic (eliscript-diagnostic-from-condition condition)))
             (when diagnostic (eliscript-diagnostic-to-alist diagnostic)))))))

(ert-deftest eliscript-reader-preprocess-runs-retain-every-character-and-transition ()
  "State skipping retains old output, even for incomplete and invalid input."
  (dolist (source
           (list "" "中😀 alpha [beta 7] (gamma -0)"
                 "a {b c} #{d e} #queue [f g]"
                 "#{ {1 2} #queue [#{3} {4 [5]}] }"
                 "#queue ; ignored [ { #queue\r\n\t[1 {2 3}]"
                 "#queue\f[1 2] #queue[3] #queuex [4] #queu #other"
                 "\"{#queue [x] #{y}}\" ; {#{#queue []}}\n{a b}"
                 "\"escaped \\\" {#queue []}\" {a b}"
                 "\"backslash \\\\\"; ignored }\r\n#{1 2}"
                 (concat "\"escaped scalar " (string ?\\ ?😀) " {x}\" {a b}")
                 (concat "\"escaped newline " (string ?\\ ?\n) " {x}\" {a b}")
                 (concat "\"unterminated " (string ?\\))
                 "; no newline \" #{ #queue [ {"
                 "; CR only does not end a comment\r{a b}"
                 "#queue [1 }" "#{1 ]}" "{1}" "\"unterminated"))
    (let ((before (copy-sequence source))
          (actual (eliscript-reader--emacs-source source))
          (expected (eliscript-reader-preprocess-tests--reference source)))
      (should (equal actual expected))
      (should (= (length actual) (length source)))
      (should (equal source before))))
  (should (equal (eliscript-reader--emacs-source "a {b c} #{d e} #queue [f g]")
                 "a (b c) ( d e) (queue  f g)")))

(ert-deftest eliscript-reader-preprocess-preserves-match-data-and-text-properties ()
  "The faster regexp scans do not leak match state or discard source metadata."
  (let ((source (propertize "中😀 {a b}\n\"escaped \\\" }\" #queue []" 'reader-origin t)))
    (should (equal-including-properties
             (eliscript-reader--emacs-source source)
             (eliscript-reader-preprocess-tests--reference source)))
    (string-match "\\(marker\\)" "marker")
    (let ((before (match-data)))
      (eliscript-reader--emacs-source source)
      (should (equal (match-data) before)))))

(ert-deftest eliscript-reader-preprocess-queue-tag-probes-only-dispatch-characters ()
  "Ordinary long runs and strings/comments never allocate Queue tag slices."
  (let ((source (concat (make-string 200000 ?a)
                        " \"#queue []\" ; #queue []\n#queue [] #{1} #other"))
        (original (symbol-function 'eliscript-reader--queue-opening-index))
        probes)
    (cl-letf (((symbol-function 'eliscript-reader--queue-opening-index)
               (lambda (input index)
                 (push index probes)
                 (funcall original input index))))
      (eliscript-reader--emacs-source source))
    (should (= (length probes) 3))
    (should (cl-every (lambda (index) (= (aref source index) ?#)) probes))))

(ert-deftest eliscript-reader-preprocess-public-forms-spans-and-first-errors-match-reference ()
  "Public located reading keeps Unicode/CRLF locations and original diagnostics."
  (dolist (source
           '("; 中😀\r\n{\"first\" #{1 2} \"queue\" #queue [3 {4 5}]}"
             "\"escaped \\\" #queue []\"\r\n#queue ; comment [\r\n [{1 2} #{3 4}]"
             "(module data (defconst value {1 [2 3]}) (defconst items #queue [#{4}]))"
             "; 中😀\r\n{1}" "; 中😀\r\n#{1 ]}"
             "; 中😀\r\n#queue [1 }" "; 中😀\r\n{\"unterminated"
             "{1 2}\n#unknown 7\n{3}"))
    (let ((actual (eliscript-reader-preprocess-tests--outcome source)) expected)
      (cl-letf (((symbol-function 'eliscript-reader--emacs-source)
                 #'eliscript-reader-preprocess-tests--reference))
        (setq expected (eliscript-reader-preprocess-tests--outcome source)))
      (should (equal actual expected)))))

(provide 'eliscript-reader-preprocess-tests)

;;; eliscript-reader-preprocess-tests.el ends here

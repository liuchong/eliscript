;;; eliscript-org.el --- Deterministic Org publishing adapter -*- lexical-binding: t; -*-

;;; Commentary:

;; Convert a directory of trusted Org articles into a deterministic ESM data
;; module.  The adapter uses only Org and Emacs APIs and remains independent
;; from the Eliscript compiler core.

;;; Code:

(require 'cl-lib)
(require 'calendar)
(require 'json)
(require 'org)
(require 'ox-html)
(require 'seq)
(require 'subr-x)

(define-error 'eliscript-org-error "Eliscript Org publishing error")

(defconst eliscript-org--metadata-keywords
  '("TITLE" "DATE" "SLUG" "DESCRIPTION" "FILETAGS" "DRAFT")
  "Org keywords recognized as article metadata.")

(defun eliscript-org--fail (file format-string &rest arguments)
  "Signal an Org publishing error for FILE using FORMAT-STRING and ARGUMENTS."
  (signal 'eliscript-org-error
          (list (format "%s: %s"
                        file
                        (apply #'format format-string arguments)))))

(defun eliscript-org--keyword (keywords name)
  "Return the first NAME value from collected Org KEYWORDS."
  (car (cdr (assoc-string name keywords t))))

(defun eliscript-org--required-keyword (keywords name file)
  "Return required NAME from KEYWORDS or fail for FILE."
  (let ((value (eliscript-org--keyword keywords name)))
    (if (and value (not (string-empty-p (string-trim value))))
        (string-trim value)
      (eliscript-org--fail file "missing required #+%s keyword" name))))

(defun eliscript-org--draft-p (value)
  "Return non-nil when Org keyword VALUE denotes a draft."
  (and value
       (member (downcase (string-trim value))
               '("t" "true" "yes" "1"))))

(defun eliscript-org--tags (value)
  "Parse FILETAGS VALUE into a sorted vector of unique strings."
  (let* ((normalized (or value ""))
         (parts
          (if (string-match-p "\\`[[:space:]]*:" normalized)
              (split-string normalized ":[[:space:]]*" t "[[:space:]]+")
            (split-string normalized "[[:space:]]*,[[:space:]]*" t)))
         (tags
          (delete-dups
           (mapcar #'string-trim
                   (seq-filter
                    (lambda (tag) (not (string-empty-p tag)))
                    parts)))))
    (vconcat (sort tags #'string-lessp))))

(defun eliscript-org--validate-date (date file)
  "Validate ISO DATE for FILE and return DATE."
  (unless (string-match-p
           "\\`[0-9]\\{4\\}-[0-9]\\{2\\}-[0-9]\\{2\\}\\'"
           date)
    (eliscript-org--fail file
                         "#+DATE must use YYYY-MM-DD, got %S"
                         date))
  (pcase-let* ((`(,year ,month ,day)
                (mapcar #'string-to-number (split-string date "-")))
               (calendar-date (list month day year)))
    (unless (calendar-date-is-valid-p calendar-date)
      (eliscript-org--fail file "#+DATE is not a valid date: %s" date)))
  date)

(defun eliscript-org--validate-slug (slug file)
  "Validate article SLUG for FILE and return SLUG."
  (when (or (string-empty-p slug)
            (string-match-p "[[:space:]/?#]" slug))
    (eliscript-org--fail
     file "#+SLUG must not be empty or contain whitespace, /, ?, or #"))
  slug)

(defun eliscript-org--assign-heading-ids (article-slug)
  "Assign deterministic missing heading ids using ARTICLE-SLUG."
  (let ((index 0))
    (save-excursion
      (goto-char (point-min))
      (org-map-entries
       (lambda ()
         (setq index (1+ index))
         (unless (org-entry-get nil "CUSTOM_ID")
           (org-entry-put
            nil "CUSTOM_ID"
            (format "%s-section-%d" article-slug index))))
       nil nil))))

(defun eliscript-org--export-html (article-slug)
  "Export the current Org buffer body as deterministic HTML for ARTICLE-SLUG."
  (eliscript-org--assign-heading-ids article-slug)
  (let ((org-html-htmlize-output-type nil)
        (org-export-with-broken-links 'mark))
    (substring-no-properties
     (org-export-as
      'html nil nil t
      '(:html-prefer-user-labels t
        :section-numbers nil
        :with-author nil
        :with-date nil
        :with-title nil
        :with-toc nil)))))

(defun eliscript-org-read-article (file content-directory)
  "Read Org article FILE relative to CONTENT-DIRECTORY.

Return a JSON-ready alist with metadata and exported HTML."
  (let ((absolute-file (expand-file-name file))
        (content-root (file-name-as-directory
                       (expand-file-name content-directory))))
    (with-temp-buffer
      (insert-file-contents absolute-file)
      (delay-mode-hooks (org-mode))
      (let* ((keywords
              (org-collect-keywords eliscript-org--metadata-keywords))
             (title
              (eliscript-org--required-keyword keywords "TITLE" absolute-file))
             (date
              (eliscript-org--validate-date
               (eliscript-org--required-keyword
                keywords "DATE" absolute-file)
               absolute-file))
             (slug
              (eliscript-org--validate-slug
               (or (and-let* ((value
                               (eliscript-org--keyword keywords "SLUG")))
                     (string-trim value))
                   (file-name-base absolute-file))
               absolute-file))
             (description
              (string-trim
               (or (eliscript-org--keyword keywords "DESCRIPTION") "")))
             (draft
              (eliscript-org--draft-p
               (eliscript-org--keyword keywords "DRAFT")))
             (tags
              (eliscript-org--tags
               (eliscript-org--keyword keywords "FILETAGS")))
             (html (eliscript-org--export-html slug)))
        `((slug . ,slug)
          (title . ,title)
          (date . ,date)
          (description . ,description)
          (tags . ,tags)
          (draft . ,(if draft t :false))
          (source . ,(file-relative-name absolute-file content-root))
          (html . ,html))))))

(defun eliscript-org--article-before-p (left right)
  "Return non-nil when article LEFT should sort before RIGHT."
  (let ((left-date (alist-get 'date left))
        (right-date (alist-get 'date right)))
    (if (string-equal left-date right-date)
        (string-lessp (alist-get 'slug left) (alist-get 'slug right))
      (string> left-date right-date))))

(defun eliscript-org--validate-unique-slugs (articles directory)
  "Validate unique slugs in ARTICLES reported relative to DIRECTORY."
  (let ((seen (make-hash-table :test #'equal)))
    (dolist (article articles)
      (let ((slug (alist-get 'slug article)))
        (when-let* ((previous (gethash slug seen)))
          (eliscript-org--fail
           directory
           "duplicate slug %S in %s and %s"
           slug previous (alist-get 'source article)))
        (puthash slug (alist-get 'source article) seen)))))

(defun eliscript-org-read-directory (content-directory &optional include-drafts)
  "Read all Org articles under CONTENT-DIRECTORY.

Exclude draft articles unless INCLUDE-DRAFTS is non-nil."
  (let ((directory (file-name-as-directory
                    (expand-file-name content-directory))))
    (unless (file-directory-p directory)
      (eliscript-org--fail directory "content directory does not exist"))
    (let ((articles
           (mapcar
            (lambda (file)
              (eliscript-org-read-article file directory))
            (sort (directory-files-recursively directory "\\.org\\'")
                  #'string-lessp))))
      (eliscript-org--validate-unique-slugs articles directory)
      (unless include-drafts
        (setq articles
              (seq-remove
               (lambda (article) (eq (alist-get 'draft article) t))
               articles)))
      (setq articles (sort articles #'eliscript-org--article-before-p))
      articles)))

(defun eliscript-org-emit-module (content-directory &optional include-drafts)
  "Emit an ESM article module for CONTENT-DIRECTORY.

Include draft articles when INCLUDE-DRAFTS is non-nil."
  (let* ((articles
          (eliscript-org-read-directory content-directory include-drafts))
         (json-array-type 'array)
         (json-object-type 'alist)
         (encoded (json-serialize (vconcat articles))))
    (concat
     "// Generated by Eliscript Org. Do not edit.\n"
     "const articles = " encoded ";\n"
     "export { articles };\n"
     "export default articles;\n")))

(defun eliscript-org-publish-directory
    (content-directory &optional output-file include-drafts)
  "Publish CONTENT-DIRECTORY as ESM.

Write to OUTPUT-FILE when non-nil and return the generated module. Include
drafts when INCLUDE-DRAFTS is non-nil."
  (let ((module
         (eliscript-org-emit-module content-directory include-drafts)))
    (when output-file
      (let ((absolute-output (expand-file-name output-file)))
        (make-directory (file-name-directory absolute-output) t)
        (with-temp-file absolute-output
          (insert module))))
    module))

(provide 'eliscript-org)

;;; eliscript-org.el ends here

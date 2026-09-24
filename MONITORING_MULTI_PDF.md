# One monitoring, one current PDF

Upload Existing Monitoring accepts one or two PDFs for Managers and Supervisors, including correction replacements. Files can be selected together, added individually, or dropped into the shared Upload PDF(s) control. The ordered list supports removing files and swapping two files.

The API validates the file count, PDF readability, encryption, combined page count and size. Two PDFs are merged in selected order using copied PDF pages, without rasterization. Filled form field appearances are made static before copying to preserve their visible values. One-PDF uploads retain their exact bytes, and the existing single-PDF API format is still accepted.

Only the resulting PDF enters existing current-document storage. Preview, review marks, downloads, replacement, resubmission and accepted locks use that same document. No database migration, additional record, version archive or audit storage is introduced. Existing limits remain 2 MB total selected input and final output, and 20 combined pages.

Validation includes API/database tests for original-byte preservation, pair merging, page dimensions/rotation and unchanged page content streams, invalid counts/files, correction replacements, same-document Manager/Supervisor downloads, and accepted locks. Browser tests cover mobile selection, order changes, maximum two files, Supervisor drag/drop, merged-page rendering, markup, replacements with one and two files, a single combined download and locking.

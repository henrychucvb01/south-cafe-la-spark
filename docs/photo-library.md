# Supervisor Photo Library

Open Photo Library in the Supervisor Command Center. Filter by school, type, contest/challenge, or date range. Download one WebP photo or select up to 30 photos for a ZIP. Selection can span pages; changing filters clears selection. Photos retain descriptive school, challenge, date and unique-ID filenames.

Only approved entries with publishing consent are included. Current and past decoration contests use their own titles. Approved Showdown submissions are included; duplicate paths are shown once. Pending, rejected, cancelled, nonconsenting and mystery-source photos are excluded. This is a supervisor feature; no separate social-media login or public gallery was created.

The private service-role-only `spark_games_photo_library` RPC verifies the supervisor session on every catalogue and download request. The API signs only the current 18-photo page or explicit authorized download IDs. It never accepts client photo paths. Existing photo-link caching is reused. Browser downloads go directly to private signed storage URLs; slow downloads reauthorize once when a URL expires. ZIP files are generated locally, with no extra service or server-side image transfer. There is no library polling, and images use lazy loading. Downloads still count toward the existing bandwidth allowance.

Migration adds a read-only RPC and changes no stored photos, game rules, votes, rewards, or other records. Preview requests use only the configured development database and development tables.

Validation: `node scripts/test-photo-library-db.mjs` tests real SQL against fictional entries in isolated dev/live schemas. `node scripts/test-photo-library-api.mjs` tests pagination, filters, authorization, download limits, path handling, and ZIP content/CRC through Python's standard ZIP reader. Component tests cover opening, filters, selections, downloads and errors. Browser visual QA remains unavailable because this environment blocks Chromium's process-singleton socket.

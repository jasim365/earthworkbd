# Roadmap

- [x] Interactive cross-section visualization: existing profiles and results, chainage selection, RL/offsets/width, zoom/pan, PNG export; baseline and browser checks passed

- [x] Recalculation status indicator on Sectional Data — DONE (verified in browser: busy + idle states)
- [ ] Excel upload flow for Pre-work / Post-work: guided dialog with file upload (.xlsx/.csv) + multi-row paste, target survey selection, and pre-apply validation summary
- [x] Security: replace permissive `USING (true)` policy on public.profiles with owner-scoped predicate
- [x] Apply routine dependency security update (@tanstack/react-start, react-router, router-plugin)
- [x] Lock calculation engine + baseline regression test

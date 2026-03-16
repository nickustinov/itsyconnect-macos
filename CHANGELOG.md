# Changelog

## 1.6.2

- Add magic wand button to app name field in app details (translate, copy, improve)
- Fix app details allowing locale add/delete when version is locked
- Fix submitting a new nomination creating a duplicate draft
- Fix ASC rate limit errors when saving many locales at once
- Only save changed locales instead of all locales on store listing and app details
- Fix all linting and React compiler errors, make lint failures block CI

## 1.6.1

- Add batch screenshot translation – select multiple screenshots and translate or copy them all at once
- Translate and upload screenshots server-side in one step, eliminating slow client round-trips
- Rework add locale dialog
- Fix invisible window on launch with stale nav state
- Fix app_preferences table missing after update
- Fix "copy from version" on what's new copying to all locales
- Fix adding locale failing with 409/500 errors
- Fix remove locale dialog not detecting app details
- Fix locale picker showing stale data after removing a locale
- Fix analytics date range resetting when navigating between pages
- Fix selected locale resetting when navigating to settings and back

## 1.6.0

- Add nominations – browse, edit, AI-powered fill, and submit App Store nominations
- Translate and copy base locale screenshots to other locales using Gemini 3 Pro Image
- Remove redundant screenshots section from add/remove locale dialogs

## 1.5.1

- Add cancel submission button for rejected versions
- Fix screenshot display size labels to match current App Store Connect
- Show all locales on screenshots page instead of only the primary locale
- Fix screenshot refresh not bypassing cache

## 1.5.0

- Fix TestFlight version picker not showing new versions on refresh
- Fix resubmission after App Review rejection – handle UNRESOLVED_ISSUES submissions to avoid ITEM_PART_OF_ANOTHER_SUBMISSION errors
- Rename "Resubmit for review" button to "Update review" to match App Store Connect terminology
- Revamp review insights prompt with three categories (strengths, weaknesses, potential) and stricter rules
- Show version statuses in portfolio app cards – non-live versions display platform, version, and state like App Store Connect
- Add keyboard shortcuts: ⌘P portfolio, ⌘1–9 switch apps, ⌘O overview, ⌘L store listing, ⌘R reviews, ⌘A analytics, ⌘B builds
- Replace native update dialog with in-app banner showing changelog and "Restart to update" button

## 1.4.1

- Show informational banner when analytics reports are first requested – explains the 24–48 hour wait and displays elapsed time since the request was initiated

## 1.4.0

- Add AI-powered analytics insights – highlights trends, anomalies, and actionable opportunities from App Store Connect metrics
- Unify insights panel across reviews and analytics pages with shared sidebar and magic wand button
- Add AI-powered review insights panel – analyses customer reviews to extract strengths and weaknesses, updates incrementally when new reviews arrive
- Add unread reviews indicator on the Reviews sidebar item
- Fix app overview KPI cards to show all-time totals instead of last 30 days
- Add date range picker to downloads and proceeds charts on app overview
- Persist date range selection across page navigation and app restarts

## 1.3.1

- Fix "Fix all issues" button showing on storefronts tab when only untapped locales exist – the AI dialog cannot fix missing locales

## 1.3.0

- Add locale dialog – translates all fields from the primary locale, generates keywords with forbidden-word rules, and creates localizations across store listing and app details in one step
- Remove locale dialog – choose which sections (store listing, app details, screenshots) to delete from, with immediate ASC deletion
- Refresh button on the store listing page now reloads localizations from App Store Connect
- Fix AI keyword generation including subtitle words as keywords – forbidden words now use the translated subtitle
- Fix keywords save deleting unchanged localizations – only changed locales are sent to the sync endpoint
- Fix App Store Connect 409 duplicate errors on locale creation – automatically falls back to updating the existing localization
- Extract shared keyword forbidden-word utilities to eliminate duplicated logic across store listing, keyword insights, and AI dialogs
- Add keywords insights page with per-locale keyword analysis, cross-locale duplicate detection, and storefront view
- Add "Fix all issues" bulk AI keyword optimisation across all locales
- Add per-locale "Fix issues" AI keyword improvement that removes name/subtitle overlaps and cross-locale duplicates
- Add keyword tips in store listing showing empty or underused keyword budget
- AI keyword prompts now include app title, subtitle, and description for better suggestions
- Primary locale keywords are treated as master – cross-locale duplicates are flagged and fixed in secondary locales only
- Exchangeable locale fallback for storefronts (e.g. en-US serves en-CA when no en-CA localisation exists)
- Add platform and version picker to keywords insights page – same picker as store listing with read-only banner for non-editable versions

## 1.2.3

- Fix build not showing in store listing after cancelling a submission – fall back to version build data when the build isn't in the TestFlight builds list
- Fix AI translation appending spurious keywords to translated descriptions – keyword-specific prompt rules are now only included when translating the keywords field

## 1.2.2

- Add app picker after setup – choose which app to manage when you have multiple apps
- Add copyright field to the store listing page
- Expand submission checklist with screenshots, app name, support URL, privacy policy, and copyright checks
- Surface associated errors from App Store Connect when submission fails – show the actual reasons (missing metadata, screenshots, etc.) instead of a generic error
- Fix review submission cleanup – reuse existing draft submissions instead of failing to delete them
- Fix app details refresh – the refresh button now reloads app info and localizations from App Store Connect
- Invalidate app info caches on global refresh

## 1.2.1

- Add demo mode – "Explore with sample data" on the setup screen lets you browse the full dashboard with three fictional apps, no credentials required
- Add Tab/Shift+Tab navigation between text inputs on store listing, app details, app review, and TestFlight info pages
- Retry on transient App Store Connect server errors (500) with exponential backoff
- Fix analytics not loading for accounts that never opened App Store Connect analytics on the web – automatically create report requests when none exist
- Fix proceeds chart and date picker disappearing when selected range has no data
- Fix AI status not updating after configuring a provider without restarting the app
- Fix "what's new" field causing sync errors on the first-ever app version – hide the field and submission checklist item when no version has been distributed yet

## 1.1.0

- Add Mac App Store build support with StoreKit in-app purchase
- Add local AI server support (LM Studio and OpenAI-compatible servers)
- Add file-based logging with automatic rotation and diagnostics export via Help menu

## 1.0.0

- Initial release

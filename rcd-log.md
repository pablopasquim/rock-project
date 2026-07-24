# Revenue-Centric Design Log

## 2026-07-24 — Mobile redesign and PWA

- Applied **Never ship a blank dashboard**: empty states keep one clear next action and explain what the user should do.
- Applied **Time-to-value**: “Nova transação” remains the primary action on desktop and becomes the central action in the mobile navigation.
- Removed administrative UI friction: filters are horizontally scrollable chips on small screens, while the month selector stays available in the header.
- Kept the scope personal and non-commercial: no pricing, acquisition, paywall, or sales patterns were introduced.
- Added the Rock Advisor illustration only at moments that benefit from guidance:
  Advisor welcome and empty states. It was intentionally removed from the login
  to preserve alignment and visual focus. Motion remains subtle, CSS-only and
  disabled when the operating system requests reduced motion.

Validation to observe after release:

- Time from login to first transaction.
- Transaction modal completion rate on mobile.
- PWA installation rate among recurring users.

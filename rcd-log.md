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
- Added explicit authentication feedback: an interactive login briefly transitions
  to a confirmed state before the dashboard opens. Restored sessions skip this
  ceremony to keep returning access immediate.
- Corrected mobile task flow after device testing: filter chips preserve their
  intrinsic labels, the transaction modal stays within the visual viewport while
  the keyboard is open, and installation is discoverable through a native prompt
  or browser-specific fallback instructions.
- Removed the remaining horizontal overflow sources found on a 430 px viewport:
  the balance decoration is now contained by its card, charts cannot grow beyond
  their panel, the Advisor collapses to one column, and the bottom navigation uses
  five explicit tracks. The install entry is always available on mobile when the
  app is not already running in standalone mode.

Validation to observe after release:

- Time from login to first transaction.
- Transaction modal completion rate on mobile.
- PWA installation rate among recurring users.

# Order workflow design audit — September 21, 2026

## Diagnosis
The order detail page mixed booking details, status changes, photographer intake, original uploads, editing tools, review, delivery, and destructive actions on one long screen. This made routine work compete with configuration. The package chooser duplicated the service-selection decision; luxury and architectural profiles were much more prominent than their role warranted. The photo review UI also offered a nonfunctional return to AI enhancement when AI editing was disabled.

## Implemented structure

| Area | Primary job | Design change |
| --- | --- | --- |
| Orders | Find the next job | Active, Upcoming, In production, Ready to deliver, Delivered, and All orders queues; property-first rows; phone cards; search and persistent filters |
| Create | Book a clear scope | Four numbered sections: client, property, services, schedule; property size appears before pricing; live service total and shoot summary; optional extras and instructions collapse |
| Overview | Manage the booking | Editable services and prices, schedule and team, client details, shoot instructions, and access notes; compact property header |
| Upload & edit | Gather original and finished files | Distinct photographer intake and finished-photo upload; original archive is secondary; automatic processing follows the existing AI setting |
| Review | Choose deliverable media | Final photo selection, quality-control summary, and video/tour/floor-plan publishing; optional photo tools collapsed |
| Delivery | Check the client experience and send | Gallery and message preview, delivery controls, and property marketing grouped together |

Packages are removed from the new-shoot form. Historical package data remains intact. Luxury/architectural profiles remain available under Overview → Order settings → Advanced photo settings. Archive and deletion are separated from routine production work. No database migration is required.

The next-action banner uses actual scheduling, assignment, media, and status facts. It recommends a work area without automatically changing order status. Tabs retain mounted work areas after their first visit, protecting unfinished uploads and local form state when navigating. Review and delivery refresh when reopened.

## Visual and accessibility decisions
Use the property address as the main identity, a restrained ocean-blue accent, consistent card spacing, and clear primary versus secondary actions. Controls have comfortable heights and visible focus. Workspace tabs support arrow keys, Home, and End, with accessible labels and selected states. Links between work areas move keyboard focus to the destination tab. Small screens use two-by-two workspace tabs and order cards.

This follows [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## Validation
- Full automated suite: 429 tests passed, including five new workflow/filter tests.
- TypeScript check passed. ESLint: zero errors and ten existing warnings.
- Local browser inspection at desktop and 390-pixel phone width; creation and workspace fixtures had no horizontal overflow.
- Property-size fixture updated Interior/Exterior Photography and the summary from $200 to $225 at 1,250 sq ft.
- Keyboard navigation and retained draft state verified across workspace tabs.
- Temporary fixtures removed before release. Real orders were not created, changed, uploaded to, or sent delivery messages during this design validation.

## Recommended next investments
1. Watch three real jobs travel through the new flow and record the points where staff hesitate. Tune the default queue and editing emphasis from observed use.
2. Review the service catalog with the business owner: keep clearly named, regularly sold services visible and retire duplicate or obsolete offerings only after confirming their use. Avoid replacing business choices with inferred package tiers.
3. Add operational queue counts and an overdue/needs-attention view based on agreed delivery deadlines. Those deadlines should be explicit before introducing urgency indicators.
4. If external editing is the normal workflow, add an editor handoff record with sent/received timestamps and revision notes. Keep automation optional until reliability and ownership are established.

## Limits
Responsive checks covered representative layouts, not every device or assistive technology. Local upload-state verification used a retained draft; real file transfer, payments, and message sending were intentionally not exercised against customer orders. Existing upload, delivery, payment, and permissions backends remain in place.

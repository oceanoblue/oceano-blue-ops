# Contractor hourly event work

Office administrators use **Contractors → Hourly work**. Contractors use the **Hourly work** tab in their field portal. Create an assignment for each contractor and event day.

1. Choose the contractor, event, event type, role, date and location. Enter the agreed hourly rate, estimated hours and assignment notes. Rates are editable per assignment, including outside the usual $60–100 range.
2. After the event, the contractor submits actual hours. An administrator can record the hours on their behalf. Extra time requires an explanation.
3. The office reviews the submission and approves the hours. A change to submitted hours requires a note. Only approved unpaid amounts enter the roster balance.
4. Send payment using the normal payment method, then select **Record payment** and enter the method/reference. Ops records the payment; it does not transfer money.

Rates and event details can be edited while an assignment is Assigned. Return a submitted or approved assignment for changes before modifying terms. Returning or cancelling approved work removes it from the balance owed. Paid and cancelled records are locked. Every action retains a before/after snapshot.

Decimal hours are converted to the nearest whole minute (4.5 = 4h 30m). The amount is calculated from approved minutes and the assignment's rate, rounding once to cents. Assignments support up to 24 hours; use separate assignments for multiple days.

The roster combines photo-shoot and approved hourly balances and shows each type's counts. **Pay photo shoots** settles photo shoots only. Hourly payments are recorded individually in Hourly work. The field Get paid page links to hourly submissions and history.

No assignment emails are sent automatically. The assignment appears in the contractor's portal immediately. Photo intake, weekly photo pay requests, agreements and video handoffs retain their existing workflows.

## Verification

- Database tests cover the lifecycle, access controls, RLS isolation, immutable history, payment calculations, stale edits, retry protection and aggregate balances.
- API tests verify session-derived identity, cross-origin rejection, input validation and history ownership.
- The browser smoke test could not launch in the execution environment (OS socket restrictions). UI behavior is checked with a DOM harness; visual browser review remains a limitation.

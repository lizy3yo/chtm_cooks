# CHTM Cooks Inventory Management System
## Text-Based Data Flow Diagram (DFD)

Date: 2026-04-12  
Standard: Structured Analysis DFD (Context Diagram + Level 1 Decomposition)  
Notation: External Entity (E), Process (P), Data Store (D), Data Flow (F)

---

## 1. Scope and Boundary

System of Interest (SOI): CHTM Cooks Inventory Management System  
Purpose: Manage user access, inventory/catalog, borrow requests, inspections, obligations, donations, notifications, and analytics.

Inside system boundary:
- Authentication and authorization
- User/profile and role handling
- Inventory and catalog operations
- Borrow request lifecycle (submit, approve, release, return)
- Inspection and replacement obligation handling
- Donations processing
- Notifications and reports

Outside system boundary (external actors/services):
- Student
- Instructor
- Custodian
- Superadmin
- Email Service (verification/reset/notification delivery)

---

## 2. Context Diagram (Level 0)

### 2.1 External Entities

- E1 Student
- E2 Instructor
- E3 Custodian
- E4 Superadmin
- E5 Email Service

### 2.2 Single Process

- P0 CHTM Cooks Inventory Management System

### 2.3 Context Flows

- F01 E1 -> P0: Registration details, login credentials, borrow request details, return-related updates
- F02 P0 -> E1: Auth result, profile/dashboard data, request status, reminders, obligations/notifications

- F03 E2 -> P0: Login credentials, approval actions, instructional review inputs
- F04 P0 -> E2: Auth result, pending approvals, request history, analytics views

- F05 E3 -> P0: Login credentials, inventory updates, release/receipt actions, inspection findings, donation records
- F06 P0 -> E3: Auth result, inventory/request queues, obligation alerts, operational reports

- F07 E4 -> P0: Login credentials, user management actions, policy/config updates, report requests
- F08 P0 -> E4: Auth result, user/admin reports, security/system summaries

- F09 P0 -> E5: Verification email request, password reset email request, notification payload
- F10 E5 -> P0: Delivery status, bounce/failure feedback

Balancing note: All major inbound/outbound flows above are decomposed in Level 1.

---

## 3. Level 1 DFD (Decomposition of P0)

### 3.1 Processes

- P1.0 Authenticate and Authorize Users
- P2.0 Manage Users and Profiles
- P3.0 Manage Inventory and Catalog
- P4.0 Process Borrow Requests
- P5.0 Inspect Returns and Manage Obligations
- P6.0 Manage Donations
- P7.0 Generate Notifications and Analytics

### 3.2 Data Stores

- D1 User Accounts
- D2 Student Records
- D3 Inventory and Catalog
- D4 Borrow Requests
- D5 Inspections and Incidents
- D6 Replacement Obligations
- D7 Donations
- D8 Notifications Log
- D9 Reports/Analytics Snapshots

### 3.3 Detailed Level 1 Flows

#### P1.0 Authenticate and Authorize Users

- F101 E1/E2/E3/E4 -> P1.0: Login/registration/verification/reset input
- F102 P1.0 <-> D1: Credential lookup, token/session persistence, role retrieval
- F103 P1.0 <-> D2: Student registration/profile linkage
- F104 P1.0 -> E5: Verification/reset email payload
- F105 E5 -> P1.0: Email delivery feedback
- F106 P1.0 -> E1/E2/E3/E4: Auth status, tokens, access scope

#### P2.0 Manage Users and Profiles

- F201 E4 -> P2.0: Create/update/deactivate user instructions
- F202 E1/E2/E3 -> P2.0: Profile update requests
- F203 P2.0 <-> D1: User CRUD and role/status updates
- F204 P2.0 <-> D2: Student demographic and academic metadata updates
- F205 P2.0 -> E1/E2/E3/E4: Confirmation, profile views, user lists

#### P3.0 Manage Inventory and Catalog

- F301 E3/E4 -> P3.0: Item create/update/archive/restore instructions
- F302 P3.0 <-> D3: Inventory and catalog transactions
- F303 P3.0 -> E1/E2/E3/E4: Catalog availability, stock state, low-stock indicators

#### P4.0 Process Borrow Requests

- F401 E1 -> P4.0: Borrow request submission (item, qty, date, purpose)
- F402 P4.0 <-> D3: Stock validation and reservation checks
- F403 P4.0 <-> D4: Request creation and status transitions
- F404 E2 -> P4.0: Approve/reject action
- F405 E3 -> P4.0: Release/receipt/return processing action
- F406 P4.0 -> E1/E2/E3: Request status, due dates, action queues
- F407 P4.0 -> P7.0: Trigger events for reminders/alerts/analytics

#### P5.0 Inspect Returns and Manage Obligations

- F501 E3 -> P5.0: Return inspection findings (missing/damaged/ok)
- F502 P5.0 <-> D5: Inspection incident records
- F503 P5.0 <-> D6: Obligation create/update/resolve records
- F504 P5.0 <-> D4: Request closure and final return status
- F505 P5.0 -> E1/E3/E4: Obligation notices and resolution updates
- F506 P5.0 -> P7.0: Incident and obligation events

#### P6.0 Manage Donations

- F601 E3/E4 -> P6.0: Donation intake (new item or add-to-existing)
- F602 P6.0 <-> D7: Donation transaction records
- F603 P6.0 <-> D3: Inventory increments from accepted donations
- F604 P6.0 <-> D6: Optional obligation-to-donation offset updates
- F605 P6.0 -> E3/E4: Donation confirmation and impact summary
- F606 P6.0 -> P7.0: Donation analytics/notification events

#### P7.0 Generate Notifications and Analytics

- F701 P4.0/P5.0/P6.0 -> P7.0: Operational events stream
- F702 P7.0 <-> D8: Notification queue and delivery log
- F703 P7.0 <-> D9: KPI aggregates, report snapshots
- F704 P7.0 -> E5: Email notification payload
- F705 E5 -> P7.0: Delivery outcomes
- F706 P7.0 -> E1/E2/E3/E4: Alerts, dashboards, role-based reports

---

## 4. Data Dictionary (Condensed)

- Auth Credentials: email/username, password or token, role context
- Borrow Request: requester, item, quantity, borrow date, purpose, status, approver, custodian action timestamps
- Inspection Result: request reference, item condition, missing/damaged flags, remarks, inspector, timestamp
- Obligation Record: student, incident reference, amount/item to replace, status, resolution method, resolution date
- Donation Record: donor, item details, quantity, classification (new/add-existing), received by, date
- Notification Payload: recipient, channel, template type, priority, status
- Analytics Snapshot: KPI name, period, dimensions (role/category/date), metric values

---

## 5. Flow Validation (Industry Checks)

### 5.1 Balancing Check

- Context inputs/outputs are preserved in Level 1 decomposition.
- No external entity connects directly to a data store (all access goes through processes).
- Every data store has at least one inflow and one outflow through processes.

### 5.2 Lifecycle Consistency Check

- Borrow flow is valid: submit -> validate -> approve/reject -> release -> return -> inspect -> close/obligation.
- Inventory consistency is maintained through request reservations, returns, and donation increments.
- Incidents can produce obligations; obligations can be resolved independently or aided by donations.
- Notifications and analytics are event-driven from operational processes.

### 5.3 Control and Governance Check

- Role-based access enforced in P1.0/P2.0 and respected by downstream processes.
- Audit-relevant records exist across requests, inspections, obligations, and donations.
- Reporting process consumes persisted operational data, not transient UI state.

---

## 6. Optional Next Decompositions (Recommended)

- Level 2 for P4.0 Process Borrow Requests
  - P4.1 Validate Request
  - P4.2 Instructor Decision
  - P4.3 Custodian Release
  - P4.4 Return Intake
  - P4.5 Close Request

- Level 2 for P5.0 Inspect Returns and Manage Obligations
  - P5.1 Capture Inspection
  - P5.2 Classify Incident
  - P5.3 Create Obligation
  - P5.4 Resolve Obligation

This document is suitable as a baseline technical DFD artifact for design review, implementation tracing, and audit documentation.

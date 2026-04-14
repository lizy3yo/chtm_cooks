# CHTM Laboratory Inventory System
## Industry-Standard Reports and Analytics Blueprint

Date: 2026-04-11
Scope: System-wide analytics design grounded in current modules and endpoints

---

## 1) Executive Summary

This blueprint defines a professional, industry-standard reporting and analytics program for the CHTM Laboratory inventory system.

It is based on the current implemented domains in this repository:
- Borrow request lifecycle and inspections
- Inventory and catalog operations
- Replacement obligations and donation flows
- Notifications and user actions
- Authentication, profile, and sessions
- Audit/history trails and operational health endpoints

The design supports:
- Real-time operational dashboards
- Role-based report packs
- Drill-down and cross-filter analytics
- Export and scheduled delivery
- Governance, auditability, and data quality controls

---

## 2) Analytics Domains and Reportable Features

### 2.1 Borrow Request Operations
Source surfaces:
- `src/routes/api/borrow-requests/**`
- `src/lib/api/borrowRequests.ts`

Core reportable features:
- Request volume and trend by period
- Status funnel (`pending_instructor` to `returned`)
- SLA turnaround (approval, release, return)
- Overdue and reminder effectiveness
- Incident rates (`missing`, `damaged` inspections)
- Instructor/custodian workload and throughput

### 2.2 Inventory and Catalog Intelligence
Source surfaces:
- `src/routes/api/inventory/**`
- `src/lib/api/inventory.ts`
- `src/lib/api/catalog.ts`
- `src/lib/api/inventoryHistory.ts`

Core reportable features:
- Stock health and low-stock risk
- Utilization and borrow intensity by item/category
- EOM variance and shrinkage indicators
- Catalog availability mix
- Constant-item demand and max-quantity policy adherence
- Archive/delete/restore activity and inventory governance

### 2.3 Replacement Obligations and Resolution
Source surfaces:
- `src/routes/api/replacement-obligations/**`
- `src/lib/api/replacementObligations.ts`

Core reportable features:
- Pending vs resolved obligations
- Resolution method (replacement)
- Average resolution cycle time
- Balance aging and backlog buckets
- Category-level obligation burden

### 2.4 Donation Pipeline Analytics
Source surfaces:
- `src/routes/api/donations/**`
- `src/lib/api/donations.ts`

Core reportable features:
- Donation volume and trend
- Donor contribution concentration
- New-item vs add-to-existing mix
- Donation-to-obligation coverage ratio
- Donation impact on stock alerts

### 2.5 Student Risk, Behavior, and Trust
Source surfaces:
- `src/routes/api/student-statistics/+server.ts`
- `src/lib/api/statistics.ts`
- `src/routes/api/reports/analytics/+server.ts`

Core reportable features:
- Trust score distribution and tiers
- On-time return performance
- Repeated incident and repeat-offender patterns
- Cohort-style risk progression (period-over-period)

### 2.6 Notifications and Engagement
Source surfaces:
- `src/routes/api/notifications/**`
- `src/lib/api/notifications.ts`

Core reportable features:
- Notification volume by type and role
- Read rate and time-to-read
- Reminder conversion impact (reminder sent to return action)

### 2.7 Authentication, Security, and Sessions
Source surfaces:
- `src/routes/api/auth/**`
- `src/lib/api/auth.ts`
- `src/lib/api/profile.ts`
- `src/routes/api/csp-report/+server.ts`
- `src/routes/api/clear-rate-limit/+server.ts`

Core reportable features:
- Login success/failure rate
- Verification/reset funnel completion
- Session concurrency and revocation trends
- Security event trend and anomaly indicators

### 2.8 Platform and Data Operations
Source surfaces:
- `src/routes/api/cache/**`
- `src/routes/api/db-indexes/**`
- `src/routes/api/db-stats/**`
- `src/routes/api/health/+server.ts`

Core reportable features:
- API and cache health KPIs
- Index coverage and optimization opportunities
- Query and endpoint latency trend
- Error-rate monitoring by endpoint

---

## 3) Role-Based Report Packs (Industry Standard)

### 3.1 Custodian Pack
- Operations Command Center (live)
- Overdue Risk Board
- Inventory Utilization and Stock Exposure
- Replacement Backlog and SLA Board
- Donation Impact Dashboard

### 3.2 Instructor Pack
- Class and student borrow behavior
- Return performance and incident tracking
- Catalog demand and planning insights
- Student risk watchlist (trust and incident trends)

### 3.3 Superadmin Pack
- Cross-role throughput and compliance
- User activity, security, and session analytics
- Data quality and audit completeness
- System performance and reliability analytics

### 3.4 Student Pack (Self-service)
- Personal borrowing trend
- Return punctuality and trust trajectory
- Active obligations and resolution progress
- Notification responsiveness

---

## 4) Standard Visualization Library by Use Case

Use these visual types as default standards:
- Time trend: line + area, moving average, anomaly overlays
- Composition: stacked bars, donut/pie
- Funnel/path: lifecycle conversion and drop-off
- Heatmap: hour/day workload and activity concentration
- Scatter: trust vs incident risk, complexity vs turnaround
- Gauge/dial: SLA and policy attainment
- Treemap: category burden/coverage concentration
- Table: sortable, expandable, inline totals and medians

Mandatory interaction standards:
- Global and widget-level filters
- Click-to-cross-filter
- Drill-through from aggregate to record list
- Hover tooltips with exact values and contextual delta
- URL-state persistence for shareable views

---

## 5) KPI Catalog (Recommended)

### Borrow and SLA KPIs
- Request intake rate
- Approval SLA attainment
- Release SLA attainment
- Return punctuality rate
- Overdue ratio
- Reminder-to-resolution conversion

### Inventory KPIs
- Stockout risk index
- Low-stock count and trend
- Inventory turnover proxy (borrow frequency)
- Variance/shrinkage index
- Constant-item service level

### Obligation and Recovery KPIs
- Outstanding obligations count/value
- Resolution rate
- Median resolution days
- Aging backlog (0-7, 8-30, 31+ days)

### Donation KPIs
- Donation inflow trend
- Coverage ratio (donated quantity / pending obligation quantity)
- Donor concentration score
- Time-to-stock contribution impact

### Student Risk KPIs
- Trust score distribution
- High-risk cohort size
- Incident recurrence rate
- Risk-to-resolution cycle time

### Platform KPIs
- Endpoint success rate
- P95 API response time
- Cache hit ratio
- Data freshness lag

---

## 6) Filter and Segmentation Standard

Default global filters:
- Date range (Today, Last 7 Days, MTD, Semester, Custom)
- Role (student/instructor/custodian/superadmin)
- Category and item
- Status and resolution type
- Class/block/year level

Metric filters:
- Value thresholds (`overdueDays > X`, `trustScore < Y`, `quantity < minStock`)

Search/autocomplete targets:
- Student ID/name
- Request ID
- Item ID/name
- Obligation ID

Reusable saved views:
- Personal saved views
- Team-shared views with role-based edit rights

---

## 7) Report Management Standard

Minimum capabilities:
- Create custom reports (field and metric picker)
- Save, Save As, Delete
- Version history with actor and timestamp
- Scheduled delivery (daily, weekly, monthly)
- Export to CSV, Excel, PDF, PNG
- API link export for integration

Permission model:
- Viewer: consume and export
- Editor: modify layout and filters
- Owner/Admin: permission and schedule control

---

## 8) Governance, Quality, and Audit

Required controls:
- Data dictionary for each metric
- Metric ownership and approval workflow
- Freshness SLAs per dashboard
- Null/coverage checks for mandatory timestamps
- Audit trail on report edits and schedule changes

Data quality scorecards should include:
- Inspection coverage
- Return timestamp coverage
- Orphaned records and referential integrity checks
- Outlier and duplicate detection indicators

---

## 9) Gap Assessment Against Current Implementation

Already strong in current codebase:
- Core analytics endpoint and SSE updates
- Borrow/inventory/replacement/student-risk metrics
- Rich front-end interactivity and filtering foundation

Gaps to implement for full enterprise standard:
- Geospatial analytics (requires location fields)
- Persistent server-side report definitions/version history
- Email scheduler and delivery tracking
- Comment/annotation and collaboration threads
- Formal semantic layer (metric definitions + ownership)

---

## 10) Implementation Roadmap

### Phase 1 (Immediate: 2-4 weeks)
- Finalize KPI dictionary and role-based report packs
- Add report version history metadata model
- Add schedule model and backend delivery job skeleton
- Add export parity and validation tests

### Phase 2 (Near-term: 4-8 weeks)
- Build custom report builder (field/metric picker)
- Add collaborative comments and shared workspaces
- Add platform observability dashboards (API/cache/index)
- Add quality scorecard widgets and alerts

### Phase 3 (Advanced: 8-12 weeks)
- Add forecasting service and configurable anomaly models
- Add cohort/path analytics with event fact tables
- Add geospatial dimension and map visualizations
- Add governance workflows and certification badges for reports

---

## 11) Recommended Next Deliverables in This Repository

1. `docs/analytics-kpi-dictionary.md`
2. `docs/analytics-role-based-report-catalog.md`
3. `docs/analytics-data-model-and-events.md`
4. `docs/analytics-scheduler-and-delivery-design.md`
5. `docs/analytics-governance-and-audit.md`

This blueprint should be treated as the baseline architecture for all future reporting and analytics features in the CHTM Laboratory inventory platform.

# 💰 FinOps Savings Report

**Account:** demo-fintech-prod (demo-account-123456789012)
**Region:** us-east-1 · **Currency:** USD
**Observation window:** 30 days · **Generated:** 2026-11-12T15:42:36.579Z

> ⚠️ **Sample / demo data.** This report was generated from the bundled sample dataset. Figures are realistic estimates, not real production spend.

## Summary

- **Findings:** 15
- **Potential savings:** **$888.00/month — $10656.00/year**

## Savings by category

| Category | Findings | Monthly savings |
|---|---:|---:|
| Over-provisioned | 3 | $378.14 |
| Idle instance | 3 | $292.00 |
| Unattached volume | 4 | $125.00 |
| Stale snapshot | 3 | $60.00 |
| Idle load balancer | 2 | $32.86 |
| **Total** | **15** | **$888.00** |

## Findings

| ID | Resource | Category | Confidence | Monthly savings |
|---|---|---|---|---:|
| F-001 | analytics-01 (`i-0a1b2c3d4e5f60005`) | Over-provisioned | medium | $183.96 |
| F-002 | web-prod-01 (`i-0a1b2c3d4e5f60001`) | Idle instance | high | $140.16 |
| F-003 | ml-training (`i-0a1b2c3d4e5f60008`) | Over-provisioned | medium | $124.10 |
| F-004 | api-staging (`i-0a1b2c3d4e5f60003`) | Idle instance | high | $121.47 |
| F-005 | 1000GB gp3 volume (`vol-0a1b2c3d4e5f600a3`) | Unattached volume | high | $80.00 |
| F-006 | web-prod-02 (`i-0a1b2c3d4e5f60002`) | Over-provisioned | medium | $70.08 |
| F-007 | 800GB snapshot (`snap-0a1b2c3d4e5f60103`) | Stale snapshot | medium | $40.00 |
| F-008 | dev-sandbox (`i-0a1b2c3d4e5f60006`) | Idle instance | high | $30.37 |
| F-009 | 200GB gp2 volume (`vol-0a1b2c3d4e5f600a2`) | Unattached volume | high | $20.00 |
| F-010 | 250GB gp3 volume (`vol-0a1b2c3d4e5f600a5`) | Unattached volume | high | $20.00 |
| F-011 | alb-legacy (`alb-legacy`) | Idle load balancer | high | $16.43 |
| F-012 | alb-prod (`alb-prod`) | Idle load balancer | high | $16.43 |
| F-013 | 300GB snapshot (`snap-0a1b2c3d4e5f60101`) | Stale snapshot | medium | $15.00 |
| F-014 | 100GB snapshot (`snap-0a1b2c3d4e5f60104`) | Stale snapshot | medium | $5.00 |
| F-015 | 50GB gp2 volume (`vol-0a1b2c3d4e5f600a6`) | Unattached volume | high | $5.00 |

### F-001 — analytics-01 · Over-provisioned

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60005`
- **Severity:** medium · **Confidence:** medium
- **Monthly savings:** $183.96 ($2207.52/year)
- **Evidence:** Avg CPU 22% (max 47%) over 30 days; avg memory 40%. Headroom far above observed load.
- **Recommendation:** Downsize analytics-01 from r5.2xlarge ($367.92/mo) to r5.xlarge ($183.96/mo) and watch CPU for one week.

**Decision:** [ ] Approve · [ ] Reject

### F-002 — web-prod-01 · Idle instance

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60001`
- **Severity:** high · **Confidence:** high
- **Monthly savings:** $140.16 ($1681.92/year)
- **Evidence:** Avg CPU 8% (max 21%) over 30 days; m5.xlarge running since 2025-06-14.
- **Recommendation:** Stop or terminate web-prod-01 (m5.xlarge). If it is needed again, relaunch from the latest AMI — do not keep paying for an idle box.

**Decision:** [ ] Approve · [ ] Reject

### F-003 — ml-training · Over-provisioned

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60008`
- **Severity:** medium · **Confidence:** medium
- **Monthly savings:** $124.10 ($1489.20/year)
- **Evidence:** Avg CPU 18% (max 44%) over 30 days; avg memory 36%. Headroom far above observed load.
- **Recommendation:** Downsize ml-training from c5.2xlarge ($248.20/mo) to c5.xlarge ($124.10/mo) and watch CPU for one week.

**Decision:** [ ] Approve · [ ] Reject

### F-004 — api-staging · Idle instance

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60003`
- **Severity:** high · **Confidence:** high
- **Monthly savings:** $121.47 ($1457.64/year)
- **Evidence:** Avg CPU 6% (max 14%) over 30 days; t3.xlarge running since 2025-11-20.
- **Recommendation:** Stop or terminate api-staging (t3.xlarge). If it is needed again, relaunch from the latest AMI — do not keep paying for an idle box.

**Decision:** [ ] Approve · [ ] Reject

### F-005 — 1000GB gp3 volume · Unattached volume

- **Resource:** EBS volume `vol-0a1b2c3d4e5f600a3`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $80.00 ($960.00/year)
- **Evidence:** Unattached for 120 days. Nothing is reading or writing to it.
- **Recommendation:** Take a final snapshot if the data matters, then delete vol-0a1b2c3d4e5f600a3 (1000GB gp3).

**Decision:** [ ] Approve · [ ] Reject

### F-006 — web-prod-02 · Over-provisioned

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60002`
- **Severity:** medium · **Confidence:** medium
- **Monthly savings:** $70.08 ($840.96/year)
- **Evidence:** Avg CPU 12% (max 38%) over 30 days; avg memory 44%. Headroom far above observed load.
- **Recommendation:** Downsize web-prod-02 from m5.xlarge ($140.16/mo) to m5.large ($70.08/mo) and watch CPU for one week.

**Decision:** [ ] Approve · [ ] Reject

### F-007 — 800GB snapshot · Stale snapshot

- **Resource:** EBS snapshot `snap-0a1b2c3d4e5f60103`
- **Severity:** low · **Confidence:** medium
- **Monthly savings:** $40.00 ($480.00/year)
- **Evidence:** 500 days old (Old analytics dataset snapshot). Older than the 180-day retention bar.
- **Recommendation:** Delete snap-0a1b2c3d4e5f60103 (800GB) unless it is a legal/compliance hold — confirm with the owning team first.

**Decision:** [ ] Approve · [ ] Reject

### F-008 — dev-sandbox · Idle instance

- **Resource:** EC2 instance `i-0a1b2c3d4e5f60006`
- **Severity:** high · **Confidence:** high
- **Monthly savings:** $30.37 ($364.44/year)
- **Evidence:** Avg CPU 3% (max 9%) over 30 days; t3.medium running since 2025-12-01.
- **Recommendation:** Stop or terminate dev-sandbox (t3.medium). If it is needed again, relaunch from the latest AMI — do not keep paying for an idle box.

**Decision:** [ ] Approve · [ ] Reject

### F-009 — 200GB gp2 volume · Unattached volume

- **Resource:** EBS volume `vol-0a1b2c3d4e5f600a2`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $20.00 ($240.00/year)
- **Evidence:** Unattached for 90 days. Nothing is reading or writing to it.
- **Recommendation:** Take a final snapshot if the data matters, then delete vol-0a1b2c3d4e5f600a2 (200GB gp2).

**Decision:** [ ] Approve · [ ] Reject

### F-010 — 250GB gp3 volume · Unattached volume

- **Resource:** EBS volume `vol-0a1b2c3d4e5f600a5`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $20.00 ($240.00/year)
- **Evidence:** Unattached for 45 days. Nothing is reading or writing to it.
- **Recommendation:** Take a final snapshot if the data matters, then delete vol-0a1b2c3d4e5f600a5 (250GB gp3).

**Decision:** [ ] Approve · [ ] Reject

### F-011 — alb-legacy · Idle load balancer

- **Resource:** Load balancer `alb-legacy`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $16.43 ($197.16/year)
- **Evidence:** Averaging 0 requests/day over the last 30 days; created 60 days ago.
- **Recommendation:** Delete alb-legacy (application). If the DNS name is still referenced, point it at the active load balancer first.

**Decision:** [ ] Approve · [ ] Reject

### F-012 — alb-prod · Idle load balancer

- **Resource:** Load balancer `alb-prod`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $16.43 ($197.16/year)
- **Evidence:** Averaging 2 requests/day over the last 30 days; created 300 days ago.
- **Recommendation:** Delete alb-prod (application). If the DNS name is still referenced, point it at the active load balancer first.

**Decision:** [ ] Approve · [ ] Reject

### F-013 — 300GB snapshot · Stale snapshot

- **Resource:** EBS snapshot `snap-0a1b2c3d4e5f60101`
- **Severity:** low · **Confidence:** medium
- **Monthly savings:** $15.00 ($180.00/year)
- **Evidence:** 400 days old (Pre-migration backup of legacy web volume). Older than the 180-day retention bar.
- **Recommendation:** Delete snap-0a1b2c3d4e5f60101 (300GB) unless it is a legal/compliance hold — confirm with the owning team first.

**Decision:** [ ] Approve · [ ] Reject

### F-014 — 100GB snapshot · Stale snapshot

- **Resource:** EBS snapshot `snap-0a1b2c3d4e5f60104`
- **Severity:** low · **Confidence:** medium
- **Monthly savings:** $5.00 ($60.00/year)
- **Evidence:** 200 days old (Manual snapshot before patching). Older than the 180-day retention bar.
- **Recommendation:** Delete snap-0a1b2c3d4e5f60104 (100GB) unless it is a legal/compliance hold — confirm with the owning team first.

**Decision:** [ ] Approve · [ ] Reject

### F-015 — 50GB gp2 volume · Unattached volume

- **Resource:** EBS volume `vol-0a1b2c3d4e5f600a6`
- **Severity:** medium · **Confidence:** high
- **Monthly savings:** $5.00 ($60.00/year)
- **Evidence:** Unattached for 200 days. Nothing is reading or writing to it.
- **Recommendation:** Take a final snapshot if the data matters, then delete vol-0a1b2c3d4e5f600a6 (50GB gp2).

**Decision:** [ ] Approve · [ ] Reject

## How to act on this report

Nothing in this report has been executed. To turn findings into an execution plan, review each finding and approve or reject it with the HITL CLI:

```bash
node approve.js --list                 # review all findings
node approve.js --approve F-001 F-002  # approve specific findings
node approve.js --reject F-004         # reject a finding (needs review)
node approve.js --approve-all          # approve everything (use with care)
node approve.js                        # interactive review, one by one
```

Approved actions are written to `reports/approved-actions.json` as an execution plan. **That plan is a proposal, not an execution** — a human (or a separate, explicitly authorized automation step) must apply it. The agent never calls AWS itself.

## Detection rules (guardrails)

- Idle EC2: avg CPU < 10% over >= 14 days → stop/terminate.
- Over-provisioned EC2: avg CPU < 30% and max CPU < 50% → downsize one size.
- Unattached EBS: state `available` for >= 30 days → snapshot-then-delete.
- Stale snapshot: age > 180 days → delete (unless a compliance hold).
- Idle load balancer: < 10 requests/day → delete.

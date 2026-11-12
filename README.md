# 💰 AI FinOps Agent

An **AI FinOps agent** that finds wasted cloud spend and proposes savings — with a **human approval step (HITL)** before any action is taken.

Companies waste an estimated 30% of cloud spend on idle instances, over-provisioned resources, unattached storage, and forgotten snapshots. This agent scans AWS cost/usage data, detects that waste with clear, auditable rules, estimates the savings in dollars, and produces an execution plan that a human reviews and approves. **It never executes anything itself.**

> ⚠️ **Demo data.** The bundled dataset (`sample-data/aws-cost-sample.json`) is realistic but invented. Figures in the sample report are estimates, not real production spend. In production this agent reads from AWS Cost Explorer / CloudWatch (or a BigQuery export of billing data) — see [MCP-ready design](#mcp-ready-design).

## The problem companies face

- Cloud bills grow every quarter and nobody can say exactly what is wasted.
- Idle EC2 instances, unattached EBS volumes, stale snapshots, and idle load balancers quietly burn money every month.
- Engineers are afraid to delete things because they cannot prove something is safe to remove — so nothing gets removed.
- Existing FinOps tools show dashboards. This agent goes one step further: it produces **a decision-ready plan with evidence, confidence, and a human approval gate**.

## What it checks

| Check | Rule (guardrail) | Action proposed |
|---|---|---|
| Idle EC2 instance | Avg CPU < 10% over ≥ 14 days | Stop / terminate |
| Over-provisioned EC2 | Avg CPU < 30% and max CPU < 50% | Downsize one instance size |
| Unattached EBS volume | State `available` for ≥ 30 days | Snapshot, then delete |
| Stale EBS snapshot | Age > 180 days | Delete (unless compliance hold) |
| Idle load balancer | < 10 requests/day | Delete |

Every finding carries **evidence** (the numbers that triggered it), a **confidence level** (high/medium), a **severity**, and a **monthly savings estimate** in USD.

## How it works

```
sample-data/aws-cost-sample.json
        │  (or Cost Explorer / CloudWatch / BigQuery export)
        ▼
┌──────────────┐
│  agent.js    │  detection rules + pricing model
│  (analysis)  │  → findings with evidence + savings
└──────┬───────┘
       ▼
reports/savings-report.md   ← human-readable report
reports/findings.json       ← machine-readable findings
       │
       ▼  human reviews each finding
┌──────────────┐
│  approve.js  │  HITL approval CLI
│  (approval)  │  approve / reject per finding
└──────┬───────┘
       ▼
reports/approved-actions.json  ← EXECUTION PLAN (proposal only)
```

**The agent never calls AWS.** It analyzes data and writes a plan. A human — or a separate, explicitly authorized automation step — applies the plan. That separation is deliberate: it is the guardrail that makes an autonomous cost agent safe to run.

## Setup

```bash
git clone https://github.com/madhan-reddy1/ai-finops-agent.git
cd ai-finops-agent
npm install   # zero runtime dependencies — Node.js 18+ only
```

## Usage

```bash
# 1. Analyze the sample data (writes reports/savings-report.md + findings.json)
npm run analyze
# or: node agent.js

# 2. Review the findings
node approve.js --list

# 3. Approve / reject — interactive, one by one
node approve.js

#    ...or by flags:
node approve.js --approve F-001 F-002 F-007
node approve.js --reject F-004
node approve.js --approve-all --reject F-004

# 4. The approved execution plan lands in reports/approved-actions.json
```

### Options

```bash
node agent.js --data <path> --out <dir> --min-savings <usd>
#   --data        Cost/usage JSON to analyze (default: sample-data/aws-cost-sample.json)
#   --out         Report directory (default: reports/)
#   --min-savings Only report findings saving at least this much per month
```

## Example output

Running the sample data finds **15 findings** worth **$888.00/month ($10,656.00/year)**:

```
💰 FinOps analysis complete — 15 findings
   Potential savings: $888.00/month ($10,656.00/year)
   Report:  reports/savings-report.md
   Findings: reports/findings.json
```

Top findings in the sample report:

| ID | Resource | Category | Monthly savings |
|---|---|---|---|
| F-001 | analytics-01 (r5.2xlarge) | Over-provisioned | $183.96 |
| F-002 | web-prod-01 (m5.xlarge) | Idle instance | $140.16 |
| F-003 | ml-training (c5.2xlarge) | Over-provisioned | $124.10 |
| F-004 | api-staging (t3.xlarge) | Idle instance | $121.47 |
| F-005 | 1000GB gp3 volume | Unattached volume | $80.00 |

The full report is in [`reports/savings-report.md`](reports/savings-report.md). The sample approval run approved 14 of 15 findings (the `analytics-01` downsize was rejected for review), producing an execution plan worth **$704.04/month** in [`reports/approved-actions.json`](reports/approved-actions.json).

## GitHub Actions

`.github/workflows/finops-check.yml` runs the analysis:

- **Weekly** (Mondays 09:00 UTC) and on **every pull request**.
- Posts the savings summary as a **job summary** and as a **PR comment**.
- Uploads the full report as an artifact.

## Skills demonstrated

- **FinOps / cloud cost optimization** — AWS pricing model, waste detection, rightsizing.
- **Guardrails** — findings only fire when evidence clears a threshold; unknown instance types are skipped, not guessed; undecided findings default to *rejected*.
- **Human-in-the-loop (HITL)** — no action becomes a plan without explicit human approval; interactive and flag-based review.
- **Agentic design** — deterministic analysis engine with a clean machine-readable output (`findings.json`) that an LLM agent can consume as a tool.
- **Observability / reporting** — Markdown report, JSON findings, CI job summary, PR comments.
- **Node.js** — zero-dependency, readable, testable code; GitHub Actions CI.

## MCP-ready design

The analysis engine is deliberately built as a **tool**, not a chatbot. `agent.js` exposes pure functions (`detectEc2Waste`, `detectEbsWaste`, `detectSnapshotWaste`, `detectLbWaste`) that take structured cost data and return structured findings — exactly the shape an **MCP server** wraps as tools for an LLM agent. The next step is a thin MCP server over this engine so an agent can call `analyze_costs` and `propose_savings` with real Cost Explorer / BigQuery data, while the HITL approval step stays exactly as it is.

## Production notes

- **Data source:** point `--data` at a real export — AWS Cost Explorer / Cost and Usage Report, CloudWatch CPU metrics, or a BigQuery billing export. The JSON schema is documented in `sample-data/aws-cost-sample.json`.
- **Pricing:** the built-in price table is approximate on-demand us-east-1. For production accuracy, pull prices from the AWS Price List API or your Cost Explorer data.
- **Execution:** applying `approved-actions.json` is intentionally out of scope. Wire it to your change-management process (Terraform, runbooks, or a separate automation step with its own approvals).

## Project structure

```
.
├── agent.js                  # analysis engine: detection rules + report writer
├── approve.js                # HITL approval CLI → execution plan
├── sample-data/
│   └── aws-cost-sample.json  # realistic demo dataset (SAMPLE DATA ONLY)
├── reports/
│   ├── savings-report.md     # sample report (generated by running the tool)
│   ├── findings.json         # sample findings (generated)
│   └── approved-actions.json # sample execution plan (generated)
├── .github/workflows/
│   └── finops-check.yml      # weekly + PR FinOps check
├── package.json
└── .gitignore
```

## License

MIT

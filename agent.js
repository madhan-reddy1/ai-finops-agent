/**
 * ai-finops-agent — agent.js
 *
 * Reads AWS cost/usage data (default: sample-data/aws-cost-sample.json),
 * detects wasted spend, estimates monthly savings per finding, and writes:
 *   - reports/savings-report.md  (human-readable report with approve/reject checklist)
 *   - reports/findings.json      (machine-readable findings, consumed by approve.js)
 *
 * SAFETY: this tool only ANALYZES data and produces a plan. It never calls
 * AWS, never terminates/stops/deletes anything, and never executes changes.
 * Every action it proposes must pass a human approval step (approve.js)
 * before it becomes part of an execution plan.
 *
 * Usage:
 *   node agent.js                          # analyze the sample data
 *   node agent.js --data <path>            # analyze a different JSON file
 *   node agent.js --out <dir>              # write reports to another directory
 *   node agent.js --min-savings 10         # only report findings saving >= $10/mo
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Pricing (approximate AWS on-demand, us-east-1, 730 hrs/month). Used only to
// estimate savings on sample data; replace with Cost Explorer data in prod.
// ---------------------------------------------------------------------------
const INSTANCE_HOURLY_USD = {
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  't3.xlarge': 0.1664,
  't3.2xlarge': 0.3328,
  'm5.large': 0.096,
  'm5.xlarge': 0.192,
  'm5.2xlarge': 0.384,
  'm5.4xlarge': 0.768,
  'c5.large': 0.085,
  'c5.xlarge': 0.17,
  'c5.2xlarge': 0.34,
  'c5.4xlarge': 0.68,
  'r5.large': 0.126,
  'r5.xlarge': 0.252,
  'r5.2xlarge': 0.504,
  'r5.4xlarge': 1.008,
};

const HOURS_PER_MONTH = 730;
const EBS_GB_MONTH_USD = { gp2: 0.1, gp3: 0.08 };
const SNAPSHOT_GB_MONTH_USD = 0.05;
const ALB_MONTH_USD = 16.43; // ~$0.0225/hr, before LCU charges

// ---------------------------------------------------------------------------
// Detection thresholds (the "guardrails" — findings only fire when the
// evidence clears these bars, so the agent does not cry wolf).
// ---------------------------------------------------------------------------
const RULES = {
  ec2IdleMaxCpuPct: 10, // avg CPU < 10% over the window => idle
  ec2IdleMinDays: 14, // ...and observed for at least 14 days
  ec2RightsizeMaxCpuPct: 30, // avg CPU < 30% and max CPU < 50% => over-provisioned
  ec2RightsizeMaxPeakPct: 50,
  ebsUnattachedMinAgeDays: 30, // unattached for >= 30 days => waste
  snapshotMaxAgeDays: 180, // snapshot older than 180 days => stale
  lbIdleMaxRequestsPerDay: 10, // fewer than 10 requests/day => idle
};

// One step down the instance family, e.g. m5.xlarge -> m5.large.
const DOWNSIZE_MAP = {
  't3.2xlarge': 't3.xlarge',
  't3.xlarge': 't3.large',
  't3.large': 't3.medium',
  't3.medium': 't3.small',
  't3.small': 't3.micro',
  'm5.4xlarge': 'm5.2xlarge',
  'm5.2xlarge': 'm5.xlarge',
  'm5.xlarge': 'm5.large',
  'c5.4xlarge': 'c5.2xlarge',
  'c5.2xlarge': 'c5.xlarge',
  'c5.xlarge': 'c5.large',
  'r5.4xlarge': 'r5.2xlarge',
  'r5.2xlarge': 'r5.xlarge',
  'r5.xlarge': 'r5.large',
};

function monthlyCost(type) {
  const hourly = INSTANCE_HOURLY_USD[type];
  return hourly === undefined ? null : +(hourly * HOURS_PER_MONTH).toFixed(2);
}

function money(n) {
  return `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
function detectEc2Waste(instances, windowDays) {
  const findings = [];
  for (const inst of instances) {
    if (inst.state !== 'running') continue;
    const cost = monthlyCost(inst.type);
    if (cost === null) continue; // unknown type: skip rather than guess

    // Rule 1: idle instance — barely used for the whole window.
    if (inst.avgCpuPct30d < RULES.ec2IdleMaxCpuPct && windowDays >= RULES.ec2IdleMinDays) {
      findings.push({
        id: null,
        resourceType: 'EC2 instance',
        resourceId: inst.id,
        resourceName: inst.name,
        category: 'Idle instance',
        severity: 'high',
        confidence: 'high',
        evidence: `Avg CPU ${inst.avgCpuPct30d}% (max ${inst.maxCpuPct30d}%) over ${windowDays} days; ${inst.type} running since ${inst.launchDate}.`,
        recommendation: `Stop or terminate ${inst.name} (${inst.type}). If it is needed again, relaunch from the latest AMI — do not keep paying for an idle box.`,
        action: 'stop-or-terminate-instance',
        monthlySavingsUsd: cost,
      });
      continue;
    }

    // Rule 2: over-provisioned — steady low CPU, no big peaks.
    const smaller = DOWNSIZE_MAP[inst.type];
    if (
      smaller &&
      inst.avgCpuPct30d < RULES.ec2RightsizeMaxCpuPct &&
      inst.maxCpuPct30d < RULES.ec2RightsizeMaxPeakPct
    ) {
      const smallerCost = monthlyCost(smaller);
      const savings = +(cost - smallerCost).toFixed(2);
      if (savings > 0) {
        findings.push({
          id: null,
          resourceType: 'EC2 instance',
          resourceId: inst.id,
          resourceName: inst.name,
          category: 'Over-provisioned',
          severity: 'medium',
          confidence: 'medium',
          evidence: `Avg CPU ${inst.avgCpuPct30d}% (max ${inst.maxCpuPct30d}%) over ${windowDays} days; avg memory ${inst.avgMemoryPct30d}%. Headroom far above observed load.`,
          recommendation: `Downsize ${inst.name} from ${inst.type} (${money(cost)}/mo) to ${smaller} (${money(smallerCost)}/mo) and watch CPU for one week.`,
          action: 'downsize-instance',
          monthlySavingsUsd: savings,
        });
      }
    }
  }
  return findings;
}

function detectEbsWaste(volumes) {
  const findings = [];
  for (const vol of volumes) {
    if (vol.state !== 'available') continue; // attached volumes are in use
    if (vol.ageDays < RULES.ebsUnattachedMinAgeDays) continue;
    const rate = EBS_GB_MONTH_USD[vol.type] ?? EBS_GB_MONTH_USD.gp3;
    findings.push({
      id: null,
      resourceType: 'EBS volume',
      resourceId: vol.id,
      resourceName: `${vol.sizeGb}GB ${vol.type} volume`,
      category: 'Unattached volume',
      severity: 'medium',
      confidence: 'high',
      evidence: `Unattached for ${vol.ageDays} days. Nothing is reading or writing to it.`,
      recommendation: `Take a final snapshot if the data matters, then delete ${vol.id} (${vol.sizeGb}GB ${vol.type}).`,
      action: 'snapshot-then-delete-volume',
      monthlySavingsUsd: +(vol.sizeGb * rate).toFixed(2),
    });
  }
  return findings;
}

function detectSnapshotWaste(snapshots) {
  const findings = [];
  for (const snap of snapshots) {
    if (snap.ageDays <= RULES.snapshotMaxAgeDays) continue;
    findings.push({
      id: null,
      resourceType: 'EBS snapshot',
      resourceId: snap.id,
      resourceName: `${snap.sizeGb}GB snapshot`,
      category: 'Stale snapshot',
      severity: 'low',
      confidence: 'medium',
      evidence: `${snap.ageDays} days old (${snap.description}). Older than the ${RULES.snapshotMaxAgeDays}-day retention bar.`,
      recommendation: `Delete ${snap.id} (${snap.sizeGb}GB) unless it is a legal/compliance hold — confirm with the owning team first.`,
      action: 'delete-snapshot',
      monthlySavingsUsd: +(snap.sizeGb * SNAPSHOT_GB_MONTH_USD).toFixed(2),
    });
  }
  return findings;
}

function detectLbWaste(loadBalancers) {
  const findings = [];
  for (const lb of loadBalancers) {
    if (lb.avgRequestsPerDay >= RULES.lbIdleMaxRequestsPerDay) continue;
    findings.push({
      id: null,
      resourceType: 'Load balancer',
      resourceId: lb.name,
      resourceName: lb.name,
      category: 'Idle load balancer',
      severity: 'medium',
      confidence: 'high',
      evidence: `Averaging ${lb.avgRequestsPerDay} requests/day over the last 30 days; created ${lb.createdDaysAgo} days ago.`,
      recommendation: `Delete ${lb.name} (${lb.type}). If the DNS name is still referenced, point it at the active load balancer first.`,
      action: 'delete-load-balancer',
      monthlySavingsUsd: ALB_MONTH_USD,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function buildReport(data, findings, outDir) {
  const totalMonthly = +findings.reduce((s, f) => s + f.monthlySavingsUsd, 0).toFixed(2);
  const totalAnnual = +(totalMonthly * 12).toFixed(2);
  const byCategory = {};
  for (const f of findings) {
    byCategory[f.category] = byCategory[f.category] || { count: 0, monthly: 0 };
    byCategory[f.category].count += 1;
    byCategory[f.category].monthly = +(byCategory[f.category].monthly + f.monthlySavingsUsd).toFixed(2);
  }

  const lines = [];
  lines.push('# 💰 FinOps Savings Report');
  lines.push('');
  lines.push(`**Account:** ${data.meta?.accountName || 'unknown'} (${data.meta?.account || ''})`);
  lines.push(`**Region:** ${data.meta?.region || 'unknown'} · **Currency:** ${data.meta?.currency || 'USD'}`);
  lines.push(`**Observation window:** ${data.meta?.observationWindowDays || 30} days · **Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('> ⚠️ **Sample / demo data.** This report was generated from the bundled sample dataset. Figures are realistic estimates, not real production spend.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Findings:** ${findings.length}`);
  lines.push(`- **Potential savings:** **${money(totalMonthly)}/month — ${money(totalAnnual)}/year**`);
  lines.push('');
  lines.push('## Savings by category');
  lines.push('');
  lines.push('| Category | Findings | Monthly savings |');
  lines.push('|---|---:|---:|');
  for (const [cat, v] of Object.entries(byCategory).sort((a, b) => b[1].monthly - a[1].monthly)) {
    lines.push(`| ${cat} | ${v.count} | ${money(v.monthly)} |`);
  }
  lines.push(`| **Total** | **${findings.length}** | **${money(totalMonthly)}** |`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  lines.push('| ID | Resource | Category | Confidence | Monthly savings |');
  lines.push('|---|---|---|---|---:|');
  for (const f of findings) {
    lines.push(`| ${f.id} | ${f.resourceName} (\`${f.resourceId}\`) | ${f.category} | ${f.confidence} | ${money(f.monthlySavingsUsd)} |`);
  }
  lines.push('');
  for (const f of findings) {
    lines.push(`### ${f.id} — ${f.resourceName} · ${f.category}`);
    lines.push('');
    lines.push(`- **Resource:** ${f.resourceType} \`${f.resourceId}\``);
    lines.push(`- **Severity:** ${f.severity} · **Confidence:** ${f.confidence}`);
    lines.push(`- **Monthly savings:** ${money(f.monthlySavingsUsd)} (${money(f.monthlySavingsUsd * 12)}/year)`);
    lines.push(`- **Evidence:** ${f.evidence}`);
    lines.push(`- **Recommendation:** ${f.recommendation}`);
    lines.push('');
    lines.push(`**Decision:** [ ] Approve · [ ] Reject`);
    lines.push('');
  }
  lines.push('## How to act on this report');
  lines.push('');
  lines.push('Nothing in this report has been executed. To turn findings into an execution plan, review each finding and approve or reject it with the HITL CLI:');
  lines.push('');
  lines.push('```bash');
  lines.push('node approve.js --list                 # review all findings');
  lines.push('node approve.js --approve F-001 F-002  # approve specific findings');
  lines.push('node approve.js --reject F-004         # reject a finding (needs review)');
  lines.push('node approve.js --approve-all          # approve everything (use with care)');
  lines.push('node approve.js                        # interactive review, one by one');
  lines.push('```');
  lines.push('');
  lines.push('Approved actions are written to `reports/approved-actions.json` as an execution plan. **That plan is a proposal, not an execution** — a human (or a separate, explicitly authorized automation step) must apply it. The agent never calls AWS itself.');
  lines.push('');
  lines.push('## Detection rules (guardrails)');
  lines.push('');
  lines.push(`- Idle EC2: avg CPU < ${RULES.ec2IdleMaxCpuPct}% over >= ${RULES.ec2IdleMinDays} days → stop/terminate.`);
  lines.push(`- Over-provisioned EC2: avg CPU < ${RULES.ec2RightsizeMaxCpuPct}% and max CPU < ${RULES.ec2RightsizeMaxPeakPct}% → downsize one size.`);
  lines.push(`- Unattached EBS: state \`available\` for >= ${RULES.ebsUnattachedMinAgeDays} days → snapshot-then-delete.`);
  lines.push(`- Stale snapshot: age > ${RULES.snapshotMaxAgeDays} days → delete (unless a compliance hold).`);
  lines.push(`- Idle load balancer: < ${RULES.lbIdleMaxRequestsPerDay} requests/day → delete.`);
  lines.push('');

  return { markdown: lines.join('\n'), totalMonthly, totalAnnual };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { data: path.join(__dirname, 'sample-data', 'aws-cost-sample.json'), out: path.join(__dirname, 'reports'), minSavings: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--data' && argv[i + 1]) args.data = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === '--min-savings' && argv[i + 1]) args.minSavings = parseFloat(argv[++i]) || 0;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node agent.js [--data <path>] [--out <dir>] [--min-savings <usd>]');
    console.log('  --data        Cost/usage JSON to analyze (default: sample-data/aws-cost-sample.json)');
    console.log('  --out         Directory for reports (default: reports/)');
    console.log('  --min-savings Only report findings saving at least this much per month (default: 0)');
    return;
  }

  const raw = fs.readFileSync(args.data, 'utf8');
  const data = JSON.parse(raw);
  const windowDays = data.meta?.observationWindowDays || 30;

  let findings = [
    ...detectEc2Waste(data.ec2Instances || [], windowDays),
    ...detectEbsWaste(data.ebsVolumes || []),
    ...detectSnapshotWaste(data.snapshots || []),
    ...detectLbWaste(data.loadBalancers || []),
  ];

  // Deterministic order: biggest savings first, then by resource.
  findings.sort((a, b) => b.monthlySavingsUsd - a.monthlySavingsUsd || a.resourceId.localeCompare(b.resourceId));
  findings = findings.filter((f) => f.monthlySavingsUsd >= args.minSavings);
  findings.forEach((f, i) => {
    f.id = `F-${String(i + 1).padStart(3, '0')}`;
  });

  const { markdown, totalMonthly, totalAnnual } = buildReport(data, findings, args.out);
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'savings-report.md'), markdown);
  fs.writeFileSync(
    path.join(args.out, 'findings.json'),
    JSON.stringify({ generated: new Date().toISOString(), source: args.data, totalMonthlyUsd: totalMonthly, totalAnnualUsd: totalAnnual, findings }, null, 2)
  );

  console.log(`\n💰 FinOps analysis complete — ${findings.length} findings`);
  console.log(`   Potential savings: ${money(totalMonthly)}/month (${money(totalAnnual)}/year)`);
  console.log(`   Report:  ${path.join(args.out, 'savings-report.md')}`);
  console.log(`   Findings: ${path.join(args.out, 'findings.json')}`);
  console.log(`\n   Next step: review and approve with  node approve.js --list\n`);
}

if (require.main === module) main();

module.exports = { detectEc2Waste, detectEbsWaste, detectSnapshotWaste, detectLbWaste, buildReport, RULES };

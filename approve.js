/**
 * ai-finops-agent — approve.js
 *
 * Human-in-the-loop (HITL) approval CLI for FinOps findings.
 *
 * Reads reports/findings.json (written by agent.js), lets a human approve or
 * reject each finding, and writes the approved set to
 * reports/approved-actions.json as an EXECUTION PLAN.
 *
 * SAFETY: this writes a plan only. It does NOT call AWS, does NOT terminate,
 * stop, resize, or delete anything. A human (or a separate, explicitly
 * authorized automation step) must apply the plan.
 *
 * Usage:
 *   node approve.js --help
 *   node approve.js --list
 *   node approve.js --approve F-001 F-002
 *   node approve.js --reject F-004
 *   node approve.js --approve-all
 *   node approve.js --reject-all
 *   node approve.js --approve-all --reject F-004   (approve all except F-004)
 *   node approve.js                                (interactive, one by one)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FINDINGS_PATH = path.join(__dirname, 'reports', 'findings.json');
const PLAN_PATH = path.join(__dirname, 'reports', 'approved-actions.json');

function money(n) {
  return `$${n.toFixed(2)}`;
}

function loadFindings() {
  if (!fs.existsSync(FINDINGS_PATH)) {
    console.error(`\n❌ No findings found at ${FINDINGS_PATH}`);
    console.error('   Run the analysis first:  node agent.js\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(FINDINGS_PATH, 'utf8'));
}

function printFindings(findings) {
  console.log(`\n📋 ${findings.length} findings — total potential savings ${money(findings.reduce((s, f) => s + f.monthlySavingsUsd, 0))}/month\n`);
  for (const f of findings) {
    console.log(`  ${f.id}  ${f.resourceName} — ${f.category}`);
    console.log(`        ${f.recommendation}`);
    console.log(`        Savings: ${money(f.monthlySavingsUsd)}/mo · Confidence: ${f.confidence} · Severity: ${f.severity}\n`);
  }
}

function writePlan(decisions, data) {
  const approved = data.findings.filter((f) => decisions[f.id] === 'approve');
  const rejected = data.findings.filter((f) => decisions[f.id] === 'reject');
  const approvedMonthly = +approved.reduce((s, f) => s + f.monthlySavingsUsd, 0).toFixed(2);

  const plan = {
    generated: new Date().toISOString(),
    source: 'reports/findings.json',
    status: 'PLAN ONLY — NOT EXECUTED',
    warning:
      'This file is an execution plan produced after human approval. It does not execute anything. A human (or a separate, explicitly authorized automation step) must apply each action. The agent never calls AWS.',
    approvedMonthlySavingsUsd: approvedMonthly,
    approvedAnnualSavingsUsd: +(approvedMonthly * 12).toFixed(2),
    rejectedMonthlySavingsUsd: +rejected.reduce((s, f) => s + f.monthlySavingsUsd, 0).toFixed(2),
    approvedActions: approved.map((f) => ({
      id: f.id,
      action: f.action,
      resourceType: f.resourceType,
      resourceId: f.resourceId,
      resourceName: f.resourceName,
      monthlySavingsUsd: f.monthlySavingsUsd,
      recommendation: f.recommendation,
    })),
    rejectedActions: rejected.map((f) => ({ id: f.id, resourceName: f.resourceName, reason: 'rejected by reviewer' })),
  };

  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));

  console.log(`\n✅ Execution plan written to ${PLAN_PATH}`);
  console.log(`   Approved: ${approved.length} actions — ${money(approvedMonthly)}/month (${money(plan.approvedAnnualSavingsUsd)}/year)`);
  console.log(`   Rejected: ${rejected.length} actions — ${money(plan.rejectedMonthlySavingsUsd)}/month left on the table`);
  console.log('   ⚠️  PLAN ONLY — nothing was executed against AWS.\n');
}

async function interactiveReview(data) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim().toLowerCase())));

  console.log(`\n🧑‍💼 Interactive review — ${data.findings.length} findings. Answer y (approve), n (reject), or q (quit and save what you decided).\n`);
  const decisions = {};
  for (const f of data.findings) {
    console.log(`${f.id} — ${f.resourceName} · ${f.category} · ${money(f.monthlySavingsUsd)}/mo · confidence ${f.confidence}`);
    console.log(`   ${f.recommendation}`);
    const answer = await ask('   Approve? [y/n/q] ');
    if (answer === 'q') break;
    decisions[f.id] = answer === 'y' || answer === 'yes' ? 'approve' : 'reject';
    console.log('');
  }
  rl.close();
  // Anything not reviewed is treated as rejected (safe default).
  for (const f of data.findings) {
    if (!decisions[f.id]) decisions[f.id] = 'reject';
  }
  writePlan(decisions, data);
}

function parseArgs(argv) {
  const args = { approve: [], reject: [], approveAll: false, rejectAll: false, list: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--approve') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.approve.push(argv[++i].toUpperCase());
    } else if (a === '--reject') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.reject.push(argv[++i].toUpperCase());
    } else if (a === '--approve-all') args.approveAll = true;
    else if (a === '--reject-all') args.rejectAll = true;
    else if (a === '--list') args.list = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      args.help = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('Usage: node approve.js [options]');
    console.log('');
    console.log('  --list                      List all findings with savings');
    console.log('  --approve F-001 F-002       Approve specific findings');
    console.log('  --reject F-004              Reject specific findings');
    console.log('  --approve-all               Approve every finding');
    console.log('  --reject-all                Reject every finding');
    console.log('  --approve-all --reject F-004  Approve all except F-004');
    console.log('  (no options)                Interactive review, one finding at a time');
    console.log('');
    console.log('Writes the approved set to reports/approved-actions.json as an');
    console.log('execution PLAN. Nothing is executed against AWS.');
    return;
  }

  const data = loadFindings();

  if (args.list) {
    printFindings(data.findings);
    return;
  }

  const decisions = {};
  const validIds = new Set(data.findings.map((f) => f.id));
  const unknown = [...args.approve, ...args.reject].filter((id) => !validIds.has(id));
  if (unknown.length > 0) {
    console.error(`\n❌ Unknown finding id(s): ${unknown.join(', ')}`);
    console.error(`   Valid ids: ${[...validIds].join(', ')}\n`);
    process.exit(1);
  }

  if (args.rejectAll) {
    for (const f of data.findings) decisions[f.id] = 'reject';
  } else if (args.approveAll) {
    for (const f of data.findings) decisions[f.id] = 'approve';
  }
  for (const id of args.approve) decisions[id] = 'approve';
  for (const id of args.reject) decisions[id] = 'reject';

  const decided = Object.keys(decisions).length;
  if (decided === 0) {
    // No flags at all: interactive mode (only if a human is at the keyboard).
    if (process.stdin.isTTY) {
      interactiveReview(data);
      return;
    }
    console.log('No decisions given. Run with --help for options, or run interactively in a terminal.');
    console.log('Example: node approve.js --approve-all --reject F-004');
    return;
  }

  // Anything not explicitly decided is rejected (safe default).
  for (const f of data.findings) {
    if (!decisions[f.id]) decisions[f.id] = 'reject';
  }
  writePlan(decisions, data);
}

if (require.main === module) main();

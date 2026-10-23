import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = "emqzcygfwcvbmhxhfkcc";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function parseHistory(output) {
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const [local, remote] = line
      .split("|")
      .map((value) => value.trim().replaceAll("`", ""));
    if (!/^\d/.test(local) && !/^\d/.test(remote)) continue;
    requireCondition(
      [local, remote].every((value) => value === "" || /^\d{14}$/.test(value)),
      "Unrecognized migration history row",
    );
    requireCondition(
      local && (!remote || remote === local),
      "Remote migration history has drifted",
    );
    rows.push({ version: local, applied: remote === local });
  }
  requireCondition(rows.length > 0, "Could not parse migration history");
  requireCondition(
    new Set(rows.map((row) => row.version)).size === rows.length,
    "Duplicate history version",
  );
  return rows;
}

export function makeManifest(sha, files, rows, configHash, trustedRunnerSha) {
  requireCondition(
    /^[a-f0-9]{40}$/.test(trustedRunnerSha ?? ""),
    "Manifest requires the trusted runner checkout SHA",
  );
  requireCondition(
    files.length === rows.length &&
      files.every((file, index) => file.version === rows[index].version),
    "History does not match candidate migration files",
  );
  let pendingSeen = false;
  for (const row of rows) {
    if (!row.applied) pendingSeen = true;
    requireCondition(
      !pendingSeen || !row.applied,
      "Pending historical migration: manual investigation required",
    );
  }
  return {
    schema: 2,
    project,
    candidate: sha,
    trusted_runner_sha: trustedRunnerSha,
    config_sha256: configHash,
    migrations: files,
    pending: rows.filter((row) => !row.applied).map((row) => row.version),
  };
}

export function approvalDigest(manifest) {
  return hash(JSON.stringify(manifest));
}

export function verifyPreview(output, manifest) {
  const names = [...output.matchAll(/\b(\d{14}_[a-zA-Z0-9_]+\.sql)\b/g)].map(
    (match) => match[1],
  );
  const expected = manifest.migrations
    .filter((file) => manifest.pending.includes(file.version))
    .map((file) => file.file);
  requireCondition(
    JSON.stringify(names) === JSON.stringify(expected),
    "Push preview differs from migration history",
  );
}

export function verifyApproval(manifest, digest, backup) {
  requireCondition(
    /^[a-f0-9]{64}$/.test(digest ?? ""),
    "Apply requires the SHA-256 digest from preview",
  );
  requireCondition(
    digest === approvalDigest(manifest),
    "Approval is stale: trusted runner, candidate, SQL, config or pending set changed",
  );
  requireCondition(
    typeof backup === "string" &&
      backup.trim().length >= 3 &&
      backup.length <= 300 &&
      !/[\r\n]/.test(backup),
    "Apply requires a backup reference (3–300 characters, one line)",
  );
  requireCondition(
    manifest.pending.length > 0,
    "No pending migrations to apply",
  );
}

function execute(command, args, { combineOutput = false, ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    ...options,
  });
  if (result.error) throw result.error;
  requireCondition(
    result.status === 0,
    `${command} failed: ${result.stderr || result.stdout}`,
  );
  return combineOutput ? result.stdout + result.stderr : result.stdout;
}

export function run(env = process.env) {
  const sha = env.CANDIDATE_SHA ?? "";
  const mode = env.MIGRATION_OPERATION ?? "preview";
  requireCondition(
    /^[a-f0-9]{40}$/.test(sha),
    "Candidate must be a full lowercase 40-character commit SHA",
  );
  requireCondition(
    ["preview", "apply"].includes(mode),
    "Operation must be preview or apply",
  );
  requireCondition(
    env.PROD_SUPABASE_PROJECT_REF === project,
    "Wrong production project",
  );
  for (const name of ["SUPABASE_ACCESS_TOKEN", "PROD_SUPABASE_DB_PASSWORD"]) {
    requireCondition(Boolean(env[name]), `Missing ${name}`);
  }
  requireCondition(
    execute("git", ["rev-parse", `${sha}^{commit}`]).trim() === sha,
    "Candidate commit unavailable",
  );
  const trustedRunnerSha = execute("git", ["rev-parse", "HEAD"]).trim();

  // Never check out or execute candidate scripts, hooks, config, or env files.
  const workspace = mkdtempSync(
    join(tmpdir(), "jakstoimy-production-migrations-"),
  );
  mkdirSync(join(workspace, "scripts"));
  mkdirSync(join(workspace, "supabase", "migrations"), { recursive: true });
  for (const file of ["supabase-ops.sh", "load-local-env.sh"]) {
    cpSync(join(root, "scripts", file), join(workspace, "scripts", file));
  }
  const config = execute("git", ["show", "HEAD:supabase/config.toml"]);
  writeFileSync(join(workspace, "supabase", "config.toml"), config);
  // The CLI validates template paths even for migration-only commands.
  cpSync(
    join(root, "supabase", "templates"),
    join(workspace, "supabase", "templates"),
    { recursive: true },
  );
  const tree = execute("git", [
    "ls-tree",
    "-r",
    sha,
    "--",
    "supabase/migrations/",
  ]);
  const versions = new Set();
  const files = tree
    .trim()
    .split("\n")
    .map((entry) => {
      const match =
        /^100644 blob ([a-f0-9]{40})\tsupabase\/migrations\/(\d{14})_([a-zA-Z0-9_]+)\.sql$/.exec(
          entry,
        );
      requireCondition(
        match,
        "Candidate contains an unexpected migration path or file mode",
      );
      const [, blob, version, slug] = match;
      requireCondition(!versions.has(version), "Duplicate migration timestamp");
      versions.add(version);
      const content = execute("git", ["cat-file", "blob", blob], {
        encoding: null,
      });
      const file = `${version}_${slug}.sql`;
      writeFileSync(join(workspace, "supabase", "migrations", file), content);
      return { version, file, sha256: hash(content) };
    })
    .sort((a, b) => a.version.localeCompare(b.version));

  const ops = (...args) => {
    const result = execute(
      "bash",
      [join(workspace, "scripts", "supabase-ops.sh"), "prod", ...args],
      {
        cwd: workspace,
        combineOutput: true,
        env: {
          ...env,
          SUPABASE_DB_PASSWORD: env.PROD_SUPABASE_DB_PASSWORD,
          NO_COLOR: "1",
        },
      },
    );
    process.stdout.write(result);
    return result;
  };
  const reportDir = resolve(
    env.MIGRATION_REPORT_DIR ?? join(root, "migration-report"),
  );
  mkdirSync(reportDir, { recursive: true });
  const report = {
    operation: mode,
    status: "started",
    candidate: sha,
    trusted_runner_sha: trustedRunnerSha,
    project,
  };
  const save = () =>
    writeFileSync(
      join(reportDir, "result.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  save();
  try {
    ops("link");
    const rows = parseHistory(ops("migrations"));
    const manifest = makeManifest(
      sha,
      files,
      rows,
      hash(config),
      trustedRunnerSha,
    );
    verifyPreview(ops("push-preview"), manifest);
    const digest = approvalDigest(manifest);
    writeFileSync(
      join(reportDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    report.approval_sha256 = digest;
    report.pending = manifest.pending;
    console.log(`Approval SHA-256: ${digest}`);
    if (mode === "apply") {
      verifyApproval(
        manifest,
        env.APPROVED_MANIFEST_SHA256,
        env.BACKUP_REFERENCE,
      );
      report.backup_reference = env.BACKUP_REFERENCE;
      report.status = "applying";
      save();
      ops("push", "--confirm", "prod");
      const after = parseHistory(ops("migrations"));
      makeManifest(sha, files, after, hash(config), trustedRunnerSha);
      requireCondition(
        after.every((row) => row.applied),
        "Migration history is not in parity after push",
      );
    }
    report.status = mode === "apply" ? "applied-and-verified" : "previewed";
    save();
    writeFileSync(
      join(reportDir, "summary.md"),
      [
        `Production migrations: **${report.status}**`,
        `Candidate: \`${sha}\``,
        `Trusted runner: \`${trustedRunnerSha}\``,
        `Project: \`${project}\``,
        `Pending in approved plan: ${manifest.pending.length}`,
        `Approval SHA-256: \`${digest}\``,
        "Versions:",
        ...manifest.pending.map((version) => `- \`${version}\``),
        "",
      ].join("\n\n"),
    );
    return report;
  } catch (error) {
    report.status = "failed";
    save();
    throw error;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

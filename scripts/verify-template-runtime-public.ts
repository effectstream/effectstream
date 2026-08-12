#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

export interface PublicRuntimeFinding {
  code: "credential-file" | "secret-pattern" | "sensitive-environment";
  location: string;
  detail: string;
}

const CREDENTIAL_FILE = /^(?:\.npmrc|\.yarnrc(?:\.yml)?|\.netrc|\.env(?:\..+)?|id_rsa.*|id_ed25519.*|.*credentials.*\.json|.*\.(?:pem|key|p12|pfx))$/i;
const ALLOWED_EXAMPLE_FILE = /^\.env\.example$/i;
const SENSITIVE_ENVIRONMENT = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_KEY|AUTH)(?:_|$)/i;
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "private-key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "npm token", pattern: /npm_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Slack token", pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
];
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function readableText(file: string): string | undefined {
  const stat = fs.statSync(file);
  if (stat.size > MAX_TEXT_FILE_BYTES) return undefined;
  const content = fs.readFileSync(file);
  if (content.includes(0)) return undefined;
  return content.toString("utf8");
}

export function auditPublicRuntime(
  root: string,
  environment: Record<string, string | undefined> = process.env,
): PublicRuntimeFinding[] {
  const findings: PublicRuntimeFinding[] = [];
  const payloads = ["templates", "bin", "licenses"]
    .map((directory) => path.join(root, directory));
  const manifest = path.join(root, "runtime-manifest.json");
  const files = payloads.flatMap(walk);
  if (fs.existsSync(manifest)) files.push(manifest);

  for (const file of files) {
    const basename = path.basename(file);
    const relative = path.relative(root, file);
    if (CREDENTIAL_FILE.test(basename) && !ALLOWED_EXAMPLE_FILE.test(basename)) {
      findings.push({
        code: "credential-file",
        location: relative,
        detail: "credential-bearing file name is forbidden in the public runtime payload",
      });
    }
    const content = readableText(file);
    if (content == null) continue;
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(content)) {
        findings.push({
          code: "secret-pattern",
          location: relative,
          detail: `contains a recognizable ${secret.name}`,
        });
      }
    }
  }

  for (const [name, value] of Object.entries(environment)) {
    if (value && SENSITIVE_ENVIRONMENT.test(name)) {
      findings.push({
        code: "sensitive-environment",
        location: name,
        detail: "sensitive environment variables must not be persisted in the public image config",
      });
    }
  }
  return findings;
}

function flagValue(name: string): string | undefined {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const root = path.resolve(flagValue("--root") ?? "/opt/effectstream");
  const findings = auditPublicRuntime(root);
  for (const finding of findings) {
    console.error(`[${finding.code}] ${finding.location}: ${finding.detail}`);
  }
  if (findings.length > 0) {
    console.error(`Public runtime audit failed with ${findings.length} finding(s)`);
    process.exit(1);
  }
  console.log(`Public runtime audit passed: ${root}`);
}

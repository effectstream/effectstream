#!/usr/bin/env python3
"""
Grade subagent outputs against the assertions in each eval's eval_metadata.json.

Writes grading.json into each run directory with fields:
- run_id
- assertions: [{text, passed, evidence}]

Run as: python3 grade.py <iteration-dir>
e.g. python3 grade.py /Users/.../create-effectstream-app-workspace/iteration-1
"""

import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

RUNTIME_TIMEOUT_S = int(os.environ.get("RUNTIME_TIMEOUT_S", "600"))  # 10 min default
BOOT_SMOKE_TIMEOUT_S = int(os.environ.get("BOOT_SMOKE_TIMEOUT_S", "60"))


def find_file(base: Path, rel: str) -> Path | None:
    """Find rel under base, exploring template/ subdir too (subagents may save into template/)."""
    candidates = [
        base / rel,
        base / "template" / rel,
    ]
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    # Fallback: glob for the filename anywhere under base (handles unexpected nesting)
    name = Path(rel).name
    matches = list(base.rglob(name))
    if matches:
        # Prefer ones whose suffix path matches
        for m in matches:
            if str(m).endswith(rel):
                return m
        return matches[0]
    return None


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def check_grep(text: str, pattern: str) -> tuple[bool, str]:
    try:
        m = re.search(pattern, text)
        if m:
            evidence = m.group(0)[:200]
            return True, f"match: {evidence!r}"
        return False, "pattern not found"
    except re.error as e:
        return False, f"regex error: {e}"


def check_grep_absent(text: str, pattern: str) -> tuple[bool, str]:
    try:
        m = re.search(pattern, text)
        if m:
            return False, f"pattern WAS found (should be absent): {m.group(0)[:200]!r}"
        return True, "pattern correctly absent"
    except re.error as e:
        return False, f"regex error: {e}"


def check_grep_all(text: str, patterns: list[str]) -> tuple[bool, str]:
    missing = []
    found = []
    for p in patterns:
        try:
            if re.search(p, text):
                found.append(p)
            else:
                missing.append(p)
        except re.error as e:
            missing.append(f"{p} (regex error: {e})")
    if not missing:
        return True, f"all {len(found)} patterns matched"
    return False, f"missing: {missing}"


def check_grep_any(text: str, patterns: list[str]) -> tuple[bool, str]:
    for p in patterns:
        try:
            if re.search(p, text):
                return True, f"matched: {p!r}"
        except re.error:
            continue
    return False, f"none of {patterns} matched"


def check_complex_password(text: str) -> tuple[bool, str]:
    """Find MIDNIGHT_STORAGE_PASSWORD: \"...\" and verify the password has 3 of 4 char classes."""
    m = re.search(r'MIDNIGHT_STORAGE_PASSWORD["\']?\s*[:=]\s*["\']([^"\']+)["\']', text)
    if not m:
        return False, "MIDNIGHT_STORAGE_PASSWORD not found"
    pw = m.group(1)
    classes = 0
    if re.search(r'[A-Z]', pw): classes += 1
    if re.search(r'[a-z]', pw): classes += 1
    if re.search(r'[0-9]', pw): classes += 1
    if re.search(r'[^A-Za-z0-9]', pw): classes += 1
    if classes >= 3:
        return True, f"password {pw!r} has {classes} char classes"
    return False, f"password {pw!r} has only {classes} char classes (need >=3)"


def check_file_exists(base: Path, rel: str) -> tuple[bool, str]:
    p = find_file(base, rel)
    if p:
        return True, f"found at {p.relative_to(base)}"
    return False, f"{rel} not found anywhere under {base}"


def find_template_dir(sandbox: Path) -> Path | None:
    """Find the directory containing the runnable template (has package.json with workspaces)."""
    for candidate in [sandbox / "template", sandbox]:
        pkg = candidate / "package.json"
        if pkg.exists():
            try:
                data = json.loads(pkg.read_text())
                if "workspaces" in data:
                    return candidate
            except Exception:
                continue
    # Fallback: glob
    for pkg in sandbox.rglob("package.json"):
        try:
            data = json.loads(pkg.read_text())
            if "workspaces" in data:
                return pkg.parent
        except Exception:
            continue
    return None


def kill_orchestrator_ports():
    """Free common orchestrator ports between runs (engine + EVM + Cardano + Midnight)."""
    for port in (
        4747, 5432, 9999, 10599, 3334, 8883, 9883,  # engine
        8545, 8546,                                  # EVM Hardhat
        10000, 8090, 50051, 3000,                    # Cardano YACI + Dolos
        9944, 8088, 6300,                            # Midnight
    ):
        try:
            subprocess.run(["bash", "-c", f"lsof -ti :{port} | xargs -r kill -9"],
                           timeout=5, capture_output=True)
        except Exception:
            pass


def run_template_test(template_dir: Path) -> dict:
    """
    Runtime tier: cd into the template, bun install, run bun test if present,
    else boot smoke (bun run dev for BOOT_SMOKE_TIMEOUT_S, grep stdout for 'finalized block').

    Returns dict with keys: tested (bool), passed (bool), evidence (str), elapsed_s (int).
    """
    if not template_dir:
        return {"tested": False, "passed": False, "evidence": "no template dir found", "elapsed_s": 0}

    start = time.time()
    log_dir = template_dir.parent / "_runtime_logs"
    log_dir.mkdir(exist_ok=True)
    install_log = log_dir / "install.log"
    run_log = log_dir / "run.log"

    # bun install
    try:
        install = subprocess.run(
            ["bun", "install"], cwd=template_dir,
            capture_output=True, text=True, timeout=180,
        )
        install_log.write_text(install.stdout + "\n--- STDERR ---\n" + install.stderr)
        if install.returncode != 0:
            return {
                "tested": True, "passed": False,
                "evidence": f"bun install failed (exit {install.returncode}); tail: {install.stderr.strip().splitlines()[-3:] if install.stderr else 'no stderr'}",
                "elapsed_s": int(time.time() - start),
            }
    except subprocess.TimeoutExpired:
        return {"tested": True, "passed": False, "evidence": "bun install timed out at 180s",
                "elapsed_s": int(time.time() - start)}
    except FileNotFoundError:
        return {"tested": False, "passed": False, "evidence": "bun not on PATH",
                "elapsed_s": int(time.time() - start)}

    # Does the template have a `test` script?
    root_pkg = json.loads((template_dir / "package.json").read_text())
    scripts = root_pkg.get("scripts", {}) or {}
    has_test = "test" in scripts
    has_build_pgtypes = "build:pgtypes" in scripts

    kill_orchestrator_ports()

    # Regenerate .queries.ts to catch hand-fabricated locs (this is a known agent-cheating mode
    # that produces a 25P02 cascade only under real integration tests).
    if has_build_pgtypes:
        # Always stop the orchestrator first — pgtyped starts its own PGLite on 5432
        # and will fail or write against the wrong DB if a daemon is still running.
        try:
            subprocess.run(
                ["bunx", "orchestrator", "stop"], cwd=template_dir,
                capture_output=True, text=True, timeout=15,
            )
        except Exception:
            pass
        kill_orchestrator_ports()
        try:
            pgt = subprocess.run(
                ["bun", "run", "build:pgtypes"], cwd=template_dir,
                capture_output=True, text=True, timeout=120,
            )
            (log_dir / "build-pgtypes.log").write_text(pgt.stdout + "\n--- STDERR ---\n" + pgt.stderr)
            if pgt.returncode != 0:
                return {
                    "tested": True, "passed": False,
                    "evidence": f"bun run build:pgtypes failed (exit {pgt.returncode}); generated .queries.ts is broken or SQL is invalid; tail: {pgt.stderr.strip().splitlines()[-3:] if pgt.stderr else 'no stderr'}",
                    "elapsed_s": int(time.time() - start),
                }
        except subprocess.TimeoutExpired:
            return {"tested": True, "passed": False, "evidence": "bun run build:pgtypes timed out at 120s (PGLite port 5432 contention? hung pgtyped?)",
                    "elapsed_s": int(time.time() - start)}
        finally:
            kill_orchestrator_ports()

    if has_test:
        # Run bun run test with timeout
        try:
            test_run = subprocess.run(
                ["bun", "run", "test"], cwd=template_dir,
                capture_output=True, text=True, timeout=RUNTIME_TIMEOUT_S,
            )
            run_log.write_text(test_run.stdout + "\n--- STDERR ---\n" + test_run.stderr)
            elapsed = int(time.time() - start)
            output = test_run.stdout + test_run.stderr
            tail = output.strip().splitlines()[-5:] if output else []

            # Trust the printed Summary, not just the exit code. Bun's `bun run test`
            # frequently reports exit 143 (SIGTERM "Polite quit request") during teardown
            # of the orchestrator subprocess, even when all tests pass. The authoritative
            # signal is the "[Summary] N tests passed / 0 tests failed" block.
            summary_match = re.search(
                r"\[Summary\][^\n]*\n[^\n]*?(\d+)\s+tests?\s+passed\s*\n[^\n]*?(\d+)\s+tests?\s+failed",
                output,
            )
            if summary_match:
                passed_n = int(summary_match.group(1))
                failed_n = int(summary_match.group(2))
                if failed_n == 0 and passed_n > 0:
                    return {"tested": True, "passed": True,
                            "evidence": f"bun run test: {passed_n}/{passed_n} tests passed in {elapsed}s (exit {test_run.returncode}; SIGTERM-on-teardown is benign if Summary shows 0 failures)",
                            "elapsed_s": elapsed}
                return {"tested": True, "passed": False,
                        "evidence": f"bun run test: {passed_n} passed, {failed_n} FAILED in {elapsed}s; tail: {tail}",
                        "elapsed_s": elapsed}

            # No Summary block — the tests didn't even reach printSummary()
            if test_run.returncode == 0:
                return {"tested": True, "passed": True,
                        "evidence": f"bun run test exit 0 (no Summary block found, but exit clean) in {elapsed}s",
                        "elapsed_s": elapsed}
            return {"tested": True, "passed": False,
                    "evidence": f"bun run test FAILED (exit {test_run.returncode}, no test Summary printed — likely crashed before tests ran) in {elapsed}s; tail: {tail}",
                    "elapsed_s": elapsed}
        except subprocess.TimeoutExpired:
            return {"tested": True, "passed": False,
                    "evidence": f"bun run test exceeded {RUNTIME_TIMEOUT_S}s timeout",
                    "elapsed_s": RUNTIME_TIMEOUT_S}
        finally:
            kill_orchestrator_ports()

    # No test script — boot smoke
    try:
        proc = subprocess.Popen(
            ["bun", "run", "dev"], cwd=template_dir,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            preexec_fn=os.setsid if os.name == "posix" else None,
        )
        finalized = False
        cannot_find = None
        deadline = time.time() + BOOT_SMOKE_TIMEOUT_S
        captured = []
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            line = proc.stdout.readline() if proc.stdout else ""
            if not line:
                time.sleep(0.2); continue
            captured.append(line)
            if len(captured) > 200:
                captured = captured[-200:]
            if "finalized block" in line:
                finalized = True; break
            if "Cannot find module" in line:
                cannot_find = line.strip(); break
        # Always kill
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGINT)
            time.sleep(2)
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            pass
        run_log.write_text("".join(captured))
        elapsed = int(time.time() - start)
        if finalized:
            return {"tested": True, "passed": True,
                    "evidence": f"boot smoke: 'finalized block' observed in {elapsed}s",
                    "elapsed_s": elapsed}
        if cannot_find:
            return {"tested": True, "passed": False,
                    "evidence": f"boot smoke FAILED: {cannot_find}",
                    "elapsed_s": elapsed}
        return {"tested": True, "passed": False,
                "evidence": f"boot smoke: no 'finalized block' within {BOOT_SMOKE_TIMEOUT_S}s; tail: {captured[-3:]}",
                "elapsed_s": elapsed}
    finally:
        kill_orchestrator_ports()


def grade_assertion(base: Path, a: dict) -> dict:
    text_label = a["text"]
    check_type = a.get("check_type", "grep")

    if check_type == "file_exists":
        passed, evidence = check_file_exists(base, a["file"])
        return {"text": text_label, "passed": passed, "evidence": evidence}

    if check_type == "regex_complex_password":
        p = find_file(base, a["file"])
        if not p:
            return {"text": text_label, "passed": False, "evidence": f"{a['file']} not found"}
        text = read(p)
        passed, evidence = check_complex_password(text)
        return {"text": text_label, "passed": passed, "evidence": evidence}

    # All other types need a file
    p = find_file(base, a["file"])
    if not p:
        return {"text": text_label, "passed": False, "evidence": f"{a['file']} not found"}
    text = read(p)

    if check_type == "grep":
        passed, evidence = check_grep(text, a["pattern"])
    elif check_type == "grep_absent":
        passed, evidence = check_grep_absent(text, a["pattern"])
    elif check_type == "grep_all":
        passed, evidence = check_grep_all(text, a["patterns"])
    elif check_type == "grep_any":
        passed, evidence = check_grep_any(text, a["patterns"])
    else:
        passed, evidence = False, f"unknown check_type: {check_type}"

    return {"text": text_label, "passed": passed, "evidence": evidence}


def grade_run(eval_dir: Path, run_subdir: str, sandbox_root: Path, meta: dict) -> dict:
    # sandbox: e.g. /tmp/eval-runs/iter-1/eval-new-evm-minimal/with/
    sandbox = sandbox_root / eval_dir.name / ("with" if run_subdir == "with_skill" else "without")
    assertions = [grade_assertion(sandbox, a) for a in meta.get("assertions", [])]

    # Runtime tier — only if the eval meta asks for it
    runtime_check = meta.get("runtime_check", "auto")  # "auto" | "skip" | "force"
    if runtime_check != "skip":
        template_dir = find_template_dir(sandbox)
        if template_dir or runtime_check == "force":
            print(f"    runtime tier: cd {template_dir} && bun install && bun run test ...")
            result = run_template_test(template_dir)
            assertions.append({
                "text": "Template actually boots and passes its own integration tests (runtime tier — most important assertion)",
                "passed": result["passed"],
                "evidence": result["evidence"] + f" (elapsed {result['elapsed_s']}s)",
                "weight": 5,  # informational; viewer doesn't enforce
            })

    passed = sum(1 for a in assertions if a["passed"])
    total = len(assertions)
    return {
        "run_id": f"{eval_dir.name}-{run_subdir}",
        "sandbox": str(sandbox),
        "assertions": assertions,
        "passed": passed,
        "total": total,
        "pass_rate": passed / total if total else 0.0,
    }


def main():
    if len(sys.argv) < 2:
        print("usage: grade.py <iteration-dir>", file=sys.stderr)
        sys.exit(1)

    iter_dir = Path(sys.argv[1]).resolve()
    # Map iteration-1 -> iter-1, iteration-2 -> iter-2, etc.
    iter_name = iter_dir.name.replace("iteration-", "iter-")
    sandbox_root = Path(f"/tmp/eval-runs/{iter_name}")
    print(f"grading {iter_dir.name} with sandbox root {sandbox_root}")

    for eval_dir in sorted(iter_dir.glob("eval-*")):
        meta_p = eval_dir / "eval_metadata.json"
        if not meta_p.exists():
            print(f"  skip {eval_dir.name}: no eval_metadata.json")
            continue
        meta = json.loads(meta_p.read_text())

        for run_subdir in ("with_skill", "without_skill"):
            run_dir = eval_dir / run_subdir
            run_dir.mkdir(exist_ok=True)
            grading = grade_run(eval_dir, run_subdir, sandbox_root, meta)
            grading_p = run_dir / "grading.json"
            grading_p.write_text(json.dumps(grading, indent=2))
            print(f"  {grading['run_id']}: {grading['passed']}/{grading['total']} ({grading['pass_rate']*100:.0f}%) → {grading_p.relative_to(iter_dir.parent)}")


if __name__ == "__main__":
    main()

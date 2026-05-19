#!/usr/bin/env python3
"""
Aggregate per-run grading.json into a single benchmark.json + benchmark.md.

Schema matches what eval-viewer expects:
- configurations: [{name, runs: [{eval_id, eval_name, pass_rate, passed, total, duration_ms?, total_tokens?}], summary: {pass_rate_mean, ...}}]

Run: python3 aggregate.py <iteration-dir> --skill-name <name>
"""

import argparse
import json
import statistics
from pathlib import Path


def load_timing(run_dir: Path) -> dict:
    p = run_dir / "timing.json"
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("iter_dir", type=Path)
    parser.add_argument("--skill-name", required=True)
    args = parser.parse_args()

    iter_dir = args.iter_dir.resolve()

    configs = {
        "with_skill": [],
        "without_skill": [],
    }

    for eval_dir in sorted(iter_dir.glob("eval-*")):
        meta_p = eval_dir / "eval_metadata.json"
        if not meta_p.exists():
            continue
        meta = json.loads(meta_p.read_text())
        eval_id = meta["eval_id"]
        eval_name = meta.get("eval_name", eval_dir.name)

        for run_subdir in ("with_skill", "without_skill"):
            run_dir = eval_dir / run_subdir
            grading_p = run_dir / "grading.json"
            if not grading_p.exists():
                continue
            grading = json.loads(grading_p.read_text())
            timing = load_timing(run_dir)

            configs[run_subdir].append({
                "eval_id": eval_id,
                "eval_name": eval_name,
                "passed": grading.get("passed", 0),
                "total": grading.get("total", 0),
                "pass_rate": grading.get("pass_rate", 0.0),
                "duration_ms": timing.get("duration_ms"),
                "total_tokens": timing.get("total_tokens"),
            })

    def summarize(runs):
        if not runs:
            return {}
        pass_rates = [r["pass_rate"] for r in runs]
        durations = [r["duration_ms"] for r in runs if r.get("duration_ms") is not None]
        tokens = [r["total_tokens"] for r in runs if r.get("total_tokens") is not None]
        return {
            "pass_rate_mean": statistics.mean(pass_rates),
            "pass_rate_stdev": statistics.stdev(pass_rates) if len(pass_rates) > 1 else 0.0,
            "duration_ms_mean": statistics.mean(durations) if durations else None,
            "duration_ms_stdev": statistics.stdev(durations) if len(durations) > 1 else 0.0,
            "tokens_mean": statistics.mean(tokens) if tokens else None,
            "tokens_stdev": statistics.stdev(tokens) if len(tokens) > 1 else 0.0,
        }

    benchmark = {
        "skill_name": args.skill_name,
        "iteration": iter_dir.name,
        "configurations": [
            {
                "name": "with_skill",
                "label": f"{args.skill_name} (with skill)",
                "runs": configs["with_skill"],
                "summary": summarize(configs["with_skill"]),
            },
            {
                "name": "without_skill",
                "label": "Baseline (no skill)",
                "runs": configs["without_skill"],
                "summary": summarize(configs["without_skill"]),
            },
        ],
    }

    out_json = iter_dir / "benchmark.json"
    out_json.write_text(json.dumps(benchmark, indent=2))
    print(f"wrote {out_json}")

    # Also write a human-readable markdown
    md_lines = [f"# Benchmark: {args.skill_name} — {iter_dir.name}\n"]
    for cfg in benchmark["configurations"]:
        s = cfg["summary"]
        if not s:
            md_lines.append(f"## {cfg['label']}\n(no runs)\n")
            continue
        pr = s["pass_rate_mean"] * 100
        prs = s["pass_rate_stdev"] * 100
        md_lines.append(f"## {cfg['label']}\n")
        md_lines.append(f"- Pass rate: {pr:.1f}% ± {prs:.1f}%")
        if s["duration_ms_mean"] is not None:
            md_lines.append(f"- Duration: {s['duration_ms_mean']/1000:.1f}s ± {s['duration_ms_stdev']/1000:.1f}s")
        if s["tokens_mean"] is not None:
            md_lines.append(f"- Tokens: {s['tokens_mean']:.0f} ± {s['tokens_stdev']:.0f}")
        md_lines.append("\n### Per-eval breakdown\n")
        md_lines.append("| eval | passed | total | rate | tokens | duration |")
        md_lines.append("|---|---|---|---|---|---|")
        for r in cfg["runs"]:
            rate = r["pass_rate"] * 100
            tok = f"{r['total_tokens']:,}" if r.get("total_tokens") else "—"
            dur = f"{r['duration_ms']/1000:.1f}s" if r.get("duration_ms") else "—"
            md_lines.append(f"| {r['eval_name']} | {r['passed']} | {r['total']} | {rate:.0f}% | {tok} | {dur} |")
        md_lines.append("")

    out_md = iter_dir / "benchmark.md"
    out_md.write_text("\n".join(md_lines))
    print(f"wrote {out_md}")

    # Print delta
    s_with = benchmark["configurations"][0]["summary"]
    s_without = benchmark["configurations"][1]["summary"]
    if s_with and s_without:
        delta = (s_with["pass_rate_mean"] - s_without["pass_rate_mean"]) * 100
        print(f"\nDelta: {delta:+.1f} percentage points (with_skill vs baseline)")


if __name__ == "__main__":
    main()

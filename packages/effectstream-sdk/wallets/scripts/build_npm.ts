import { build, emptyDir } from "@deno/dnt";

const version = Deno.args[0];
if (!version) {
    throw new Error("Version is required");
}

await emptyDir("./npm");

await build({
  entryPoints: ["./src/mod.ts"],
  outDir: "./npm",
  test: false,
  shims: {
    deno: false,
  },
  package: {
    name: "@effectstream/wallets",
    version: version,
    description: "Your package.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/username/repo.git",
    },
    bugs: {
      url: "https://github.com/username/repo/issues",
    },
  },
  postBuild() {
    // steps to run after building and before running the tests
    // Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
  configFile: import.meta.resolve("../deno.json"),
  compilerOptions: {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["dom", "es2022"],
  }
});
// Offline demo build: runs from a folder with no internet (browser storage
// instead of Supabase, font and icons bundled in, demo data built in).
//   1. npm run copy-live-data   (needs internet; writes offline/seed.json)
//   2. npm run build:offline    (writes offline-demo/, open index.html)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import webpack from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import common from "./webpack.common.js";

const seedFile = new URL("./offline/seed.json", import.meta.url);
let seed = null;
if (fs.existsSync(seedFile)) {
  seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  // Offline sign-in checks a SHA-256 hash: every password = its username
  const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
  seed.gh_users = seed.gh_users.map((u) => ({ ...u, pass: sha(u.user) }));
} else {
  console.warn("offline/seed.json not found: using the built-in sample data.");
}

// Drop the Google Fonts links from the built page (the files are bundled)
class StripGoogleFonts {
  apply(compiler) {
    compiler.hooks.compilation.tap("StripGoogleFonts", (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tap(
        "StripGoogleFonts",
        (data) => ({
          ...data,
          html: data.html.replace(
            /<link\b[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g,
            "",
          ),
        }),
      );
    });
  }
}

const keep = common.plugins.filter((p) => !(p instanceof webpack.DefinePlugin));

export default {
  ...common,
  mode: "production",
  entry: ["./src/offline.js", "./src/index.js"],
  output: {
    filename: "main.js",
    path: path.resolve(import.meta.dirname, "offline-demo"),
    clean: true,
  },
  performance: { hints: false },
  plugins: [
    ...keep,
    new StripGoogleFonts(),
    new webpack.DefinePlugin({
      __SUPABASE_URL__: JSON.stringify(""),
      __SUPABASE_ANON_KEY__: JSON.stringify(""),
      __OFFLINE_SEED__: JSON.stringify(seed),
    }),
  ],
  module: {
    rules: [
      ...common.module.rules,
      { test: /\.(woff2?|ttf|eot)$/i, type: "asset/resource" },
    ],
  },
};

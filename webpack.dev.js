import fs from "node:fs";
import webpack from "webpack";
import { merge } from "webpack-merge";
import common from "./webpack.common.js";

// Read GEMINI_API_KEY from a local .env file (dev only, never committed)
function readGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
    const match = env.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

export default merge(common, {
  mode: "development",
  devtool: "eval-source-map",
  devServer: {
    watchFiles: ["./src/index.html"],
  },
  plugins: [
    new webpack.DefinePlugin({
      __GEMINI_API_KEY__: JSON.stringify(readGeminiKey()),
    }),
  ],
});

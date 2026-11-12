import fs from "node:fs";
import path from "node:path";
import webpack from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";

// Read a value from the environment or the local .env file (never committed)
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
    const line = env
      .split(/\r?\n/)
      .find(
        (l) =>
          l.trim().startsWith(`${name}=`) || l.trim().startsWith(`${name} =`),
      );
    if (!line) return "";
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

export default {
  mode: "development",
  entry: "./src/index.js",
  output: {
    filename: "main.js",
    path: path.resolve(import.meta.dirname, "dist"),
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/index.html",
    }),
    // Supabase's URL and anon (public) key are meant to ship to the browser;
    // Row Level Security in supabase/schema.sql is what protects the data.
    // Leave them empty to keep using localStorage.
    new webpack.DefinePlugin({
      __SUPABASE_URL__: JSON.stringify(readEnv("SUPABASE_URL")),
      __SUPABASE_ANON_KEY__: JSON.stringify(readEnv("SUPABASE_ANON_KEY")),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.html$/i,
        use: ["html-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
    ],
  },
};

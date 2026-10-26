import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes que chamam binários (whisper.cpp) rodam fora do bundle do servidor.
  serverExternalPackages: ["@remotion/install-whisper-cpp"],
  // O proxy de senha passa por todas as rotas e limita o corpo a 10MB por padrão; áudio WAV passa disso.
  experimental: { proxyClientMaxBodySize: "60mb" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

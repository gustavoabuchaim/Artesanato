import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pastaSemana } from "@/lib/armazenamento";
import { pastaArquivos } from "@/lib/fluxo";

const TIPOS: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Serve a voz, as fotos e o vídeo da semana, com suporte a Range (o player precisa para avançar). */
export async function GET(request: Request, { params }: RouteContext<"/api/arquivos/[nome]">) {
  const { nome } = await params;
  const tipo = TIPOS[path.extname(nome).toLowerCase()];
  if (!/^[\w-]+\.\w+$/.test(nome) || !tipo) return new Response("Arquivo inválido", { status: 400 });

  const ehVideo = nome.startsWith("video-");
  const arquivo = path.join(ehVideo ? pastaSemana() : pastaArquivos(), nome);
  const info = await stat(arquivo).catch(() => null);
  if (!info?.isFile()) return new Response("Não encontrado", { status: 404 });

  const cabecalhos: Record<string, string> = {
    "Content-Type": tipo,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (ehVideo && new URL(request.url).searchParams.has("baixar")) {
    cabecalhos["Content-Disposition"] = `attachment; filename="${nome}"`;
  }

  const faixa = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (faixa && (faixa[1] || faixa[2])) {
    const inicio = faixa[1] ? Number(faixa[1]) : Math.max(info.size - Number(faixa[2]), 0);
    const fim = faixa[1] && faixa[2] ? Math.min(Number(faixa[2]), info.size - 1) : info.size - 1;
    if (inicio > fim || inicio >= info.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }
    const corpo = Readable.toWeb(createReadStream(arquivo, { start: inicio, end: fim })) as ReadableStream;
    return new Response(corpo, {
      status: 206,
      headers: { ...cabecalhos, "Content-Range": `bytes ${inicio}-${fim}/${info.size}`, "Content-Length": String(fim - inicio + 1) },
    });
  }
  const corpo = Readable.toWeb(createReadStream(arquivo)) as ReadableStream;
  return new Response(corpo, { headers: { ...cabecalhos, "Content-Length": String(info.size) } });
}

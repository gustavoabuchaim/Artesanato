import { writeFile } from "node:fs/promises";
import path from "node:path";

const EXTENSOES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
export type TipoImagem = keyof typeof EXTENSOES;
const MAX_BYTES = 15 * 1024 * 1024;

export type ImagemSalva = { arquivo: string; tipo: TipoImagem; credito: string };

// shortcut: barra só endereços locais/privados escritos na própria URL, sem resolver DNS.
// Basta para um app de uma usuária; usar um proxy de saída se o app abrir para terceiros.
function urlPublica(endereco: string) {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const privado =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    (host.includes(":") && (host === "::1" || /^(fc|fd|fe80)/.test(host)));
  return privado ? null : url;
}

/** GET seguindo até 3 redirecionamentos, conferindo cada destino. Devolve null em qualquer falha. */
async function buscar(endereco: string, cabecalhos: Record<string, string> = {}) {
  let atual = endereco;
  for (let salto = 0; salto < 4; salto++) {
    const url = urlPublica(atual);
    if (!url) return null;
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EstudioNoticias/1.0)", ...cabecalhos },
      });
    } catch {
      return null;
    }
    const destino = resposta.headers.get("location");
    if (resposta.status >= 300 && resposta.status < 400 && destino) {
      atual = new URL(destino, url).href;
      continue;
    }
    return resposta.ok ? resposta : null;
  }
  return null;
}

async function salvar(resposta: Response, pasta: string, nome: string, credito: string): Promise<ImagemSalva | null> {
  const tipo = resposta.headers.get("content-type")?.split(";")[0].trim().toLowerCase() as TipoImagem;
  if (!(tipo in EXTENSOES)) return null;
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length === 0 || dados.length > MAX_BYTES) return null;
  const arquivo = `${nome}.${EXTENSOES[tipo]}`;
  await writeFile(path.join(pasta, arquivo), dados);
  return { arquivo, tipo, credito };
}

function decodificar(texto: string) {
  return texto.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&quot;/g, '"');
}

/** Foto principal da matéria (og:image / twitter:image). */
export async function fotoDaNoticia(link: string, fonte: string, pasta: string) {
  const pagina = await buscar(link);
  if (!pagina || !pagina.headers.get("content-type")?.includes("html")) return null;
  const html = (await pagina.text()).slice(0, 2_000_000);
  let imagem: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const chave = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase();
    const valor = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (valor && (chave === "og:image" || chave === "og:image:secure_url" || chave === "twitter:image")) {
      imagem = new URL(decodificar(valor), pagina.url || link).href;
      break;
    }
  }
  if (!imagem) return null;
  const resposta = await buscar(imagem);
  return resposta ? salvar(resposta, pasta, `noticia-${Date.now()}`, `Foto: ${fonte}`) : null;
}

/** Foto ilustrativa do Pexels (licença livre para uso comercial). Sem PEXELS_API_KEY, devolve null. */
export async function fotoDoBanco(busca: string, pasta: string, nome: string) {
  const chave = process.env.PEXELS_API_KEY;
  if (!chave || !busca.trim()) return null;
  const parametros = new URLSearchParams({ query: busca, orientation: "portrait", per_page: "5" });
  const resultado = await buscar(`https://api.pexels.com/v1/search?${parametros}`, { Authorization: chave });
  if (!resultado) return null;
  const { photos } = (await resultado.json()) as { photos?: { photographer: string; src: { large2x: string } }[] };
  const foto = photos?.[0];
  if (!foto) return null;
  const resposta = await buscar(foto.src.large2x);
  return resposta ? salvar(resposta, pasta, nome, `Foto: ${foto.photographer} / Pexels`) : null;
}

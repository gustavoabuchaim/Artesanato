import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { atualizarEstado, executarTarefa, lerEstado, pastaSemana, tarefaRodando, type Progresso } from "./armazenamento";
import { normalizarCenas } from "./cenas";
import { buscarNoticias, gerarCenas, gerarRoteiro } from "./claude";
import { fotoDaNoticia, fotoDoBanco, type ImagemSalva } from "./imagens";
import { converterAudio, duracaoAudio, renderizarVideo, transcrever } from "./midia";
import type { Cena, Estado, VideoProps } from "./tipos";

const DURACAO_MAXIMA_S = 180;

export const pastaArquivos = () => path.join(pastaSemana(), "arquivos");

/** Título e link das notícias das últimas semanas, para a busca não repetir o assunto. */
async function linksJaUsados() {
  const raiz = path.dirname(pastaSemana());
  const semanas = (await readdir(raiz).catch(() => [] as string[])).sort().slice(-8);
  const links: string[] = [];
  for (const semana of semanas) {
    try {
      const estado: Estado = JSON.parse(await readFile(path.join(raiz, semana, "estado.json"), "utf8"));
      links.push(...estado.noticias.map((n) => `${n.titulo} (${n.link})`));
    } catch {
      // Semana sem estado salvo: nada a evitar.
    }
  }
  return links;
}

const limparVideo = (e: Estado): Estado => ({ ...e, audio: null, duracao: 0, transcricao: [], cenas: [], video: null });

export function buscarNoticiasDaSemana() {
  return executarTarefa("Buscando as notícias da semana", async () => {
    const noticias = await buscarNoticias(await linksJaUsados());
    await atualizarEstado((e) => ({
      ...limparVideo(e),
      noticias,
      buscadoEm: new Date().toISOString(),
      escolhida: null,
      roteiro: "",
    }));
  });
}

export async function escolherNoticia(indice: number) {
  const { noticias } = await lerEstado();
  const noticia = noticias[indice];
  if (!noticia) throw new Error("Notícia não encontrada.");
  return executarTarefa("Escrevendo o roteiro", async () => {
    const roteiro = await gerarRoteiro(noticia);
    await atualizarEstado((e) => ({ ...limparVideo(e), escolhida: indice, roteiro }));
  });
}

/** Busca fotos, pede as cenas ao Claude e grava o resultado. Usa a transcrição já salva no estado. */
async function montarCenas(estado: Estado, progresso: Progresso) {
  const noticia = estado.escolhida === null ? null : estado.noticias[estado.escolhida];
  if (!noticia) throw new Error("Escolha uma notícia antes.");
  const pasta = pastaArquivos();

  await progresso(0.55, "Buscando a foto da notícia");
  const fotoNoticia = await fotoDaNoticia(noticia.link, noticia.fonte, pasta).catch(() => null);
  // Imagens acima de ~5 MB não são aceitas pela API; nesse caso o Claude só não vê a foto.
  const dadosFoto = fotoNoticia ? await readFile(path.join(pasta, fotoNoticia.arquivo)) : null;
  const anexo = fotoNoticia && dadosFoto && dadosFoto.length < 4_500_000 ? { base64: dadosFoto.toString("base64"), tipo: fotoNoticia.tipo } : null;

  await progresso(0.6, "Criando as cenas com o Claude");
  const geradas = normalizarCenas(await gerarCenas(noticia, estado.transcricao, estado.duracao, anexo), estado.duracao);

  await progresso(0.85, "Buscando fotos ilustrativas");
  const cenas: Cena[] = [];
  for (const [i, { foto, buscaFoto, ...cena }] of geradas.entries()) {
    let imagem: ImagemSalva | null = null;
    if (cena.tipo === "foto") {
      imagem = foto === "noticia" ? fotoNoticia : null;
      imagem ??= await fotoDoBanco(buscaFoto, pasta, `banco-${Date.now()}-${i}`).catch(() => null);
      // Sem foto do banco (sem chave ou sem resultado), a foto da notícia ainda serve.
      imagem ??= fotoNoticia;
    }
    cenas.push({ ...cena, imagem: imagem?.arquivo ?? "", credito: imagem?.credito ?? "" });
  }
  await atualizarEstado((e) => ({ ...e, cenas, video: null }));
}

/** Recebe o áudio gravado: converte, transcreve e monta as cenas. */
export async function processarAudio(arquivo: File) {
  if (tarefaRodando()) throw new Error("Já existe uma tarefa em andamento. Aguarde terminar.");
  const estado = await lerEstado();
  if (estado.escolhida === null) throw new Error("Escolha uma notícia antes de enviar o áudio.");
  const pasta = pastaArquivos();
  await mkdir(pasta, { recursive: true });
  const original = path.join(pasta, `original${path.extname(arquivo.name).replace(/[^.\w]/g, "").slice(0, 8)}`);
  await writeFile(original, Buffer.from(await arquivo.arrayBuffer()));

  return executarTarefa("Preparando o áudio", async (progresso) => {
    try {
      const { voz, wav } = await converterAudio(original, pasta);
      const duracao = await duracaoAudio(voz);
      if (duracao > DURACAO_MAXIMA_S) {
        throw new Error(`O áudio tem ${Math.round(duracao)} s. O limite é ${DURACAO_MAXIMA_S} s.`);
      }
      await progresso(0.1, "Transcrevendo o áudio (a primeira vez baixa o modelo, ~500 MB)");
      const transcricao = await transcrever(wav, (f) => void progresso(0.1 + f * 0.4));
      if (transcricao.length === 0) throw new Error("Não consegui entender fala no áudio. Grave de novo?");
      const novo = await atualizarEstado((e) => ({
        ...limparVideo(e),
        audio: path.basename(voz),
        duracao,
        transcricao,
      }));
      if (estado.audio) await rm(path.join(pasta, estado.audio), { force: true });
      await montarCenas(novo, progresso);
    } finally {
      // Só a voz convertida fica; o original e o WAV podem ser grandes.
      await rm(original, { force: true });
      await rm(path.join(pasta, "voz.wav"), { force: true });
      // O áudio que falhou na conversão ou transcrição não fica órfão na pasta.
      const atual = await lerEstado();
      for (const nome of await readdir(pasta)) {
        if (nome.startsWith("voz-") && nome !== atual.audio) await rm(path.join(pasta, nome), { force: true });
      }
    }
  });
}

export async function refazerCenas() {
  const estado = await lerEstado();
  if (!estado.transcricao.length) throw new Error("Envie o áudio antes.");
  return executarTarefa("Refazendo as cenas", (progresso) => montarCenas(estado, progresso));
}

export async function trocarFoto(indice: number, arquivo: File) {
  const tipos: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extensao = tipos[arquivo.type];
  if (!extensao) throw new Error("Envie uma foto JPG, PNG ou WebP.");
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("A foto passa de 15 MB.");
  if (tarefaRodando()) throw new Error("Já existe uma tarefa em andamento. Aguarde terminar.");
  const estado = await lerEstado();
  if (!estado.cenas[indice]) throw new Error("Cena não encontrada.");
  const nome = `foto-${Date.now()}.${extensao}`;
  await writeFile(path.join(pastaArquivos(), nome), Buffer.from(await arquivo.arrayBuffer()));
  await atualizarEstado((e) => ({
    ...e,
    video: null,
    cenas: e.cenas.map((c, i) => (i === indice ? { ...c, imagem: nome, credito: "" } : c)),
  }));
}

export async function exportarVideo() {
  const estado = await lerEstado();
  if (!estado.audio || !estado.cenas.length) throw new Error("Não há vídeo para exportar ainda.");
  return executarTarefa("Renderizando o vídeo", async (progresso) => {
    const pasta = pastaSemana();
    const props: VideoProps = { cenas: estado.cenas, duracao: estado.duracao, audio: estado.audio!, base: "" };
    const arquivoProps = path.join(pasta, "props.json");
    await writeFile(arquivoProps, JSON.stringify(props));
    const nome = `video-${Date.now()}.mp4`;
    await renderizarVideo(arquivoProps, pastaArquivos(), path.join(pasta, nome), (f) => void progresso(f));
    await atualizarEstado((e) => ({ ...e, video: nome }));
    // Só o vídeo mais recente fica; os anteriores ocupariam disco à toa.
    for (const antigo of await readdir(pasta)) {
      if (antigo.startsWith("video-") && antigo !== nome) await rm(path.join(pasta, antigo), { force: true });
    }
  });
}

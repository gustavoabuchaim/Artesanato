import { lerEstado } from "@/lib/armazenamento";
import { buscarNoticiasDaSemana, escolherNoticia, exportarVideo, processarAudio, refazerCenas, trocarFoto } from "@/lib/fluxo";

const MAX_AUDIO = 50 * 1024 * 1024;

/** Uma rota para todas as ações da tela; o campo "acao" do formulário diz qual. */
export async function POST(request: Request) {
  try {
    const dados = await request.formData();
    const acao = dados.get("acao");
    const indice = Number(dados.get("indice"));
    const arquivo = dados.get("arquivo");

    if (acao === "buscar") await buscarNoticiasDaSemana();
    else if (acao === "roteiro") await escolherNoticia(indice);
    else if (acao === "cenas") await refazerCenas();
    else if (acao === "exportar") await exportarVideo();
    else if (acao === "audio") {
      if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Escolha o arquivo de áudio.");
      if (arquivo.size > MAX_AUDIO) throw new Error("O áudio passa de 50 MB.");
      if (!/^(audio|video)\//.test(arquivo.type) && !/\.(m4a|mp3|ogg|opus|wav|aac|flac|webm|mp4)$/i.test(arquivo.name)) {
        throw new Error("Esse arquivo não parece ser de áudio.");
      }
      await processarAudio(arquivo);
    } else if (acao === "foto") {
      if (!(arquivo instanceof File)) throw new Error("Escolha a foto.");
      await trocarFoto(indice, arquivo);
    } else throw new Error("Ação desconhecida.");

    return Response.json(await lerEstado());
  } catch (erro) {
    return Response.json({ erro: erro instanceof Error ? erro.message : String(erro) }, { status: 400 });
  }
}

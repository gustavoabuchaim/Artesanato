import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Estado } from "./tipos";

const DADOS = path.join(process.cwd(), "data");

// Estado em memória compartilhado entre as rotas (o Next pode instanciar módulos por rota).
const g = globalThis as typeof globalThis & {
  __filaEstado?: Promise<unknown>;
  __tarefaRodando?: boolean;
};

/** Semana ISO no fuso de São Paulo, ex.: "2026-S43". */
export function chaveSemana(agora = new Date()): string {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  dia.setUTCDate(dia.getUTCDate() + 4 - (dia.getUTCDay() || 7)); // quinta-feira da semana ISO
  const ano = dia.getUTCFullYear();
  const semana = Math.ceil(((dia.getTime() - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return `${ano}-S${String(semana).padStart(2, "0")}`;
}

// shortcut: o app sempre mostra a semana atual; um vídeo em andamento na virada de domingo
// para segunda fica na pasta da semana anterior. Listar semanas antigas se isso incomodar.
export function pastaSemana(semana = chaveSemana()) {
  return path.join(DADOS, semana);
}

function estadoVazio(semana: string): Estado {
  return {
    semana,
    buscadoEm: null,
    noticias: [],
    escolhida: null,
    roteiro: "",
    audio: null,
    duracao: 0,
    transcricao: [],
    cenas: [],
    video: null,
    tarefa: null,
  };
}

async function lerDoDisco(semana: string): Promise<Estado> {
  try {
    return JSON.parse(await readFile(path.join(pastaSemana(semana), "estado.json"), "utf8"));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return estadoVazio(semana);
    throw erro;
  }
}

export async function lerEstado(semana = chaveSemana()): Promise<Estado> {
  const estado = await lerDoDisco(semana);
  // Tarefa marcada como rodando, mas nada rodando neste processo: o servidor reiniciou no meio.
  if (estado.tarefa && !estado.tarefa.erro && !g.__tarefaRodando) {
    estado.tarefa = { nome: estado.tarefa.nome, erro: "A tarefa foi interrompida. Tente de novo." };
  }
  return estado;
}

/** Lê, altera e grava o estado da semana em fila, para duas escritas não se atropelarem. */
export function atualizarEstado(alterar: (estado: Estado) => Estado, semana = chaveSemana()) {
  const proxima = (g.__filaEstado ?? Promise.resolve()).catch(() => {}).then(async () => {
    const novo = alterar(await lerDoDisco(semana));
    const pasta = pastaSemana(semana);
    await mkdir(pasta, { recursive: true });
    const arquivo = path.join(pasta, "estado.json");
    // Grava num temporário e renomeia: um travamento no meio não corrompe o estado.
    await writeFile(`${arquivo}.tmp`, JSON.stringify(novo, null, 2));
    await rename(`${arquivo}.tmp`, arquivo);
    return novo;
  });
  g.__filaEstado = proxima;
  return proxima;
}

/** Atualiza o andamento (0 a 1) e, opcionalmente, o nome da etapa exibida. */
export type Progresso = (fracao: number, etapa?: string) => Promise<unknown>;

/**
 * Roda uma tarefa demorada em segundo plano (uma por vez) e registra no estado o andamento
 * ou o erro. Retorna assim que a tarefa começa; a interface acompanha lendo o estado.
 */
export async function executarTarefa(nome: string, tarefa: (progresso: Progresso) => Promise<void>) {
  if (g.__tarefaRodando) throw new Error("Já existe uma tarefa em andamento. Aguarde terminar.");
  g.__tarefaRodando = true;
  const semana = chaveSemana();
  try {
    await atualizarEstado((e) => ({ ...e, tarefa: { nome } }), semana);
  } catch (erro) {
    g.__tarefaRodando = false;
    throw erro;
  }
  let ultimo = 0;
  let etapaAtual = nome;
  const progresso: Progresso = (fracao, etapa = etapaAtual) => {
    // Grava no máximo uma vez a cada 1% (ou ao mudar de etapa) para não martelar o disco.
    if (etapa === etapaAtual && Math.abs(fracao - ultimo) < 0.01) return Promise.resolve();
    ultimo = fracao;
    etapaAtual = etapa;
    return atualizarEstado((e) => ({ ...e, tarefa: { nome: etapa, progresso: fracao } }), semana);
  };
  void tarefa(progresso)
    .then(() => atualizarEstado((e) => ({ ...e, tarefa: null }), semana))
    .catch((erro: unknown) => {
      console.error(`[tarefa] ${nome}:`, erro);
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      return atualizarEstado((e) => ({ ...e, tarefa: { nome, erro: mensagem } }), semana);
    })
    .finally(() => {
      g.__tarefaRodando = false;
    });
}

export function tarefaRodando() {
  return Boolean(g.__tarefaRodando);
}

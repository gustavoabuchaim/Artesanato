import { z } from "zod";

export const NoticiaSchema = z.object({
  titulo: z.string(),
  link: z.string(),
  fonte: z.string(),
  data: z.string().describe("Data de publicação AAAA-MM-DD, ou vazio se desconhecida"),
  resumo: z.string(),
});
export type Noticia = z.infer<typeof NoticiaSchema>;

export const NoticiasSchema = z.object({ noticias: z.array(NoticiaSchema) });

export const TIPOS_CENA = ["titulo", "foto", "topicos", "destaque", "citacao", "encerramento"] as const;

// Formato que o Claude devolve. Campos que não se aplicam ao tipo vêm vazios.
export const CenaClaudeSchema = z.object({
  tipo: z.enum(TIPOS_CENA),
  inicio: z.number().describe("Segundo em que a cena começa"),
  rotulo: z.string().describe("Capítulo curto em maiúsculas, ex.: 1 · A NOTÍCIA"),
  titulo: z.string(),
  texto: z.string().describe("Frase-resumo exibida embaixo da tela"),
  itens: z.array(z.string()),
  destaque: z.string().describe("Número/valor (tipo destaque) ou autor (tipo citacao)"),
  foto: z.enum(["noticia", "banco", "nenhuma"]),
  buscaFoto: z.string().describe("Palavras em inglês para buscar foto no banco de imagens"),
});
export const CenasClaudeSchema = z.object({ cenas: z.array(CenaClaudeSchema) });
export type CenaClaude = z.infer<typeof CenaClaudeSchema>;

// Cena pronta para o vídeo: tempos fechados e foto resolvida para um arquivo local.
export type Cena = Omit<CenaClaude, "foto" | "buscaFoto"> & {
  fim: number;
  imagem: string;
  credito: string;
};

export type VideoProps = {
  cenas: Cena[];
  duracao: number;
  audio: string;
  // Prefixo de URL dos arquivos no preview; vazio no render (usa staticFile).
  base: string;
};

export type Segmento = { inicio: number; fim: number; texto: string };

export type Tarefa = { nome: string; progresso?: number; erro?: string };

export type Estado = {
  semana: string;
  buscadoEm: string | null;
  noticias: Noticia[];
  escolhida: number | null;
  roteiro: string;
  audio: string | null;
  duracao: number;
  transcricao: Segmento[];
  cenas: Cena[];
  video: string | null;
  tarefa: Tarefa | null;
};

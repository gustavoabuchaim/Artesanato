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

export const TIPOS_CENA = ["titulo", "foto", "topicos", "passos", "comparacao", "destaque", "citacao", "encerramento"] as const;

// Só as combinações que o design system de Fernanda Sklovsky permite: fundos chapados onde o logo
// pode entrar, acentos que aceitam texto em tinta por cima, símbolos com cor fixa.
export const FUNDOS = ["azul-noite", "verde-noite", "creme", "rosa-papel", "branco"] as const;
export const ACENTOS = ["coral", "amarelo-sol", "laranja", "rosa", "menta", "verde-agua", "areia"] as const;
export const SIMBOLOS = ["folha-coral", "folha-laranja", "sol", "passaro", "vaso", "nenhum"] as const;
export type Logo = "coral" | "laranja" | "amarelo" | "rosa" | "verde";

// Formato que o Claude devolve. Campos que não se aplicam ao tipo vêm vazios.
export const CenaClaudeSchema = z.object({
  tipo: z.enum(TIPOS_CENA),
  inicio: z.number().describe("Segundo em que a cena começa"),
  rotulo: z.string().describe("Capítulo curto em maiúsculas, ex.: 1 · A NOTÍCIA"),
  titulo: z.string(),
  enfase: z.string().describe("De 1 a 3 palavras copiadas do titulo, que ganham um recorte colorido; ou vazio"),
  texto: z.string().describe("Frase curta exibida embaixo da tela"),
  itens: z.array(z.string()).describe("topicos e passos: as linhas; comparacao: rótulo A, texto A, rótulo B, texto B; encerramento: etiquetas"),
  destaque: z.string().describe("Número/valor (tipo destaque) ou autor (tipo citacao)"),
  fundo: z.enum(FUNDOS),
  acento: z.enum(ACENTOS),
  simbolo: z.enum(SIMBOLOS),
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
  logo: Logo;
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

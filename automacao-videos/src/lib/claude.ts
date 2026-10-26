import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CenasClaudeSchema, NoticiasSchema, type CenaClaude, type Noticia, type Segmento } from "./tipos";

// Criado sob demanda: sem ANTHROPIC_API_KEY o app ainda abre e mostra o erro só ao usar o Claude.
let cliente: Anthropic | undefined;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta a ANTHROPIC_API_KEY no .env.local.");
  return (cliente ??= new Anthropic());
}

// Haiku 5.5: o modelo mais barato (pedido da cliente). Ele não tem modelo reserva para recusas
// (sem "fallbacks") e só aceita as versões básicas das ferramentas de busca e leitura na web.
const MODELO = "claude-haiku-5-5";

type Esforco = "low" | "medium" | "high";

function conferir(resposta: Anthropic.Message) {
  const uso = resposta.usage;
  // Log de custo: entrada US$ 0,10 e saída US$ 0,50 por milhão de tokens; cada busca, US$ 0,01.
  console.info(
    `[claude] entrada=${uso.input_tokens} saída=${uso.output_tokens} buscas=${uso.server_tool_use?.web_search_requests ?? 0} leituras=${uso.server_tool_use?.web_fetch_requests ?? 0}`,
  );
  if (resposta.stop_reason === "refusal") throw new Error("O Claude recusou este pedido. Tente outra notícia.");
  if (resposta.stop_reason === "max_tokens") throw new Error("A resposta do Claude ficou longa demais. Tente de novo.");
}

function hoje() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" }).format(new Date());
}

/** Pedido com ferramentas do servidor (busca/leitura na web); devolve o texto final. */
async function comFerramentas(prompt: string, tools: Anthropic.ToolUnion[], effort: Esforco) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  // A API pausa buscas longas (pause_turn); reenviar a conversa faz ela continuar de onde parou.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const resposta = await claude().messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort },
      tools,
      messages,
    });
    if (resposta.stop_reason !== "pause_turn") {
      conferir(resposta);
      return resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    }
    messages.push({ role: "assistant", content: resposta.content });
  }
  throw new Error("A pesquisa demorou demais. Tente de novo.");
}

export async function buscarNoticias(linksJaUsados: string[]): Promise<Noticia[]> {
  const pesquisa = await comFerramentas(
    `Hoje é ${hoje()}. Você escolhe pautas para as redes sociais de um negócio de artesanato no Brasil. Os vídeos são curtos e precisam fazer o público parar de rolar a tela.

Pesquise na web e escolha as 3 notícias recentes sobre artesanato com mais força para chamar atenção: o tipo de assunto que faz um artesão comentar, salvar e mandar para os colegas. Procure principalmente:
- Dinheiro e oportunidades: editais, prêmios, crédito, programas e feiras de alcance nacional, novos canais de venda, exportação.
- Mudanças que mexem no bolso ou no trabalho: leis, impostos, MEI, regras de marketplaces e dos Correios, Carteira Nacional do Artesão.
- Alertas: golpes, cópias e plágio, concorrência de importados, ameaças a ofícios tradicionais.
- Números surpreendentes, recordes, polêmicas e viradas de tendência no consumo.

Abrangência: as notícias precisam valer para artesãos do Brasil inteiro. Deixe de fora notícias locais (feira de uma cidade, ação de uma prefeitura ou de um só estado), a menos que sejam MUITO relevantes: com repercussão nacional ou com uma lição que sirva a artesãos de qualquer lugar. Antes de responder, teste cada escolha: ela interessa tanto a uma artesã do Amazonas quanto a uma do Rio Grande do Sul? Se não, troque por outra.

Regras:
- Publicadas nos últimos 14 dias (de preferência nos últimos 7). Se não houver 3 notícias nacionais fortes nesse período, aceite até 30 dias.
- Prefira fontes brasileiras e em português; uma fonte diferente para cada notícia.
- Escolha pelo impacto, mas sem distorcer: título e resumo têm de ser fiéis ao que a matéria diz.
- Não escolha oportunidades com prazo já vencido nem eventos que já acabaram, a menos que o resultado seja a notícia.
- O resumo traz só o conteúdo da matéria, sem comentários seus.
- Só use links que apareceram nos resultados da busca, com a URL completa da matéria. Não invente links.
${linksJaUsados.length ? `- Não repita estas notícias, já usadas antes, nem o mesmo assunto em outro veículo:\n${linksJaUsados.map((l) => `  ${l}`).join("\n")}\n` : ""}
Para cada notícia, informe: título, link, fonte (nome do veículo), data de publicação (AAAA-MM-DD, se souber) e um resumo de 2 a 3 frases que comece pelo que mais impacta o artesão.`,
    [
      {
        type: "web_search_20250305",
        name: "web_search",
        // Cada busca custa US$ 0,01 além dos tokens; 5 bastam para achar 3 notícias.
        max_uses: 5,
        user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
      },
    ],
    "medium",
  );

  const resposta = await claude().messages.parse({
    model: MODELO,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(NoticiasSchema) },
    messages: [
      {
        role: "user",
        content: `Organize as notícias abaixo no formato pedido. Copie título, link, fonte, data e resumo como estão; não acrescente nada.\n\n${pesquisa}`,
      },
    ],
  });
  conferir(resposta);
  const noticias = (resposta.parsed_output?.noticias ?? []).filter((n) => /^https?:\/\//.test(n.link));
  if (noticias.length === 0) throw new Error("Não encontrei notícias desta vez. Tente buscar de novo.");
  return noticias.slice(0, 3);
}

export async function gerarRoteiro(noticia: Noticia) {
  const roteiro = await comFerramentas(
    `Escreva uma sugestão de roteiro para um vídeo de 1 minuto sobre a notícia abaixo, para as redes sociais de um negócio de artesanato. A dona vai gravar o áudio com a própria voz.

Notícia: ${noticia.titulo}
Fonte: ${noticia.fonte}
Link: ${noticia.link}
Resumo: ${noticia.resumo}

Leia a matéria no link antes de escrever. Regras:
- Entre 140 e 160 palavras faladas (cerca de 1 minuto).
- A primeira frase é um gancho que prende a atenção.
- Linguagem simples e calorosa, em português do Brasil, de 3 a 4 parágrafos curtos.
- Cite a fonte da notícia.
- Termine com um convite para seguir ou comentar.
- Use só fatos da matéria. Não invente números, nomes ou datas.

Responda só com o texto a ser lido: sem título, sem marcações de cena, sem emojis e sem comentários.`,
    // Lê só a matéria, com teto de tokens para páginas enormes.
    [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1, max_content_tokens: 8000 }],
    "medium",
  );
  if (!roteiro) throw new Error("O Claude não devolveu o roteiro. Tente de novo.");
  return roteiro;
}

type Foto = { base64: string; tipo: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

export async function gerarCenas(noticia: Noticia, segmentos: Segmento[], duracao: number, fotoNoticia: Foto | null) {
  const narracao = segmentos.map((s) => `[${s.inicio.toFixed(1)}–${s.fim.toFixed(1)}] ${s.texto}`).join("\n");
  const prompt = `Você é diretor(a) de arte de vídeos curtos verticais (9:16) no estilo "explicado em um minuto": fundo azul-marinho escuro, textos curtos, cartões e destaques coloridos que aparecem no ritmo da narração.

A dona de um negócio de artesanato gravou a narração abaixo sobre uma notícia. Divida o áudio em cenas.

NOTÍCIA
Título: ${noticia.titulo}
Fonte: ${noticia.fonte}
Resumo: ${noticia.resumo}

NARRAÇÃO (duração total: ${duracao.toFixed(1)} s; tempos em segundos)
${narracao}

FOTO DA NOTÍCIA: ${fotoNoticia ? "disponível (é a imagem anexada)" : "indisponível"}

TIPOS DE CENA
- titulo: abertura. titulo = manchete curta da notícia; texto = subtítulo (opcional).
- foto: foto grande com o titulo embaixo. foto = "noticia" (a foto da matéria) ou "banco" (foto ilustrativa genérica; preencha buscaFoto com 2 a 4 palavras em inglês, ex.: "handmade ceramic pottery").
- topicos: titulo + 2 a 4 itens curtos que aparecem um a um (listas, passos, motivos).
- destaque: um número ou valor dito na narração em tamanho gigante. destaque = o número ("R$ 2 mi", "300", "40%"); titulo explica o número.
- citacao: frase marcante da narração ou da notícia. titulo = a frase; destaque = quem disse (ou vazio).
- encerramento: fechamento e chamada para ação. itens = 2 ou 3 palavras-chave da história (viram selos coloridos); titulo = mensagem final.

REGRAS
- Cenas em ordem, cobrindo o áudio do início ao fim. "inicio" é o segundo em que a cena começa; a primeira começa em 0. Cada cena dura até o início da próxima, e a última até o fim do áudio.
- Comece cada cena no início de uma frase da narração, para a imagem trocar junto com a fala.
- Entre 5 e 9 cenas, cada uma com 4 a 12 segundos.
- A primeira cena é "titulo" e a última é "encerramento".
- rotulo: capítulo curto em maiúsculas com número, ex.: "1 · A NOTÍCIA", "2 · O QUE MUDA". Cenas do mesmo capítulo repetem o rótulo.
- Texto na tela curto: titulo até 8 palavras; texto até 16 palavras (resume o trecho falado; pode ficar vazio); cada item até 5 palavras.
- Use só informações da narração e da notícia. Não invente números, nomes, datas ou falas.
- Use cenas de foto em 1 a 3 momentos. "noticia" só se a foto da notícia estiver disponível e combinar com o trecho. Nas cenas que não são do tipo foto, foto = "nenhuma".
- Campos que não se aplicam ao tipo ficam vazios ("" ou []).
- Português do Brasil, sem emojis.`;

  const content: Anthropic.ContentBlockParam[] = fotoNoticia
    ? [
        { type: "image", source: { type: "base64", media_type: fotoNoticia.tipo, data: fotoNoticia.base64 } },
        { type: "text", text: prompt },
      ]
    : [{ type: "text", text: prompt }];

  const resposta = await claude().messages.parse({
    model: MODELO,
    max_tokens: 16000,
    // "high": muitas regras de tempo e texto para seguir; o pensamento extra custa centavos de centavo.
    output_config: { effort: "high", format: zodOutputFormat(CenasClaudeSchema) },
    messages: [{ role: "user", content }],
  });
  conferir(resposta);
  const cenas: CenaClaude[] = resposta.parsed_output?.cenas ?? [];
  if (cenas.length === 0) throw new Error("O Claude não devolveu as cenas. Tente de novo.");
  return cenas;
}

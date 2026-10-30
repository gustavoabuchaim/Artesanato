import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CenasClaudeSchema, NoticiasSchema, type CenaClaude, type Noticia, type Segmento } from "./tipos";

// Criado sob demanda: sem ANTHROPIC_API_KEY o app ainda abre e mostra o erro só ao usar o Claude.
let cliente: Anthropic | undefined;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta a ANTHROPIC_API_KEY no .env.local.");
  return (cliente ??= new Anthropic());
}

// Sonnet 5.5 com esforço médio em todas as chamadas. Se um filtro de segurança recusar o pedido,
// a API refaz no modelo reserva indicado pela Anthropic.
const COMUM = {
  model: "claude-sonnet-5-5",
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};
const ESFORCO = "medium";

function conferir(resposta: Anthropic.Beta.BetaMessage) {
  const uso = resposta.usage;
  // Log de custo: entrada US$ 2 e saída US$ 10 por milhão de tokens; cada busca, US$ 0,01.
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
async function comFerramentas(prompt: string, tools: Anthropic.Beta.BetaToolUnion[]) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  // A API pausa buscas longas (pause_turn); reenviar a conversa faz ela continuar de onde parou.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const resposta = await claude().beta.messages.create({
      ...COMUM,
      max_tokens: 16000,
      output_config: { effort: ESFORCO },
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
        type: "web_search_20260209",
        name: "web_search",
        // Cada busca custa US$ 0,01 além dos tokens; 5 bastam para achar 3 notícias.
        max_uses: 5,
        user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
      },
    ],
  );

  const resposta = await claude().beta.messages.parse({
    ...COMUM,
    max_tokens: 8000,
    output_config: { effort: ESFORCO, format: betaZodOutputFormat(NoticiasSchema) },
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
    `Escreva uma sugestão de roteiro para um vídeo de 1 minuto sobre a notícia abaixo, para as redes sociais de Fernanda Sklovsky, designer que trabalha com artesãs e artesãos de todo o Brasil. Ela vai gravar o áudio com a própria voz.

Notícia: ${noticia.titulo}
Fonte: ${noticia.fonte}
Link: ${noticia.link}
Resumo: ${noticia.resumo}

Leia a matéria no link antes de escrever. Regras:
- Entre 140 e 160 palavras faladas (cerca de 1 minuto).
- A primeira frase é um gancho que prende a atenção.
- Frases claras e afirmativas, em português do Brasil, de 3 a 4 parágrafos curtos. Fale com quem faz artesanato, não sobre: "você", "artesãs e artesãos".
- Valorize origem e cultura quando couber: trajetória, território, técnica, identidade brasileira.
- Cite a fonte da notícia.
- Termine com um convite para seguir ou comentar.
- Use só fatos da matéria. Não invente números, nomes ou datas.

Responda só com o texto a ser lido: sem título, sem marcações de cena, sem emojis e sem comentários.`,
    // Lê só a matéria, com teto de tokens para páginas enormes.
    [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, max_content_tokens: 8000 }],
  );
  if (!roteiro) throw new Error("O Claude não devolveu o roteiro. Tente de novo.");
  return roteiro;
}

type Foto = { base64: string; tipo: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

export async function gerarCenas(noticia: Noticia, segmentos: Segmento[], duracao: number, fotoNoticia: Foto | null) {
  const temBanco = Boolean(process.env.PEXELS_API_KEY);
  const narracao = segmentos.map((s) => `[${s.inicio.toFixed(1)}–${s.fim.toFixed(1)}] ${s.texto}`).join("\n");
  const prompt = `Você é diretor(a) de criação dos vídeos verticais (9:16, 1 minuto) de Fernanda Sklovsky, designer que trabalha com artesãs e artesãos de todo o Brasil e criadora do método Artesanato Inteligente. A narração já está gravada; você decide tudo o que aparece na tela enquanto ela toca.

Um bom vídeo aqui faz a artesã parar de rolar a tela nos 3 primeiros segundos, entender por que a notícia mexe com a vida dela e terminar com vontade de comentar ou salvar. A tela não repete a fala: ela resume, organiza e dá peso ao que está sendo dito.

NOTÍCIA
Título: ${noticia.titulo}
Fonte: ${noticia.fonte}
Resumo: ${noticia.resumo}

NARRAÇÃO (duração total: ${duracao.toFixed(1)} s; tempos em segundos)
${narracao}
A transcrição é automática e erra nomes e termos. Quando divergir da notícia, confie na notícia.

FOTO DA NOTÍCIA: ${fotoNoticia ? "disponível (é a imagem anexada)" : "indisponível"}
BANCO DE IMAGENS: ${temBanco ? "disponível" : "indisponível"}

COMO PENSAR O VÍDEO
Antes de escrever as cenas, encontre a ideia central em uma frase e o momento de maior impacto (um número, uma virada, um alerta). Depois monte o arco:
1. Gancho: a consequência mais forte para quem faz artesanato, não o assunto genérico.
2. Contexto: o que aconteceu, em poucos elementos.
3. Virada: o dado ou a mudança que surpreende. É a cena mais forte do vídeo.
4. O que muda para artesãs e artesãos: o efeito concreto no trabalho, nas vendas ou no bolso.
5. Fechamento: a mensagem que fica e o convite da narração.

RITMO
- Cerca de ${Math.max(5, Math.round(duracao / 5))} cenas: troque de imagem a cada 3 a 7 segundos, nunca mais de 8. Um vídeo com cenas paradas perde a pessoa.
- "inicio" é o segundo em que a cena começa; a primeira começa em 0. Cada cena dura até o início da próxima, e a última até o fim do áudio.
- Comece cada cena no início de uma frase. Se um trecho longo tiver duas ideias, divida no ponto proporcional em que a segunda começa.
- A imagem entra junto com a fala que ela ilustra, nunca antes.

TIPOS DE CENA (use só quando o conteúdo pedir)
- titulo: a abertura, sempre a primeira cena. titulo = o gancho; texto = complemento curto, numa linha em itálico.
- foto: foto grande com o titulo embaixo. Serve para mostrar pessoas, peças e lugares. foto = "noticia" (só se a foto anexada combinar com o trecho) ou "banco" (ilustrativa; preencha buscaFoto com 2 a 4 palavras em inglês, ex.: "handmade ceramic pottery"). No máximo 2 no vídeo. Se a foto da notícia e o banco estiverem indisponíveis, não use este tipo.
- destaque: um número dito na narração em tamanho gigante. destaque = o número ("R$ 2 mil", "130", "40%"); titulo diz o que ele significa. Nunca use para datas. Reserve para o que realmente impressiona.
- comparacao: duas situações em dois blocos: antes e depois, regra antiga e nova, quem pode e quem não pode. itens = exatamente 4 textos, nesta ordem: rótulo A, texto A, rótulo B, texto B. titulo = o que está sendo comparado.
- topicos: 2 a 4 itens de mesmo peso, sem ordem entre eles (motivos, exemplos, benefícios). titulo + itens.
- passos: 2 a 4 etapas em que a ordem importa (como fazer, o que vem antes). titulo + itens.
- citacao: frase marcante, em itálico grande. titulo = a frase, fiel à narração ou à matéria; destaque = quem disse (vazio se não houver autor). Nunca atribua a alguém uma frase que essa pessoa não disse.
- encerramento: sempre a última cena, com o logo. titulo = a mensagem que fica; texto = o convite da narração (comentar, seguir, salvar); itens = 2 ou 3 palavras-chave da história, que viram etiquetas.

VARIEDADE
- Nunca dois tipos iguais em sequência. Use pelo menos 5 tipos diferentes no vídeo.
- topicos e passos juntos, no máximo 3 vezes.

TEXTO NA TELA
- A pessoa precisa entender cada tela em 2 segundos, muitas vezes sem som.
- titulo: até 7 palavras, afirmativo, com verbo sempre que der. Corte artigos e palavras vazias.
- enfase: de 1 a 3 palavras copiadas exatamente do titulo, as que mudam o sentido da frase; elas ganham um recorte colorido. Em cenas de citacao e destaque, deixe vazio.
- texto: até 12 palavras, acrescenta o que o titulo não disse. Deixe vazio se nada faltar; em foto e destaque ele costuma sobrar.
- itens: até 5 palavras cada, com a mesma estrutura gramatical entre si.
- rotulo: capítulo em maiúsculas e numerado ("1 · O QUE MUDOU", "2 · NA PRÁTICA"), com 3 a 5 capítulos no vídeo. Cenas do mesmo capítulo repetem o rótulo.
- Campos que não se aplicam ao tipo ficam vazios ("" ou []). Nas cenas que não são do tipo foto, foto = "nenhuma".

VOZ DA MARCA
- Português do Brasil, frases claras e afirmativas, sem emojis e sem exclamações em série.
- A marca fala com quem faz artesanato, não sobre: "você", "seu trabalho". Escreva "artesãs e artesãos", nessa ordem, quando falar do grupo.
- Valorize origem e cultura quando couber: trajetória, território, técnica, identidade brasileira.
- Impacto vem do fato, não do exagero: nada de "inacreditável" ou "você não vai acreditar".
- Use só informações da narração e da matéria. Não invente números, nomes, datas ou falas. Valores, prazos e nomes de leis ficam exatamente como na fonte.

DIREÇÃO DE ARTE
A identidade é feita de cores chapadas em grandes blocos retos e de símbolos que parecem recortes de papel. O código já aplica fontes, layout e contraste; você escolhe três coisas em cada cena:
- fundo: "azul-noite" e "verde-noite" (escuros), "creme", "rosa-papel" e "branco" (claros). Alterne escuro e claro para dar ritmo e nunca repita o mesmo fundo em sequência. Abra com um fundo escuro; feche em "rosa-papel" ou "creme". Use "azul-noite" mais vezes entre os escuros.
- acento: a cor dos blocos da cena: "coral", "amarelo-sol", "laranja", "rosa", "menta", "verde-agua" ou "areia". Nunca repita em sequência. Use "coral" ou "amarelo-sol" nas cenas mais fortes (gancho e virada).
- simbolo: recorte grande que sangra pela borda da tela: "folha-coral" e "folha-laranja" (fibras, natureza, o que cresce), "sol" (oportunidade, energia, novidade), "passaro" (liberdade, novos caminhos), "vaso" (peça, ofício, cerâmica) ou "nenhum". "passaro" e "vaso" só aparecem em fundo escuro. Sempre um na abertura e no fechamento; no meio, em cerca de uma cena a cada três, e use "nenhum" nas demais, para ele não virar enfeite.

ANTES DE RESPONDER, confira:
- A primeira cena é titulo, a última é encerramento, e os tempos crescem até perto de ${duracao.toFixed(1)} s.
- Quem assiste sem som entende a notícia e por que ela importa.
- Cada enfase existe literalmente no seu titulo.
- Todo número, nome e prazo na tela está na narração ou na matéria.
- O tipo titulo aparece uma única vez, na primeira cena, e o encerramento uma única vez, na última.
- Cada destaque é um número ou valor: nunca uma data nem palavras.
- Cada citacao é uma frase dita por alguém ou uma frase da matéria com força própria. Frase explicativa vira outro tipo.
- Detalhes burocráticos (número de decreto, data de publicação) cabem no texto de apoio, não em cena própria.`;

  const content: Anthropic.Beta.BetaContentBlockParam[] = fotoNoticia
    ? [
        { type: "image", source: { type: "base64", media_type: fotoNoticia.tipo, data: fotoNoticia.base64 } },
        { type: "text", text: prompt },
      ]
    : [{ type: "text", text: prompt }];

  const resposta = await claude().beta.messages.parse({
    ...COMUM,
    max_tokens: 16000,
    output_config: { effort: ESFORCO, format: betaZodOutputFormat(CenasClaudeSchema) },
    messages: [{ role: "user", content }],
  });
  conferir(resposta);
  const cenas: CenaClaude[] = resposta.parsed_output?.cenas ?? [];
  if (cenas.length === 0) throw new Error("O Claude não devolveu as cenas. Tente de novo.");
  return cenas;
}

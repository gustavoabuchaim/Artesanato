import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/lib/services/dashboard";
import { usersServerService } from "@/lib/services/users.server";
import { formatDate, toPercent } from "@/lib/utils";

const quickAccess = [
  {
    href: "/membros/curadoria",
    title: "Curadoria",
    description: "Conteúdo selecionado para você aplicar e evoluir.",
    cta: "Acessar agora",
  },
  {
    href: "/membros/ebooks",
    title: "Ebooks",
    description: "Guias e materiais para baixar e estudar no seu ritmo.",
    cta: "Download",
  },
  {
    href: "/membros/whatsapp",
    title: "Comunidade no WhatsApp",
    description: "Entre no grupo e conecte-se com outras membros.",
    cta: "Entrar no grupo",
  },
] as const;

const quote = {
  text: "O que falta nesses produtos não é técnica. É identidade. É história. E essas são coisas que cada uma já tem — só ainda não sabe.",
  author: "Mentoria",
} as const;

export default async function DashboardPage() {
  const user = await usersServerService.requireMe();
  const dashboard = await dashboardService.get();
  const continueWatching = dashboard?.continueWatching ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Olá, {user.name ?? "membro"}!</h1>
        <p className="text-sm text-muted-foreground">Acesse curadoria, aulas, ebooks, comunidade e mentoria em um só lugar.</p>
      </div>

      <div className="rounded-[28px] bg-[linear-gradient(135deg,hsl(var(--premium-hero-from)),hsl(var(--premium-hero-to)))] p-8 text-white shadow-premium">
        <div className="max-w-3xl">
          <p className="text-2xl font-medium leading-relaxed md:text-3xl">“{quote.text}”</p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">— {quote.author}</p>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Acesse agora</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {quickAccess.map((item) => (
            <Card key={item.href} className="rounded-[28px]">
              <CardHeader>
                <CardTitle className="text-xl">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <Button asChild className="rounded-full">
                  <Link href={item.href}>{item.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Continuar assistindo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {continueWatching.length ? (
              continueWatching.map((item) => (
                <Link
                  key={item.lessonId}
                  href={`/membros/videoaulas?course=${item.lesson.module.courseId}&lesson=${item.lessonId}`}
                  className="flex items-center justify-between rounded-[24px] border border-border/70 px-4 py-4 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{item.lesson.title}</p>
                    <p className="text-sm text-muted-foreground">{item.lesson.module.course.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">{toPercent(item.progressPercent)}</p>
                    <p className="text-xs text-muted-foreground">Atualizado em {formatDate(item.updatedAt)}</p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Seu progresso aparecerá aqui assim que começar uma videoaula.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-border/70 bg-background/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Onboarding</p>
              <p className="mt-2 text-xl font-semibold">{dashboard?.onboarding?.completedAt ? "Concluído" : "Pendente"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dashboard?.onboarding?.completedAt ? "Você já liberou as funcionalidades principais." : "Responda para personalizar sua jornada."}
              </p>
              <Button asChild className="mt-4 w-full rounded-full">
                <Link href="/membros/onboarding">{dashboard?.onboarding?.completedAt ? "Ver respostas" : "Começar"}</Link>
              </Button>
            </div>

            <div className="rounded-[24px] bg-primary p-5 text-primary-foreground">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">Premium</p>
              <p className="mt-2 text-xl font-semibold">Mentoria + bônus</p>
              <p className="mt-1 text-sm text-primary-foreground/80">Ative o premium para destravar mentoria e conteúdos extras.</p>
              <Button asChild variant="secondary" className="mt-4 w-full rounded-full">
                <Link href="/membros/premium">Ver oferta</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

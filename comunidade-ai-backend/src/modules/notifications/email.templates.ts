type EmailLayoutParams = {
  preheader?: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerHtml?: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function emailLayout(params: EmailLayoutParams) {
  const preheader = params.preheader ? escapeHtml(params.preheader) : '';
  const title = escapeHtml(params.title);
  const subtitle = params.subtitle ? escapeHtml(params.subtitle) : '';
  const cta = params.ctaText && params.ctaUrl
    ? `<a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:9999px;font-weight:700;font-size:14px"> ${escapeHtml(params.ctaText)} </a>`
    : '';

  const subtitleHtml = subtitle
    ? `<p style="margin:10px 0 0 0;color:#6b7280;font-size:14px;line-height:20px">${subtitle}</p>`
    : '';

  const footerHtml = params.footerHtml
    ? `<div style="margin-top:22px;padding-top:16px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;line-height:18px">${params.footerHtml}</div>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
    <div style="max-width:600px;margin:0 auto;padding:28px 14px">
      <div style="background:#ffffff;border:1px solid #eef2f7;border-radius:18px;overflow:hidden">
        <div style="padding:22px 20px;background:linear-gradient(135deg,#111827 0%,#0b1220 100%);color:#ffffff">
          <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85">Comunidade AI</p>
          <h1 style="margin:10px 0 0 0;font-size:22px;line-height:28px">${title}</h1>
          ${subtitleHtml}
        </div>
        <div style="padding:22px 20px;color:#111827">
          <div style="font-size:14px;line-height:22px;color:#111827">${params.bodyHtml}</div>
          ${cta ? `<div style="margin-top:18px">${cta}</div>` : ''}
          ${footerHtml}
        </div>
      </div>
      <p style="margin:14px 0 0 0;color:#9ca3af;font-size:12px;line-height:18px;text-align:center">
        Se você não reconhece este email, ignore esta mensagem.
      </p>
    </div>
  </body>
</html>`;
}

export function textTemplate(params: { title: string; lines: string[]; ctaText?: string; ctaUrl?: string }) {
  const parts = [`Comunidade AI — ${params.title}`, '', ...params.lines];
  if (params.ctaText && params.ctaUrl) parts.push('', `${params.ctaText}: ${params.ctaUrl}`);
  return parts.join('\n');
}

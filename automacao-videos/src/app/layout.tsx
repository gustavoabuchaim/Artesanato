import type { Metadata } from "next";
import { Archivo, Libre_Bodoni } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const bodoni = Libre_Bodoni({ variable: "--font-bodoni", subsets: ["latin"], style: "italic" });

export const metadata: Metadata = {
  title: "Estúdio de Notícias · Artesanato",
  description: "Notícias da semana viram vídeos de 1 minuto",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${bodoni.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}

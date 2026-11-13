import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Agex — Construtor visual de agentes e ponte MCP",
  description:
    "Crie, revise e exporte pacotes .agents/ para o Antigravity em qualquer linguagem. Local, gratuito e sem cadastro.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

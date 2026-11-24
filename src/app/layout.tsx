import type { Metadata } from "next";
import "./globals.css";

function resolveSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;
  if (!raw) return "http://localhost:3000";
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

const siteTitle = "Paktro - Construtor visual de agentes de IA";
const siteDescription =
  "Crie, valide, converta e exporte pacotes de agentes, regras, skills e servidores MCP para Google Antigravity, Claude Code, OpenAI Codex e ChatGPT Plugin. Local, gratuito e open source.";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Paktro",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Paktro - Configure uma vez. Exporte no formato certo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
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

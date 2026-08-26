import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Developer Personal Assistant Agent",
  description: "Next-generation developer personal assistant with local and cloud model support, tool permissions, and MCP integrations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-background text-foreground overflow-hidden">
        {children}
      </body>
    </html>
  );
}

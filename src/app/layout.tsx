import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warfront Animation Studio",
  description: "Create delicate, customized alternate-history warfront map videos with auto-drawn frontlines, layered basemaps and video export.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;600;700&family=Montserrat:wght@500;700;800&family=Cinzel:wght@500;700&family=Oswald:wght@500;700&family=Share+Tech+Mono&family=Inter:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

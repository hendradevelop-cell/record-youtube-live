import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "LiveRecorder — rekam YouTube Live",
  description: "Rekam stream YouTube Live dari link, simpan lokal, upload ke cloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <span className="brand-dot" />
              <span className="brand-name">
                Live<b>Recorder</b>
              </span>
            </div>
            <Nav />
            <div className="topbar-note">tool lokal</div>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
